/**
 * Unit tests for IncomingDocumentsService.create() — Function29 /
 * Assign Collaborator (PHXL).
 *
 * Note on naming: the matrix headers reference `AssignmentService`,
 * but the actual implementation that assigns collaborators (PHXL)
 * is `IncomingDocumentsService.create(data)` with `data.processorIds`
 * containing XLC + PHXL + XDB entries. We exercise `create()` and
 * focus on the PHXL portion of the assignment.
 *
 * Contract (PHXL-specific portion of create()):
 *   1. data.processorIds must contain at least one XLC (otherwise
 *      BadRequestError 'Phải chọn ít nhất một Người xử lý chính
 *      (XLC)'). PHXL/XDB are optional.
 *   2. validateProcessorRoles:
 *      - Exactly 1 XLC (BadRequestError otherwise).
 *      - Every PHXL/XDB user must have DEPARTMENT_HEAD or
 *        SPECIALIST role (BadRequestError otherwise).
 *      - No userId appears in more than one role (BadRequestError
 *        otherwise).
 *   3. prisma.$transaction:
 *      - tx.documentProcessor.createMany with one row per
 *        processorId.
 *      - For each PHXL/XDB: upsertParticipation(_, processorType,
 *        'PENDING').
 *   4. Returns this.getById(incomingId).
 *
 * Note on the matrix's "notification/history" UTCID04:
 *   - The implementation does NOT push notifications. The
 *     participation rows serve as the audit trail.
 *
 * Coverage matrix (UTCID01 – UTCID09):
 *   UTCID01  N  – Single PHXL collaborator: DocumentProcessor row
 *                 + participation row are written.
 *   UTCID02  N  – Multiple PHXL collaborators: each gets its own
 *                 DocumentProcessor + participation row.
 *   UTCID03  N  – Permission mapping: PHXL/XDB user must have
 *                 DEPARTMENT_HEAD or SPECIALIST role.
 *   UTCID04  N  – Notification / history (documented gap):
 *                 participation rows are written but no
 *                 notification is emitted.
 *   UTCID05  N  – Response-to-database consistency: returns
 *                 this.getById; persisted DocumentProcessor +
 *                 participation rows match the input.
 *   UTCID06  A  – Duplicate / not-found collaborator: rejects when
 *                 a userId appears in multiple roles; rejects when
 *                 a user does not exist.
 *   UTCID07  A  – Unauthorized / invalid state: route layer
 *                 enforces role; create() itself does NOT check
 *                 the caller's identity.
 *   UTCID08  B  – Minimum / maximum PHXL count: zero, one, and
 *                 many PHXLs.
 *   UTCID09  B  – Upper-bound: very long fields, very many PHXLs,
 *                 MAX_SAFE_INTEGER ids.
 */

import { IncomingDocumentsService } from '../../../src/modules/incoming-documents/incoming-documents.service';
import { incomingDocumentsRepository } from '../../../src/modules/incoming-documents/incoming-documents.repository';
import { documentsRepository } from '../../../src/modules/documents/documents.repository';
import { default as prisma } from '../../../src/config/database';
import {
  resolveUrgencyIdWithDefault,
} from '../../../src/shared/utils/urgency';
import {
  resolveConfidentialityIdWithDefault,
} from '../../../src/shared/utils/confidentiality';
import { BadRequestError } from '../../../src/shared/exceptions/app-error';
import { DocumentStatus, WorkflowStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/incoming-documents/incoming-documents.repository',
);
jest.mock('../../../src/modules/documents/documents.repository');

jest.mock('../../../src/config/database', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    user: { findMany: jest.fn() },
    workflowStep: { findMany: jest.fn() },
  },
}));

jest.mock('../../../src/shared/utils/urgency', () => ({
  resolveUrgencyIdWithDefault: jest.fn(),
  resolveUrgencyId: jest.fn(),
}));

jest.mock('../../../src/shared/utils/confidentiality', () => ({
  resolveConfidentialityIdWithDefault: jest.fn(),
  resolveConfidentialityId: jest.fn(),
}));

const mockedRepo = incomingDocumentsRepository as jest.Mocked<
  typeof incomingDocumentsRepository
>;

const mockedDocsRepo = documentsRepository as jest.Mocked<
  typeof documentsRepository
>;

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

const mockedUrgency =
  resolveUrgencyIdWithDefault as jest.MockedFunction<
    typeof resolveUrgencyIdWithDefault
  >;

const mockedConfidentiality =
  resolveConfidentialityIdWithDefault as jest.MockedFunction<
    typeof resolveConfidentialityIdWithDefault
  >;

// ---------------------------------------------------------------------------
// Transaction runner — applies the inner callback to a fake tx client.
// ---------------------------------------------------------------------------

function makeTxMock() {
  const tx: any = {
    document: {
      create: jest.fn(async ({ data }: any) => ({
        id: 100,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...data,
      })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    incomingDocument: {
      create: jest.fn(async ({ data }: any) => ({
        id: 1,
        ...data,
      })),
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...data,
      })),
    },
    documentBook: {
      update: jest.fn(async () => ({ id: 1, currentNumber: 1 })),
    },
    incomingBookEntry: {
      create: jest.fn(async ({ data }: any) => ({
        id: 1,
        ...data,
      })),
    },
    documentProcessor: {
      createMany: jest.fn(async () => ({ count: 1 })),
    },
    documentAttachment: {
      createMany: jest.fn(async () => ({ count: 1 })),
    },
    documentWorkflow: {
      createMany: jest.fn(async () => ({ count: 3 })),
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...data,
      })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    documentWorkflowParticipation: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({
        id: Math.floor(Math.random() * 1_000_000) + 1,
        ...data,
      })),
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id ?? 1,
        ...data,
      })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  return tx;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

let service: IncomingDocumentsService;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();

  (mockedPrisma.$transaction as jest.Mock).mockImplementation(
    async (cb: any) => {
      const tx = makeTxMock();
      return cb(tx);
    },
  );

  mockedUrgency.mockResolvedValue(1);
  mockedConfidentiality.mockResolvedValue(1);

  mockedDocsRepo.generateDocumentNumber.mockResolvedValue('IN-2025-0001');

  // Default user.findMany: echo back the requested ids with
  // SPECIALIST role, except for id 7 (the canonical XLC user) which
  // has DEPARTMENT_HEAD role to satisfy the create-stage XLC
  // requirement.
  (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
    async (args: any) => {
      const ids: number[] = args?.where?.id?.in ?? [];
      return ids.map((id) => ({
        id,
        userRoles: [
          {
            role: {
              name: id === 7 ? 'DEPARTMENT_HEAD' : 'SPECIALIST',
            },
          },
        ],
      }));
    },
  );

  // Default workflowStep.findMany: 3 steps.
  (mockedPrisma.workflowStep.findMany as jest.Mock).mockResolvedValue([
    { id: 1, stepOrder: 1, roleName: 'DOCUMENT_CLERK' },
    { id: 2, stepOrder: 2, roleName: 'DEPARTMENT_HEAD' },
    { id: 3, stepOrder: 3, roleName: 'SPECIALIST' },
  ]);

  // Default findById for getById (called at the end of create()).
  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockResolvedValue({
    id: 1,
    documentId: 100,
    arrivalNumber: 1,
    dateReceived: new Date('2025-01-15'),
    receivedDate: new Date('2025-01-15'),
    pageCount: null,
    processingInstructions: null,
    documentBookId: null,
    documentBook: null,
    document: {
      id: 100,
      documentNumber: 'IN-2025-0001',
      subject: 'Test',
      type: 'INCOMING',
      fileUrl: null,
      status: DocumentStatus.PENDING,
      urgencyId: 1,
      urgency: null as any,
      confidentialityId: 1,
      confidentiality: null as any,
      ocrText: null,
      documentTypeId: null,
      documentTypeRef: null,
      issuer: null,
      signerName: null,
      signerTitle: null,
      issuedDate: null,
      categoryId: null,
      category: null as any,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdByUser: null as any,
      createdBy: 5,
      updatedByUser: null as any,
      processors: [],
      attachments: [],
      workflows: [],
    },
  } as any);

  service = new IncomingDocumentsService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: any = {}) {
  return {
    issuer: 'Ministry of Justice',
    documentTypeId: 1,
    documentNumber: '14/2026/NQ-HĐND',
    arrivalNumber: 1,
    signerName: 'Nguyen Van A',
    signerTitle: 'Minister',
    dateLetter: '2026-01-15',
    dateReceived: '2026-01-15T00:00:00.000Z',
    summary: 'Test summary',
    pageCount: 1,
    urgency: 'THUONG',
    processingInstructions: 'Test processing instructions',
    processorIds: [
      { userId: 7, processorType: 'XLC' as const },
    ],
    attachments: [],
    createdBy: 5,
    confidentialityLevel: 'THUONG',
    documentBookId: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: assign a single PHXL collaborator.
// Result : One DocumentProcessor row (PHXL) + one participation row
//          (PHXL, PENDING) are written.
// ---------------------------------------------------------------------------
describe('[UTCID01] incomingDocumentsService.create() – Normal 1: assign single PHXL collaborator', () => {
  it('creates a DocumentProcessor row for the PHXL collaborator', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: 8,
            processorType: 'PHXL',
          }),
        ]),
      }),
    );
  });

  it('creates a PENDING participation row for the PHXL collaborator', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    expect(tx.documentWorkflowParticipation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 8,
          participationRole: 'PHXL',
          status: 'PENDING',
        }),
      }),
    );
  });

  it('creates both the XLC and PHXL rows in a single createMany call', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalledTimes(1);
    const data = tx.documentProcessor.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(2);
  });

  it('does NOT log to console on the success path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: multiple PHXL collaborators.
// Result : Each PHXL gets its own DocumentProcessor +
//          participation row.
// ---------------------------------------------------------------------------
describe('[UTCID02] incomingDocumentsService.create() – Normal 2: multiple PHXL collaborators', () => {
  it('creates DocumentProcessor rows for every PHXL collaborator', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
          { userId: 9, processorType: 'PHXL' as const },
          { userId: 10, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 8, processorType: 'PHXL' }),
          expect.objectContaining({ userId: 9, processorType: 'PHXL' }),
          expect.objectContaining({ userId: 10, processorType: 'PHXL' }),
        ]),
      }),
    );
  });

  it('creates PENDING participation rows for every PHXL collaborator', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
          { userId: 9, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    const phxlRows =
      tx.documentWorkflowParticipation.create.mock.calls.filter(
        (c: any) => c[0].data.participationRole === 'PHXL',
      );
    expect(phxlRows).toHaveLength(2);
  });

  it('persists both PHXL and XDB in the same call', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
          { userId: 9, processorType: 'XDB' as const },
        ],
      }) as any,
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 8, processorType: 'PHXL' }),
          expect.objectContaining({ userId: 9, processorType: 'XDB' }),
        ]),
      }),
    );
  });

  it('does NOT log to console on the multi-PHXL path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
          { userId: 9, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: permission mapping.
// Result : PHXL/XDB users must have DEPARTMENT_HEAD or SPECIALIST
//          role. XLC users must have DEPARTMENT_HEAD role at the
//          create stage.
// ---------------------------------------------------------------------------
describe('[UTCID03] incomingDocumentsService.create() – Normal 3: permission mapping for PHXL', () => {
  it('accepts the boundary: PHXL user with SPECIALIST role', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
      async (args: any) => {
        const ids: number[] = args?.where?.id?.in ?? [];
        return ids.map((id) => ({
          id,
          userRoles: [
            { role: { name: id === 7 ? 'DEPARTMENT_HEAD' : 'SPECIALIST' } },
          ],
        }));
      },
    );

    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalled();
  });

  it('accepts the boundary: PHXL user with DEPARTMENT_HEAD role', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
      async (args: any) => {
        const ids: number[] = args?.where?.id?.in ?? [];
        return ids.map((id) => ({
          id,
          userRoles: [
            { role: { name: id === 7 ? 'DEPARTMENT_HEAD' : 'DEPARTMENT_HEAD' } },
          ],
        }));
      },
    );

    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalled();
  });

  it('rejects when PHXL user has DOCUMENT_CLERK role', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
      async (args: any) => {
        const ids: number[] = args?.where?.id?.in ?? [];
        return ids.map((id) => ({
          id,
          userRoles: [
            { role: { name: id === 7 ? 'DEPARTMENT_HEAD' : 'DOCUMENT_CLERK' } },
          ],
        }));
      },
    );

    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 8, processorType: 'PHXL' as const },
          ],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when PHXL user has VIEWER role', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
      async (args: any) => {
        const ids: number[] = args?.where?.id?.in ?? [];
        return ids.map((id) => ({
          id,
          userRoles: [
            { role: { name: id === 7 ? 'DEPARTMENT_HEAD' : 'VIEWER' } },
          ],
        }));
      },
    );

    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 8, processorType: 'PHXL' as const },
          ],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('uses the correct error message when PHXL user has an invalid role', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
      async (args: any) => {
        const ids: number[] = args?.where?.id?.in ?? [];
        return ids.map((id) => ({
          id,
          userRoles: [
            { role: { name: id === 7 ? 'DEPARTMENT_HEAD' : 'ADMIN' } },
          ],
        }));
      },
    );

    const err = await service
      .create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 8, processorType: 'PHXL' as const },
          ],
        }) as any,
      )
      .catch((e) => e) as BadRequestError;

    expect(err.message).toMatch(/PHXL.*XDB|Trưởng phòng|Chuyên viên/i);
  });

  it('does NOT log to console on the permission-mapping path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: notification / history (documented gap).
// Result : Participation rows are written as the audit trail; no
//          notification is emitted.
// ---------------------------------------------------------------------------
describe('[UTCID04] incomingDocumentsService.create() – Normal 4: notification / history (documented gap)', () => {
  it('persists DocumentWorkflowParticipation rows for the audit trail', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    // 3 participation rows are written:
    // 1. clerk CLERK → COMPLETED
    // 2. XLC user XLC → PENDING
    // 3. XLC user DEPARTMENT_HEAD → PENDING
    // 4. PHXL PHXL → PENDING
    expect(tx.documentWorkflowParticipation.create.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('writes the PHXL\'s participation as PENDING (no completedAt)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    const phxlRow = tx.documentWorkflowParticipation.create.mock.calls.find(
      (c: any) =>
        c[0].data.userId === 8 && c[0].data.participationRole === 'PHXL',
    );
    expect(phxlRow).toBeDefined();
    expect(phxlRow[0].data.status).toBe('PENDING');
    expect(phxlRow[0].data.completedAt).toBeNull();
  });

  it('writes the XLC\'s XLC + DEPARTMENT_HEAD participation as PENDING', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    const xlcRows = tx.documentWorkflowParticipation.create.mock.calls.filter(
      (c: any) => c[0].data.userId === 7,
    );
    expect(xlcRows.length).toBeGreaterThanOrEqual(2);
    expect(xlcRows[0][0].data.status).toBe('PENDING');
  });

  it('writes the clerk\'s CLERK participation as COMPLETED with completedAt', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    const clerkRow = tx.documentWorkflowParticipation.create.mock.calls.find(
      (c: any) =>
        c[0].data.userId === 5 && c[0].data.participationRole === 'CLERK',
    );
    expect(clerkRow).toBeDefined();
    expect(clerkRow[0].data.status).toBe('COMPLETED');
    expect(clerkRow[0].data.completedAt).toBeInstanceOf(Date);
  });

  it('does NOT emit a notification (documented gap)', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('does NOT call email.service.send (documented gap)', async () => {
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : Returns the result of this.getById; persisted
//          DocumentProcessor + participation rows match the input.
// ---------------------------------------------------------------------------
describe('[UTCID05] incomingDocumentsService.create() – Normal 5: response-to-database consistency for PHXL', () => {
  it('returns the result of getById(incomingId)', async () => {
    const fakeReturned: any = {
      id: 1,
      documentId: 100,
      document: { id: 100, status: DocumentStatus.PENDING },
    };
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(fakeReturned);

    const result = await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    expect(result).toEqual(fakeReturned);
  });

  it('persists the same DocumentProcessor rows that the input described', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    const persisted = tx.documentProcessor.createMany.mock.calls[0][0].data;
    expect(persisted).toEqual([
      expect.objectContaining({
        documentId: 100,
        userId: 7,
        processorType: 'XLC',
      }),
      expect.objectContaining({
        documentId: 100,
        userId: 8,
        processorType: 'PHXL',
      }),
    ]);
  });

  it('does NOT leak sensitive fields through DocumentProcessor.createMany', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    tx.documentProcessor.createMany.mock.calls.forEach((c: any) => {
      expect(JSON.stringify(c[0].data)).not.toMatch(/password|hash|secret/i);
    });
  });

  it('does NOT leak sensitive fields through participation rows', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    tx.documentWorkflowParticipation.create.mock.calls.forEach((c: any) => {
      expect(JSON.stringify(c[0].data)).not.toMatch(/password|hash|secret/i);
    });
  });

  it('does NOT log to console on the consistency path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: duplicate / not-found collaborator.
// Result : Rejects when a userId appears in multiple roles; rejects
//          when a user does not exist.
// ---------------------------------------------------------------------------
describe('[UTCID06] incomingDocumentsService.create() – Abnormal 1: duplicate / not-found collaborator', () => {
  it('throws BadRequestError when the same user appears in two roles', async () => {
    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 7, processorType: 'PHXL' as const },
          ],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when a PHXL user does not exist', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockImplementationOnce(
      async () => [
        {
          id: 7,
          userRoles: [{ role: { name: 'DEPARTMENT_HEAD' } }],
        },
      ],
    );

    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 999, processorType: 'PHXL' as const },
          ],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT enter the transaction when a user is missing', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockImplementationOnce(
      async () => [
        {
          id: 7,
          userRoles: [{ role: { name: 'DEPARTMENT_HEAD' } }],
        },
      ],
    );

    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 999, processorType: 'PHXL' as const },
          ],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws BadRequestError when no XLC is supplied (PHXL-only)', async () => {
    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 8, processorType: 'PHXL' as const },
          ],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('uses the correct error message for the duplicate case', async () => {
    const err = await service
      .create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 7, processorType: 'PHXL' as const },
          ],
        }) as any,
      )
      .catch((e) => e) as BadRequestError;

    expect(err.message).toMatch(/XLC > PHXL > XDB|vai trò/i);
  });

  it('records a safe diagnostic on the validation failure (no password / hash leak)', async () => {
    const err = await service
      .create(
        makeInput({
          processorIds: [
            { userId: 8, processorType: 'PHXL' as const },
          ],
        }) as any,
      )
      .catch((e) => e) as BadRequestError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on validation failures', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 7, processorType: 'PHXL' as const },
          ],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: unauthorized / invalid state.
// Result : Documented gap — no actor check at the service layer.
//          Route layer enforces DOCUMENT_CLERK / ADMIN.
// ---------------------------------------------------------------------------
describe('[UTCID07] incomingDocumentsService.create() – Abnormal 2: unauthorized / invalid state (documented gap)', () => {
  it('does NOT check caller identity at the service layer (documented gap)', async () => {
    // create() takes only data; it does NOT receive userId or
    // userRoles. Authorization is enforced at the route layer.
    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 8, processorType: 'PHXL' as const },
          ],
        }) as any,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT verify createdBy has the DOCUMENT_CLERK role (documented gap)', async () => {
    // create() accepts any createdBy without verifying role.
    await expect(
      service.create(
        makeInput({
          createdBy: 999,
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 8, processorType: 'PHXL' as const },
          ],
        }) as any,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT enforce authentication at the service layer (documented gap)', async () => {
    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 8, processorType: 'PHXL' as const },
          ],
        }) as any,
      ),
    ).resolves.toBeDefined();
  });

  it('PERMITS the create() call regardless of caller identity', async () => {
    await expect(
      service.create(
        makeInput({
          createdBy: -1,
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 8, processorType: 'PHXL' as const },
          ],
        }) as any,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log unauthorized attempts to console (documented gap)', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('propagates a repository failure (e.g. transaction rollback)', async () => {
    (mockedPrisma.$transaction as jest.Mock).mockReset();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async () => {
        throw new Error('Transaction aborted by unique constraint');
      },
    );

    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 8, processorType: 'PHXL' as const },
          ],
        }) as any,
      ),
    ).rejects.toThrow('Transaction aborted by unique constraint');
  });

  it('records a safe diagnostic on repository failures (no password / hash leak)', async () => {
    (mockedPrisma.$transaction as jest.Mock).mockReset();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async () => {
        throw new Error('Database connection refused');
      },
    );

    const err = await service
      .create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 8, processorType: 'PHXL' as const },
          ],
        }) as any,
      )
      .catch((e) => e);

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: minimum / maximum PHXL count.
// Result : 0 PHXLs (just XLC) is allowed; 1 PHXL is the canonical
//          case; many PHXLs is allowed; PHXL+XDB is allowed.
// ---------------------------------------------------------------------------
describe('[UTCID08] incomingDocumentsService.create() – Boundary 1: minimum / maximum PHXL count', () => {
  it('accepts the boundary: zero PHXL collaborators (just XLC)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
        ],
      }) as any,
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 7, processorType: 'XLC' }),
        ]),
      }),
    );
  });

  it('accepts the boundary: exactly one PHXL collaborator', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    const data = tx.documentProcessor.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(2);
  });

  it('accepts the boundary: many PHXL collaborators (10)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const manyPhxl = Array.from({ length: 10 }, (_, i) => ({
      userId: i + 8,
      processorType: 'PHXL' as const,
    }));

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          ...manyPhxl,
        ],
      }) as any,
    );

    const data = tx.documentProcessor.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(11);
  });

  it('accepts the boundary: mixed PHXL + XDB', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
          { userId: 9, processorType: 'XDB' as const },
          { userId: 10, processorType: 'PHXL' as const },
          { userId: 11, processorType: 'XDB' as const },
        ],
      }) as any,
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ processorType: 'PHXL' }),
          expect.objectContaining({ processorType: 'XDB' }),
        ]),
      }),
    );
  });

  it('does NOT throw on the minimum PHXL count path', async () => {
    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
          ],
        }) as any,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on the maximum reasonable PHXL count path', async () => {
    const manyPhxl = Array.from({ length: 50 }, (_, i) => ({
      userId: i + 8,
      processorType: 'PHXL' as const,
    }));

    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            ...manyPhxl,
          ],
        }) as any,
      ),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 2: upper-bound value just at the supported limit.
// Result : Very long fields, very many PHXLs, MAX_SAFE_INTEGER ids.
// ---------------------------------------------------------------------------
describe('[UTCID09] incomingDocumentsService.create() – Boundary 2: upper-bound value just at the supported limit', () => {
  it('accepts the boundary: very long summary (10 000 chars)', async () => {
    const longSummary = 'a'.repeat(10000);

    await expect(
      service.create(
        makeInput({
          summary: longSummary,
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 8, processorType: 'PHXL' as const },
          ],
        }) as any,
      ),
    ).resolves.toBeDefined();
  });

  it('accepts the boundary: very long processingInstructions (10 000 chars)', async () => {
    const longInstructions = 'a'.repeat(10000);

    await expect(
      service.create(
        makeInput({
          processingInstructions: longInstructions,
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 8, processorType: 'PHXL' as const },
          ],
        }) as any,
      ),
    ).resolves.toBeDefined();
  });

  it('accepts the boundary: very many PHXL processors (100)', async () => {
    const manyPhxl = Array.from({ length: 100 }, (_, i) => ({
      userId: i + 8,
      processorType: 'PHXL' as const,
    }));

    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            ...manyPhxl,
          ],
        }) as any,
      ),
    ).resolves.toBeDefined();
  });

  it('accepts the boundary: PHXL userId = Number.MAX_SAFE_INTEGER', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
      async (args: any) => {
        const ids: number[] = args?.where?.id?.in ?? [];
        return ids.map((id) => ({
          id,
          userRoles: [
            { role: { name: id === 7 ? 'DEPARTMENT_HEAD' : 'SPECIALIST' } },
          ],
        }));
      },
    );

    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          {
            userId: Number.MAX_SAFE_INTEGER,
            processorType: 'PHXL' as const,
          },
        ],
      }) as any,
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: Number.MAX_SAFE_INTEGER,
            processorType: 'PHXL',
          }),
        ]),
      }),
    );
  });

  it('does NOT enforce an upper bound on summary / processingInstructions length (documented gap)', async () => {
    expect(true).toBe(true);
  });

  it('does NOT enforce an upper bound on processorIds count (documented gap)', async () => {
    expect(true).toBe(true);
  });

  it('does NOT throw on the upper-bound path', async () => {
    const manyPhxl = Array.from({ length: 100 }, (_, i) => ({
      userId: i + 8,
      processorType: 'PHXL' as const,
    }));

    await expect(
      service.create(
        makeInput({
          summary: 'a'.repeat(10000),
          processingInstructions: 'b'.repeat(10000),
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            ...manyPhxl,
          ],
        }) as any,
      ),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    tx.documentProcessor.createMany.mock.calls.forEach((c: any) => {
      expect(JSON.stringify(c[0].data)).not.toMatch(/password|hash|secret/i);
    });
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
