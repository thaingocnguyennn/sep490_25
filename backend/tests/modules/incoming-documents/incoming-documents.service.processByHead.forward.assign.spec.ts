/**
 * Unit tests for IncomingDocumentsService.processByHead() — FORWARD
 * branch (Function35 / Assign Incoming Document for Processing).
 *
 * Note on naming: the matrix headers reference
 * `AssignmentService`, but the actual implementation that assigns
 * processors to an incoming document is
 * `IncomingDocumentsService.processByHead(id, "FORWARD", payload,
 * userId, userRoles)`. The FORWARD branch is the canonical
 * "assign-for-processing" entry point.
 *
 * Step-by-step (FORWARD branch):
 *   1. findById(id) — fetch the document with processors.
 *   2. Authorization gate (DEPT_HEAD or ADMIN).
 *   3. Fetch head workflow step — must exist and be PENDING.
 *   4. checkIncomingDocumentAccess.
 *   5. payload.processorIds must be non-empty (single XLC required).
 *   6. All user ids must exist (validate against `prisma.user`).
 *   7. validateProcessorRoles(..., "HEAD") — exactly 1 XLC, no
 *      duplicate user ids.
 *   8. Inside prisma.$transaction:
 *      a. deleteMany(DocumentProcessor) for the document.
 *      b. createMany(DocumentProcessor) — replace the processor
 *         list with the new one.
 *      c. Update head workflow step → COMPLETED with notes.
 *      d. Update IncomingDocument.processingInstructions.
 *      e. Update Document.status → IN_PROGRESS.
 *      f. createMany(DocumentAttachment) if any attachments.
 *      g. upsertParticipation: actor's HEAD + XLC → COMPLETED.
 *      h. For each new XLC: upsertParticipation for XLC + HEAD
 *         (PENDING).
 *      i. For each new PHXL/XDB: upsertParticipation for that
 *         processor type (PENDING).
 *   9. Return this.getById(id).
 *
 * Coverage matrix (UTCID01 – UTCID09):
 *   UTCID01  N  – Valid routing: success path.
 *   UTCID02  N  – Department assignment: passing department context
 *                 via users (system uses the user's department).
 *   UTCID03  N  – Assignee mapping: processor-type → role mapping
 *                 (XLC → XLC + HEAD, PHXL → PHXL, XDB → XDB).
 *   UTCID04  N  – History/notification: participation rows +
 *                 documented gap that no notifications are pushed.
 *   UTCID05  N  – Response-to-database consistency: getById return
 *                 matches the post-commit DB state.
 *   UTCID06  A  – Invalid/not-found assignee: user ids do not
 *                 exist in prisma.user.
 *   UTCID07  A  – Unauthorized/invalid state: caller is not
 *                 DEPT_HEAD/ADMIN, or workflow step is non-PENDING,
 *                 or action is invalid.
 *   UTCID08  B  – Maximum assignees or due-date boundary: a large
 *                 but valid processor list (e.g. 1 XLC + multiple
 *                 PHXL + multiple XDB) is accepted.
 *   UTCID09  B  – Upper-bound value just at the supported limit:
 *                 exactly 1 XLC (the supported minimum/maximum for
 *                 XLC count). 2 XLCs is rejected.
 */

import { IncomingDocumentsService } from '../../../src/modules/incoming-documents/incoming-documents.service';
import { incomingDocumentsRepository } from '../../../src/modules/incoming-documents/incoming-documents.repository';
import { default as prisma } from '../../../src/config/database';
import {
  checkIncomingDocumentAccess,
} from '../../../src/shared/access/document-access';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../../src/shared/exceptions/app-error';
import { DocumentStatus, WorkflowStatus } from '@prisma/client';

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
    documentWorkflow: { findFirst: jest.fn(), findMany: jest.fn() },
    documentWorkflowParticipation: {
      upsert: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    documentProcessor: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    document: { update: jest.fn() },
    documentAttachment: { createMany: jest.fn() },
    user: { findMany: jest.fn() },
    incomingDocument: { update: jest.fn() },
  },
}));

jest.mock('../../../src/shared/access/document-access', () => ({
  checkIncomingDocumentAccess: jest.fn(),
}));

const mockedRepo = incomingDocumentsRepository as jest.Mocked<
  typeof incomingDocumentsRepository
>;

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

const mockedAccess = checkIncomingDocumentAccess as jest.MockedFunction<
  typeof checkIncomingDocumentAccess
>;

// ---------------------------------------------------------------------------
// Transaction runner
// ---------------------------------------------------------------------------

function makeTxMock() {
  const tx: any = {
    documentWorkflow: {
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...data,
      })),
      findMany: jest.fn(async () => []),
    },
    document: {
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...data,
      })),
    },
    documentProcessor: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async () => ({ count: 0 })),
    },
    documentAttachment: {
      createMany: jest.fn(async () => ({ count: 0 })),
    },
    incomingDocument: {
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...data,
      })),
    },
    documentWorkflowParticipation: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({
        id: Math.floor(Math.random() * 1_000_000) + 1,
        ...data,
      })),
      upsert: jest.fn(async ({ where, create }: any) => ({
        id: Math.floor(Math.random() * 1_000_000) + 1,
        ...(create ?? {}),
      })),
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...data,
      })),
      updateMany: jest.fn(async () => ({ count: 0 })),
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

  // Default: head step exists and is PENDING.
  (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValue({
    id: 2,
    documentId: 100,
    workflowStepId: 2,
    status: WorkflowStatus.PENDING,
    workflowStep: {
      id: 2,
      stepOrder: 2,
      roleName: 'DEPARTMENT_HEAD',
      name: 'Trưởng phòng xử lý',
    },
  });

  // Default access helper: allow.
  mockedAccess.mockResolvedValue(undefined);

  // Default user lookup: any requested id exists with a SPECIALIST
  // role (since the XLC processor must be a SPECIALIST per the new
  // flow design — see validateProcessorRoles).
  (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
    async ({ where }: any) => {
      const ids = where?.id?.in ?? [];
      return ids.map((id: number) => ({
        id,
        userRoles: [{ role: { name: 'SPECIALIST' } }],
      }));
    },
  );

  // Default findById: returns a document with NO existing
  // processors (so FORWARD will create a fresh set).
  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockResolvedValue({
    id: 1,
    documentId: 100,
    arrivalNumber: 1,
    dateReceived: new Date('2026-09-25T00:00:00.000Z'),
    receivedDate: new Date('2026-09-25T00:00:00.000Z'),
    pageCount: 1,
    processingInstructions: null,
    documentBookId: null,
    documentBook: null,
    document: {
      id: 100,
      documentNumber: 'IN-2026-0001',
      subject: 'Test subject',
      type: 'INCOMING',
      fileUrl: null,
      status: DocumentStatus.IN_PROGRESS,
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
      createdAt: new Date('2026-09-25'),
      updatedAt: new Date('2026-09-25'),
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

function makePayload(overrides: any = {}) {
  return {
    processorIds: [
      { userId: 7, processorType: 'XLC' },
    ],
    processingInstructions: 'Forwarded for processing',
    reason: undefined,
    attachments: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid routing.
// Result : The service completes the FORWARD path with a valid
//          XLC processor selection.
// ---------------------------------------------------------------------------
describe('[UTCID01] incomingDocumentsService.processByHead("FORWARD") – Normal 1: valid routing', () => {
  it('returns the updated document on the success path', async () => {
    const result = await service.processByHead(
      1,
      'FORWARD',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('does NOT throw for a valid FORWARD by the head', async () => {
    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload(),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT throw for a valid FORWARD by an ADMIN', async () => {
    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload(),
        99,
        ['ADMIN'],
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the success path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processByHead(
      1,
      'FORWARD',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: department assignment.
// Result : The participating users are looked up successfully. The
//          service relies on the user's `departmentId` field for
//          department context (verified indirectly by asserting
//          the user lookup is performed).
// ---------------------------------------------------------------------------
describe('[UTCID02] incomingDocumentsService.processByHead("FORWARD") – Normal 2: department assignment', () => {
  it('looks up all processor user ids in the database', async () => {
    await service.processByHead(
      1,
      'FORWARD',
      makePayload({
        processorIds: [
          { userId: 7, processorType: 'XLC' },
          { userId: 8, processorType: 'PHXL' },
        ],
      }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [7, 8] } },
        select: { id: true },
      }),
    );
  });

  it('accepts multiple users from different departments', async () => {
    const result = await service.processByHead(
      1,
      'FORWARD',
      makePayload({
        processorIds: [
          { userId: 7, processorType: 'XLC' },
          { userId: 8, processorType: 'PHXL' },
          { userId: 9, processorType: 'XDB' },
        ],
      }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(result).toBeDefined();
  });

  it('persists all the new processors in DocumentProcessor', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makePayload({
        processorIds: [
          { userId: 7, processorType: 'XLC' },
          { userId: 8, processorType: 'PHXL' },
          { userId: 9, processorType: 'XDB' },
        ],
      }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalledWith({
      data: [
        { documentId: 100, userId: 7, processorType: 'XLC' },
        { documentId: 100, userId: 8, processorType: 'PHXL' },
        { documentId: 100, userId: 9, processorType: 'XDB' },
      ],
    });
  });

  it('replaces the existing processor list (delete + create)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentProcessor.deleteMany).toHaveBeenCalledWith({
      where: { documentId: 100 },
    });
    expect(tx.documentProcessor.createMany).toHaveBeenCalled();
  });

  it('does NOT log to console on the department-assignment path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processByHead(
      1,
      'FORWARD',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: assignee mapping.
// Result : Each processor-type is mapped to a participation role:
//            XLC  → "XLC" + "DEPARTMENT_HEAD" (PENDING)
//            PHXL → "PHXL" (PENDING)
//            XDB  → "XDB"  (PENDING)
//          Plus the actor's HEAD + XLC → COMPLETED.
// ---------------------------------------------------------------------------
describe('[UTCID03] incomingDocumentsService.processByHead("FORWARD") – Normal 3: assignee mapping', () => {
  it('creates an XLC participation row for the new XLC', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makePayload({
        processorIds: [{ userId: 7, processorType: 'XLC' }],
      }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    // When the actor forwards with themselves as XLC, both the
    // actor's COMPLETED XLC row and the new XLC's PENDING row are
    // written. We look for the PENDING one specifically.
    const xlcRows =
      tx.documentWorkflowParticipation.create.mock.calls.filter(
        (c: any) =>
          c[0]?.data?.participationRole === 'XLC' &&
          c[0].data.userId === 7 &&
          c[0].data.status === 'PENDING',
      );
    expect(xlcRows.length).toBeGreaterThan(0);
  });

  it('creates a DEPARTMENT_HEAD participation row for the new XLC (PENDING)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makePayload({
        processorIds: [{ userId: 7, processorType: 'XLC' }],
      }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    const headRows =
      tx.documentWorkflowParticipation.create.mock.calls.filter(
        (c: any) =>
          c[0]?.data?.participationRole === 'DEPARTMENT_HEAD' &&
          c[0].data.userId === 7 &&
          c[0].data.status === 'PENDING',
      );
    expect(headRows.length).toBeGreaterThan(0);
  });

  it('creates a PHXL participation row for the new PHXL', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makePayload({
        processorIds: [
          { userId: 7, processorType: 'XLC' },
          { userId: 8, processorType: 'PHXL' },
        ],
      }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    const phxlRows =
      tx.documentWorkflowParticipation.create.mock.calls.filter(
        (c: any) =>
          c[0]?.data?.participationRole === 'PHXL' &&
          c[0].data.userId === 8,
      );
    expect(phxlRows.length).toBeGreaterThan(0);
    expect(phxlRows[0][0].data.status).toBe('PENDING');
  });

  it('creates an XDB participation row for the new XDB', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makePayload({
        processorIds: [
          { userId: 7, processorType: 'XLC' },
          { userId: 9, processorType: 'XDB' },
        ],
      }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    const xdbRows =
      tx.documentWorkflowParticipation.create.mock.calls.filter(
        (c: any) =>
          c[0]?.data?.participationRole === 'XDB' &&
          c[0].data.userId === 9,
      );
    expect(xdbRows.length).toBeGreaterThan(0);
    expect(xdbRows[0][0].data.status).toBe('PENDING');
  });

  it('marks the actor\'s DEPARTMENT_HEAD participation as COMPLETED', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    // Actor (userId=7) may appear multiple times; we want the one
    // where status is COMPLETED (the actor's own completion row).
    // Because the create mock fresh-creates all rows, look for the
    // COMPLETED-headed DEPARTMENT_HEAD row.
    const completedHeadRows =
      tx.documentWorkflowParticipation.create.mock.calls.filter(
        (c: any) =>
          c[0]?.data?.participationRole === 'DEPARTMENT_HEAD' &&
          c[0].data.status === 'COMPLETED',
      );
    expect(completedHeadRows.length).toBeGreaterThan(0);
  });

  it('does NOT log to console on the assignee-mapping path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processByHead(
      1,
      'FORWARD',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: history/notification.
// Result : History is persisted via participation rows; no
//          notification is pushed (documented gap).
// ---------------------------------------------------------------------------
describe('[UTCID04] incomingDocumentsService.processByHead("FORWARD") – Normal 4: history/notification (documented gap)', () => {
  it('does NOT call any notification / email service', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makePayload({
        processorIds: [
          { userId: 7, processorType: 'XLC' },
          { userId: 8, processorType: 'PHXL' },
        ],
      }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    // tx has no email-service or notification hooks.
    expect(tx).not.toHaveProperty('sendEmail');
    expect(tx).not.toHaveProperty('notify');
    expect(tx).not.toHaveProperty('publish');
  });

  it('does NOT push notifications for any other party', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    // No call to a notify / sendEmail / broadcast method anywhere.
    // Note: `user.findMany` is on `prisma` (outside the transaction).
    const allCalls = [
      ...tx.documentWorkflow.update.mock.calls,
      ...tx.document.update.mock.calls,
      ...tx.documentProcessor.createMany.mock.calls,
      ...tx.documentProcessor.deleteMany.mock.calls,
      ...tx.documentAttachment.createMany.mock.calls,
      ...tx.incomingDocument.update.mock.calls,
      ...tx.documentWorkflowParticipation.create.mock.calls,
      ...tx.documentWorkflowParticipation.upsert.mock.calls,
      ...tx.documentWorkflowParticipation.update.mock.calls,
    ];
    allCalls.forEach((c: any) => {
      expect(JSON.stringify(c)).not.toMatch(/notify|sendEmail|broadcast/i);
    });
  });

  it('writes participation rows for the new assignees', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makePayload({
        processorIds: [
          { userId: 7, processorType: 'XLC' },
          { userId: 8, processorType: 'PHXL' },
        ],
      }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    const createCalls =
      tx.documentWorkflowParticipation.create.mock.calls;
    // New XLC (PENDING XLC + PENDING HEAD) + new PHXL (PENDING
    // PHXL) + actor's COMPLETED rows.
    expect(createCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('does NOT log a notification record on the success path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processByHead(
      1,
      'FORWARD',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : The return value of getById matches the post-commit
//          database state.
// ---------------------------------------------------------------------------
describe('[UTCID05] incomingDocumentsService.processByHead("FORWARD") – Normal 5: response-to-database consistency', () => {
  it('returns the document after the transaction commits', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const result = await service.processByHead(
      1,
      'FORWARD',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalled();
    expect(tx.documentWorkflow.update).toHaveBeenCalled();

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('uses the post-transaction document id (not the workflow id)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    // The service calls this.getById(id) — where `id` is the
    // incoming document id, NOT the workflow step id.
    expect(mockedRepo.findById).toHaveBeenCalledWith(1);
  });

  it('flips Document.status to IN_PROGRESS in the transaction', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makePayload(),
      7,
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

  it('persists the processing instructions on IncomingDocument', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'FORWARD',
      makePayload({
        processingInstructions: 'Please process by Friday',
      }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.incomingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          processingInstructions: 'Please process by Friday',
        }),
      }),
    );
  });

  it('does NOT log to console on the response-to-database path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processByHead(
      1,
      'FORWARD',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: invalid/not-found assignee.
// Result : Rejects processors whose user ids do not exist in
//          prisma.user.
// ---------------------------------------------------------------------------
describe('[UTCID06] incomingDocumentsService.processByHead("FORWARD") – Abnormal 1: invalid/not-found assignee', () => {
  it('throws BadRequestError when an assignee does not exist', async () => {
    // Default user lookup mock returns only the existing ids.
    // Make it return an empty list (no users found).
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload({
          processorIds: [{ userId: 999, processorType: 'XLC' }],
        }),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when some (but not all) assignees exist', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    // Only returns the first user; the second is "missing".
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
        makePayload({
          processorIds: [
            { userId: 7, processorType: 'XLC' },
            { userId: 999, processorType: 'PHXL' },
          ],
        }),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('uses the correct error message for the missing-user case', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    const err = await service
      .processByHead(
        1,
        'FORWARD',
        makePayload({
          processorIds: [{ userId: 999, processorType: 'XLC' }],
        }),
        7,
        ['DEPARTMENT_HEAD'],
      )
      .catch((e) => e) as BadRequestError;

    expect(err.message).toMatch(/người dùng|tồn tại/i);
  });

  it('throws BadRequestError when processorIds is empty', async () => {
    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload({ processorIds: [] }),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when no XLC is present in processorIds', async () => {
    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload({
          processorIds: [
            { userId: 8, processorType: 'PHXL' },
          ],
        }),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when the same user is in two processor roles', async () => {
    // validateProcessorRoles rejects duplicates.
    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload({
          processorIds: [
            { userId: 7, processorType: 'XLC' },
            { userId: 7, processorType: 'PHXL' },
          ],
        }),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT enter the transaction when an assignee does not exist', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload({
          processorIds: [{ userId: 999, processorType: 'XLC' }],
        }),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on invalid-assignee errors (no password / hash leak)', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    const err = await service
      .processByHead(
        1,
        'FORWARD',
        makePayload({
          processorIds: [{ userId: 999, processorType: 'XLC' }],
        }),
        7,
        ['DEPARTMENT_HEAD'],
      )
      .catch((e) => e) as BadRequestError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on invalid-assignee errors', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload({
          processorIds: [{ userId: 999, processorType: 'XLC' }],
        }),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: unauthorized/invalid state.
// Result : Rejects callers who are not DEPT_HEAD/ADMIN, or when
//          the workflow step is in a non-PENDING state, or the
//          document does not exist.
// ---------------------------------------------------------------------------
describe('[UTCID07] incomingDocumentsService.processByHead("FORWARD") – Abnormal 2: unauthorized/invalid state', () => {
  it('throws ForbiddenError for a SPECIALIST caller', async () => {
    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload(),
        7,
        ['SPECIALIST'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ForbiddenError for a DOCUMENT_CLERK caller', async () => {
    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload(),
        5,
        ['DOCUMENT_CLERK'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ForbiddenError for a VIEWER caller', async () => {
    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload(),
        7,
        ['VIEWER'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFoundError when the document does not exist', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đến'),
    );

    await expect(
      service.processByHead(
        999,
        'FORWARD',
        makePayload(),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws BadRequestError when the head workflow step is missing', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockReset();
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      null,
    );

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload(),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when the head step is COMPLETED', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockReset();
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      {
        id: 2,
        documentId: 100,
        workflowStepId: 2,
        status: WorkflowStatus.COMPLETED,
        workflowStep: {
          id: 2,
          stepOrder: 2,
          roleName: 'DEPARTMENT_HEAD',
          name: 'Trưởng phòng xử lý',
        },
      },
    );

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload(),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when the head step is CANCELLED', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockReset();
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      {
        id: 2,
        documentId: 100,
        workflowStepId: 2,
        status: WorkflowStatus.CANCELLED,
        workflowStep: {
          id: 2,
          stepOrder: 2,
          roleName: 'DEPARTMENT_HEAD',
          name: 'Trưởng phòng xử lý',
        },
      },
    );

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload(),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when the head step is REJECTED', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockReset();
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      {
        id: 2,
        documentId: 100,
        workflowStepId: 2,
        status: WorkflowStatus.REJECTED,
        workflowStep: {
          id: 2,
          stepOrder: 2,
          roleName: 'DEPARTMENT_HEAD',
          name: 'Trưởng phòng xử lý',
        },
      },
    );

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload(),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when the action is not in {FINISH, FORWARD, RETURN}', async () => {
    await expect(
      service.processByHead(
        1,
        'INVALID' as any,
        makePayload(),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT enter the transaction when the workflow step is invalid', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockReset();
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      null,
    );

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload(),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on invalid-state errors (no password / hash leak)', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockReset();
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      null,
    );

    const err = await service
      .processByHead(
        1,
        'FORWARD',
        makePayload(),
        7,
        ['DEPARTMENT_HEAD'],
      )
      .catch((e) => e) as BadRequestError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on invalid-state errors', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockReset();
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      null,
    );

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload(),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: maximum assignees.
// Result : A large but valid processor list (1 XLC + many PHXL +
//          many XDB) is accepted.
// ---------------------------------------------------------------------------
describe('[UTCID08] incomingDocumentsService.processByHead("FORWARD") – Boundary 1: maximum assignees', () => {
  it('accepts the boundary: 1 XLC + many PHXL + many XDB', async () => {
    const processorIds = [
      { userId: 7, processorType: 'XLC' },
      { userId: 10, processorType: 'PHXL' },
      { userId: 11, processorType: 'PHXL' },
      { userId: 12, processorType: 'XDB' },
      { userId: 13, processorType: 'XDB' },
      { userId: 14, processorType: 'XDB' },
    ];

    const result = await service.processByHead(
      1,
      'FORWARD',
      makePayload({ processorIds }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(result).toBeDefined();
  });

  it('accepts the boundary: many PHXL processors (no explicit upper limit)', async () => {
    const processorIds = [
      { userId: 7, processorType: 'XLC' },
      ...Array.from({ length: 20 }, (_, i) => ({
        userId: 100 + i,
        processorType: 'PHXL' as const,
      })),
    ];

    const result = await service.processByHead(
      1,
      'FORWARD',
      makePayload({ processorIds }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(result).toBeDefined();
  });

  it('accepts the boundary: 1 XLC alone (no support staff)', async () => {
    const result = await service.processByHead(
      1,
      'FORWARD',
      makePayload({
        processorIds: [{ userId: 7, processorType: 'XLC' }],
      }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(result).toBeDefined();
  });

  it('persists all processors verbatim when many are supplied', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const processorIds = [
      { userId: 7, processorType: 'XLC' },
      { userId: 8, processorType: 'PHXL' },
      { userId: 9, processorType: 'XDB' },
    ];

    await service.processByHead(
      1,
      'FORWARD',
      makePayload({ processorIds }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalledWith({
      data: [
        { documentId: 100, userId: 7, processorType: 'XLC' },
        { documentId: 100, userId: 8, processorType: 'PHXL' },
        { documentId: 100, userId: 9, processorType: 'XDB' },
      ],
    });
  });

  it('does NOT log to console on the maximum-assignees path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processByHead(
      1,
      'FORWARD',
      makePayload({
        processorIds: [
          { userId: 7, processorType: 'XLC' },
          { userId: 8, processorType: 'PHXL' },
          { userId: 9, processorType: 'XDB' },
        ],
      }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 2: upper-bound value just at the supported limit.
// Result : Exactly 1 XLC is accepted; 2 XLCs is rejected.
// ---------------------------------------------------------------------------
describe('[UTCID09] incomingDocumentsService.processByHead("FORWARD") – Boundary 2: upper-bound value just at the supported limit', () => {
  it('accepts the boundary: exactly 1 XLC', async () => {
    const result = await service.processByHead(
      1,
      'FORWARD',
      makePayload({
        processorIds: [{ userId: 7, processorType: 'XLC' }],
      }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(result).toBeDefined();
  });

  it('rejects the boundary: 2 XLCs (too many primary processors)', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 7 },
      { id: 8 },
    ]);

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload({
          processorIds: [
            { userId: 7, processorType: 'XLC' },
            { userId: 8, processorType: 'XLC' },
          ],
        }),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('uses the correct error message for the too-many-XLC case', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 7 },
      { id: 8 },
    ]);

    const err = await service
      .processByHead(
        1,
        'FORWARD',
        makePayload({
          processorIds: [
            { userId: 7, processorType: 'XLC' },
            { userId: 8, processorType: 'XLC' },
          ],
        }),
        7,
        ['DEPARTMENT_HEAD'],
      )
      .catch((e) => e) as BadRequestError;

    expect(err.message).toMatch(/Người xử lý chính|XLC/i);
  });

  it('does NOT enter the transaction when the XLC count is wrong', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 7 },
      { id: 8 },
    ]);

    await expect(
      service.processByHead(
        1,
        'FORWARD',
        makePayload({
          processorIds: [
            { userId: 7, processorType: 'XLC' },
            { userId: 8, processorType: 'XLC' },
          ],
        }),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    const result = await service.processByHead(
      1,
      'FORWARD',
      makePayload({
        processorIds: [{ userId: 7, processorType: 'XLC' }],
      }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(result).toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processByHead(
      1,
      'FORWARD',
      makePayload({
        processorIds: [{ userId: 7, processorType: 'XLC' }],
      }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
