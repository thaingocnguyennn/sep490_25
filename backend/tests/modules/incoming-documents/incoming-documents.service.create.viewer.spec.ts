/**
 * Unit tests for IncomingDocumentsService — Function30 / Assign
 * Viewer (XDB).
 *
 * Note on naming: the matrix headers reference `AssignmentService`,
 * but the actual implementation that assigns viewers (XDB) is
 * `IncomingDocumentsService.create(data)` with `data.processorIds`
 * containing XLC + PHXL + XDB entries. The XDB read-permission flow
 * is exercised via `markViewed()`. We exercise both and focus on
 * the XDB portion of the assignment.
 *
 * Contract (XDB-specific portion of create()):
 *   1. data.processorIds must contain at least one XLC.
 *   2. validateProcessorRoles:
 *      - Exactly 1 XLC.
 *      - Every PHXL/XDB user must have DEPARTMENT_HEAD or
 *        SPECIALIST role.
 *      - No userId appears in more than one role.
 *   3. prisma.$transaction:
 *      - tx.documentProcessor.createMany with one row per
 *        processorId (XDB gets processorType='XDB').
 *      - For each XDB: upsertParticipation(_, 'XDB', 'PENDING').
 *   4. Returns this.getById(incomingId).
 *
 * Contract (markViewed — the XDB read-permission flow):
 *   1. checkIncomingDocumentAccess(id, userId, userRoles).
 *   2. findUnique({ id }) — returns silently if missing.
 *   3. prisma.$transaction:
 *      - updateMany viewedAt=null → new Date() for ALL the user's
 *        participation rows on this document.
 *      - updateMany XDB rows status=PENDING → COMPLETED (XDB
 *        observers: viewing = completing).
 *   4. Returns void.
 *
 * Note on the matrix's "notification/history" UTCID03:
 *   - The implementation does NOT push notifications. The
 *     participation rows serve as the audit trail. The XDB read
 *     permission is implicit: XDB users have a participation row
 *     that grants them document visibility.
 *
 * Coverage matrix (UTCID01 – UTCID06):
 *   UTCID01  N  – Single XDB viewer: DocumentProcessor row +
 *                 participation row are written.
 *   UTCID02  N  – Multiple XDB viewers: each gets its own
 *                 DocumentProcessor + participation row.
 *   UTCID03  N  – Read permission: XDB participation grants
 *                 document visibility; markViewed flips status to
 *                 COMPLETED.
 *   UTCID04  A  – Duplicate / not-found viewer: rejects when a
 *                 userId appears in multiple roles; rejects when
 *                 a user does not exist.
 *   UTCID05  A  – Unauthorized / invalid state: route layer
 *                 enforces role; create() itself does NOT check
 *                 the caller's identity.
 *   UTCID06  B  – Minimum / maximum XDB count: zero, one, and
 *                 many XDBs.
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
import {
  checkIncomingDocumentAccess,
} from '../../../src/shared/access/document-access';
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
    documentWorkflowParticipation: { updateMany: jest.fn() },
    incomingDocument: { findUnique: jest.fn() },
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

jest.mock('../../../src/shared/access/document-access', () => ({
  checkIncomingDocumentAccess: jest.fn(),
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

const mockedAccess = checkIncomingDocumentAccess as jest.MockedFunction<
  typeof checkIncomingDocumentAccess
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
      findUnique: jest.fn(async ({ where }: any) => ({
        id: where.id,
        documentId: 100,
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

  // Default user.findMany: echo back the requested ids with the
  // expected role per id (id 7 → DEPARTMENT_HEAD for the XLC; all
  // others → SPECIALIST for PHXL/XDB).
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

  // Default documentWorkflowParticipation.updateMany: just succeed.
  (mockedPrisma.documentWorkflowParticipation.updateMany as jest.Mock).mockResolvedValue(
    { count: 1 },
  );

  // Default incomingDocument.findUnique: returns a documentId.
  (mockedPrisma.incomingDocument.findUnique as jest.Mock).mockResolvedValue({
    id: 1,
    documentId: 100,
  });

  // Default access helper: allow.
  mockedAccess.mockResolvedValue(undefined);

  // Default findById for getById.
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
// UTCID01 – Normal 1: assign a single XDB viewer.
// Result : One DocumentProcessor row (XDB) + one participation row
//          (XDB, PENDING) are written.
// ---------------------------------------------------------------------------
describe('[UTCID01] incomingDocumentsService.create() – Normal 1: assign single XDB viewer', () => {
  it('creates a DocumentProcessor row for the XDB viewer', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'XDB' as const },
        ],
      }) as any,
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: 8,
            processorType: 'XDB',
          }),
        ]),
      }),
    );
  });

  it('creates a PENDING participation row for the XDB viewer', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'XDB' as const },
        ],
      }) as any,
    );

    expect(tx.documentWorkflowParticipation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 8,
          participationRole: 'XDB',
          status: 'PENDING',
        }),
      }),
    );
  });

  it('creates both the XLC and XDB rows in a single createMany call', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'XDB' as const },
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
          { userId: 8, processorType: 'XDB' as const },
        ],
      }) as any,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: multiple XDB viewers.
// Result : Each XDB gets its own DocumentProcessor +
//          participation row.
// ---------------------------------------------------------------------------
describe('[UTCID02] incomingDocumentsService.create() – Normal 2: multiple XDB viewers', () => {
  it('creates DocumentProcessor rows for every XDB viewer', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'XDB' as const },
          { userId: 9, processorType: 'XDB' as const },
          { userId: 10, processorType: 'XDB' as const },
        ],
      }) as any,
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 8, processorType: 'XDB' }),
          expect.objectContaining({ userId: 9, processorType: 'XDB' }),
          expect.objectContaining({ userId: 10, processorType: 'XDB' }),
        ]),
      }),
    );
  });

  it('creates PENDING participation rows for every XDB viewer', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'XDB' as const },
          { userId: 9, processorType: 'XDB' as const },
        ],
      }) as any,
    );

    const xdbRows =
      tx.documentWorkflowParticipation.create.mock.calls.filter(
        (c: any) => c[0].data.participationRole === 'XDB',
      );
    expect(xdbRows).toHaveLength(2);
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
          expect.objectContaining({ processorType: 'PHXL' }),
          expect.objectContaining({ processorType: 'XDB' }),
        ]),
      }),
    );
  });

  it('does NOT log to console on the multi-XDB path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'XDB' as const },
          { userId: 9, processorType: 'XDB' as const },
        ],
      }) as any,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: read permission (XDB view-only access).
// Result : XDB participation grants document visibility;
//          markViewed flips XDB status PENDING → COMPLETED.
// ---------------------------------------------------------------------------
describe('[UTCID03] incomingDocumentsService.markViewed() – Normal 3: read permission for XDB', () => {
  it('accepts the boundary: XDB user with SPECIALIST role', async () => {
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

    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'XDB' as const },
        ],
      }) as any,
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalled();
  });

  it('accepts the boundary: XDB user with DEPARTMENT_HEAD role', async () => {
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
          { userId: 8, processorType: 'XDB' as const },
        ],
      }) as any,
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalled();
  });

  it('writes the XDB\'s participation row (grants document visibility)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'XDB' as const },
        ],
      }) as any,
    );

    // The XDB participation row was written during create().
    const xdbRow = tx.documentWorkflowParticipation.create.mock.calls.find(
      (c: any) =>
        c[0].data.userId === 8 && c[0].data.participationRole === 'XDB',
    );
    expect(xdbRow).toBeDefined();
    expect(xdbRow[0].data.status).toBe('PENDING');
  });

  it('rejects when XDB user has DOCUMENT_CLERK role', async () => {
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
            { userId: 8, processorType: 'XDB' as const },
          ],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when XDB user has VIEWER role', async () => {
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
            { userId: 8, processorType: 'XDB' as const },
          ],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('markViewed: sets viewedAt on every participation row for the user', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.markViewed(1, 8, ['SPECIALIST']);

    const updateManyCalls =
      tx.documentWorkflowParticipation.updateMany.mock.calls;
    // The first updateMany call sets viewedAt on every participation.
    expect(updateManyCalls.length).toBeGreaterThanOrEqual(1);
    expect(updateManyCalls[0][0].where).toEqual(
      expect.objectContaining({
        documentId: 100,
        userId: 8,
        viewedAt: null,
      }),
    );
  });

  it('markViewed: flips XDB status PENDING → COMPLETED', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.markViewed(1, 8, ['SPECIALIST']);

    const updateManyCalls =
      tx.documentWorkflowParticipation.updateMany.mock.calls;
    // The second updateMany call flips XDB status PENDING → COMPLETED.
    expect(updateManyCalls.length).toBeGreaterThanOrEqual(2);
    expect(updateManyCalls[1][0].where).toEqual(
      expect.objectContaining({
        documentId: 100,
        userId: 8,
        participationRole: 'XDB',
        status: 'PENDING',
      }),
    );
    expect(updateManyCalls[1][0].data).toEqual({ status: 'COMPLETED' });
  });

  it('markViewed: returns void', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const result = await service.markViewed(1, 8, ['SPECIALIST']);

    expect(result).toBeUndefined();
  });

  it('does NOT log to console on the read-permission path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.markViewed(1, 8, ['SPECIALIST']);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: duplicate / not-found viewer.
// Result : Rejects when a userId appears in multiple roles; rejects
//          when a user does not exist.
// ---------------------------------------------------------------------------
describe('[UTCID04] incomingDocumentsService.create() – Abnormal 1: duplicate / not-found viewer', () => {
  it('throws BadRequestError when the same user appears in two roles', async () => {
    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 7, processorType: 'XDB' as const },
          ],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when an XDB user does not exist', async () => {
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
            { userId: 999, processorType: 'XDB' as const },
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
            { userId: 999, processorType: 'XDB' as const },
          ],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws BadRequestError when no XLC is supplied (XDB-only)', async () => {
    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 8, processorType: 'XDB' as const },
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
            { userId: 7, processorType: 'XDB' as const },
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
            { userId: 8, processorType: 'XDB' as const },
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
            { userId: 7, processorType: 'XDB' as const },
          ],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 2: unauthorized / invalid state.
// Result : Documented gap — no actor check at the service layer.
//          Route layer enforces DOCUMENT_CLERK / ADMIN.
// ---------------------------------------------------------------------------
describe('[UTCID05] incomingDocumentsService — Abnormal 2: unauthorized / invalid state (documented gap)', () => {
  it('does NOT check caller identity at the service layer for create()', async () => {
    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 8, processorType: 'XDB' as const },
          ],
        }) as any,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT check caller identity at the service layer for markViewed()', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    // markViewed accepts any userId + userRoles; access is enforced
    // upstream.
    await expect(
      service.markViewed(1, 8, []),
    ).resolves.toBeUndefined();
  });

  it('does NOT verify createdBy has the DOCUMENT_CLERK role (documented gap)', async () => {
    await expect(
      service.create(
        makeInput({
          createdBy: 999,
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 8, processorType: 'XDB' as const },
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
            { userId: 8, processorType: 'XDB' as const },
          ],
        }) as any,
      ),
    ).resolves.toBeDefined();
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
            { userId: 8, processorType: 'XDB' as const },
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
            { userId: 8, processorType: 'XDB' as const },
          ],
        }) as any,
      )
      .catch((e) => e);

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('markViewed: returns silently when the incoming document does not exist', async () => {
    (mockedPrisma.incomingDocument.findUnique as jest.Mock).mockResolvedValueOnce(
      null,
    );

    await expect(
      service.markViewed(999, 8, ['SPECIALIST']),
    ).resolves.toBeUndefined();
  });

  it('does NOT log unauthorized attempts to console (documented gap)', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'XDB' as const },
        ],
      }) as any,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Boundary 1: minimum / maximum XDB count.
// Result : 0 XDBs (just XLC) is allowed; 1 XDB is the canonical
//          case; many XDBs is allowed; PHXL+XDB is allowed.
// ---------------------------------------------------------------------------
describe('[UTCID06] incomingDocumentsService.create() – Boundary 1: minimum / maximum XDB count', () => {
  it('accepts the boundary: zero XDB viewers (just XLC)', async () => {
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

  it('accepts the boundary: exactly one XDB viewer', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'XDB' as const },
        ],
      }) as any,
    );

    const data = tx.documentProcessor.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(2);
  });

  it('accepts the boundary: many XDB viewers (10)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const manyXdb = Array.from({ length: 10 }, (_, i) => ({
      userId: i + 8,
      processorType: 'XDB' as const,
    }));

    await service.create(
      makeInput({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          ...manyXdb,
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

  it('does NOT throw on the minimum XDB count path', async () => {
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

  it('does NOT throw on the maximum reasonable XDB count path', async () => {
    const manyXdb = Array.from({ length: 50 }, (_, i) => ({
      userId: i + 8,
      processorType: 'XDB' as const,
    }));

    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            ...manyXdb,
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
          { userId: 8, processorType: 'XDB' as const },
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
          { userId: 8, processorType: 'XDB' as const },
        ],
      }) as any,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
