/**
 * Unit tests for OutgoingDocumentsService.softDelete() —
 * Function42 / Soft Delete Outgoing Document.
 *
 * Note on naming: the matrix headers reference
 * `OutgoingDocumentService`. The actual implementation that
 * soft-deletes an outgoing document is
 * `OutgoingDocumentsService.softDelete(id, userId)`.
 *
 * Step-by-step:
 *   1. Loads the outgoing document via
 *      `outgoingDocumentsRepository.findById(id)`. If null,
 *      the repository throws `NotFoundError`.
 *   2. Checks `document.status`. Only `DRAFT` is allowed;
 *      any other status raises `BadRequestError`.
 *   3. Wraps the writes in `prisma.$transaction`:
 *      a. `tx.document.update` →
 *           `status: 'TRASHED'`, `updatedBy: userId`.
 *      b. `tx.outgoingDocument.update` →
 *           `trashedAt: new Date()`, `trashedBy: userId`.
 *   4. Returns a fresh `findById(id)` snapshot.
 *
 * Coverage matrix (UTCID01 – UTCID07):
 *   UTCID01  N  – Soft delete draft: a DRAFT document is
 *                 trashed.
 *   UTCID02  N  – Deleted state: the return value carries
 *                 `status = TRASHED`, `trashedAt`, `trashedBy`.
 *   UTCID03  N  – Trash visibility: the document is visible
 *                 in /outgoing-documents/trash.
 *   UTCID04  N  – Audit: the `trashedBy` actor is recorded.
 *   UTCID05  A  – Not found / unauthorized.
 *   UTCID06  A  – Non-deletable state: status != DRAFT
 *                 rejects.
 *   UTCID07  B  – Already deleted (recycle) or retention
 *                 boundary.
 */

import { default as prisma } from '../../../src/config/database';
import { OutgoingDocumentsService } from '../../../src/modules/outgoing-documents/outgoing-documents.service';
import { outgoingDocumentsRepository } from '../../../src/modules/outgoing-documents/outgoing-documents.repository';
import {
  NotFoundError,
  BadRequestError,
} from '../../../src/shared/exceptions/app-error';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/outgoing-documents/outgoing-documents.repository',
);

jest.mock('../../../src/config/database', () => {
  const mockTx = {
    document: { update: jest.fn() },
    outgoingDocument: { update: jest.fn() },
  };
  return {
    __esModule: true,
    default: {
      $transaction: jest.fn(async (cb) => cb(mockTx)),
      __mockTx: mockTx,
    },
  };
});

// Stub the outgoing-document service's transitive dependencies so Jest
// doesn't pull in pdfjs-dist / napi-rs/canvas at module-load time.
jest.mock('../../../src/shared/services/ocr.service', () => ({
  __esModule: true,
  performOcr: jest.fn(),
  extractFields: jest.fn(),
}));
jest.mock('../../../src/shared/services/email.service', () => ({
  __esModule: true,
  sendEmail: jest.fn(),
}));

const mockedRepo = outgoingDocumentsRepository as jest.Mocked<
  typeof outgoingDocumentsRepository
>;
const mockedPrisma = prisma as unknown as {
  $transaction: jest.Mock;
  __mockTx: {
    document: { update: jest.Mock };
    outgoingDocument: { update: jest.Mock };
  };
};

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

let service: OutgoingDocumentsService;

beforeEach(() => {
  jest.clearAllMocks();

  // Default: a DRAFT outgoing document.
  // First findById = pre-update state; subsequent calls =
  // post-update state.
  mockedRepo.findById.mockReset();
  const draftDoc: any = {
    id: 1,
    documentId: 100,
    documentNumber: 'OUT-2026-0001',
    dispatchNumber: null,
    issuanceDate: null,
    recipientName: 'Sở TTTT',
    recipientAddress: '123 Nguyễn Văn Cừ',
    recipientEmail: 'sotttt@example.com',
    sentDate: null,
    pageCount: 5,
    submittedAt: null,
    submittedBy: null,
    approvedAt: null,
    approvedBy: null,
    returnedAt: null,
    returnedBy: null,
    returnReason: null,
    forwardedAt: null,
    forwardedBy: null,
    issuedAt: null,
    issuedBy: null,
    recalledAt: null,
    recalledBy: null,
    recallReason: null,
    trashedAt: null,
    trashedBy: null,
    assignedApproverId: null,
    assignedClerkId: null,
    documentBookId: null,
    documentBook: null,
    bookEntry: null,
    createdAt: new Date('2026-09-19'),
    document: {
      id: 100,
      documentNumber: 'OUT-2026-0001',
      subject: 'Công văn cần xóa',
      type: 'OUTGOING',
      fileUrl: null,
      status: 'DRAFT',
      urgencyId: 1,
      confidentialityId: 1,
      ocrText: null,
      documentTypeId: 1,
      issuer: null,
      signerName: 'Nguyễn Văn A',
      signerTitle: 'Giám đốc',
      issuedDate: null,
      categoryId: null,
      createdAt: new Date('2026-09-19'),
      updatedAt: new Date('2026-09-19'),
      createdByUser: { id: 7, fullName: 'Trần Văn C' },
      updatedByUser: { id: 7, fullName: 'Trần Văn C' },
      department: { id: 1, name: 'Phòng Hành chính' },
      confidentiality: {
        id: 1,
        code: 'B',
        name: 'Mật',
        description: 'Văn bản mật',
      },
      urgency: { id: 1, name: 'THUONG', description: 'Thường' },
      documentTypeRef: { id: 1, name: 'Công văn' },
      category: null,
      attachments: [],
    },
    submittedByUser: null,
    approvedByUser: null,
    returnedByUser: null,
    forwardedByUser: null,
    issuedByUser: null,
    recalledByUser: null,
    trashedByUser: null,
  };
  const trashedDoc: any = {
    ...draftDoc,
    trashedAt: new Date('2026-09-25T08:00:00Z'),
    trashedBy: 7,
    trashedByUser: { id: 7, fullName: 'Trần Văn C' },
    document: {
      ...draftDoc.document,
      status: 'TRASHED',
      updatedByUser: { id: 7, fullName: 'Trần Văn C' },
    },
  };
  // Tracks the most recent actor the service wrote via
  // `tx.outgoingDocument.update(...trashedBy)`.
  let lastTrashedBy = 7;
  let findByIdCallCount = 0;
  mockedRepo.findById.mockImplementation(async () => {
    findByIdCallCount += 1;
    // 1st call: pre-update (DRAFT); later calls: post-update.
    if (findByIdCallCount === 1) return { ...draftDoc };
    // Pick the most recent captured actor.
    const actor =
      capturedActors[capturedActors.length - 1] ?? lastTrashedBy;
    return {
      ...trashedDoc,
      trashedBy: actor,
      trashedByUser: { id: actor, fullName: 'Trần Văn C' },
      document: {
        ...trashedDoc.document,
        updatedByUser: { id: actor, fullName: 'Trần Văn C' },
      },
    };
  });

  // Capture the trashedBy actor for the post-update mock.
  mockedPrisma.__mockTx.outgoingDocument.update.mockReset();
  // We use a queue so each successive softDelete call gets a
  // fresh captured actor.
  const capturedActors: number[] = [];
  mockedPrisma.__mockTx.outgoingDocument.update.mockImplementation(
    async (args: any) => {
      const actor = args?.data?.trashedBy ?? 7;
      capturedActors.push(actor);
      return {
        id: 1,
        trashedAt: new Date(),
        trashedBy: actor,
      };
    },
  );

  mockedPrisma.__mockTx.document.update.mockReset();
  mockedPrisma.__mockTx.document.update.mockResolvedValue({
    id: 100,
    status: 'TRASHED',
  } as any);

  mockedPrisma.$transaction.mockClear();
  mockedPrisma.$transaction.mockImplementation(
    async (cb: any) => cb(mockedPrisma.__mockTx),
  );

  service = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: soft delete draft.
// Result : The DRAFT document is trashed.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.softDelete() – Normal 1: soft delete draft', () => {
  it('returns the updated document', async () => {
    const result = await service.softDelete(1, 7);

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('starts a transaction', async () => {
    await service.softDelete(1, 7);

    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('updates the parent Document inside the transaction', async () => {
    await service.softDelete(1, 7);

    expect(mockedPrisma.__mockTx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
      }),
    );
  });

  it('sets the parent Document status to TRASHED', async () => {
    await service.softDelete(1, 7);

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data.status).toBe('TRASHED');
  });

  it('updates the child OutgoingDocument inside the transaction', async () => {
    await service.softDelete(1, 7);

    expect(mockedPrisma.__mockTx.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
      }),
    );
  });

  it('sets the trashedAt timestamp on the child OutgoingDocument', async () => {
    await service.softDelete(1, 7);

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.trashedAt).toBeInstanceOf(Date);
  });

  it('sets the trashedBy userId on the child OutgoingDocument', async () => {
    await service.softDelete(1, 7);

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.trashedBy).toBe(7);
  });

  it('does NOT throw on the soft-delete path', async () => {
    await expect(service.softDelete(1, 7)).resolves.toBeDefined();
  });

  it('does NOT log to console on the soft-delete path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.softDelete(1, 7);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: deleted state.
// Result : The return value carries `status = TRASHED`.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.softDelete() – Normal 2: deleted state', () => {
  it('returns the document with status = TRASHED', async () => {
    const result = await service.softDelete(1, 7);

    expect((result.document as any).status).toBe('TRASHED');
  });

  it('returns the document with the trashedAt timestamp', async () => {
    const result = await service.softDelete(1, 7);

    expect(result.trashedAt).toBeInstanceOf(Date);
  });

  it('returns the document with the trashedBy userId', async () => {
    const result = await service.softDelete(1, 7);

    expect(result.trashedBy).toBe(7);
  });

  it('returns the trashedByUser relation (when populated)', async () => {
    const result = await service.softDelete(1, 7);

    expect(result.trashedByUser).toBeDefined();
  });

  it('does NOT throw on the deleted-state path', async () => {
    await expect(service.softDelete(1, 7)).resolves.toBeDefined();
  });

  it('does NOT log to console on the deleted-state path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.softDelete(1, 7);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: trash visibility.
// Result : The trashed document is the same id; the status is
//          TRASHED so it can be picked up by /trash route.
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.softDelete() – Normal 3: trash visibility', () => {
  it('returns the same id (1) — the document is the one in /trash', async () => {
    const result = await service.softDelete(1, 7);

    expect(result.id).toBe(1);
  });

  it('returns the same documentId (100) — the parent is unchanged', async () => {
    const result = await service.softDelete(1, 7);

    expect(result.documentId).toBe(100);
  });

  it('returns the document with status = TRASHED (visible in /trash)', async () => {
    const result = await service.softDelete(1, 7);

    expect((result.document as any).status).toBe('TRASHED');
  });

  it('does NOT mutate the document type (still OUTGOING)', async () => {
    const result = await service.softDelete(1, 7);

    expect((result.document as any).type).toBe('OUTGOING');
  });

  it('does NOT mutate the documentNumber', async () => {
    const result = await service.softDelete(1, 7);

    expect(result.documentNumber).toBe('OUT-2026-0001');
  });

  it('does NOT throw on the trash-visibility path', async () => {
    await expect(service.softDelete(1, 7)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: audit.
// Result : The trashedBy actor and the updatedBy actor are
//          recorded.
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.softDelete() – Normal 4: audit', () => {
  it('records the trashedBy actor on the OutgoingDocument', async () => {
    await service.softDelete(1, 7);

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.trashedBy).toBe(7);
  });

  it('records the updatedBy actor on the parent Document', async () => {
    await service.softDelete(1, 7);

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data.updatedBy).toBe(7);
  });

  it('records a different actor when supplied', async () => {
    await service.softDelete(1, 42);

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data.updatedBy).toBe(42);
  });

  it('returns the actor in the trashedBy field', async () => {
    const result = await service.softDelete(1, 42);

    expect(result.trashedBy).toBe(42);
  });

  it('does NOT throw on the audit path', async () => {
    await expect(service.softDelete(1, 7)).resolves.toBeDefined();
  });

  it('does NOT log to console on the audit path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.softDelete(1, 7);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 1: not found / unauthorized.
// Result : NotFoundError is thrown when the id doesn't exist.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.softDelete() – Abnormal 1: not found / unauthorized', () => {
  it('rejects (throws NotFoundError) when the document does not exist', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(service.softDelete(9999, 7)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rejects (throws NotFoundError) when called with id=0', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(service.softDelete(0, 7)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rejects (throws NotFoundError) when called with a negative id', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(service.softDelete(-1, 7)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('does NOT call the transaction when the document is not found', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(service.softDelete(9999, 7)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on not-found (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    const err = await service
      .softDelete(9999, 7)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the not-found path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(service.softDelete(9999, 7)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 2: non-deletable state.
// Result : BadRequestError is thrown when the status is not
//          DRAFT.
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.softDelete() – Abnormal 2: non-deletable state', () => {
  it('rejects (throws BadRequestError) when status = ISSUED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'ISSUED' },
    } as any);

    await expect(service.softDelete(1, 7)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('rejects (throws BadRequestError) when status = SUBMITTED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'SUBMITTED' },
    } as any);

    await expect(service.softDelete(1, 7)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('rejects (throws BadRequestError) when status = APPROVED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'APPROVED' },
    } as any);

    await expect(service.softDelete(1, 7)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('rejects (throws BadRequestError) when status = RETURNED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'RETURNED' },
    } as any);

    await expect(service.softDelete(1, 7)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('rejects (throws BadRequestError) when status = TRASHED (already deleted)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'TRASHED' },
    } as any);

    await expect(service.softDelete(1, 7)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('does NOT call the transaction when status is invalid', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'ISSUED' },
    } as any);

    await expect(service.softDelete(1, 7)).rejects.toBeInstanceOf(
      BadRequestError,
    );

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on non-deletable state (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'ISSUED' },
    } as any);

    const err = await service
      .softDelete(1, 7)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the non-deletable path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'ISSUED' },
    } as any);

    await expect(service.softDelete(1, 7)).rejects.toBeInstanceOf(
      BadRequestError,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Boundary 1: already deleted or retention boundary.
// Result : A TRASHED document is rejected (re-soft-delete is
//          not allowed). The boundary value is the moment
//          status becomes TRASHED; the adjacent unsupported
//          value is trying to re-delete it.
// ---------------------------------------------------------------------------
describe('[UTCID07] outgoingDocumentsService.softDelete() – Boundary 1: already deleted (recycle) or retention boundary', () => {
  it('rejects (throws BadRequestError) when status is already TRASHED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      trashedAt: new Date('2026-09-20'),
      trashedBy: 7,
      document: { status: 'TRASHED' },
    } as any);

    await expect(service.softDelete(1, 7)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('does NOT update the trashedAt timestamp (re-trash)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      trashedAt: new Date('2026-09-20'),
      trashedBy: 7,
      document: { status: 'TRASHED' },
    } as any);

    await expect(service.softDelete(1, 7)).rejects.toBeInstanceOf(
      BadRequestError,
    );

    expect(
      mockedPrisma.__mockTx.outgoingDocument.update,
    ).not.toHaveBeenCalled();
  });

  it('does NOT update the document status (re-trash)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      trashedAt: new Date('2026-09-20'),
      trashedBy: 7,
      document: { status: 'TRASHED' },
    } as any);

    await expect(service.softDelete(1, 7)).rejects.toBeInstanceOf(
      BadRequestError,
    );

    expect(mockedPrisma.__mockTx.document.update).not.toHaveBeenCalled();
  });

  it('accepts the boundary: status = DRAFT (the supported edge)', async () => {
    // The default mock has status = DRAFT. Just verify this
    // passes through to a transaction.
    await service.softDelete(1, 7);

    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      trashedAt: new Date('2026-09-20'),
      trashedBy: 7,
      document: { status: 'TRASHED' },
    } as any);

    const err = await service
      .softDelete(1, 7)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      trashedAt: new Date('2026-09-20'),
      trashedBy: 7,
      document: { status: 'TRASHED' },
    } as any);

    await expect(service.softDelete(1, 7)).rejects.toBeInstanceOf(
      BadRequestError,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
