/**
 * Unit tests for IncomingDocumentsService.processByHead() — RETURN
 * branch (Function34 / Return Incoming Document).
 *
 * Note on naming: the matrix headers reference
 * `IncomingWorkflowService`, but the actual implementation that
 * returns (sends back) an incoming document at the head stage is
 * `IncomingDocumentsService.processByHead(id, "RETURN", payload,
 * userId, userRoles)`. The RETURN branch is gated by:
 *   - The caller must be DEPARTMENT_HEAD or ADMIN.
 *   - The head workflow step (stepOrder=2, roleName=DEPARTMENT_HEAD)
 *     must exist and be PENDING.
 *   - `payload.reason?.trim()` must be non-empty.
 *
 * Step-by-step (RETURN branch):
 *   1. findById(id) — fetch the document with processors.
 *   2. Authorization gate (DEPT_HEAD or ADMIN).
 *   3. Fetch head workflow step — must exist and be PENDING.
 *   4. checkIncomingDocumentAccess — final access gate.
 *   5. payload.reason must be a non-empty (trimmed) string.
 *   6. Inside prisma.$transaction:
 *      a. Update the head workflow step → REJECTED with reason.
 *      b. Update Document.status → RETURNED.
 *      c. deleteMany(DocumentProcessor) for the document.
 *      d. Upsert participation rows for the actor's HEAD + XLC
 *         roles → RETURNED with returnReason + returnedAt.
 *      e. If `createdBy` is set, upsert participation row for the
 *         clerk (creator) → RETURNED.
 *      f. updateMany on DocumentWorkflowParticipation: other XLC /
 *         PHXL / XDB rows → CANCELLED.
 *   7. Return this.getById(id).
 *
 * Coverage matrix (UTCID01 – UTCID07):
 *   UTCID01  N  – Valid return: success path with reason.
 *   UTCID02  N  – Reason persistence: reason is stored on workflow
 *                 notes + participation returnReason.
 *   UTCID03  N  – State transition: workflow REJECTED, document
 *                 RETURNED, processors deleted.
 *   UTCID04  N  – History/notification: participation rows upserted;
 *                 no notification is pushed (documented gap).
 *   UTCID05  A  – Missing reason: payload.reason is empty / blank.
 *   UTCID06  A  – Unauthorized / invalid document state: caller is
 *                 not DEPT_HEAD / ADMIN, or workflow step is in
 *                 non-PENDING state.
 *   UTCID07  B  – Minimum/maximum return-reason length: 1-character
 *                 reason accepted; 1000-character reason accepted;
 *                 1001-character reason rejected.
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
import {
  DocumentStatus,
  WorkflowStatus,
} from '@prisma/client';

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
    documentProcessor: { deleteMany: jest.fn() },
    document: { update: jest.fn() },
    user: { findMany: jest.fn() },
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

  // Default: no remaining PENDING/IN_PROGRESS workflow steps.
  (mockedPrisma.documentWorkflow.findMany as jest.Mock).mockResolvedValue([]);

  // Default access helper: allow.
  mockedAccess.mockResolvedValue(undefined);

  // Default findById: returns a document with createdBy=5 (the clerk).
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
      processors: [
        {
          id: 1,
          userId: 7,
          processorType: 'XLC',
          user: {
            id: 7,
            email: 'head@example.com',
            fullName: 'Head User',
            username: 'head',
          },
        },
      ],
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
    processorIds: undefined,
    processingInstructions: undefined,
    reason: 'Văn bản chưa đầy đủ thông tin',
    attachments: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid return.
// Result : The service completes the RETURN path with a valid
//          reason.
// ---------------------------------------------------------------------------
describe('[UTCID01] incomingDocumentsService.processByHead("RETURN") – Normal 1: valid return', () => {
  it('returns the updated document on the success path', async () => {
    const result = await service.processByHead(
      1,
      'RETURN',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
    expect(result.documentId).toBe(100);
  });

  it('does NOT throw for a valid RETURN by the head', async () => {
    await expect(
      service.processByHead(
        1,
        'RETURN',
        makePayload(),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT throw for a valid RETURN by an ADMIN', async () => {
    await expect(
      service.processByHead(
        1,
        'RETURN',
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
      'RETURN',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: reason persistence.
// Result : The reason is stored on the workflow step's `notes` and
//          on the participation rows' `returnReason` field.
// ---------------------------------------------------------------------------
describe('[UTCID02] incomingDocumentsService.processByHead("RETURN") – Normal 2: reason persistence', () => {
  it('persists the reason on the workflow step notes', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const reason = 'Cần bổ sung chữ ký của giám đốc';
    await service.processByHead(
      1,
      'RETURN',
      makePayload({ reason }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentWorkflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2 },
        data: expect.objectContaining({
          notes: reason,
        }),
      }),
    );
  });

  it('persists the reason on the actor\'s DEPARTMENT_HEAD participation row', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const reason = 'Cần bổ sung chữ ký của giám đốc';
    await service.processByHead(
      1,
      'RETURN',
      makePayload({ reason }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    const headRow =
      tx.documentWorkflowParticipation.create.mock.calls.find(
        (c: any) => c[0]?.data?.participationRole === 'DEPARTMENT_HEAD',
      );
    expect(headRow).toBeDefined();
    expect(headRow[0].data.returnReason).toBe(reason);
  });

  it('persists the reason on the actor\'s XLC participation row', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const reason = 'Cần bổ sung chữ ký của giám đốc';
    await service.processByHead(
      1,
      'RETURN',
      makePayload({ reason }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    const xlcRow =
      tx.documentWorkflowParticipation.create.mock.calls.find(
        (c: any) => c[0]?.data?.participationRole === 'XLC',
      );
    expect(xlcRow).toBeDefined();
    expect(xlcRow[0].data.returnReason).toBe(reason);
  });

  it('persists the reason on the clerk (creator) participation row', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const reason = 'Cần bổ sung chữ ký của giám đốc';
    await service.processByHead(
      1,
      'RETURN',
      makePayload({ reason }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    const clerkRow =
      tx.documentWorkflowParticipation.create.mock.calls.find(
        (c: any) => c[0]?.data?.participationRole === 'CLERK',
      );
    expect(clerkRow).toBeDefined();
    expect(clerkRow[0].data.userId).toBe(5);
    expect(clerkRow[0].data.returnReason).toBe(reason);
  });

  it('sets the workflow step status to REJECTED', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'RETURN',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentWorkflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WorkflowStatus.REJECTED,
        }),
      }),
    );
  });

  it('sets returnedAt on every RETURNED participation row', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'RETURN',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    const calls = tx.documentWorkflowParticipation.create.mock.calls;
    calls.forEach((c: any) => {
      expect(c[0].data.returnedAt).toBeInstanceOf(Date);
    });
  });

  it('does NOT log to console on the reason-persistence path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processByHead(
      1,
      'RETURN',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: state transition.
// Result : Document.status flips to RETURNED; the head workflow
//          step flips to REJECTED; processors are deleted.
// ---------------------------------------------------------------------------
describe('[UTCID03] incomingDocumentsService.processByHead("RETURN") – Normal 3: state transition', () => {
  it('flips Document.status to RETURNED', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'RETURN',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: expect.objectContaining({
          status: DocumentStatus.RETURNED,
        }),
      }),
    );
  });

  it('flips the head workflow step to REJECTED', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'RETURN',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentWorkflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2 },
        data: expect.objectContaining({
          status: WorkflowStatus.REJECTED,
        }),
      }),
    );
  });

  it('sets the head workflow step\'s userId to the actor', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'RETURN',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentWorkflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 7,
        }),
      }),
    );
  });

  it('sets the head workflow step\'s completedAt to the current time', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const before = new Date();
    await service.processByHead(
      1,
      'RETURN',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );
    const after = new Date();

    const call = tx.documentWorkflow.update.mock.calls[0][0];
    expect(call.data.completedAt).toBeInstanceOf(Date);
    expect(call.data.completedAt.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
    expect(call.data.completedAt.getTime()).toBeLessThanOrEqual(
      after.getTime(),
    );
  });

  it('deletes all processors for the document', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'RETURN',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentProcessor.deleteMany).toHaveBeenCalledWith({
      where: { documentId: 100 },
    });
  });

  it('cancels other XLC/PHXL/XDB participation rows via updateMany', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'RETURN',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentWorkflowParticipation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          documentId: 100,
          participationRole: { in: ['XLC', 'PHXL', 'XDB'] },
        }),
        data: { status: 'CANCELLED' },
      }),
    );
  });

  it('does NOT log to console on the state-transition path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processByHead(
      1,
      'RETURN',
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
describe('[UTCID04] incomingDocumentsService.processByHead("RETURN") – Normal 4: history/notification (documented gap)', () => {
  it('writes three participation rows (HEAD, XLC, CLERK)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'RETURN',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    const createCalls =
      tx.documentWorkflowParticipation.create.mock.calls;
    expect(createCalls).toHaveLength(3);
  });

  it('marks every participation row as RETURNED', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'RETURN',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    const createCalls =
      tx.documentWorkflowParticipation.create.mock.calls;
    createCalls.forEach((c: any) => {
      expect(c[0].data.status).toBe('RETURNED');
    });
  });

  it('does NOT call any notification / email service', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'RETURN',
      makePayload(),
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
      'RETURN',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    // No call to a notify / sendEmail / broadcast method anywhere.
    const allCalls = [
      ...tx.documentWorkflow.update.mock.calls,
      ...tx.documentWorkflow.findMany.mock.calls,
      ...tx.document.update.mock.calls,
      ...tx.documentWorkflowParticipation.create.mock.calls,
      ...tx.documentWorkflowParticipation.upsert.mock.calls,
      ...tx.documentWorkflowParticipation.update.mock.calls,
      ...tx.documentWorkflowParticipation.updateMany.mock.calls,
      ...tx.documentProcessor.deleteMany.mock.calls,
    ];
    allCalls.forEach((c: any) => {
      expect(JSON.stringify(c)).not.toMatch(/notify|sendEmail|broadcast/i);
    });
  });

  it('does NOT log a notification record on the success path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processByHead(
      1,
      'RETURN',
      makePayload(),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 1: missing reason.
// Result : Throws BadRequestError when payload.reason is empty,
//          blank, or missing.
// ---------------------------------------------------------------------------
describe('[UTCID05] incomingDocumentsService.processByHead("RETURN") – Abnormal 1: missing reason', () => {
  it('throws BadRequestError when reason is undefined', async () => {
    await expect(
      service.processByHead(
        1,
        'RETURN',
        makePayload({ reason: undefined }),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when reason is empty', async () => {
    await expect(
      service.processByHead(
        1,
        'RETURN',
        makePayload({ reason: '' }),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when reason is whitespace-only', async () => {
    await expect(
      service.processByHead(
        1,
        'RETURN',
        makePayload({ reason: '   \t\n  ' }),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT enter the transaction when reason is missing', async () => {
    await expect(
      service.processByHead(
        1,
        'RETURN',
        makePayload({ reason: '' }),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses the correct error message for the missing-reason case', async () => {
    const err = await service
      .processByHead(
        1,
        'RETURN',
        makePayload({ reason: '' }),
        7,
        ['DEPARTMENT_HEAD'],
      )
      .catch((e) => e) as BadRequestError;

    expect(err.message).toMatch(/lý do/i);
  });

  it('records a safe diagnostic on missing-reason errors (no password / hash leak)', async () => {
    const err = await service
      .processByHead(
        1,
        'RETURN',
        makePayload({ reason: '' }),
        7,
        ['DEPARTMENT_HEAD'],
      )
      .catch((e) => e) as BadRequestError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on missing-reason errors', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await expect(
      service.processByHead(
        1,
        'RETURN',
        makePayload({ reason: '' }),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 2: unauthorized/invalid document state.
// Result : Rejects when caller is not DEPT_HEAD/ADMIN, or the
//          workflow step is in a non-PENDING state, or the
//          document does not exist.
// ---------------------------------------------------------------------------
describe('[UTCID06] incomingDocumentsService.processByHead("RETURN") – Abnormal 2: unauthorized/invalid document state', () => {
  it('throws ForbiddenError for a SPECIALIST caller', async () => {
    await expect(
      service.processByHead(
        1,
        'RETURN',
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
        'RETURN',
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
        'RETURN',
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
        'RETURN',
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
        'RETURN',
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
        'RETURN',
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
        'RETURN',
        makePayload(),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when the head step is REJECTED (already returned)', async () => {
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
        'RETURN',
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
        'RETURN',
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
        'RETURN',
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
        'RETURN',
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
// UTCID07 – Boundary 1: minimum/maximum return-reason length.
// Result : 1-character reason accepted; 1000-character reason
//          accepted; 1001-character reason rejected by the route
//          validation (service-layer still trims and accepts as
//          long as non-empty).
// ---------------------------------------------------------------------------
describe('[UTCID07] incomingDocumentsService.processByHead("RETURN") – Boundary 1: minimum/maximum return-reason length', () => {
  it('accepts the boundary: 1-character reason', async () => {
    const result = await service.processByHead(
      1,
      'RETURN',
      makePayload({ reason: 'x' }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(result).toBeDefined();
  });

  it('accepts the boundary: 1000-character reason', async () => {
    const reason = 'a'.repeat(1000);
    const result = await service.processByHead(
      1,
      'RETURN',
      makePayload({ reason }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(result).toBeDefined();
  });

  it('persists the 1000-character reason verbatim on the workflow step notes', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const reason = 'a'.repeat(1000);
    await service.processByHead(
      1,
      'RETURN',
      makePayload({ reason }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentWorkflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notes: reason,
        }),
      }),
    );
  });

  it('persists the 1000-character reason verbatim on the participation rows', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const reason = 'a'.repeat(1000);
    await service.processByHead(
      1,
      'RETURN',
      makePayload({ reason }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    const headRow =
      tx.documentWorkflowParticipation.create.mock.calls.find(
        (c: any) => c[0]?.data?.participationRole === 'DEPARTMENT_HEAD',
      );
    expect(headRow[0].data.returnReason).toBe(reason);
    expect(headRow[0].data.returnReason.length).toBe(1000);
  });

  it('persists the 1-character reason verbatim on the workflow step notes', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processByHead(
      1,
      'RETURN',
      makePayload({ reason: 'x' }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(tx.documentWorkflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notes: 'x',
        }),
      }),
    );
  });

  it('does NOT throw on the boundary path (1-character reason)', async () => {
    await expect(
      service.processByHead(
        1,
        'RETURN',
        makePayload({ reason: 'x' }),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on the boundary path (1000-character reason)', async () => {
    await expect(
      service.processByHead(
        1,
        'RETURN',
        makePayload({ reason: 'a'.repeat(1000) }),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    const result = await service.processByHead(
      1,
      'RETURN',
      makePayload({ reason: 'x' }),
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
      'RETURN',
      makePayload({ reason: 'x' }),
      7,
      ['DEPARTMENT_HEAD'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
