/**
 * Unit tests for OutgoingDocumentsService.getSignatureDetail() —
 * Function62 / View Signature Modified Time.
 *
 * Note on naming: the matrix headers reference
 * `SignatureQueryService` and the action is "View Signature
 * Modified Time". The closest implementation is
 * `OutgoingDocumentsService.getSignatureDetail(id, signatureIndex,
 *   currentUser)` — returns the full signature detail including
 * `signedAt` (modification time).
 *
 * The matrix mentions modification time, timezone conversion,
 * signature association. These all map to the returned signature
 * payload:
 *   - `signedAt` → modification time (UTC ISO string).
 *   - `signature.unsignedTime` or similar → timezone conversion.
 *   - `signerName`, `signerEmail`, certificate → association.
 *
 * Step-by-step:
 *   1. `outgoing = await outgoingDocumentsRepository.findById
 *      (id)`.
 *   2. Role-based access check (same as getSignatures).
 *   3. If `!outgoing.document.fileUrl`, throw
 *      `BadRequestError('FILE_NOT_FOUND: ...')`.
 *   4. Build filename + filepath; if file missing on disk →
 *      `NotFoundError('FILE_NOT_FOUND: ...')`.
 *   5. If `!isSupportedSignatureFile(filePath, mimeType)`,
 *      throw `BadRequestError('UNSUPPORTED_FILE_TYPE: ...')`.
 *   6. `buffer = fs.readFileSync(filePath)` in try/catch →
 *      `BadRequestError('CANNOT_READ_FILE: ...')` on failure.
 *   7. `signatures = extractSignaturesFromFile(buffer, filePath,
 *      mimeType)` in try/catch.
 *   8. If `signatureIndex < 0 || signatureIndex >=
 *      signatures.length`, throw
 *      `BadRequestError('INVALID_SIGNATURE_INDEX: ...')`.
 *   9. Return `signatures[signatureIndex]` — full signature
 *      payload including `signedAt`.
 *
 * Coverage matrix (UTCID01 – UTCID06):
 *   UTCID01  N  – Modification time: returns signedAt.
 *   UTCID02  N  – Timezone conversion: signedAt is a UTC ISO
 *                 string.
 *   UTCID03  N  – Signature association: full signature object
 *                 with signer + certificate.
 *   UTCID04  A  – Signature/file not found.
 *   UTCID05  A  – Forbidden/parser failure.
 *   UTCID06  B  – Exact timestamp/timezone boundary.
 */

import { OutgoingDocumentsService } from '../../../src/modules/outgoing-documents/outgoing-documents.service';
import { outgoingDocumentsRepository } from '../../../src/modules/outgoing-documents/outgoing-documents.repository';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from '../../../src/shared/exceptions/app-error';
import {
  extractSignaturesFromFile,
  isSupportedSignatureFile,
} from '../../../src/shared/utils/pdf-signature.util';
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
    document: { findUnique: jest.fn().mockResolvedValue(null) },
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

const mockedFs = fs as jest.Mocked<typeof fs>;

const mockedExtractSignatures = extractSignaturesFromFile as jest.MockedFunction<
  typeof extractSignaturesFromFile
>;
const mockedIsSupported = isSupportedSignatureFile as jest.MockedFunction<
  typeof isSupportedSignatureFile
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
const FAKE_FILENAME = 'test-document.pdf';
const FAKE_SIGNED_AT = '2026-09-10T08:30:45Z';

const buildSignature = (overrides: any = {}): any => ({
  index: 0,
  signerName: 'Nguyễn Văn A',
  signerEmail: 'a@example.com',
  signedAt: FAKE_SIGNED_AT,
  certificate: {
    issuer: 'VNPT-CA',
    validFrom: '2026-01-01T00:00:00Z',
    validTo: '2027-01-01T00:00:00Z',
    serialNumber: 'ABC123',
  },
  reason: 'Approval',
  location: 'Hà Nội',
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
    mimeType: 'application/pdf',
    status: 'ISSUED',
    documentStatus: 'ACTIVE',
    createdAt: new Date('2026-09-09T07:00:00.000Z'),
    updatedAt: new Date('2026-09-12T12:00:00.000Z'),
    createdByUser: { id: 5, fullName: 'Lê Văn Submitter' },
    department: { id: 1, name: 'Phòng Hành chính' },
    documentTypeRef: { id: 1, name: 'Công văn' },
  },
  ...overrides,
});

const buildCurrentUser = (overrides: any = {}): any => ({
  id: 99,
  roles: ['ADMIN'],
  departmentId: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();

  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockImplementation(async () => buildDocument());

  mockedFs.existsSync.mockImplementation(() => true);
  mockedFs.readFileSync.mockImplementation(
    () => Buffer.from('fake-content') as any,
  );

  mockedIsSupported.mockImplementation(() => true);
  mockedExtractSignatures.mockImplementation(() => [
    buildSignature({ index: 0 }),
  ]);

  service = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: modification time.
// Result : signedAt present on the returned signature.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.getSignatureDetail() – Normal 1: modification time', () => {
  it('returns the signature detail', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result).toBeDefined();
  });

  it('returns signedAt (modification time) as UTC ISO string', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signedAt).toBe(FAKE_SIGNED_AT);
  });

  it('returns signedAt matching the input signature index', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ index: 0, signedAt: '2026-09-10T08:00:00Z' }),
      buildSignature({ index: 1, signedAt: '2026-09-10T09:00:00Z' }),
    ]);

    const result = await service.getSignatureDetail(1, 1, buildCurrentUser());

    expect(result.signedAt).toBe('2026-09-10T09:00:00Z');
  });

  it('returns index matching signatureIndex', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.index).toBe(0);
  });

  it('returns signerName', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signerName).toBe('Nguyễn Văn A');
  });

  it('returns signerEmail', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signerEmail).toBe('a@example.com');
  });

  it('returns certificate', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.certificate).toBeDefined();
  });

  it('returns reason', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.reason).toBe('Approval');
  });

  it('returns location', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.location).toBe('Hà Nội');
  });

  it('does NOT throw on the modification-time path', async () => {
    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the modification-time path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: timezone conversion.
// Result : signedAt is a UTC ISO string, parseable as Date.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.getSignatureDetail() – Normal 2: timezone conversion', () => {
  it('returns signedAt as a UTC ISO string ending with "Z"', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signedAt).toMatch(/Z$/);
  });

  it('returns signedAt parseable as a Date object', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    const date = new Date(result.signedAt);

    expect(date.toString()).not.toBe('Invalid Date');
  });

  it('returns signedAt in ISO 8601 format', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    );
  });

  it('preserves the UTC time when converted to local', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ signedAt: '2026-09-10T08:30:45Z' }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());
    const utcDate = new Date(result.signedAt);

    expect(utcDate.toISOString()).toBe('2026-09-10T08:30:45.000Z');
  });

  it('does NOT throw on the timezone-conversion path', async () => {
    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the timezone-conversion path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: signature association.
// Result : full signature object (signer + certificate + time).
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.getSignatureDetail() – Normal 3: signature association', () => {
  it('returns the full signature object for index=0', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.index).toBe(0);
    expect(result.signerName).toBe('Nguyễn Văn A');
    expect(result.signedAt).toBeDefined();
  });

  it('returns the right signature when index=1', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ index: 0, signerName: 'Signer 0' }),
      buildSignature({ index: 1, signerName: 'Signer 1' }),
    ]);

    const result = await service.getSignatureDetail(1, 1, buildCurrentUser());

    expect(result.signerName).toBe('Signer 1');
    expect(result.index).toBe(1);
  });

  it('returns certificate with all fields', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.certificate.issuer).toBe('VNPT-CA');
    expect(result.certificate.serialNumber).toBe('ABC123');
    expect(result.certificate.validFrom).toBeDefined();
    expect(result.certificate.validTo).toBeDefined();
  });

  it('returns the right signature even when not in order', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ index: 0, signerName: 'A' }),
      buildSignature({ index: 1, signerName: 'B' }),
      buildSignature({ index: 2, signerName: 'C' }),
    ]);

    const result = await service.getSignatureDetail(1, 2, buildCurrentUser());

    expect(result.signerName).toBe('C');
  });

  it('does NOT throw on the signature-association path', async () => {
    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the signature-association path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: signature/file not found.
// Result : NotFoundError when missing, BadRequestError when
//          file missing or invalid index.
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.getSignatureDetail() – Abnormal 1: signature/file not found', () => {
  it('throws BadRequestError when fileUrl is missing', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildDocument({
        document: {
          ...buildDocument().document,
          fileUrl: null,
        },
      }),
    );

    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws NotFoundError when file does not exist on disk', async () => {
    mockedFs.existsSync.mockImplementation(() => false);

    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws BadRequestError with INVALID_SIGNATURE_INDEX for negative index', async () => {
    await expect(
      service.getSignatureDetail(1, -1, buildCurrentUser()),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError with INVALID_SIGNATURE_INDEX for index >= length', async () => {
    mockedExtractSignatures.mockImplementation(() => [buildSignature()]);

    await expect(
      service.getSignatureDetail(1, 5, buildCurrentUser()),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError with INVALID_SIGNATURE_INDEX message', async () => {
    await expect(
      service.getSignatureDetail(1, -1, buildCurrentUser()),
    ).rejects.toThrow(/INVALID_SIGNATURE_INDEX/);
  });

  it('throws BadRequestError with FILE_NOT_FOUND when no fileUrl', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildDocument({
        document: {
          ...buildDocument().document,
          fileUrl: null,
        },
      }),
    );

    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).rejects.toThrow(/FILE_NOT_FOUND/);
  });

  it('throws NotFoundError with FILE_NOT_FOUND when file missing on disk', async () => {
    mockedFs.existsSync.mockImplementation(() => false);

    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).rejects.toThrow(/FILE_NOT_FOUND/);
  });

  it('records a safe diagnostic on not-found (no password / hash leak)', async () => {
    mockedFs.existsSync.mockImplementation(() => false);

    const err = await service
      .getSignatureDetail(1, 0, buildCurrentUser())
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the not-found path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedFs.existsSync.mockImplementation(() => false);

    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 2: forbidden/parser failure.
// Result : ForbiddenError or BadRequestError.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.getSignatureDetail() – Abnormal 2: forbidden/parser failure', () => {
  it('throws ForbiddenError when specialist from different department', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildDocument({
        document: {
          ...buildDocument().document,
          status: 'DRAFT',
          department: { id: 2, name: 'Phòng khác' },
        },
      }),
    );

    await expect(
      service.getSignatureDetail(1, 0, {
        id: 99,
        roles: ['SPECIALIST'],
        departmentId: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws BadRequestError for unsupported file type', async () => {
    mockedIsSupported.mockImplementation(() => false);

    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError with UNSUPPORTED_FILE_TYPE for unsupported file', async () => {
    mockedIsSupported.mockImplementation(() => false);

    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).rejects.toThrow(/UNSUPPORTED_FILE_TYPE/);
  });

  it('throws BadRequestError when file cannot be read', async () => {
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError with CANNOT_READ_FILE when read fails', async () => {
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).rejects.toThrow(/CANNOT_READ_FILE/);
  });

  it('throws BadRequestError when signature parsing fails', async () => {
    mockedExtractSignatures.mockImplementation(() => {
      throw new Error('Parse failed');
    });

    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError with SIGNATURE_PARSE_FAILED when parser fails', async () => {
    mockedExtractSignatures.mockImplementation(() => {
      throw new Error('Parse failed');
    });

    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).rejects.toThrow(/SIGNATURE_PARSE_FAILED/);
  });

  it('records a safe diagnostic on forbidden (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildDocument({
        document: {
          ...buildDocument().document,
          status: 'DRAFT',
          department: { id: 2, name: 'Phòng khác' },
        },
      }),
    );

    const err = await service
      .getSignatureDetail(1, 0, {
        id: 99,
        roles: ['SPECIALIST'],
        departmentId: 1,
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('records a safe diagnostic on parse failure (no password / hash leak)', async () => {
    mockedExtractSignatures.mockImplementation(() => {
      throw new Error('Parse failed');
    });

    const err = await service
      .getSignatureDetail(1, 0, buildCurrentUser())
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the forbidden/parser path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedExtractSignatures.mockImplementation(() => {
      throw new Error('Parse failed');
    });

    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Boundary 1: exact timestamp/timezone boundary.
// Result : 0 index (first), large index (last) supported;
//          signedAt accepts various formats.
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.getSignatureDetail() – Boundary 1: exact timestamp/timezone boundary', () => {
  it('handles the boundary: index=0 (first signature)', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.index).toBe(0);
  });

  it('handles the boundary: signedAt at midnight UTC', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ signedAt: '2026-01-01T00:00:00Z' }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signedAt).toBe('2026-01-01T00:00:00Z');
    expect(new Date(result.signedAt).toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('handles the boundary: signedAt at midnight with offset', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ signedAt: '2026-12-31T23:59:59Z' }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signedAt).toBe('2026-12-31T23:59:59Z');
  });

  it('handles the boundary: signedAt with milliseconds', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ signedAt: '2026-09-10T08:30:45.123Z' }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signedAt).toBe('2026-09-10T08:30:45.123Z');
    expect(new Date(result.signedAt).toISOString()).toBe(
      '2026-09-10T08:30:45.123Z',
    );
  });

  it('handles the boundary: index at length-1 (last signature)', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ index: 0 }),
      buildSignature({ index: 1 }),
      buildSignature({ index: 2 }),
    ]);

    const result = await service.getSignatureDetail(1, 2, buildCurrentUser());

    expect(result.index).toBe(2);
  });

  it('handles the boundary: very large document id', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildDocument({ id: Number.MAX_SAFE_INTEGER }),
    );

    const result = await service.getSignatureDetail(
      Number.MAX_SAFE_INTEGER,
      0,
      buildCurrentUser(),
    );

    expect(result).toBeDefined();
  });

  it('handles the boundary: signedAt at unix epoch', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ signedAt: '1970-01-01T00:00:00Z' }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signedAt).toBe('1970-01-01T00:00:00Z');
  });

  it('handles the boundary: signedAt at far future', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ signedAt: '2099-12-31T23:59:59Z' }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signedAt).toBe('2099-12-31T23:59:59Z');
  });

  it('does NOT throw on the boundary path (index=0)', async () => {
    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on the boundary path (index=length-1)', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ index: 0 }),
      buildSignature({ index: 1 }),
    ]);

    await expect(
      service.getSignatureDetail(1, 1, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
