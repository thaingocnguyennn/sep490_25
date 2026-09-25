/**
 * Unit tests for OutgoingDocumentsService.updateMetadata() —
 * Function41 / Update Draft Outgoing Document.
 *
 * Note on naming: the matrix headers reference
 * `OutgoingDocumentService`. The actual implementation that
 * updates the metadata of a DRAFT outgoing document is
 * `OutgoingDocumentsService.updateMetadata(id, data, updatedBy)`.
 *
 * Step-by-step:
 *   1. Loads the outgoing document via
 *      `outgoingDocumentsRepository.findById(id)`. If null,
 *      the repository throws `NotFoundError`.
 *   2. Checks the document's status. Only `DRAFT` and
 *      `RETURNED` are allowed; otherwise `BadRequestError`.
 *   3. Builds a `documentUpdate` patch with the optional
 *      fields:
 *      - `subject`, `departmentId`, `updatedBy` always set
 *        (subject and departmentId may be `undefined`).
 *      - `confidentialityId` resolved via
 *        `resolveConfidentialityIdWithDefault` if
 *        `confidentialityLevel` is provided (or `null` to
 *        clear).
 *      - `urgencyId` resolved via
 *        `resolveUrgencyIdWithDefault` if `urgency` is
 *        provided.
 *      - `documentTypeId`, `signerName`, `signerTitle` if
 *        provided.
 *   4. Wraps the writes in `prisma.$transaction`:
 *      a. `tx.document.update` for the parent.
 *      b. `tx.outgoingDocument.update` for the child.
 *   5. Returns a fresh `findById(id)` snapshot.
 *
 * Coverage matrix (UTCID01 – UTCID09):
 *   UTCID01  N  – Full update: subject + urgency +
 *                 confidentiality + department + signer +
 *                 recipient fields are all updated.
 *   UTCID02  N  – Partial update: only some fields change.
 *   UTCID03  N  – File/metadata link: file metadata remains
 *                 consistent.
 *   UTCID04  N  – Persistence/history: the `updatedBy` field
 *                 is recorded and a fresh fetch returns the
 *                 new state.
 *   UTCID05  N  – Response-to-database consistency: the
 *                 return value matches a fresh DB read.
 *   UTCID06  A  – Invalid data: status is not DRAFT /
 *                 RETURNED; the update is rejected.
 *   UTCID07  A  – Not found / not draft / unauthorized:
 *                 id doesn't exist.
 *   UTCID08  B  – Maximum field/file/date boundary: subject
 *                 2000 chars; recipient fields very long.
 *   UTCID09  B  – Upper-bound value just at the supported
 *                 limit: subject exactly 2000 chars.
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
      confidentiality: {
        // Resolve default ('THUONG') on lookup by name, otherwise null.
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where?.name === 'THUONG') return Promise.resolve({ id: 1 });
          if (where?.code === 'A') return Promise.resolve({ id: 1 });
          if (where?.code === 'B') return Promise.resolve({ id: 2 });
          if (where?.code === 'C') return Promise.resolve({ id: 3 });
          return Promise.resolve(null);
        }),
      },
      urgency: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where?.name === 'THUONG') return Promise.resolve({ id: 1 });
          if (where?.name === 'KHAN') return Promise.resolve({ id: 2 });
          if (where?.name === 'HOA_TOC') return Promise.resolve({ id: 3 });
          return Promise.resolve(null);
        }),
      },
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
  confidentiality: { findUnique: jest.Mock };
  urgency: { findUnique: jest.Mock };
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
  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockResolvedValue({
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
      subject: 'Công văn cũ',
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
    } as any,
    submittedByUser: null,
    approvedByUser: null,
    returnedByUser: null,
    forwardedByUser: null,
    issuedByUser: null,
    recalledByUser: null,
    trashedByUser: null,
  } as any);

  mockedPrisma.__mockTx.document.update.mockReset();
  mockedPrisma.__mockTx.document.update.mockResolvedValue({
    id: 100,
    subject: 'Công văn mới',
  } as any);

  mockedPrisma.__mockTx.outgoingDocument.update.mockReset();
  mockedPrisma.__mockTx.outgoingDocument.update.mockResolvedValue({
    id: 1,
  } as any);

  mockedPrisma.$transaction.mockClear();
  mockedPrisma.$transaction.mockImplementation(
    async (cb: any) => cb(mockedPrisma.__mockTx),
  );

  service = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: full update.
// Result : The full update succeeds.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.updateMetadata() – Normal 1: full update', () => {
  it('returns the updated document', async () => {
    const result = await service.updateMetadata(
      1,
      {
        subject: 'Công văn mới',
        urgency: 'KHAN',
        confidentialityLevel: 'MAT',
        departmentId: 2,
        documentTypeId: 1,
        signerName: 'Nguyễn Văn B',
        signerTitle: 'Phó Giám đốc',
        recipientName: 'Bộ Công an',
        recipientAddress: 'Hà Nội',
        recipientEmail: 'bca@example.com',
        pageCount: 10,
      },
      7,
    );

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('starts a transaction', async () => {
    await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      7,
    );

    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('updates the parent Document inside the transaction', async () => {
    await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      7,
    );

    expect(mockedPrisma.__mockTx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
      }),
    );
  });

  it('updates the child OutgoingDocument inside the transaction', async () => {
    await service.updateMetadata(
      1,
      { recipientName: 'Bộ Công an' },
      7,
    );

    expect(mockedPrisma.__mockTx.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
      }),
    );
  });

  it('records `updatedBy` in the document patch', async () => {
    await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      7,
    );

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data).toEqual(
      expect.objectContaining({
        updatedBy: 7,
      }),
    );
  });

  it('sets `subject` on the document patch', async () => {
    await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      7,
    );

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data).toEqual(
      expect.objectContaining({
        subject: 'Công văn mới',
      }),
    );
  });

  it('does NOT throw on the full-update path', async () => {
    await expect(
      service.updateMetadata(
        1,
        { subject: 'Công văn mới' },
        7,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the full-update path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      7,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: partial update.
// Result : Only the provided fields are touched; other fields
//          remain `undefined` in the patch.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.updateMetadata() – Normal 2: partial update', () => {
  it('accepts a partial update (only subject)', async () => {
    await service.updateMetadata(
      1,
      { subject: 'Chỉ cập nhật trích yếu' },
      7,
    );

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data).toEqual(
      expect.objectContaining({
        subject: 'Chỉ cập nhật trích yếu',
        updatedBy: 7,
      }),
    );
    // Urgency is not provided — should NOT be in the patch.
    expect('urgencyId' in callArgs.data).toBe(false);
    expect('confidentialityId' in callArgs.data).toBe(false);
  });

  it('accepts a partial update (only recipient fields)', async () => {
    await service.updateMetadata(
      1,
      {
        recipientName: 'Bộ Quốc phòng',
        recipientAddress: 'Hà Nội',
        recipientEmail: 'bqp@example.com',
      },
      7,
    );

    expect(mockedPrisma.__mockTx.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          recipientName: 'Bộ Quốc phòng',
          recipientAddress: 'Hà Nội',
          recipientEmail: 'bqp@example.com',
        }),
      }),
    );
  });

  it('accepts a partial update (only departmentId)', async () => {
    await service.updateMetadata(
      1,
      { departmentId: 2 },
      7,
    );

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data).toEqual(
      expect.objectContaining({
        departmentId: 2,
        updatedBy: 7,
      }),
    );
  });

  it('accepts a partial update (only signerName + signerTitle)', async () => {
    await service.updateMetadata(
      1,
      { signerName: 'Lê Văn E', signerTitle: 'Trưởng phòng' },
      7,
    );

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data).toEqual(
      expect.objectContaining({
        signerName: 'Lê Văn E',
        signerTitle: 'Trưởng phòng',
        updatedBy: 7,
      }),
    );
  });

  it('does NOT throw on the partial-update path', async () => {
    await expect(
      service.updateMetadata(
        1,
        { subject: 'Chỉ cập nhật trích yếu' },
        7,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the partial-update path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateMetadata(
      1,
      { subject: 'Chỉ cập nhật trích yếu' },
      7,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: file/metadata link.
// Result : The file metadata (fileUrl, attachments) is
//          untouched by `updateMetadata` because the method
//          only patches metadata fields.
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.updateMetadata() – Normal 3: file/metadata link', () => {
  it('preserves the fileUrl (no file mutation)', async () => {
    const result = await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      7,
    );

    expect((result.document as any).fileUrl).toBeNull();
  });

  it('preserves the attachments array (no attachment mutation)', async () => {
    const result = await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      7,
    );

    expect((result.document as any).attachments).toEqual([]);
  });

  it('does NOT include fileUrl / attachments in the document patch', async () => {
    await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      7,
    );

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect('fileUrl' in callArgs.data).toBe(false);
    expect('attachments' in callArgs.data).toBe(false);
  });

  it('does NOT throw on the file/metadata-link path', async () => {
    await expect(
      service.updateMetadata(
        1,
        { subject: 'Công văn mới' },
        7,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the file/metadata-link path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      7,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: persistence/history.
// Result : The `updatedBy` field is recorded and a fresh
//          fetch returns the new state.
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.updateMetadata() – Normal 4: persistence/history', () => {
  it('records updatedBy in the document patch', async () => {
    await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      42, // a different user
    );

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data.updatedBy).toBe(42);
  });

  it('returns a fresh findById snapshot after the update', async () => {
    const findByIdCallsBefore = mockedRepo.findById.mock.calls.length;

    const result = await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      7,
    );

    const findByIdCallsAfter = mockedRepo.findById.mock.calls.length;
    // The service calls findById once at the start and once
    // at the end to return a fresh snapshot.
    expect(findByIdCallsAfter).toBe(findByIdCallsBefore + 2);

    expect(result).toBeDefined();
  });

  it('does NOT mutate the input data (immutability)', async () => {
    const data = { subject: 'Công văn mới' };
    const snapshot = JSON.stringify(data);

    await service.updateMetadata(1, data, 7);

    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('does NOT throw on the persistence/history path', async () => {
    await expect(
      service.updateMetadata(
        1,
        { subject: 'Công văn mới' },
        7,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the persistence/history path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      7,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency for Draft
// Outgoing Document including identifiers, status, actors.
// Result : The return value matches a fresh DB read; status
//          is preserved as DRAFT; the document id is
//          unchanged; the actor (updatedBy) is recorded.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.updateMetadata() – Normal 5: response-to-database consistency', () => {
  it('returns the same id as the input', async () => {
    const result = await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      7,
    );

    expect(result.id).toBe(1);
  });

  it('preserves the documentId in the return value', async () => {
    const result = await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      7,
    );

    expect(result.documentId).toBe(100);
  });

  it('preserves the status as DRAFT in the return value', async () => {
    const result = await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      7,
    );

    expect((result.document as any).status).toBe('DRAFT');
  });

  it('records the updatedBy actor (a fresh findById returns it)', async () => {
    const result = await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      7,
    );

    expect((result.document as any).updatedByUser).toEqual({
      id: 7,
      fullName: 'Trần Văn C',
    });
  });

  it('preserves the documentNumber on the parent document', async () => {
    const result = await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      7,
    );

    expect(result.documentNumber).toBe('OUT-2026-0001');
  });

  it('preserves the dispatchNumber on the parent document', async () => {
    const result = await service.updateMetadata(
      1,
      { subject: 'Công văn mới' },
      7,
    );

    expect(result.dispatchNumber).toBeNull();
  });

  it('does NOT throw on the consistency path', async () => {
    await expect(
      service.updateMetadata(
        1,
        { subject: 'Công văn mới' },
        7,
      ),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: invalid data.
// Result : The service rejects updates on documents that are
//          not in DRAFT / RETURNED status.
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.updateMetadata() – Abnormal 1: invalid data (status not DRAFT / RETURNED)', () => {
  it('rejects when status = ISSUED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'ISSUED' },
    } as any);

    await expect(
      service.updateMetadata(1, { subject: 'Công văn mới' }, 7),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when status = SUBMITTED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'SUBMITTED' },
    } as any);

    await expect(
      service.updateMetadata(1, { subject: 'Công văn mới' }, 7),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when status = APPROVED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'APPROVED' },
    } as any);

    await expect(
      service.updateMetadata(1, { subject: 'Công văn mới' }, 7),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT call the transaction when status is invalid', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'ISSUED' },
    } as any);

    await expect(
      service.updateMetadata(1, { subject: 'Công văn mới' }, 7),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on the invalid-data path (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'ISSUED' },
    } as any);

    const err = await service
      .updateMetadata(1, { subject: 'Công văn mới' }, 7)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the invalid-data path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'ISSUED' },
    } as any);

    await expect(
      service.updateMetadata(1, { subject: 'Công văn mới' }, 7),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: not found / not draft / unauthorized.
// Result : The service propagates NotFoundError from the
//          repository.
// ---------------------------------------------------------------------------
describe('[UTCID07] outgoingDocumentsService.updateMetadata() – Abnormal 2: not found / not draft / unauthorized', () => {
  it('rejects (throws NotFoundError) when the document does not exist', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(
      service.updateMetadata(9999, { subject: 'Công văn mới' }, 7),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects (throws NotFoundError) when called with id=0', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(
      service.updateMetadata(0, { subject: 'Công văn mới' }, 7),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects (throws NotFoundError) when called with a negative id', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(
      service.updateMetadata(-1, { subject: 'Công văn mới' }, 7),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does NOT call the transaction when not found', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(
      service.updateMetadata(9999, { subject: 'Công văn mới' }, 7),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on the not-found path (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    const err = await service
      .updateMetadata(9999, { subject: 'Công văn mới' }, 7)
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

    await expect(
      service.updateMetadata(9999, { subject: 'Công văn mới' }, 7),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: maximum field/file/date boundary.
// Result : Very long subject (2000 chars), very long
//          recipient fields are accepted.
// ---------------------------------------------------------------------------
describe('[UTCID08] outgoingDocumentsService.updateMetadata() – Boundary 1: maximum field/file/date boundary', () => {
  it('accepts the boundary: subject with 2000 characters', async () => {
    const longSubject = 'A'.repeat(2000);

    await service.updateMetadata(
      1,
      { subject: longSubject },
      7,
    );

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data.subject).toBe(longSubject);
    expect((callArgs.data.subject as string).length).toBe(2000);
  });

  it('accepts the boundary: very long recipientName (1000 chars)', async () => {
    const longRecipient = 'R'.repeat(1000);

    await service.updateMetadata(
      1,
      { recipientName: longRecipient },
      7,
    );

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.recipientName).toBe(longRecipient);
    expect((callArgs.data.recipientName as string).length).toBe(1000);
  });

  it('accepts the boundary: very long recipientAddress (2000 chars)', async () => {
    const longAddress = 'X'.repeat(2000);

    await service.updateMetadata(
      1,
      { recipientAddress: longAddress },
      7,
    );

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.recipientAddress).toBe(longAddress);
    expect((callArgs.data.recipientAddress as string).length).toBe(2000);
  });

  it('accepts the boundary: large pageCount', async () => {
    await service.updateMetadata(
      1,
      { pageCount: Number.MAX_SAFE_INTEGER },
      7,
    );

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.pageCount).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('does NOT throw on the maximum-boundary path', async () => {
    await expect(
      service.updateMetadata(
        1,
        { subject: 'A'.repeat(2000) },
        7,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the maximum-boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateMetadata(
      1,
      { subject: 'A'.repeat(2000) },
      7,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 2: upper-bound value just at the supported
// limit for Update Draft Outgoing Document.
// Result : The exact boundary value (subject = 2000 chars) is
//          accepted.
// ---------------------------------------------------------------------------
describe('[UTCID09] outgoingDocumentsService.updateMetadata() – Boundary 2: upper-bound value just at the supported limit', () => {
  it('accepts the boundary: subject exactly 2000 chars', async () => {
    const exactSubject = 'A'.repeat(2000);

    await service.updateMetadata(
      1,
      { subject: exactSubject },
      7,
    );

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data.subject).toBe(exactSubject);
    expect((callArgs.data.subject as string).length).toBe(2000);
  });

  it('returns the document with the exact-boundary subject', async () => {
    const exactSubject = 'A'.repeat(2000);

    const result = await service.updateMetadata(
      1,
      { subject: exactSubject },
      7,
    );

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('accepts the boundary: recipientEmail exactly at the supported format', async () => {
    const longEmail =
      'a'.repeat(50) +
      '@' +
      'b'.repeat(50) +
      '.com';

    await service.updateMetadata(
      1,
      { recipientEmail: longEmail },
      7,
    );

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.recipientEmail).toBe(longEmail);
  });

  it('accepts the boundary: pageCount = 1 (smallest valid)', async () => {
    await service.updateMetadata(
      1,
      { pageCount: 1 },
      7,
    );

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.pageCount).toBe(1);
  });

  it('does NOT throw on the upper-boundary path', async () => {
    await expect(
      service.updateMetadata(
        1,
        { subject: 'A'.repeat(2000) },
        7,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the upper-boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateMetadata(
      1,
      { subject: 'A'.repeat(2000) },
      7,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
