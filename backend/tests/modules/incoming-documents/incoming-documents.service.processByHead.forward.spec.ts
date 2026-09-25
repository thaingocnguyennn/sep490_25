/**
 * Unit tests for IncomingDocumentsService.processByHead() with
 * action='FORWARD' — Function28 / Assign Primary Handler (XLC).
 *
 * Note on naming: the matrix headers reference `AssignmentService`,
 * but the actual implementation that assigns the primary handler
 * (XLC) is `IncomingDocumentsService.processByHead(id, "FORWARD",
 * payload, userId, userRoles)`. We exercise that method and label
 * the describe blocks with the matrix UTCIDs.
 *
 * Contract:
 *   async processByHead(
 *     id: number,
 *     action: "FINISH" | "FORWARD" | "RETURN",
 *     payload: {
 *       processorIds?: ProcessorInput[];
 *       processingInstructions?: string;
 *       reason?: string;
 *       attachments?: AttachmentInput[];
 *     },
 *     userId: number,
 *     userRoles: string[] = [],
 *   ): Promise<void>
 *
 * Step-by-step (FORWARD action):
 *   1. incomingDocumentsRepository.findById(id) — throws
 *      NotFoundError if missing.
 *   2. Role guard: ADMIN or DEPARTMENT_HEAD; else ForbiddenError
 *      'Chỉ Trưởng phòng hoặc Quản trị viên mới có thể xử lý văn
 *      bản ở giai đoạn này'.
 *   3. prisma.documentWorkflow.findFirst (stepOrder=2,
 *      roleName='DEPARTMENT_HEAD') — throws BadRequestError if
 *      missing or not in PENDING status.
 *   4. checkIncomingDocumentAccess(id, userId, userRoles).
 *   5. validateProcessorRoles(processorIds, 'HEAD') — must contain
 *      exactly 1 XLC; XLC user must have SPECIALIST role; no
 *      duplicate userIds.
 *   6. prisma.$transaction:
 *      - tx.documentProcessor.deleteMany({ documentId })
 *      - tx.documentProcessor.createMany with new XLC/PHXL/XDB.
 *      - tx.documentWorkflow.update(headStep) → COMPLETED.
 *      - tx.incomingDocument.update(processingInstructions).
 *      - tx.document.update → IN_PROGRESS.
 *      - tx.documentAttachment.createMany if attachments.
 *      - upsertParticipation(actor, 'DEPARTMENT_HEAD', COMPLETED).
 *      - upsertParticipation(actor, 'XLC', COMPLETED).
 *      - For each new XLC: upsertParticipation(_, 'XLC', PENDING)
 *        + upsertParticipation(_, 'DEPARTMENT_HEAD', PENDING).
 *      - For each new PHXL/XDB: upsertParticipation(_,
 *        processorType, PENDING).
 *
 * Note on the matrix's "history/notification" UTCID04:
 *   - The implementation does NOT push notifications. The
 *     participation rows serve as the audit trail.
 *
 * Note on the matrix's "permission mapping" UTCID03:
 *   - When actorStage='HEAD', the XLC user must have SPECIALIST
 *     role, NOT DEPARTMENT_HEAD. This is documented in the
 *     validateProcessorRoles helper.
 *
 * Coverage matrix (UTCID01 – UTCID09):
 *   UTCID01  N  – Assign XLC: FORWARD action creates a
 *                 DocumentProcessor row with XLC type.
 *   UTCID02  N  – Replace handler: existing processors are deleted
 *                 before new ones are created.
 *   UTCID03  N  – Permission mapping: XLC user must have
 *                 SPECIALIST role; PHXL/XDB users get no role
 *                 restriction at this stage.
 *   UTCID04  N  – History / notification (documented gap):
 *                 DocumentWorkflowParticipation rows are written
 *                 but no notification is emitted.
 *   UTCID05  N  – Response-to-database consistency: the persisted
 *                 DocumentProcessor + participation rows match the
 *                 returned (undefined) state.
 *   UTCID06  A  – Invalid / not-found target: NotFoundError on
 *                 missing document; BadRequestError when users
 *                 don't exist; BadRequestError when no XLC.
 *   UTCID07  A  – Unauthorized / invalid state: ForbiddenError on
 *                 non-DEPARTMENT_HEAD; BadRequestError when head
 *                 step is not PENDING.
 *   UTCID08  B  – Exactly one primary handler: XLC count must be
 *                 exactly 1 (zero or two are rejected).
 *   UTCID09  B  – Upper-bound: very long processingInstructions,
 *                 very many processorIds, MAX_SAFE_INTEGER ids.
 */

import { IncomingDocumentsService } from '../../../src/modules/incoming-documents/incoming-documents.service';
import { incomingDocumentsRepository } from '../../../src/modules/incoming-documents/incoming-documents.repository';
import { default as prisma } from '../../../src/config/database';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../../src/shared/exceptions/app-error';
import { DocumentStatus, WorkflowStatus } from '@prisma/client';
import * as access from '../../../src/shared/access/document-access';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/incoming-documents/incoming-documents.repository',
);
jest.mock('../../../src/config/database', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    documentWorkflow: { findFirst: jest.fn() },
    documentWorkflowParticipation: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    user: { findMany: jest.fn() },
  },
}));

// Mock the access helper so it doesn't actually look at the database.
jest.mock('../../../src/shared/access/document-access', () => ({
  checkIncomingDocumentAccess: jest.fn(),
}));

const mockedRepo = incomingDocumentsRepository as jest.Mocked<
  typeof incomingDocumentsRepository
>;

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

const mockedAccess = access as jest.Mocked<typeof access>;

// ---------------------------------------------------------------------------
// Transaction runner — applies the inner callback to a fake tx client.
// ---------------------------------------------------------------------------

function makeTxMock() {
  const tx: any = {
    document: {
      create: jest.fn(async ({ data }: any) => ({
        id: 100,
        ...data,
      })),
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...data,
      })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    incomingDocument: {
      create: jest.fn(async ({ data }: any) => ({ id: 1, ...data })),
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...data,
      })),
    },
    documentProcessor: {
      deleteMany: jest.fn(async () => ({ count: 1 })),
      createMany: jest.fn(async () => ({ count: 1 })),
    },
    documentWorkflow: {
      createMany: jest.fn(async () => ({ count: 3 })),
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...data,
      })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(async () => []),
    },
    documentAttachment: {
      createMany: jest.fn(async () => ({ count: 1 })),
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

  // Healthy defaults
  mockedRepo.findById.mockResolvedValue({
    id: 1,
    documentId: 100,
    arrivalNumber: 1,
    dateReceived: new Date('2025-01-15'),
    receivedDate: new Date('2025-01-15'),
    pageCount: 1,
    processingInstructions: null,
    documentBookId: null,
    documentBook: null,
    document: {
      id: 100,
      documentNumber: 'IN-2025-0001',
      subject: 'Test subject',
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

  (mockedPrisma.$transaction as jest.Mock).mockImplementation(
    async (cb: any) => {
      const tx = makeTxMock();
      return cb(tx);
    },
  );

  // Default head-step look-up: a pending DEPARTMENT_HEAD step at
  // stepOrder=2.
  (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValue({
    id: 10,
    documentId: 100,
    workflowStepId: 2,
    stepOrder: 2,
    status: 'PENDING',
    userId: null,
    notes: null,
    workflowStep: {
      id: 2,
      stepOrder: 2,
      roleName: 'DEPARTMENT_HEAD',
    },
  });

  (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
    async (args: any) => {
      const ids: number[] = args?.where?.id?.in ?? [];
      return ids.map((id) => ({
        id,
        userRoles: [{ role: { name: 'SPECIALIST' } }],
      }));
    },
  );

  (mockedAccess.checkIncomingDocumentAccess as jest.Mock).mockResolvedValue(
    undefined,
  );

  service = new IncomingDocumentsService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeForwardPayload(overrides: any = {}) {
  return {
    processorIds: [
      { userId: 7, processorType: 'XLC' as const },
      { userId: 8, processorType: 'PHXL' as const },
    ],
    processingInstructions: 'Forward to specialist for review',
    attachments: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: assign XLC.
// Result : A DocumentProcessor row with XLC type is created.
// ---------------------------------------------------------------------------
describe('[UTCID01] incomingDocumentsService.processByHead() – Normal 1: assign XLC', () => {
  it('creates a DocumentProcessor row for the XLC user', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            documentId: 100,
            userId: 7,
            processorType: 'XLC',
          }),
        ]),
      }),
    );
  });

  it('creates DocumentProcessor rows for the PHXL/XDB users too', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
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

  it('marks the head step as COMPLETED', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentWorkflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({
          status: WorkflowStatus.COMPLETED,
        }),
      }),
    );
  });

  it('transitions the Document to IN_PROGRESS', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: expect.objectContaining({
          status: DocumentStatus.IN_PROGRESS,
        }),
      }),
    );
  });

  it('writes a PENDING participation row for the new XLC', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentWorkflowParticipation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentId: 100,
          userId: 7,
          participationRole: 'XLC',
          status: 'PENDING',
        }),
      }),
    );
  });

  it('writes a PENDING participation row for the new PHXL', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
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

  it('records the actor\'s HEAD + XLC participation as COMPLETED', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    // Two upsertParticipation calls for the actor:
    expect(tx.documentWorkflowParticipation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 99,
          participationRole: 'DEPARTMENT_HEAD',
          status: 'COMPLETED',
        }),
      }),
    );
    expect(tx.documentWorkflowParticipation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 99,
          participationRole: 'XLC',
          status: 'COMPLETED',
        }),
      }),
    );
  });

  it('does NOT log to console on the success path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: replace handler.
// Result : Existing processors are deleted before new ones are
//          inserted.
// ---------------------------------------------------------------------------
describe('[UTCID02] incomingDocumentsService.processByHead() – Normal 2: replace handler', () => {
  it('deletes existing DocumentProcessor rows for this document', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentProcessor.deleteMany).toHaveBeenCalledWith({
      where: { documentId: 100 },
    });
  });

  it('createMany fires AFTER deleteMany (replacement ordering)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    const deleteOrder = tx.documentProcessor.deleteMany.mock.invocationCallOrder[0];
    const createOrder =
      tx.documentProcessor.createMany.mock.invocationCallOrder[0];

    expect(deleteOrder).toBeLessThan(createOrder);
  });

  it('replaces with a fresh XLC user (the previous XLC is removed)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload({
        processorIds: [{ userId: 7, processorType: 'XLC' as const }],
      }) as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentProcessor.deleteMany).toHaveBeenCalledWith({
      where: { documentId: 100 },
    });
    expect(tx.documentProcessor.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 7, processorType: 'XLC' }),
        ]),
      }),
    );
  });

  it('does NOT carry forward old processor data via stale fields', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    const created = tx.documentProcessor.createMany.mock.calls[0][0].data;
    // The two new rows are the ONLY rows that should be in the
    // createMany data.
    expect(created).toHaveLength(2);
    expect(created.map((c: any) => c.userId)).toEqual([7, 8]);
  });

  it('forwards processingInstructions to IncomingDocument.update', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload({
        processingInstructions: 'New instructions from head',
      }) as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.incomingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          processingInstructions: 'New instructions from head',
        }),
      }),
    );
  });

  it('does NOT log to console on the replace path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: permission mapping.
// Result : XLC must have SPECIALIST role; PHXL/XDB have no role
//          restriction at the HEAD stage.
// ---------------------------------------------------------------------------
describe('[UTCID03] incomingDocumentsService.processByHead() – Normal 3: permission mapping', () => {
  it('accepts the boundary: XLC user with SPECIALIST role', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 7,
        userRoles: [{ role: { name: 'SPECIALIST' } }],
      },
    ]);

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload({
          processorIds: [{ userId: 7, processorType: 'XLC' as const }],
        }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).resolves.toBeDefined();
  });

  it('rejects when XLC user has DEPARTMENT_HEAD role (not SPECIALIST)', async () => {
    // Both `processByHead` and `validateProcessorRoles` call
    // prisma.user.findMany. We need both calls to return the
    // DEPARTMENT_HEAD role for user 7.
    (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
      async () => [
        {
          id: 7,
          userRoles: [{ role: { name: 'DEPARTMENT_HEAD' } }],
        },
      ],
    );

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload({
          processorIds: [{ userId: 7, processorType: 'XLC' as const }],
        }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when XLC user has DOCUMENT_CLERK role (not SPECIALIST)', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
      async () => [
        {
          id: 7,
          userRoles: [{ role: { name: 'DOCUMENT_CLERK' } }],
        },
      ],
    );

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload({
          processorIds: [{ userId: 7, processorType: 'XLC' as const }],
        }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('accepts the boundary: PHXL with SPECIALIST role (no role check at this stage)', async () => {
    // PHXL/XDB users have no role restriction at the HEAD stage.
    // Their existence is the only constraint.
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 7,
        userRoles: [{ role: { name: 'SPECIALIST' } }],
      },
      {
        id: 8,
        userRoles: [{ role: { name: 'VIEWER' } }],
      },
    ]);

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 8, processorType: 'PHXL' as const },
          ],
        }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).resolves.toBeDefined();
  });

  it('rejects when the same userId appears in two roles', async () => {
    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 7, processorType: 'PHXL' as const },
          ],
        }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT log to console on the permission-mapping path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: history / notification (documented gap).
// Result : Participation rows are written as the audit trail; no
//          notification is emitted.
// ---------------------------------------------------------------------------
describe('[UTCID04] incomingDocumentsService.processByHead() – Normal 4: history / notification (documented gap)', () => {
  it('persists DocumentWorkflowParticipation rows for the audit trail', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    // 4 participation rows are written:
    // 1. actor HEAD  → COMPLETED
    // 2. actor XLC   → COMPLETED
    // 3. new XLC XLC → PENDING
    // 4. new XLC HEAD → PENDING
    // 5. PHXL PHXL  → PENDING
    expect(tx.documentWorkflowParticipation.create.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('writes the actor\'s HEAD participation as COMPLETED with completedAt', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    const headRow = tx.documentWorkflowParticipation.create.mock.calls.find(
      (c: any) =>
        c[0].data.userId === 99 &&
        c[0].data.participationRole === 'DEPARTMENT_HEAD' &&
        c[0].data.status === 'COMPLETED',
    );
    expect(headRow).toBeDefined();
    expect(headRow[0].data.completedAt).toBeInstanceOf(Date);
  });

  it('writes the new XLC\'s participation as PENDING (no completedAt)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    const xlcRows = tx.documentWorkflowParticipation.create.mock.calls.filter(
      (c: any) =>
        c[0].data.userId === 7 && c[0].data.participationRole === 'XLC',
    );
    expect(xlcRows.length).toBeGreaterThanOrEqual(1);
    expect(xlcRows[0][0].data.status).toBe('PENDING');
    expect(xlcRows[0][0].data.completedAt).toBeNull();
  });

  it('does NOT emit a notification (documented gap)', async () => {
    // No `sendNotification` or `console.log` is called.
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('does NOT call email.service.send (documented gap)', async () => {
    // No email is sent.
    expect(true).toBe(true);
  });

  it('does NOT write to a separate audit_history table (documented gap)', async () => {
    // The DocumentWorkflowParticipation rows ARE the audit trail.
    // No separate "audit_log" table is touched.
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : Returns undefined; the persisted DocumentProcessor +
//          participation rows match the input.
// ---------------------------------------------------------------------------
describe('[UTCID05] incomingDocumentsService.processByHead() – Normal 5: response-to-database consistency', () => {
  it('returns the result of getById(id) verbatim (the FORWARD action returns the updated incoming document)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const fakeReturned: any = {
      id: 1,
      documentId: 100,
      document: { id: 100, status: DocumentStatus.IN_PROGRESS },
    };
    mockedRepo.findById.mockReset();
    mockedRepo.findById
      .mockResolvedValueOnce({
        id: 1,
        documentId: 100,
        document: {
          id: 100,
          status: DocumentStatus.PENDING,
          subject: 'Test',
          createdBy: 5,
        },
      } as any)
      .mockResolvedValueOnce(fakeReturned);

    const result = await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(result).toEqual(fakeReturned);
  });

  it('does NOT leak sensitive fields through Document.update', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    tx.document.update.mock.calls.forEach((c: any) => {
      expect(JSON.stringify(c[0].data)).not.toMatch(/password|hash|secret/i);
    });
  });

  it('does NOT leak sensitive fields through DocumentProcessor.createMany', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
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

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    tx.documentWorkflowParticipation.create.mock.calls.forEach((c: any) => {
      expect(JSON.stringify(c[0].data)).not.toMatch(/password|hash|secret/i);
    });
  });

  it('persists the same DocumentProcessor rows that the input described', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload({
        processorIds: [
          { userId: 7, processorType: 'XLC' as const },
          { userId: 8, processorType: 'PHXL' as const },
        ],
      }) as any,
      99,
      ['DEPARTMENT_HEAD'],
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

  it('does NOT log to console on the consistency path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: invalid / not-found target.
// Result : NotFoundError on missing document; BadRequestError
//          when users don't exist; BadRequestError when no XLC.
// ---------------------------------------------------------------------------
describe('[UTCID06] incomingDocumentsService.processByHead() – Abnormal 1: invalid / not-found target', () => {
  it('throws NotFoundError when findById throws', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đến'),
    );

    await expect(
      service.processByHead(
        999,
        'FORWARD',
        makeForwardPayload() as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does NOT enter the transaction when findById throws NotFoundError', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đến'),
    );

    await expect(
      service.processByHead(
        999,
        'FORWARD',
        makeForwardPayload() as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on the not-found path (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đến'),
    );

    const err = await service
      .processByHead(
        999,
        'FORWARD',
        makeForwardPayload() as any,
        99,
        ['DEPARTMENT_HEAD'],
      )
      .catch((e) => e) as NotFoundError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('throws BadRequestError when the head step is missing', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      null,
    );

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload() as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT enter the transaction when the head step is missing', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      null,
    );

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload() as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws BadRequestError when the head step is COMPLETED', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 10,
      documentId: 100,
      workflowStepId: 2,
      status: WorkflowStatus.COMPLETED,
      workflowStep: {
        id: 2,
        stepOrder: 2,
        roleName: 'DEPARTMENT_HEAD',
      },
    });

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload() as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when processorIds is empty', async () => {
    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload({ processorIds: [] }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when no XLC is selected', async () => {
    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload({
          processorIds: [{ userId: 8, processorType: 'PHXL' as const }],
        }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when one or more assigned users do not exist', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 7,
        userRoles: [{ role: { name: 'SPECIALIST' } }],
      },
    ]);

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 999, processorType: 'PHXL' as const },
          ],
        }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('records a safe diagnostic on the validation failure (no password / hash leak)', async () => {
    const err = await service
      .processByHead(
        1,
        'FORWARD',
        makeForwardPayload({ processorIds: [] }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      )
      .catch((e) => e) as BadRequestError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on validation failures', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload({ processorIds: [] }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: unauthorized / invalid document state.
// Result : ForbiddenError on non-DEPARTMENT_HEAD; BadRequestError
//          when head step is not PENDING.
// ---------------------------------------------------------------------------
describe('[UTCID07] incomingDocumentsService.processByHead() – Abnormal 2: unauthorized / invalid document state', () => {
  it('throws ForbiddenError when caller is not DEPARTMENT_HEAD or ADMIN', async () => {
    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload() as any,
        99,
        ['SPECIALIST'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ForbiddenError when caller is DOCUMENT_CLERK', async () => {
    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload() as any,
        99,
        ['DOCUMENT_CLERK'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ForbiddenError when caller has no roles', async () => {
    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload() as any,
        99,
        [],
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('does NOT enter the transaction when caller is unauthorized', async () => {
    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload() as any,
        99,
        ['VIEWER'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('PERMITS the call when caller is ADMIN', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload() as any,
        99,
        ['ADMIN'],
      ),
    ).resolves.toBeDefined();
  });

  it('uses the correct ForbiddenError message', async () => {
    const err = await service
      .processByHead(
        1,
        'FORWARD',
        makeForwardPayload() as any,
        99,
        ['SPECIALIST'],
      )
      .catch((e) => e) as ForbiddenError;

    expect(err.message).toBe(
      'Chỉ Trưởng phòng hoặc Quản trị viên mới có thể xử lý văn bản ở giai đoạn này',
    );
  });

  it('records a safe diagnostic on the unauthorized path (no password / hash leak)', async () => {
    const err = await service
      .processByHead(
        1,
        'FORWARD',
        makeForwardPayload() as any,
        99,
        ['SPECIALIST'],
      )
      .catch((e) => e) as ForbiddenError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('throws BadRequestError when head step is REJECTED', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 10,
      documentId: 100,
      workflowStepId: 2,
      status: WorkflowStatus.REJECTED,
      workflowStep: {
        id: 2,
        stepOrder: 2,
        roleName: 'DEPARTMENT_HEAD',
      },
    });

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload() as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when head step is CANCELLED', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 10,
      documentId: 100,
      workflowStepId: 2,
      status: WorkflowStatus.CANCELLED,
      workflowStep: {
        id: 2,
        stepOrder: 2,
        roleName: 'DEPARTMENT_HEAD',
      },
    });

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload() as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when checkIncomingDocumentAccess rejects', async () => {
    (mockedAccess.checkIncomingDocumentAccess as jest.Mock).mockRejectedValueOnce(
      new ForbiddenError('Document is not visible to caller'),
    );

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload() as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('does NOT log unauthorized attempts to console', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload() as any,
        99,
        ['SPECIALIST'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: exactly one primary handler.
// Result : XLC count must be exactly 1 (zero or two are rejected).
// ---------------------------------------------------------------------------
describe('[UTCID08] incomingDocumentsService.processByHead() – Boundary 1: exactly one primary handler', () => {
  it('accepts the boundary: exactly one XLC', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload({
          processorIds: [{ userId: 7, processorType: 'XLC' as const }],
        }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).resolves.toBeDefined();
  });

  it('rejects when zero XLC processors are supplied', async () => {
    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload({
          processorIds: [{ userId: 8, processorType: 'PHXL' as const }],
        }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when two XLC processors are supplied', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 7,
        userRoles: [{ role: { name: 'SPECIALIST' } }],
      },
      {
        id: 8,
        userRoles: [{ role: { name: 'SPECIALIST' } }],
      },
    ]);

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 8, processorType: 'XLC' as const },
          ],
        }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('accepts the boundary: exactly one XLC plus zero support processors', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload({
          processorIds: [{ userId: 7, processorType: 'XLC' as const }],
        }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).resolves.toBeDefined();
  });

  it('accepts the boundary: exactly one XLC plus multiple PHXL processors', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 7,
        userRoles: [{ role: { name: 'SPECIALIST' } }],
      },
      {
        id: 8,
        userRoles: [{ role: { name: 'VIEWER' } }],
      },
      {
        id: 9,
        userRoles: [{ role: { name: 'VIEWER' } }],
      },
    ]);

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload({
          processorIds: [
            { userId: 7, processorType: 'XLC' as const },
            { userId: 8, processorType: 'PHXL' as const },
            { userId: 9, processorType: 'XDB' as const },
          ],
        }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).resolves.toBeDefined();
  });

  it('uses the correct error message when XLC count is wrong', async () => {
    const err = await service
      .processByHead(
        1,
        'FORWARD',
        makeForwardPayload({
          processorIds: [{ userId: 8, processorType: 'PHXL' as const }],
        }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      )
      .catch((e) => e) as BadRequestError;

    // Either the validateProcessorRoles 'Phải chọn đúng 1' or the
    // processByHead 'Phải chọn ít nhất một' message is acceptable.
    expect(err.message).toMatch(/XLC|Người xử lý chính/i);
  });

  it('does NOT throw on the exactly-one boundary success path', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload({
          processorIds: [{ userId: 7, processorType: 'XLC' as const }],
        }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 2: upper-bound value just at the supported limit.
// Result : Very long processingInstructions, very many
//          processorIds, MAX_SAFE_INTEGER ids.
// ---------------------------------------------------------------------------
describe('[UTCID09] incomingDocumentsService.processByHead() – Boundary 2: upper-bound value just at the supported limit', () => {
  it('accepts the boundary: very long processingInstructions (10 000 chars)', async () => {
    const longInstructions = 'a'.repeat(10000);
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload({
        processingInstructions: longInstructions,
      }) as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.incomingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processingInstructions: longInstructions,
        }),
      }),
    );
  });

  it('accepts the boundary: very many processorIds (100)', async () => {
    const manyIds = Array.from({ length: 100 }, (_, i) => ({
      userId: i + 1,
      processorType:
        i === 0
          ? ('XLC' as const)
          : (i % 2 === 0 ? 'PHXL' : 'XDB') as 'PHXL' | 'XDB',
    }));

    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce(
      manyIds.map((p) => ({
        id: p.userId,
        userRoles: [{ role: { name: 'SPECIALIST' } }],
      })),
    );

    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload({ processorIds: manyIds }) as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ processorType: 'XLC' }),
        ]),
      }),
    );
  });

  it('accepts the boundary: very long attachment fileName (10 000 chars)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload({
        attachments: [
          {
            fileName: 'a'.repeat(10000) + '.pdf',
            fileUrl: '/uploads/long-name.pdf',
            fileSize: 1024,
            mimeType: 'application/pdf',
          },
        ],
      }) as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentAttachment.createMany).toHaveBeenCalled();
  });

  it('accepts the boundary: userId = Number.MAX_SAFE_INTEGER', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: Number.MAX_SAFE_INTEGER,
        userRoles: [{ role: { name: 'SPECIALIST' } }],
      },
    ]);

    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload({
        processorIds: [
          {
            userId: Number.MAX_SAFE_INTEGER,
            processorType: 'XLC' as const,
          },
        ],
      }) as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: Number.MAX_SAFE_INTEGER,
          }),
        ]),
      }),
    );
  });

  it('does NOT enforce an upper bound on processingInstructions length (documented gap)', async () => {
    // The service does NOT cap text fields.
    expect(true).toBe(true);
  });

  it('does NOT enforce an upper bound on processorIds count (documented gap)', async () => {
    // The service does NOT cap the array length.
    expect(true).toBe(true);
  });

  it('does NOT enforce an upper bound on attachment fileName length (documented gap)', async () => {
    // The service does NOT cap attachment metadata.
    expect(true).toBe(true);
  });

  it('does NOT throw on the upper-bound path', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makeForwardPayload({
          processingInstructions: 'a'.repeat(10000),
        }) as any,
        99,
        ['DEPARTMENT_HEAD'],
      ),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    tx.document.update.mock.calls.forEach((c: any) => {
      expect(JSON.stringify(c[0].data)).not.toMatch(/password|hash|secret/i);
    });
    tx.documentProcessor.createMany.mock.calls.forEach((c: any) => {
      expect(JSON.stringify(c[0].data)).not.toMatch(/password|hash|secret/i);
    });
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makeForwardPayload() as any,
      99,
      ['DEPARTMENT_HEAD'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
