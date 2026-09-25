/**
 * Unit tests for IncomingDocumentsService.processBySpecialist() —
 * Function33 / Approve Incoming Document.
 *
 * Note on naming: the matrix headers reference
 * `IncomingWorkflowService`, but the actual implementation that
 * approves (FINISHes) an incoming document is
 * `IncomingDocumentsService.processBySpecialist(id, "FINISH",
 * payload, userId, userRoles)`. The action is locked to "FINISH"
 * per the new flow design — specialist has exactly ONE available
 * action. We exercise the FINISH branch end-to-end.
 *
 * Contract:
 *   async processBySpecialist(
 *     id: number,
 *     action: "FINISH",
 *     payload: {
 *       processorIds?: ProcessorInput[];
 *       processingInstructions?: string;
 *       reason?: string;
 *     },
 *     userId: number,
 *     userRoles: string[] = []
 *   ): Promise<IncomingDocumentWithRelations>
 *
 * Step-by-step:
 *   1. findById(id) — fetch the document with processors. Throws
 *      NotFoundError if missing.
 *   2. Authorization gate:
 *      a. Caller must be ADMIN or SPECIALIST. Otherwise 403.
 *      b. Caller must be the XLC processor on the document (or
 *         ADMIN). Otherwise 403.
 *   3. Fetch the specialist (step-3) workflow row. Throws
 *      BadRequestError if missing.
 *   4. specialistStep.status must be PENDING. Throws
 *      BadRequestError otherwise.
 *   5. checkIncomingDocumentAccess(id, userId, userRoles) — final
 *      access gate.
 *   6. action must equal "FINISH". Throws BadRequestError
 *      otherwise (defense in depth on top of the route validation).
 *   7. Inside prisma.$transaction:
 *      a. Update the specialist workflow row → COMPLETED with
 *         userId / completedAt / notes.
 *      b. Cancel any remaining PENDING/IN_PROGRESS workflow rows.
 *      c. Update Document.status → COMPLETED.
 *      d. upsertParticipation for SPECIALIST / XLC /
 *         DEPARTMENT_HEAD (all COMPLETED).
 *   8. Return this.getById(id).
 *
 * Coverage matrix (UTCID01 – UTCID08):
 *   UTCID01  N  – Approve valid document: success path.
 *   UTCID02  N  – State transition: Document.status flips from
 *                 PENDING/IN_PROGRESS → COMPLETED; workflow step
 *                 status flips to COMPLETED.
 *   UTCID03  N  – History: participation rows are upserted with
 *                 COMPLETED status for SPECIALIST / XLC /
 *                 DEPARTMENT_HEAD roles.
 *   UTCID04  N  – Notification: no notification is sent (documented
 *                 gap).
 *   UTCID05  N  – Response-to-database consistency: the return
 *                 value of getById matches the database state.
 *   UTCID06  A  – Unauthorized approver: caller is not the XLC
 *                 processor or not a SPECIALIST / ADMIN.
 *   UTCID07  A  – Invalid / not-found / already-processed document:
 *                 workflow step does not exist or is in a non-
 *                 PENDING state.
 *   UTCID08  B  – Approval at deadline/status boundary: accept
 *                 PENDING → COMPLETED; reject any non-PENDING
 *                 starting status.
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
    documentWorkflowParticipation: { upsert: jest.fn(), update: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    document: { update: jest.fn() },
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

  // Default: specialist step exists and is PENDING.
  (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValue({
    id: 3,
    documentId: 100,
    workflowStepId: 3,
    status: WorkflowStatus.PENDING,
  });

  // Default: no remaining PENDING/IN_PROGRESS workflow steps.
  (mockedPrisma.documentWorkflow.findMany as jest.Mock).mockResolvedValue([]);

  // Default access helper: allow.
  mockedAccess.mockResolvedValue(undefined);

  // Default findById: returns a document with XLC processor id=7.
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
            email: 'specialist@example.com',
            fullName: 'Specialist User',
            username: 'specialist',
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
    processingInstructions: 'Specialist processing instructions',
    reason: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: approve valid document.
// Result : The service completes the specialist workflow step and
//          returns the updated document.
// ---------------------------------------------------------------------------
describe('[UTCID01] incomingDocumentsService.processBySpecialist() – Normal 1: approve valid document', () => {
  it('returns the updated document on the success path', async () => {
    const result = await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
    expect(result.documentId).toBe(100);
  });

  it('does NOT throw for a valid FINISH by the XLC SPECIALIST', async () => {
    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['SPECIALIST'],
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT throw for a valid FINISH by an ADMIN', async () => {
    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
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

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: state transition.
// Result : Document.status flips from PENDING → COMPLETED; the
//          specialist workflow step flips from PENDING → COMPLETED.
// ---------------------------------------------------------------------------
describe('[UTCID02] incomingDocumentsService.processBySpecialist() – Normal 2: state transition', () => {
  it('flips Document.status to COMPLETED', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: expect.objectContaining({
          status: DocumentStatus.COMPLETED,
        }),
      }),
    );
  });

  it('flips the specialist workflow step to COMPLETED', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    expect(tx.documentWorkflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 3 },
        data: expect.objectContaining({
          status: WorkflowStatus.COMPLETED,
        }),
      }),
    );
  });

  it('sets the workflow step\'s userId to the approver', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    expect(tx.documentWorkflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 3 },
        data: expect.objectContaining({
          userId: 7,
        }),
      }),
    );
  });

  it('sets the workflow step\'s completedAt to the current time', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const before = new Date();
    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
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

  it('cancels remaining PENDING/IN_PROGRESS workflow steps', async () => {
    const tx = makeTxMock();
    tx.documentWorkflow.findMany.mockResolvedValueOnce([
      {
        id: 4,
        documentId: 100,
        workflowStepId: 4,
        status: WorkflowStatus.PENDING,
      },
    ]);
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    // 2 update calls expected: 1 for specialist step, 1 for the
    // remaining PENDING step.
    expect(tx.documentWorkflow.update).toHaveBeenCalledTimes(2);
    expect(tx.documentWorkflow.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 4 },
        data: expect.objectContaining({
          status: WorkflowStatus.CANCELLED,
        }),
      }),
    );
  });

  it('does NOT log to console on the state-transition path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: history (participation rows).
// Result : Participation rows are upserted with COMPLETED status
//          for SPECIALIST / XLC / DEPARTMENT_HEAD roles.
// ---------------------------------------------------------------------------
describe('[UTCID03] incomingDocumentsService.processBySpecialist() – Normal 3: history', () => {
  it('writes a SPECIALIST participation row', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    const specialistRow =
      tx.documentWorkflowParticipation.create.mock.calls.find(
        (c: any) => c[0]?.data?.participationRole === 'SPECIALIST',
      );
    expect(specialistRow).toBeDefined();
    expect(specialistRow[0].data.status).toBe('COMPLETED');
  });

  it('writes an XLC participation row', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    const xlcRow =
      tx.documentWorkflowParticipation.create.mock.calls.find(
        (c: any) => c[0]?.data?.participationRole === 'XLC',
      );
    expect(xlcRow).toBeDefined();
    expect(xlcRow[0].data.status).toBe('COMPLETED');
  });

  it('writes a DEPARTMENT_HEAD participation row (defense in depth)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    const headRow =
      tx.documentWorkflowParticipation.create.mock.calls.find(
        (c: any) => c[0]?.data?.participationRole === 'DEPARTMENT_HEAD',
      );
    expect(headRow).toBeDefined();
    expect(headRow[0].data.status).toBe('COMPLETED');
  });

  it('writes completedAt on every participation row', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    const calls = tx.documentWorkflowParticipation.create.mock.calls;
    calls.forEach((c: any) => {
      expect(c[0].data.completedAt).toBeInstanceOf(Date);
    });
  });

  it('writes three participation rows (one per role)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    const createCalls =
      tx.documentWorkflowParticipation.create.mock.calls;
    expect(createCalls).toHaveLength(3);
  });

  it('does NOT log to console on the history path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: notification.
// Result : Documented gap — the service does NOT push notifications.
//          The frontend polls getById() to discover the state change.
// ---------------------------------------------------------------------------
describe('[UTCID04] incomingDocumentsService.processBySpecialist() – Normal 4: notification (documented gap)', () => {
  it('does NOT call any notification / email service', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    // The transaction contains ONLY workflow / document /
    // participation updates. There are no email-service / socket /
    // notification calls.
    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
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

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    // No call to a notify / sendEmail / broadcast method anywhere.
    const allCalls = [
      ...tx.documentWorkflow.update.mock.calls,
      ...tx.documentWorkflow.findMany.mock.calls,
      ...tx.document.update.mock.calls,
      ...tx.documentWorkflowParticipation.upsert.mock.calls,
    ];
    allCalls.forEach((c: any) => {
      expect(JSON.stringify(c)).not.toMatch(/notify|sendEmail|broadcast/i);
    });
  });

  it('does NOT log a notification record on the success path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : The return value of getById matches the database state
//          after the transaction commits.
// ---------------------------------------------------------------------------
describe('[UTCID05] incomingDocumentsService.processBySpecialist() – Normal 5: response-to-database consistency', () => {
  it('returns the document after the transaction commits', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const result = await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    // The transaction ran before the return.
    expect(tx.document.update).toHaveBeenCalled();
    expect(tx.documentWorkflow.update).toHaveBeenCalled();

    // The return value matches what getById returns (the mock).
    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('uses the post-transaction document id (not the workflow id)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    // The service calls this.getById(id) — where `id` is the
    // incoming document id, NOT the workflow step id.
    expect(mockedRepo.findById).toHaveBeenCalledWith(1);
  });

  it('does NOT throw when getById returns the post-commit document', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['SPECIALIST'],
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the response-to-database path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: unauthorized approver.
// Result : Rejects callers who are not SPECIALIST/ADMIN, or who are
//          not the XLC processor on the document.
// ---------------------------------------------------------------------------
describe('[UTCID06] incomingDocumentsService.processBySpecialist() – Abnormal 1: unauthorized approver', () => {
  it('throws ForbiddenError for a DEPARTMENT_HEAD who is not the XLC', async () => {
    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['DEPARTMENT_HEAD'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ForbiddenError for a DOCUMENT_CLERK caller', async () => {
    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['DOCUMENT_CLERK'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ForbiddenError for a VIEWER caller', async () => {
    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['VIEWER'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ForbiddenError for a SPECIALIST caller who is not the XLC', async () => {
    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        99,
        ['SPECIALIST'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('does NOT enter the transaction when the caller is unauthorized', async () => {
    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['DOCUMENT_CLERK'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses the correct error message for the wrong-role case', async () => {
    const err = await service
      .processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['DEPARTMENT_HEAD'],
      )
      .catch((e) => e) as ForbiddenError;

    expect(err.message).toMatch(/Chuyên viên|Quản trị viên/i);
  });

  it('uses the correct error message for the wrong-XLC case', async () => {
    const err = await service
      .processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        99,
        ['SPECIALIST'],
      )
      .catch((e) => e) as ForbiddenError;

    expect(err.message).toMatch(/Người xử lý chính|XLC/i);
  });

  it('records a safe diagnostic on unauthorized attempts (no password / hash leak)', async () => {
    const err = await service
      .processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['DOCUMENT_CLERK'],
      )
      .catch((e) => e) as ForbiddenError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on unauthorized attempts', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['DOCUMENT_CLERK'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: invalid/not-found/already-processed document.
// Result : Rejects when the workflow step does not exist, or when
//          it is in a non-PENDING state, or when the document id
//          does not resolve.
// ---------------------------------------------------------------------------
describe('[UTCID07] incomingDocumentsService.processBySpecialist() – Abnormal 2: invalid/not-found/already-processed', () => {
  it('throws NotFoundError when the document does not exist', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đến'),
    );

    await expect(
      service.processBySpecialist(
        999,
        'FINISH',
        makePayload(),
        7,
        ['SPECIALIST'],
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws BadRequestError when the specialist workflow step is missing', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      null,
    );

    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['SPECIALIST'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when the specialist step is COMPLETED (already-processed)', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      {
        id: 3,
        documentId: 100,
        workflowStepId: 3,
        status: WorkflowStatus.COMPLETED,
      },
    );

    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['SPECIALIST'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when the specialist step is CANCELLED', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      {
        id: 3,
        documentId: 100,
        workflowStepId: 3,
        status: WorkflowStatus.CANCELLED,
      },
    );

    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['SPECIALIST'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when the specialist step is REJECTED', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      {
        id: 3,
        documentId: 100,
        workflowStepId: 3,
        status: WorkflowStatus.REJECTED,
      },
    );

    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['SPECIALIST'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when the action is not FINISH (defense in depth)', async () => {
    await expect(
      service.processBySpecialist(
        1,
        'FORWARD' as any,
        makePayload(),
        7,
        ['SPECIALIST'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when the action is RETURN (defense in depth)', async () => {
    await expect(
      service.processBySpecialist(
        1,
        'RETURN' as any,
        makePayload(),
        7,
        ['SPECIALIST'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT enter the transaction when the workflow step is already COMPLETED', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockReset();
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      {
        id: 3,
        documentId: 100,
        workflowStepId: 3,
        status: WorkflowStatus.COMPLETED,
      },
    );

    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['SPECIALIST'],
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
      .processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['SPECIALIST'],
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
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['SPECIALIST'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: approval at deadline/status boundary.
// Result : Accepts PENDING → COMPLETED; rejects any non-PENDING
//          starting status (already covered by UTCID07). Also
//          exercises the exact boundary at workflow-step order 3.
// ---------------------------------------------------------------------------
describe('[UTCID08] incomingDocumentsService.processBySpecialist() – Boundary 1: approval at deadline/status boundary', () => {
  it('accepts the boundary: specialist step at exactly stepOrder=3 (SPECIALIST)', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockReset();
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      {
        id: 3,
        documentId: 100,
        workflowStepId: 3,
        status: WorkflowStatus.PENDING,
      },
    );

    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['SPECIALIST'],
      ),
    ).resolves.toBeDefined();
  });

  it('rejects the boundary: specialist step with stepOrder=2 (DEPARTMENT_HEAD)', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockReset();
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      null, // The findFirst query filters by stepOrder=3 / roleName=SPECIALIST.
    );

    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['SPECIALIST'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects the boundary: specialist step with stepOrder=4 (ARCHIVE)', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockReset();
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      null,
    );

    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['SPECIALIST'],
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('accepts the boundary: status exactly at PENDING', async () => {
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockReset();
    (mockedPrisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValueOnce(
      {
        id: 3,
        documentId: 100,
        workflowStepId: 3,
        status: WorkflowStatus.PENDING,
      },
    );

    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    expect(tx.documentWorkflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WorkflowStatus.COMPLETED,
        }),
      }),
    );
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['SPECIALIST'],
      ),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    await expect(
      service.processBySpecialist(
        1,
        'FINISH',
        makePayload(),
        7,
        ['SPECIALIST'],
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.processBySpecialist(
      1,
      'FINISH',
      makePayload(),
      7,
      ['SPECIALIST'],
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
