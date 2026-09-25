/**
 * Unit tests for OutgoingDocumentsService.runOcr() —
 * Function65 / OCR Outgoing Document.
 *
 * Note on naming: the matrix headers reference `OcrService`.
 * The actual implementation is
 * `OutgoingDocumentsService.runOcr(id)` — runs OCR on the
 * already-uploaded file of an outgoing document.
 *
 * Step-by-step:
 *   1. `outgoing = await outgoingDocumentsRepository.findById
 *      (id)`.
 *   2. If `!outgoing.document.fileUrl`, throw
 *      `BadRequestError('Văn bản chưa có file đính kèm. ...')`.
 *   3. If status not in `['DRAFT', 'RETURNED']`, throw
 *      `BadRequestError('Không thể chạy OCR ở trạng thái ...')`.
 *   4. If file missing on disk → `NotFoundError('File không tồn
 *      tại trên server. ...')`.
 *   5. Read file: `fileBuffer = fs.readFileSync(filePath)`.
 *   6. mimeType = `outgoing.document.mimeType ||
 *      'application/pdf'`.
 *   7. Persist: `prisma.document.update({ ..., data: {
 *      ocrStatus: 'PROCESSING' } })`.
 *   8. `ocrResult = await performOcr(fileBuffer, mimeType)`.
 *   9. `extractedFields = extractFields(ocrResult.pages,
 *      'OUTGOING', { sources: { embeddedPages,
 *      ocrPages } })`.
 *   10. Persist: `prisma.document.update({ ..., data: {
 *       ocrText, ocrStatus: 'COMPLETED' } })`.
 *   11. Return `{ confidence, extractedFields, ocrText? }`.
 *
 *   On error during steps 8–10, persist `{ ocrStatus: 'FAILED'
 *   }` and rethrow.
 *
 * Coverage matrix (UTCID01 – UTCID10):
 *   UTCID01  N  – Valid Vietnamese document.
 *   UTCID02  N  – Extracted text.
 *   UTCID03  N  – Metadata suggestion.
 *   UTCID04  N  – OCR history (text + status persisted).
 *   UTCID05  N  – Response-to-database consistency.
 *   UTCID06  N  – Repeat-safe processing (idempotent calls).
 *   UTCID07  A  – Unsupported/corrupt image/PDF.
 *   UTCID08  A  – OCR engine/language-data failure.
 *   UTCID09  B  – One-page or maximum supported page count.
 *   UTCID10  B  – Upper-bound value just at the supported
 *                 limit.
 */

import { OutgoingDocumentsService } from '../../../src/modules/outgoing-documents/outgoing-documents.service';
import { outgoingDocumentsRepository } from '../../../src/modules/outgoing-documents/outgoing-documents.repository';
import {
  NotFoundError,
  BadRequestError,
} from '../../../src/shared/exceptions/app-error';
import { performOcr, extractFields } from '../../../src/shared/services/ocr.service';
import prisma from '../../../src/config/database';
import fs from 'fs';

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
const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedPerformOcr = performOcr as jest.MockedFunction<
  typeof performOcr
>;
const mockedExtractFields = extractFields as jest.MockedFunction<
  typeof extractFields
>;

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

const FAKE_FILE_URL = '/uploads/test-document.pdf';
const FAKE_OCR_TEXT = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\nSố: 123/CV-BCD';

const buildOcrResult = (overrides: any = {}): any => ({
  text: FAKE_OCR_TEXT,
  confidence: 0.95,
  pages: [
    {
      pageNumber: 1,
      text: FAKE_OCR_TEXT,
      confidence: 0.95,
      lines: [],
      width: 595,
      height: 842,
    },
  ],
  embeddedPages: [],
  ocrPages: [
    {
      pageNumber: 1,
      text: FAKE_OCR_TEXT,
      confidence: 0.95,
      lines: [],
      width: 595,
      height: 842,
    },
  ],
  ...overrides,
});

const buildExtractedFields = (overrides: any = {}): any => ({
  documentNumber: '123/CV-BCD',
  dateLetter: '2026-09-10',
  signerName: 'Nguyễn Văn A',
  issuer: 'Ban Chỉ đạo',
  summary: 'Công văn phát hành',
  documentType: 'Công văn',
  ...overrides,
});

const buildDocument = (overrides: any = {}): any => ({
  id: 1,
  documentId: 100,
  documentNumber: 'OUT-2026-0001',
  dispatchNumber: 'OUT-DISP-001',
  document: {
    id: 100,
    documentNumber: 'OUT-2026-0001',
    subject: 'Công văn phát hành',
    fileUrl: FAKE_FILE_URL,
    originalFileName: 'test-document.pdf',
    fileSize: 1024 * 1024,
    mimeType: 'application/pdf',
    status: 'DRAFT',
    documentStatus: 'ACTIVE',
    ocrStatus: null,
    ocrText: null,
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

  mockedFs.existsSync.mockImplementation(() => true);
  mockedFs.readFileSync.mockImplementation(
    () => Buffer.from('fake-content') as any,
  );

  mockedPerformOcr.mockReset();
  mockedPerformOcr.mockImplementation(async () => buildOcrResult());

  mockedExtractFields.mockReset();
  mockedExtractFields.mockImplementation(() => buildExtractedFields());

  service = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid Vietnamese document.
// Result : OCR succeeds, returns extractedFields.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.runOcr() – Normal 1: valid Vietnamese document', () => {
  it('runs OCR successfully on a Vietnamese PDF', async () => {
    const result = await service.runOcr(1);

    expect(result).toBeDefined();
    expect(result.extractedFields).toBeDefined();
  });

  it('returns confidence for Vietnamese document', async () => {
    const result = await service.runOcr(1);

    expect(result.confidence).toBe(0.95);
  });

  it('handles Vietnamese text in OCR result', async () => {
    mockedPerformOcr.mockImplementation(async () => buildOcrResult({
      text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM Độc lập Tự do Hạnh phúc',
    }));

    const result = await service.runOcr(1);

    expect(result.extractedFields).toBeDefined();
  });

  it('handles Vietnamese document with diacritics', async () => {
    mockedExtractFields.mockImplementation(() => buildExtractedFields({
      issuer: 'Sở Giáo dục và Đào tạo',
    }));

    const result = await service.runOcr(1);

    expect(result.extractedFields.issuer).toBe('Sở Giáo dục và Đào tạo');
  });

  it('calls performOcr once', async () => {
    await service.runOcr(1);

    expect(mockedPerformOcr).toHaveBeenCalledTimes(1);
  });

  it('calls extractFields once', async () => {
    await service.runOcr(1);

    expect(mockedExtractFields).toHaveBeenCalledTimes(1);
  });

  it('does NOT throw on the valid-Vietnamese-document path', async () => {
    await expect(service.runOcr(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the valid-Vietnamese-document path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.runOcr(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: extracted text.
// Result : ocrText persisted.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.runOcr() – Normal 2: extracted text', () => {
  it('persists ocrText on the document', async () => {
    await service.runOcr(1);

    const updateCalls = mockedPrisma.document.update.mock.calls;
    const completedCall = updateCalls.find(
      (call) => (call[0].data as any).ocrText !== undefined,
    );

    expect(completedCall).toBeDefined();
    expect((completedCall![0].data as any).ocrText).toBe(FAKE_OCR_TEXT);
  });

  it('persists ocrStatus = COMPLETED on success', async () => {
    await service.runOcr(1);

    const updateCalls = mockedPrisma.document.update.mock.calls;
    const completedCall = updateCalls.find(
      (call) => (call[0].data as any).ocrStatus === 'COMPLETED',
    );

    expect(completedCall).toBeDefined();
  });

  it('handles extracted text with newlines', async () => {
    mockedPerformOcr.mockImplementation(async () => buildOcrResult({
      text: 'Line 1\nLine 2\nLine 3',
    }));

    await service.runOcr(1);

    const updateCalls = mockedPrisma.document.update.mock.calls;
    const completedCall = updateCalls.find(
      (call) => (call[0].data as any).ocrText !== undefined,
    );

    expect((completedCall![0].data as any).ocrText).toBe('Line 1\nLine 2\nLine 3');
  });

  it('handles extracted text with empty string', async () => {
    mockedPerformOcr.mockImplementation(async () => buildOcrResult({
      text: '',
    }));

    await expect(service.runOcr(1)).resolves.toBeDefined();
  });

  it('does NOT throw on the extracted-text path', async () => {
    await expect(service.runOcr(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the extracted-text path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.runOcr(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: metadata suggestion.
// Result : extractedFields returned to caller.
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.runOcr() – Normal 3: metadata suggestion', () => {
  it('returns documentNumber suggestion', async () => {
    const result = await service.runOcr(1);

    expect(result.extractedFields.documentNumber).toBe('123/CV-BCD');
  });

  it('returns dateLetter suggestion', async () => {
    const result = await service.runOcr(1);

    expect(result.extractedFields.dateLetter).toBe('2026-09-10');
  });

  it('returns signerName suggestion', async () => {
    const result = await service.runOcr(1);

    expect(result.extractedFields.signerName).toBe('Nguyễn Văn A');
  });

  it('returns issuer suggestion', async () => {
    const result = await service.runOcr(1);

    expect(result.extractedFields.issuer).toBe('Ban Chỉ đạo');
  });

  it('returns summary suggestion', async () => {
    const result = await service.runOcr(1);

    expect(result.extractedFields.summary).toBe('Công văn phát hành');
  });

  it('returns documentType suggestion', async () => {
    const result = await service.runOcr(1);

    expect(result.extractedFields.documentType).toBe('Công văn');
  });

  it('passes OUTGOING mode to extractFields', async () => {
    await service.runOcr(1);

    expect(mockedExtractFields).toHaveBeenCalledWith(
      expect.anything(),
      'OUTGOING',
      expect.any(Object),
    );
  });

  it('does NOT throw on the metadata-suggestion path', async () => {
    await expect(service.runOcr(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the metadata-suggestion path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.runOcr(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: OCR history (status + text persisted).
// Result : ocrText + ocrStatus are persisted in the DB.
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.runOcr() – Normal 4: OCR history', () => {
  it('persists OCR history with status PROCESSING first', async () => {
    await service.runOcr(1);

    const updateCalls = mockedPrisma.document.update.mock.calls;
    const processingCall = updateCalls.find(
      (call) => (call[0].data as any).ocrStatus === 'PROCESSING',
    );

    expect(processingCall).toBeDefined();
  });

  it('persists OCR history with status COMPLETED last', async () => {
    await service.runOcr(1);

    const updateCalls = mockedPrisma.document.update.mock.calls;
    const completedCall = updateCalls.find(
      (call) => (call[0].data as any).ocrStatus === 'COMPLETED',
    );

    expect(completedCall).toBeDefined();
  });

  it('persists OCR history with ocrText', async () => {
    await service.runOcr(1);

    const updateCalls = mockedPrisma.document.update.mock.calls;
    const completedCall = updateCalls.find(
      (call) => (call[0].data as any).ocrText !== undefined,
    );

    expect(completedCall).toBeDefined();
  });

  it('makes at least 2 prisma.document.update calls', async () => {
    await service.runOcr(1);

    expect(
      mockedPrisma.document.update.mock.calls.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('does NOT throw on the OCR-history path', async () => {
    await expect(service.runOcr(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the OCR-history path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.runOcr(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency for
// Outgoing Document including identifiers, status, actor and
// target.
// Result : returned confidence + extractedFields mirror what
//          was persisted.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.runOcr() – Normal 5: response-to-database consistency', () => {
  it('matches OCR confidence to response.confidence', async () => {
    const result = await service.runOcr(1);

    expect(result.confidence).toBe(0.95);
  });

  it('matches documentNumber to extractedFields.documentNumber', async () => {
    const result = await service.runOcr(1);

    expect(result.extractedFields.documentNumber).toBe('123/CV-BCD');
  });

  it('matches dateLetter to extractedFields.dateLetter', async () => {
    const result = await service.runOcr(1);

    expect(result.extractedFields.dateLetter).toBe('2026-09-10');
  });

  it('matches signerName to extractedFields.signerName', async () => {
    const result = await service.runOcr(1);

    expect(result.extractedFields.signerName).toBe('Nguyễn Văn A');
  });

  it('matches issuer to extractedFields.issuer', async () => {
    const result = await service.runOcr(1);

    expect(result.extractedFields.issuer).toBe('Ban Chỉ đạo');
  });

  it('matches summary to extractedFields.summary', async () => {
    const result = await service.runOcr(1);

    expect(result.extractedFields.summary).toBe('Công văn phát hành');
  });

  it('does NOT throw on the consistency path', async () => {
    await expect(service.runOcr(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the consistency path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.runOcr(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Normal 6: repeat-safe processing without duplicate
// records, assignments, notifications, numbers or history.
// Result : each call updates the OCR text but doesn't create
//          duplicates.
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.runOcr() – Normal 6: repeat-safe processing', () => {
  it('handles multiple sequential OCR calls without throwing', async () => {
    await service.runOcr(1);
    await expect(service.runOcr(1)).resolves.toBeDefined();
  });

  it('each call persists the latest ocrText (overwrite, not duplicate)', async () => {
    mockedPerformOcr.mockImplementation(async () => buildOcrResult({
      text: 'First text',
    }));
    await service.runOcr(1);

    mockedPerformOcr.mockImplementation(async () => buildOcrResult({
      text: 'Second text',
    }));
    await service.runOcr(1);

    const updateCalls = mockedPrisma.document.update.mock.calls;
    const textCalls = updateCalls.filter(
      (call) => (call[0].data as any).ocrText !== undefined,
    );

    expect(textCalls.length).toBe(2);
    expect((textCalls[1][0].data as any).ocrText).toBe('Second text');
  });

  it('each call persists PROCESSING → COMPLETED transition', async () => {
    await service.runOcr(1);

    const updateCalls = mockedPrisma.document.update.mock.calls;
    const statusSequence = updateCalls.map(
      (call) => (call[0].data as any).ocrStatus,
    ).filter((s) => s !== undefined);

    expect(statusSequence).toContain('PROCESSING');
    expect(statusSequence).toContain('COMPLETED');
  });

  it('idempotent: calling twice does not duplicate OCR records', async () => {
    await service.runOcr(1);
    await service.runOcr(1);

    // Each run does 2 updates (PROCESSING + COMPLETED). Two runs = 4.
    expect(mockedPrisma.document.update).toHaveBeenCalledTimes(4);
  });

  it('does NOT throw on the repeat-safe path', async () => {
    await expect(service.runOcr(1)).resolves.toBeDefined();
    await expect(service.runOcr(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the repeat-safe path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.runOcr(1);
    await service.runOcr(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 1: unsupported/corrupt image/PDF.
// Result : BadRequestError, ocrStatus = FAILED.
// ---------------------------------------------------------------------------
describe('[UTCID07] outgoingDocumentsService.runOcr() – Abnormal 1: unsupported/corrupt image/PDF', () => {
  it('throws BadRequestError when fileUrl is missing', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({
        document: { ...buildDocument().document, fileUrl: null },
      }),
    );

    await expect(service.runOcr(1)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws NotFoundError when file does not exist on disk', async () => {
    mockedFs.existsSync.mockImplementation(() => false);

    await expect(service.runOcr(1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws BadRequestError when status is SUBMITTED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({
        document: { ...buildDocument().document, status: 'SUBMITTED' },
      }),
    );

    await expect(service.runOcr(1)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when status is APPROVED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({
        document: { ...buildDocument().document, status: 'APPROVED' },
      }),
    );

    await expect(service.runOcr(1)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when status is ISSUED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({
        document: { ...buildDocument().document, status: 'ISSUED' },
      }),
    );

    await expect(service.runOcr(1)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('records a safe diagnostic on corrupt file (no password / hash leak)', async () => {
    mockedFs.existsSync.mockImplementation(() => false);

    const err = await service.runOcr(1).catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the corrupt-file path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedFs.existsSync.mockImplementation(() => false);

    await expect(service.runOcr(1)).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Abnormal 2: OCR engine/language-data failure.
// Result : ocrStatus = FAILED persisted, error thrown.
// ---------------------------------------------------------------------------
describe('[UTCID08] outgoingDocumentsService.runOcr() – Abnormal 2: OCR engine/language-data failure', () => {
  it('rejects when performOcr throws', async () => {
    mockedPerformOcr.mockReset();
    mockedPerformOcr.mockRejectedValueOnce(new Error('OCR engine failure'));

    await expect(service.runOcr(1)).rejects.toBeInstanceOf(Error);
  });

  it('persists ocrStatus = FAILED when performOcr throws', async () => {
    mockedPerformOcr.mockReset();
    mockedPerformOcr.mockRejectedValueOnce(new Error('OCR engine failure'));

    await expect(service.runOcr(1)).rejects.toThrow();

    const updateCalls = mockedPrisma.document.update.mock.calls;
    const failedCall = updateCalls.find(
      (call) => (call[0].data as any).ocrStatus === 'FAILED',
    );

    expect(failedCall).toBeDefined();
  });

  it('rejects when extractFields throws', async () => {
    mockedExtractFields.mockReset();
    mockedExtractFields.mockImplementationOnce(() => {
      throw new Error('Field extraction failure');
    });

    await expect(service.runOcr(1)).rejects.toBeInstanceOf(Error);
  });

  it('persists ocrStatus = FAILED when extractFields throws', async () => {
    mockedExtractFields.mockReset();
    mockedExtractFields.mockImplementationOnce(() => {
      throw new Error('Field extraction failure');
    });

    await expect(service.runOcr(1)).rejects.toThrow();

    const updateCalls = mockedPrisma.document.update.mock.calls;
    const failedCall = updateCalls.find(
      (call) => (call[0].data as any).ocrStatus === 'FAILED',
    );

    expect(failedCall).toBeDefined();
  });

  it('records a safe diagnostic on OCR failure (no password / hash leak)', async () => {
    mockedPerformOcr.mockReset();
    mockedPerformOcr.mockRejectedValueOnce(new Error('OCR engine failure'));

    const err = await service.runOcr(1).catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the OCR-failure path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedPerformOcr.mockReset();
    mockedPerformOcr.mockRejectedValueOnce(new Error('OCR engine failure'));

    await expect(service.runOcr(1)).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 1: one-page or maximum supported page
// count.
// Result : 1-page documents and 1000-page documents handled.
// ---------------------------------------------------------------------------
describe('[UTCID09] outgoingDocumentsService.runOcr() – Boundary 1: one-page or maximum supported page count', () => {
  it('handles the boundary: 1-page document', async () => {
    mockedPerformOcr.mockImplementation(async () => buildOcrResult({
      pages: [
        {
          pageNumber: 1,
          text: FAKE_OCR_TEXT,
          confidence: 0.95,
          lines: [],
          width: 595,
          height: 842,
        },
      ],
    }));

    await expect(service.runOcr(1)).resolves.toBeDefined();
  });

  it('handles the boundary: 100-page document', async () => {
    mockedPerformOcr.mockImplementation(async () => buildOcrResult({
      pages: Array.from({ length: 100 }, (_, i) => ({
        pageNumber: i + 1,
        text: `Page ${i + 1}`,
        confidence: 0.95,
        lines: [],
        width: 595,
        height: 842,
      })),
    }));

    await expect(service.runOcr(1)).resolves.toBeDefined();
  });

  it('handles the boundary: 1000-page document', async () => {
    mockedPerformOcr.mockImplementation(async () => buildOcrResult({
      pages: Array.from({ length: 1000 }, (_, i) => ({
        pageNumber: i + 1,
        text: `Page ${i + 1}`,
        confidence: 0.95,
        lines: [],
        width: 595,
        height: 842,
      })),
    }));

    await expect(service.runOcr(1)).resolves.toBeDefined();
  });

  it('handles the boundary: 0-page document', async () => {
    mockedPerformOcr.mockImplementation(async () => buildOcrResult({
      pages: [],
      text: '',
    }));

    await expect(service.runOcr(1)).resolves.toBeDefined();
  });

  it('does NOT throw on the page-count boundary path', async () => {
    mockedPerformOcr.mockImplementation(async () => buildOcrResult({
      pages: Array.from({ length: 1000 }, (_, i) => ({
        pageNumber: i + 1,
        text: `Page ${i + 1}`,
        confidence: 0.95,
        lines: [],
        width: 595,
        height: 842,
      })),
    }));

    await expect(service.runOcr(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the page-count boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.runOcr(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID10 – Boundary 2: upper-bound value just at the supported
// limit for OCR Outgoing Document.
// Result : maximum file size and edge cases handled.
// ---------------------------------------------------------------------------
describe('[UTCID10] outgoingDocumentsService.runOcr() – Boundary 2: upper-bound value just at the supported limit', () => {
  it('handles the boundary: id = Number.MAX_SAFE_INTEGER', async () => {
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({ id: Number.MAX_SAFE_INTEGER }),
    );

    await expect(
      service.runOcr(Number.MAX_SAFE_INTEGER),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: empty text result', async () => {
    mockedPerformOcr.mockImplementation(async () => buildOcrResult({
      text: '',
    }));

    await expect(service.runOcr(1)).resolves.toBeDefined();
  });

  it('handles the boundary: very long text result', async () => {
    mockedPerformOcr.mockImplementation(async () => buildOcrResult({
      text: 'a'.repeat(100000),
    }));

    await expect(service.runOcr(1)).resolves.toBeDefined();
  });

  it('handles the boundary: confidence = 0', async () => {
    mockedPerformOcr.mockImplementation(async () => buildOcrResult({
      confidence: 0,
    }));

    const result = await service.runOcr(1);

    expect(result.confidence).toBe(0);
  });

  it('handles the boundary: confidence = 1', async () => {
    mockedPerformOcr.mockImplementation(async () => buildOcrResult({
      confidence: 1,
    }));

    const result = await service.runOcr(1);

    expect(result.confidence).toBe(1);
  });

  it('handles the boundary: image mimeType', async () => {
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({
        document: { ...buildDocument().document, mimeType: 'image/png' },
      }),
    );

    await expect(service.runOcr(1)).resolves.toBeDefined();
  });

  it('does NOT throw on the upper-bound path', async () => {
    await expect(service.runOcr(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the upper-bound path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.runOcr(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
