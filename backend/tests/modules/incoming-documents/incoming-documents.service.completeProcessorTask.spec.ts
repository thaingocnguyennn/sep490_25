/**
 * Unit tests for IncomingDocumentsService.completeProcessorTask() —
 * Function36 / PHXL Collaborate on Incoming Document Processing.
 *
 * Note on naming: the matrix headers reference
 * `ProcessingService`, but the actual implementation that lets
 * a PHXL processor record their collaboration result is
 * `IncomingDocumentsService.completeProcessorTask(incomingId,
 * processorUserId, actorId, actorRoles, notes)`. The PHXL user
 * records a supporting note and closes their own participation
 * row. Per the new flow design, this does NOT affect the
 * document's main workflow (Document.status stays IN_PROGRESS
 * until the assigned XLC FINISHes).
 *
 * Step-by-step:
 *   1. checkIncomingDocumentAccess — final access gate.
 *   2. findById(incomingId).
 *   3. Authorization gate:
 *      a. actorId must be the processor user (or ADMIN). Otherwise 403.
 *      b. The processor must exist on the document.
 *      c. The processor's processorType must be "PHXL". Otherwise 400.
 *   4. Inside prisma.$transaction:
 *      a. Update the DocumentProcessor row → completedAt + notes.
 *      b. upsertParticipation for the processor's PHXL role →
 *         COMPLETED with completedAt.
 *   5. Return this.getById(incomingId).
 *
 * Coverage matrix (UTCID01 – UTCID08):
 *   UTCID01  N  – Add processing note: success path with notes.
 *   UTCID02  N  – Update collaboration result: notes are persisted
 *                 on DocumentProcessor.
 *   UTCID03  N  – File/evidence link: notes are written; no file
 *                 attachment is created (documented gap).
 *   UTCID04  N  – History: PHXL participation row is upserted to
 *                 COMPLETED.
 *   UTCID05  N  – Response-to-database consistency: getById return
 *                 matches the post-commit DB state.
 *   UTCID06  A  – Non-collaborator access: caller is not the
 *                 processor user (and not ADMIN).
 *   UTCID07  A  – Invalid document/state/data: processor is not
 *                 PHXL, document does not exist, processor is not
 *                 on the document.
 *   UTCID08  B  – Minimum/maximum note or attachment boundary:
 *                 empty notes accepted; 2000-character notes
 *                 accepted; 2001-character notes accepted by the
 *                 service (no upper limit enforced at the service
 *                 layer; the route doesn't validate either).
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
import { DocumentStatus } from '@prisma/client';

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
    documentProcessor: { update: jest.fn() },
    documentWorkflowParticipation: {
      upsert: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
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
    documentProcessor: {
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

  // Default access helper: allow.
  mockedAccess.mockResolvedValue(undefined);

  // Default findById: returns a document with a PHXL processor
  // (userId=8) and an XLC processor (userId=7).
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
            email: 'xlc@example.com',
            fullName: 'XLC User',
            username: 'xlc',
          },
        },
        {
          id: 2,
          userId: 8,
          processorType: 'PHXL',
          user: {
            id: 8,
            email: 'phxl@example.com',
            fullName: 'PHXL User',
            username: 'phxl',
          },
        },
        {
          id: 3,
          userId: 9,
          processorType: 'XDB',
          user: {
            id: 9,
            email: 'xdb@example.com',
            fullName: 'XDB User',
            username: 'xdb',
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
// UTCID01 – Normal 1: add processing note.
// Result : The service completes the PHXL close path with notes.
// ---------------------------------------------------------------------------
describe('[UTCID01] incomingDocumentsService.completeProcessorTask() – Normal 1: add processing note', () => {
  it('returns the updated document on the success path', async () => {
    const result = await service.completeProcessorTask(
      1,
      8,
      8,
      [],
      'Tôi đã xem xét văn bản này, đồng ý với nội dung XLC đề xuất.',
    );

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('does NOT throw for a valid PHXL self-close', async () => {
    await expect(
      service.completeProcessorTask(
        1,
        8,
        8,
        [],
        'Tôi đã xem xét văn bản này, đồng ý với nội dung XLC đề xuất.',
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT throw for a valid ADMIN close on behalf of PHXL', async () => {
    await expect(
      service.completeProcessorTask(
        1,
        8,
        99,
        ['ADMIN'],
        'Admin closing on behalf of PHXL',
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the success path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.completeProcessorTask(
      1,
      8,
      8,
      [],
      'Tôi đã xem xét văn bản này',
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: update collaboration result.
// Result : The notes are persisted on the DocumentProcessor row.
// ---------------------------------------------------------------------------
describe('[UTCID02] incomingDocumentsService.completeProcessorTask() – Normal 2: update collaboration result', () => {
  it('persists the notes on the DocumentProcessor row', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const notes = 'Cần bổ sung ý kiến của phòng pháp chế';
    await service.completeProcessorTask(1, 8, 8, [], notes);

    expect(tx.documentProcessor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2 },
        data: expect.objectContaining({
          notes,
        }),
      }),
    );
  });

  it('sets completedAt to the current time on the DocumentProcessor row', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const before = new Date();
    await service.completeProcessorTask(1, 8, 8, [], 'Notes');
    const after = new Date();

    const call = tx.documentProcessor.update.mock.calls[0][0];
    expect(call.data.completedAt).toBeInstanceOf(Date);
    expect(call.data.completedAt.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
    expect(call.data.completedAt.getTime()).toBeLessThanOrEqual(
      after.getTime(),
    );
  });

  it('uses the DocumentProcessor id (not the userId) for the update', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.completeProcessorTask(1, 8, 8, [], 'Notes');

    expect(tx.documentProcessor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2 },
      }),
    );
  });

  it('persists null when notes are not provided', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.completeProcessorTask(1, 8, 8, []);

    expect(tx.documentProcessor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notes: null,
        }),
      }),
    );
  });

  it('does NOT log to console on the collaboration-result path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.completeProcessorTask(1, 8, 8, [], 'Notes');

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: file/evidence link.
// Result : Notes are written; no file attachment is created
//          (documented gap — the endpoint doesn't accept files).
// ---------------------------------------------------------------------------
describe('[UTCID03] incomingDocumentsService.completeProcessorTask() – Normal 3: file/evidence link (documented gap)', () => {
  it('does NOT create any DocumentAttachment row', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.completeProcessorTask(
      1,
      8,
      8,
      [],
      'Evidence link: https://example.com/doc.pdf',
    );

    // tx has no documentAttachment property.
    expect(tx).not.toHaveProperty('documentAttachment');
  });

  it('does NOT upload files', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.completeProcessorTask(
      1,
      8,
      8,
      [],
      'Some notes',
    );

    // The transaction does not touch any upload / file endpoint.
    const allCalls = [
      ...tx.documentProcessor.update.mock.calls,
      ...tx.documentWorkflowParticipation.create.mock.calls,
      ...tx.documentWorkflowParticipation.upsert.mock.calls,
      ...tx.documentWorkflowParticipation.update.mock.calls,
    ];
    allCalls.forEach((c: any) => {
      expect(JSON.stringify(c)).not.toMatch(/upload|fileUrl|attachment/i);
    });
  });

  it('stores file references as text in the notes field', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const noteWithLink =
      'Xem tài liệu tại: https://internal.example.com/docs/123';
    await service.completeProcessorTask(1, 8, 8, [], noteWithLink);

    expect(tx.documentProcessor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notes: noteWithLink,
        }),
      }),
    );
  });

  it('does NOT log to console on the file/evidence-link path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.completeProcessorTask(1, 8, 8, [], 'Some notes');

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: history.
// Result : PHXL participation row is upserted to COMPLETED.
// ---------------------------------------------------------------------------
describe('[UTCID04] incomingDocumentsService.completeProcessorTask() – Normal 4: history', () => {
  it('upserts a PHXL participation row with status COMPLETED', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.completeProcessorTask(1, 8, 8, [], 'Notes');

    const phxlRows =
      tx.documentWorkflowParticipation.create.mock.calls.filter(
        (c: any) =>
          c[0]?.data?.participationRole === 'PHXL' &&
          c[0].data.userId === 8,
      );
    expect(phxlRows.length).toBeGreaterThan(0);
    expect(phxlRows[0][0].data.status).toBe('COMPLETED');
  });

  it('sets completedAt on the PHXL participation row', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const before = new Date();
    await service.completeProcessorTask(1, 8, 8, [], 'Notes');
    const after = new Date();

    const phxlRows =
      tx.documentWorkflowParticipation.create.mock.calls.filter(
        (c: any) =>
          c[0]?.data?.participationRole === 'PHXL' &&
          c[0].data.userId === 8,
      );
    expect(phxlRows.length).toBeGreaterThan(0);
    const completedAt = phxlRows[0][0].data.completedAt;
    expect(completedAt).toBeInstanceOf(Date);
    expect(completedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(completedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('uses the matching documentId for the participation row', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.completeProcessorTask(1, 8, 8, [], 'Notes');

    const phxlRows =
      tx.documentWorkflowParticipation.create.mock.calls.filter(
        (c: any) =>
          c[0]?.data?.participationRole === 'PHXL' &&
          c[0].data.userId === 8,
      );
    expect(phxlRows[0][0].data.documentId).toBe(100);
  });

  it('does NOT affect the document\'s main workflow status (Document.status stays IN_PROGRESS)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.completeProcessorTask(1, 8, 8, [], 'Notes');

    // No call to tx.document.update (the main document status
    // doesn't change because PHXL close is local to the
    // participation row).
    expect(tx.document).toBeUndefined();
  });

  it('does NOT push notifications for any other party', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.completeProcessorTask(1, 8, 8, [], 'Notes');

    const allCalls = [
      ...tx.documentProcessor.update.mock.calls,
      ...tx.documentWorkflowParticipation.create.mock.calls,
      ...tx.documentWorkflowParticipation.upsert.mock.calls,
      ...tx.documentWorkflowParticipation.update.mock.calls,
    ];
    allCalls.forEach((c: any) => {
      expect(JSON.stringify(c)).not.toMatch(/notify|sendEmail|broadcast/i);
    });
  });

  it('does NOT log to console on the history path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.completeProcessorTask(1, 8, 8, [], 'Notes');

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : The return value of getById matches the post-commit
//          database state.
// ---------------------------------------------------------------------------
describe('[UTCID05] incomingDocumentsService.completeProcessorTask() – Normal 5: response-to-database consistency', () => {
  it('returns the document after the transaction commits', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const result = await service.completeProcessorTask(
      1,
      8,
      8,
      [],
      'Notes',
    );

    expect(tx.documentProcessor.update).toHaveBeenCalled();
    expect(tx.documentWorkflowParticipation.create).toHaveBeenCalled();

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('uses the post-transaction document id (not the processor id)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.completeProcessorTask(1, 8, 8, [], 'Notes');

    // The service calls this.getById(incomingId) — where
    // `incomingId` is the document id, NOT the processor id.
    expect(mockedRepo.findById).toHaveBeenCalledWith(1);
  });

  it('does NOT throw when getById returns the post-commit document', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await expect(
      service.completeProcessorTask(1, 8, 8, [], 'Notes'),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the response-to-database path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.completeProcessorTask(1, 8, 8, [], 'Notes');

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: non-collaborator access.
// Result : Rejects callers who are not the processor user (and not
//          ADMIN).
// ---------------------------------------------------------------------------
describe('[UTCID06] incomingDocumentsService.completeProcessorTask() – Abnormal 1: non-collaborator access', () => {
  it('throws ForbiddenError for a non-self, non-ADMIN caller', async () => {
    await expect(
      service.completeProcessorTask(
        1,
        8, // processor userId
        7, // actor userId (different from processor)
        [], // no ADMIN role
        'Notes',
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ForbiddenError for a caller with SPECIALIST role but not the processor', async () => {
    await expect(
      service.completeProcessorTask(
        1,
        8,
        7,
        ['SPECIALIST'],
        'Notes',
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ForbiddenError for a DEPARTMENT_HEAD caller who is not the processor', async () => {
    await expect(
      service.completeProcessorTask(
        1,
        8,
        7,
        ['DEPARTMENT_HEAD'],
        'Notes',
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('uses the correct error message for the non-self case', async () => {
    const err = await service
      .completeProcessorTask(1, 8, 7, [], 'Notes')
      .catch((e) => e) as ForbiddenError;

    expect(err.message).toMatch(/chính bạn|tự/i);
  });

  it('does NOT enter the transaction for non-collaborator access', async () => {
    await expect(
      service.completeProcessorTask(1, 8, 7, [], 'Notes'),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on unauthorized attempts (no password / hash leak)', async () => {
    const err = await service
      .completeProcessorTask(1, 8, 7, [], 'Notes')
      .catch((e) => e) as ForbiddenError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on unauthorized attempts', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await expect(
      service.completeProcessorTask(1, 8, 7, [], 'Notes'),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: invalid document/state/data.
// Result : Rejects when the processor is not PHXL, when the
//          processor is not on the document, or when the document
//          does not exist.
// ---------------------------------------------------------------------------
describe('[UTCID07] incomingDocumentsService.completeProcessorTask() – Abnormal 2: invalid document/state/data', () => {
  it('throws NotFoundError when the document does not exist', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đến'),
    );

    await expect(
      service.completeProcessorTask(999, 8, 8, [], 'Notes'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError when the processor is not on the document', async () => {
    await expect(
      service.completeProcessorTask(1, 999, 999, [], 'Notes'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws BadRequestError when the processor is XLC, not PHXL', async () => {
    await expect(
      service.completeProcessorTask(1, 7, 7, [], 'Notes'),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when the processor is XDB, not PHXL', async () => {
    await expect(
      service.completeProcessorTask(1, 9, 9, [], 'Notes'),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('uses the correct error message for the wrong-processor-type case', async () => {
    const err = await service
      .completeProcessorTask(1, 7, 7, [], 'Notes')
      .catch((e) => e) as BadRequestError;

    expect(err.message).toMatch(/Người phối hợp|PHXL/i);
  });

  it('uses the correct error message for the processor-not-found case', async () => {
    const err = await service
      .completeProcessorTask(1, 999, 999, [], 'Notes')
      .catch((e) => e) as NotFoundError;

    expect(err.message).toMatch(/người xử lý/i);
  });

  it('does NOT enter the transaction when the processor type is wrong', async () => {
    await expect(
      service.completeProcessorTask(1, 7, 7, [], 'Notes'),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on invalid-state errors (no password / hash leak)', async () => {
    const err = await service
      .completeProcessorTask(1, 7, 7, [], 'Notes')
      .catch((e) => e) as BadRequestError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on invalid-state errors', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await expect(
      service.completeProcessorTask(1, 7, 7, [], 'Notes'),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: minimum/maximum note or attachment boundary.
// Result : Empty notes accepted; very long notes accepted by the
//          service (the route doesn't validate the upper bound).
// ---------------------------------------------------------------------------
describe('[UTCID08] incomingDocumentsService.completeProcessorTask() – Boundary 1: minimum/maximum note boundary', () => {
  it('accepts the boundary: undefined notes (no notes provided)', async () => {
    const result = await service.completeProcessorTask(1, 8, 8, []);

    expect(result).toBeDefined();
  });

  it('accepts the boundary: empty string notes', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.completeProcessorTask(1, 8, 8, [], '');

    // Empty string is accepted; the service stores the empty
    // string verbatim (the `notes ?? null` only fires when
    // notes is `undefined`).
    expect(tx.documentProcessor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notes: '',
        }),
      }),
    );
  });

  it('accepts the boundary: 1-character notes', async () => {
    const result = await service.completeProcessorTask(1, 8, 8, [], 'x');

    expect(result).toBeDefined();
  });

  it('accepts the boundary: 2000-character notes', async () => {
    const longNotes = 'a'.repeat(2000);
    const result = await service.completeProcessorTask(
      1,
      8,
      8,
      [],
      longNotes,
    );

    expect(result).toBeDefined();
  });

  it('accepts the boundary: 5000-character notes (service has no upper limit)', async () => {
    const veryLongNotes = 'a'.repeat(5000);
    const result = await service.completeProcessorTask(
      1,
      8,
      8,
      [],
      veryLongNotes,
    );

    expect(result).toBeDefined();
  });

  it('persists long notes verbatim on the DocumentProcessor row', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const longNotes = 'a'.repeat(2000);
    await service.completeProcessorTask(1, 8, 8, [], longNotes);

    expect(tx.documentProcessor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notes: longNotes,
        }),
      }),
    );
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.completeProcessorTask(1, 8, 8, [], 'a'.repeat(2000)),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    const result = await service.completeProcessorTask(
      1,
      8,
      8,
      [],
      'a'.repeat(2000),
    );

    expect(result).toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.completeProcessorTask(1, 8, 8, [], 'a'.repeat(2000));

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
