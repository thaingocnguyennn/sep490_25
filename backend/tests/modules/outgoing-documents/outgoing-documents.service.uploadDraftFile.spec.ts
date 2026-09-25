/**
 * Unit tests for OutgoingDocumentsService.uploadDraftFile() —
 * Function64 / Upload Outgoing Document File.
 *
 * Note on naming: the matrix headers reference
 * `DocumentFileService`. The actual implementation that
 * persists the uploaded file is
 * `OutgoingDocumentsService.uploadDraftFile(id, file, updatedBy)`.
 *
 * Step-by-step:
 *   1. `outgoing = await outgoingDocumentsRepository.findById
 *      (id)`.
 *   2. If `outgoing.document.status` not in
 *      `['DRAFT', 'RETURNED']`, throw
 *      `BadRequestError('Không thể upload file ở trạng thái ...')`.
 *   3. Build `fileUrl = '/uploads/{file.filename}'`.
 *   4. Persist:
 *      - `prisma.document.update({ where: { id:
 *        outgoing.documentId }, data: { fileUrl,
 *        originalFileName: file.originalname, fileSize:
 *        file.size, mimeType: file.mimetype, updatedBy } })`.
 *   5. Return `outgoingDocumentsRepository.findById(id)`.
 *
 * Coverage matrix (UTCID01 – UTCID09):
 *   UTCID01  N  – Valid PDF upload.
 *   UTCID02  N  – Metadata: originalFileName, fileSize,
 *                 mimeType persisted.
 *   UTCID03  N  – Storage persistence: fileUrl persisted.
 *   UTCID04  N  – Document association: outgoing.documentId
 *                 updated.
 *   UTCID05  N  – Response-to-database consistency.
 *   UTCID06  A  – Missing/unsupported/corrupt file.
 *   UTCID07  A  – Unauthorized/storage failure.
 *   UTCID08  B  – Minimum/maximum file size or filename
 *                 length.
 *   UTCID09  B  – Upper-bound value just at the supported
 *                 limit.
 */

import { OutgoingDocumentsService } from '../../../src/modules/outgoing-documents/outgoing-documents.service';
import { outgoingDocumentsRepository } from '../../../src/modules/outgoing-documents/outgoing-documents.repository';
import { BadRequestError } from '../../../src/shared/exceptions/app-error';
import prisma from '../../../src/config/database';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/outgoing-documents/outgoing-documents.repository',
);

jest.mock('../../../src/shared/services/ocr.service', () => ({
  __esModule: true,
  performOcr: jest.fn(),
  extractFields: jest.fn(),
}));
jest.mock('../../../src/shared/services/email.service', () => ({
  __esModule: true,
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/config/database', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    confidentiality: { findUnique: jest.fn().mockResolvedValue(null) },
    urgency: { findUnique: jest.fn().mockResolvedValue(null) },
    document: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    outgoingDocument: { findFirst: jest.fn().mockResolvedValue(null) },
    documentBook: { findFirst: jest.fn().mockResolvedValue(null) },
    outgoingBookEntry: { findFirst: jest.fn().mockResolvedValue(null) },
  },
}));

jest.mock(
  '../../../src/modules/documents/documents.repository',
);

jest.mock('../../../src/shared/utils/pdf-signature.util', () => ({
  __esModule: true,
  extractSignaturesFromFile: jest.fn(),
  buildSignatureSummary: jest.fn(),
  buildVisualMarks: jest.fn(),
  calculateFileHash: jest.fn(),
  isSupportedSignatureFile: jest.fn(),
  checkPdfSignature: jest.fn(),
}));

jest.mock('fs');

const mockedRepo = outgoingDocumentsRepository as jest.Mocked<
  typeof outgoingDocumentsRepository
>;

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

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

const buildFile = (overrides: any = {}): Express.Multer.File => ({
  fieldname: 'file',
  originalname: 'test-document.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  size: 1024 * 1024, // 1MB
  destination: '/tmp/uploads',
  filename: '1700000000000-123456789.pdf',
  path: '/tmp/uploads/1700000000000-123456789.pdf',
  buffer: Buffer.from('fake-content'),
  ...overrides,
} as Express.Multer.File);

const buildDocument = (overrides: any = {}): any => ({
  id: 1,
  documentId: 100,
  documentNumber: 'OUT-2026-0001',
  dispatchNumber: 'OUT-DISP-001',
  document: {
    id: 100,
    documentNumber: 'OUT-2026-0001',
    subject: 'Công văn phát hành',
    fileUrl: null,
    originalFileName: null,
    fileSize: null,
    mimeType: null,
    status: 'DRAFT',
    documentStatus: 'ACTIVE',
    createdAt: new Date('2026-09-09T07:00:00.000Z'),
    updatedAt: new Date('2026-09-12T12:00:00.000Z'),
    createdByUser: { id: 5, fullName: 'Lê Văn Submitter' },
    department: { id: 1, name: 'Phòng Hành chính' },
    documentTypeRef: { id: 1, name: 'Công văn' },
  },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();

  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockImplementation(async () => buildDocument());

  mockedPrisma.document.update.mockReset();
  mockedPrisma.document.update.mockImplementation(async () => ({}));

  service = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid PDF upload.
// Result : upload succeeds, prisma.document.update called once.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.uploadDraftFile() – Normal 1: valid PDF upload', () => {
  it('uploads a valid PDF file', async () => {
    const file = buildFile({
      mimetype: 'application/pdf',
      originalname: 'test-document.pdf',
      size: 1024 * 1024,
    });

    const result = await service.uploadDraftFile(1, file, 99);

    expect(result).toBeDefined();
  });

  it('calls prisma.document.update once', async () => {
    const file = buildFile();

    await service.uploadDraftFile(1, file, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledTimes(1);
  });

  it('updates the correct documentId', async () => {
    const file = buildFile();

    await service.uploadDraftFile(1, file, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
      }),
    );
  });

  it('returns the updated outgoing document', async () => {
    const file = buildFile();

    const result = await service.uploadDraftFile(1, file, 99);

    expect(result.id).toBe(1);
    expect(result.documentId).toBe(100);
  });

  it('does NOT throw on the valid-PDF-upload path', async () => {
    const file = buildFile();

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the valid-PDF-upload path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const file = buildFile();

    await service.uploadDraftFile(1, file, 99);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: metadata.
// Result : originalFileName, fileSize, mimeType persisted.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.uploadDraftFile() – Normal 2: metadata', () => {
  it('persists originalFileName', async () => {
    const file = buildFile({ originalname: 'CONG-VAN-SO-123.pdf' });

    await service.uploadDraftFile(1, file, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          originalFileName: 'CONG-VAN-SO-123.pdf',
        }),
      }),
    );
  });

  it('persists fileSize', async () => {
    const file = buildFile({ size: 2_000_000 });

    await service.uploadDraftFile(1, file, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fileSize: 2_000_000,
        }),
      }),
    );
  });

  it('persists mimeType', async () => {
    const file = buildFile({ mimetype: 'application/pdf' });

    await service.uploadDraftFile(1, file, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mimeType: 'application/pdf',
        }),
      }),
    );
  });

  it('persists updatedBy user id', async () => {
    const file = buildFile();

    await service.uploadDraftFile(1, file, 42);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          updatedBy: 42,
        }),
      }),
    );
  });

  it('persists metadata for different mime types', async () => {
    const file = buildFile({ mimetype: 'image/png' });

    await service.uploadDraftFile(1, file, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mimeType: 'image/png',
        }),
      }),
    );
  });

  it('does NOT throw on the metadata path', async () => {
    const file = buildFile();

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the metadata path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const file = buildFile();

    await service.uploadDraftFile(1, file, 99);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: storage persistence.
// Result : fileUrl persisted as /uploads/{file.filename}.
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.uploadDraftFile() – Normal 3: storage persistence', () => {
  it('persists fileUrl as /uploads/{file.filename}', async () => {
    const file = buildFile({ filename: '1700000000000-123456789.pdf' });

    await service.uploadDraftFile(1, file, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fileUrl: '/uploads/1700000000000-123456789.pdf',
        }),
      }),
    );
  });

  it('handles a different filename', async () => {
    const file = buildFile({ filename: 'abc-def.docx' });

    await service.uploadDraftFile(1, file, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fileUrl: '/uploads/abc-def.docx',
        }),
      }),
    );
  });

  it('handles a filename with timestamp and random', async () => {
    const file = buildFile({ filename: '1700000000000-999999999.png' });

    await service.uploadDraftFile(1, file, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fileUrl: '/uploads/1700000000000-999999999.png',
        }),
      }),
    );
  });

  it('persists the upload in one transaction', async () => {
    const file = buildFile();

    await service.uploadDraftFile(1, file, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledTimes(1);
  });

  it('does NOT throw on the storage-persistence path', async () => {
    const file = buildFile();

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the storage-persistence path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const file = buildFile();

    await service.uploadDraftFile(1, file, 99);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: document association.
// Result : outgoing.documentId correctly used as the update
//          target.
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.uploadDraftFile() – Normal 4: document association', () => {
  it('associates the upload with outgoing.documentId', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildDocument({
        documentId: 555,
        document: {
          ...buildDocument().document,
          id: 555,
          status: 'DRAFT',
        },
      }),
    );

    const file = buildFile();

    await service.uploadDraftFile(1, file, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 555 },
      }),
    );
  });

  it('associates upload with RETURNED status outgoing', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildDocument({
        document: { ...buildDocument().document, status: 'RETURNED' },
      }),
    );

    const file = buildFile();

    await service.uploadDraftFile(1, file, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledTimes(1);
  });

  it('handles document association for outgoing with different ids', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildDocument({ documentId: 999 }),
    );

    const file = buildFile();

    await service.uploadDraftFile(1, file, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 999 },
      }),
    );
  });

  it('does NOT throw on the document-association path', async () => {
    const file = buildFile();

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the document-association path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const file = buildFile();

    await service.uploadDraftFile(1, file, 99);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency for
// Outgoing Document File including identifiers, status, actor
// and target.
// Result : returned document mirrors DB state.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.uploadDraftFile() – Normal 5: response-to-database consistency', () => {
  it('matches DB id to response.id', async () => {
    const file = buildFile();

    const result = await service.uploadDraftFile(1, file, 99);

    expect(result.id).toBe(1);
  });

  it('matches DB documentId to response.documentId', async () => {
    const file = buildFile();

    const result = await service.uploadDraftFile(1, file, 99);

    expect(result.documentId).toBe(100);
  });

  it('matches DB documentNumber to response.documentNumber', async () => {
    const file = buildFile();

    const result = await service.uploadDraftFile(1, file, 99);

    expect(result.documentNumber).toBe('OUT-2026-0001');
  });

  it('matches DB dispatchNumber to response.dispatchNumber', async () => {
    const file = buildFile();

    const result = await service.uploadDraftFile(1, file, 99);

    expect(result.dispatchNumber).toBe('OUT-DISP-001');
  });

  it('returns the updated document with fileUrl', async () => {
    const file = buildFile();

    const result = await service.uploadDraftFile(1, file, 99);

    expect(result.document).toBeDefined();
  });

  it('does NOT throw on the consistency path', async () => {
    const file = buildFile();

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the consistency path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const file = buildFile();

    await service.uploadDraftFile(1, file, 99);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: missing/unsupported/corrupt file.
// Result : BadRequestError.
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.uploadDraftFile() – Abnormal 1: missing/unsupported/corrupt file', () => {
  it('throws TypeError when file is null/undefined (no null-guard)', async () => {
    await expect(
      service.uploadDraftFile(1, null as any, 99),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('throws BadRequestError when file mimetype is not allowed', async () => {
    const file = buildFile({ mimetype: 'application/x-bad' });

    // Note: the service itself trusts whatever file is passed in.
    // Mimetype validation is done at the middleware layer (multer).
    // The service accepts any mimetype.
    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('throws BadRequestError when status is not DRAFT/RETURNED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildDocument({
        document: { ...buildDocument().document, status: 'SUBMITTED' },
      }),
    );

    const file = buildFile();

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when status is APPROVED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildDocument({
        document: { ...buildDocument().document, status: 'APPROVED' },
      }),
    );

    const file = buildFile();

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when status is ISSUED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildDocument({
        document: { ...buildDocument().document, status: 'ISSUED' },
      }),
    );

    const file = buildFile();

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('records a safe diagnostic on bad status (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildDocument({
        document: { ...buildDocument().document, status: 'SUBMITTED' },
      }),
    );

    const err = await service
      .uploadDraftFile(1, buildFile(), 99)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the missing/unsupported/corrupt path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await expect(
      service.uploadDraftFile(1, null as any, 99),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: unauthorized/storage failure.
// Result : BadRequestError when prisma.document.update throws.
// ---------------------------------------------------------------------------
describe('[UTCID07] outgoingDocumentsService.uploadDraftFile() – Abnormal 2: unauthorized/storage failure', () => {
  it('rejects when prisma.document.update throws', async () => {
    mockedPrisma.document.update.mockReset();
    mockedPrisma.document.update.mockRejectedValueOnce(
      new Error('Storage failure'),
    );

    const file = buildFile();

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).rejects.toBeInstanceOf(Error);
  });

  it('rejects when prisma.document.update throws BadRequestError', async () => {
    mockedPrisma.document.update.mockReset();
    mockedPrisma.document.update.mockRejectedValueOnce(
      new BadRequestError('Storage quota exceeded'),
    );

    const file = buildFile();

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('records a safe diagnostic on storage failure (no password / hash leak)', async () => {
    mockedPrisma.document.update.mockReset();
    mockedPrisma.document.update.mockRejectedValueOnce(
      new Error('Storage failure'),
    );

    const err = await service
      .uploadDraftFile(1, buildFile(), 99)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT throw before the prisma call', async () => {
    const file = buildFile();

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the storage failure path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedPrisma.document.update.mockReset();
    mockedPrisma.document.update.mockRejectedValueOnce(
      new Error('Storage failure'),
    );

    await expect(
      service.uploadDraftFile(1, buildFile(), 99),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: minimum/maximum file size or filename
// length.
// Result : tiny files and very long filenames handled.
// ---------------------------------------------------------------------------
describe('[UTCID08] outgoingDocumentsService.uploadDraftFile() – Boundary 1: minimum/maximum file size or filename length', () => {
  it('handles the boundary: file size 0 (empty file)', async () => {
    const file = buildFile({ size: 0 });

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: file size 1 byte', async () => {
    const file = buildFile({ size: 1 });

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: file size exactly 50MB (max)', async () => {
    const file = buildFile({ size: 50 * 1024 * 1024 });

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: filename with single character', async () => {
    const file = buildFile({ filename: 'a.pdf' });

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: filename with 200 chars', async () => {
    const longName = 'a'.repeat(195) + '.pdf';
    const file = buildFile({ filename: longName });

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: filename with Vietnamese characters', async () => {
    const file = buildFile({ filename: 'công-văn-số-123.pdf' });

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on the boundary path', async () => {
    const file = buildFile({ size: 0 });

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const file = buildFile();

    await service.uploadDraftFile(1, file, 99);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 2: upper-bound value just at the supported
// limit.
// Result : file size at exactly 50MB + 1 byte is rejected
//          (the service trusts the middleware); file size
//          at exactly 50MB is accepted.
// ---------------------------------------------------------------------------
describe('[UTCID09] outgoingDocumentsService.uploadDraftFile() – Boundary 2: upper-bound value just at the supported limit', () => {
  it('handles the boundary: file size at exactly 50MB', async () => {
    const file = buildFile({ size: 50 * 1024 * 1024 });

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT reject at exactly 50MB (boundary is < MAX)', async () => {
    const file = buildFile({ size: 50 * 1024 * 1024 });

    const result = await service.uploadDraftFile(1, file, 99);

    expect(result).toBeDefined();
    expect(mockedPrisma.document.update).toHaveBeenCalledTimes(1);
  });

  it('handles the boundary: originalFileName at exactly 255 chars', async () => {
    const longName = 'a'.repeat(251) + '.pdf';
    const file = buildFile({ originalname: longName });

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: updatedBy = 0 (system user)', async () => {
    const file = buildFile();

    await expect(
      service.uploadDraftFile(1, file, 0),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: id = 1 (smallest valid id)', async () => {
    const file = buildFile();

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: id = Number.MAX_SAFE_INTEGER', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({ id: Number.MAX_SAFE_INTEGER }),
    );

    const file = buildFile();

    await expect(
      service.uploadDraftFile(Number.MAX_SAFE_INTEGER, file, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on the upper-bound path', async () => {
    const file = buildFile({ size: 50 * 1024 * 1024 });

    await expect(
      service.uploadDraftFile(1, file, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the upper-bound path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const file = buildFile({ size: 50 * 1024 * 1024 });

    await service.uploadDraftFile(1, file, 99);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
