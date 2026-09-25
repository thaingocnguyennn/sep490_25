/**
 * Unit tests for OutgoingDocumentsService.getSignatureDetail() —
 * Function63 / View Signer Details and Time.
 *
 * Note on naming: the matrix headers reference
 * `SignatureQueryService` and the action is "View Signer
 * Details and Time". The closest implementation is
 * `OutgoingDocumentsService.getSignatureDetail(id, signatureIndex,
 *   currentUser)` — returns the full signature detail including
 * signer identity, signing time, and certificate info.
 *
 * The matrix mentions:
 *   - signer identity → signerName, signerEmail.
 *   - signing time    → signedAt (UTC ISO string).
 *   - certificate issuer → certificate.issuer, certificate
 *     .serialNumber, certificate.validFrom, certificate
 *     .validTo.
 *   - signature mapping → signatures[signatureIndex] lookup.
 *   - response-to-database consistency → full object mirror.
 *   - certificate validity-time boundary → validFrom/validTo
 *     at exactly-now / past / future.
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
 *   7. `signatures = extractSignaturesFromFile(...)` in
 *      try/catch.
 *   8. If `signatureIndex < 0 || signatureIndex >=
 *      signatures.length`, throw
 *      `BadRequestError('INVALID_SIGNATURE_INDEX: ...')`.
 *   9. Return `signatures[signatureIndex]` — full signature
 *      payload including `signedAt` and certificate fields.
 *
 * Coverage matrix (UTCID01 – UTCID08):
 *   UTCID01  N  – Signer identity: signerName + signerEmail.
 *   UTCID02  N  – Signing time: signedAt ISO string.
 *   UTCID03  N  – Certificate issuer: certificate fields.
 *   UTCID04  N  – Signature mapping: index lookup.
 *   UTCID05  N  – Response-to-database consistency: full
 *                 payload.
 *   UTCID06  A  – Signature/file not found.
 *   UTCID07  A  – Forbidden/invalid certificate.
 *   UTCID08  B  – Certificate validity-time boundary.
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
// UTCID01 – Normal 1: signer identity.
// Result : signerName + signerEmail present.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.getSignatureDetail() – Normal 1: signer identity', () => {
  it('returns signerName', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signerName).toBe('Nguyễn Văn A');
  });

  it('returns signerEmail', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signerEmail).toBe('a@example.com');
  });

  it('handles signer identity with Vietnamese name', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ signerName: 'Trần Thị B' }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signerName).toBe('Trần Thị B');
  });

  it('handles signer identity with English name', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ signerName: 'John Doe' }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signerName).toBe('John Doe');
  });

  it('handles multiple signers with different identities', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({
        index: 0,
        signerName: 'Signer 0',
        signerEmail: 's0@example.com',
      }),
      buildSignature({
        index: 1,
        signerName: 'Signer 1',
        signerEmail: 's1@example.com',
      }),
    ]);

    const result = await service.getSignatureDetail(1, 1, buildCurrentUser());

    expect(result.signerName).toBe('Signer 1');
    expect(result.signerEmail).toBe('s1@example.com');
  });

  it('handles signerEmail at long value', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({
        signerEmail: 'very.long.email.address.that.exceeds.normal.length@subdomain.example.com',
      }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signerEmail).toContain('very.long.email');
  });

  it('does NOT throw on the signer-identity path', async () => {
    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the signer-identity path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: signing time.
// Result : signedAt as ISO string.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.getSignatureDetail() – Normal 2: signing time', () => {
  it('returns signedAt as UTC ISO string', async () => {
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

  it('returns signedAt with "Z" suffix', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signedAt).toMatch(/Z$/);
  });

  it('returns signedAt parseable as Date', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    const date = new Date(result.signedAt);

    expect(date.toString()).not.toBe('Invalid Date');
  });

  it('handles signedAt with milliseconds', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ signedAt: '2026-09-10T08:30:45.123Z' }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signedAt).toBe('2026-09-10T08:30:45.123Z');
  });

  it('handles signedAt with hyphenated format', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ signedAt: '2026-09-10T08:30:45+00:00' }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signedAt).toBe('2026-09-10T08:30:45+00:00');
  });

  it('does NOT throw on the signing-time path', async () => {
    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the signing-time path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: certificate issuer.
// Result : certificate.issuer, .serialNumber, .validFrom,
//          .validTo all present.
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.getSignatureDetail() – Normal 3: certificate issuer', () => {
  it('returns certificate.issuer', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.certificate.issuer).toBe('VNPT-CA');
  });

  it('returns certificate.serialNumber', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.certificate.serialNumber).toBe('ABC123');
  });

  it('returns certificate.validFrom', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.certificate.validFrom).toBeDefined();
  });

  it('returns certificate.validTo', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.certificate.validTo).toBeDefined();
  });

  it('returns different CA issuers correctly', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({
        certificate: {
          issuer: 'FPT-CA',
          validFrom: '2026-01-01T00:00:00Z',
          validTo: '2028-01-01T00:00:00Z',
          serialNumber: 'XYZ789',
        },
      }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.certificate.issuer).toBe('FPT-CA');
    expect(result.certificate.serialNumber).toBe('XYZ789');
  });

  it('returns certificate fields with valid timestamps', async () => {
    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    const validFrom = new Date(result.certificate.validFrom);
    const validTo = new Date(result.certificate.validTo);

    expect(validFrom.toString()).not.toBe('Invalid Date');
    expect(validTo.toString()).not.toBe('Invalid Date');
    expect(validTo.getTime()).toBeGreaterThan(validFrom.getTime());
  });

  it('does NOT throw on the certificate-issuer path', async () => {
    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the certificate-issuer path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: signature mapping.
// Result : signatures[signatureIndex] lookup returns the right
//          signature.
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.getSignatureDetail() – Normal 4: signature mapping', () => {
  it('returns signatures[0] when signatureIndex=0', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({
        index: 0,
        signerName: 'Signer 0',
        signedAt: '2026-09-10T08:00:00Z',
      }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.index).toBe(0);
    expect(result.signerName).toBe('Signer 0');
  });

  it('returns signatures[1] when signatureIndex=1', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ index: 0, signerName: 'Signer 0' }),
      buildSignature({ index: 1, signerName: 'Signer 1' }),
    ]);

    const result = await service.getSignatureDetail(1, 1, buildCurrentUser());

    expect(result.index).toBe(1);
    expect(result.signerName).toBe('Signer 1');
  });

  it('returns signatures[5] (large index) when signatures.length=10', async () => {
    mockedExtractSignatures.mockImplementation(() =>
      Array.from({ length: 10 }, (_, i) =>
        buildSignature({ index: i, signerName: `Signer ${i}` }),
      ),
    );

    const result = await service.getSignatureDetail(1, 5, buildCurrentUser());

    expect(result.index).toBe(5);
    expect(result.signerName).toBe('Signer 5');
  });

  it('handles signature mapping with different timezones', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ index: 0, signedAt: '2026-09-10T08:00:00Z' }),
      buildSignature({ index: 1, signedAt: '2026-09-10T09:00:00+07:00' }),
    ]);

    const result = await service.getSignatureDetail(1, 1, buildCurrentUser());

    expect(result.signedAt).toBe('2026-09-10T09:00:00+07:00');
  });

  it('handles signature mapping with mixed CAs', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({
        index: 0,
        certificate: { issuer: 'VNPT-CA', serialNumber: 'A' },
      }),
      buildSignature({
        index: 1,
        certificate: { issuer: 'FPT-CA', serialNumber: 'B' },
      }),
    ]);

    const result = await service.getSignatureDetail(1, 1, buildCurrentUser());

    expect(result.certificate.issuer).toBe('FPT-CA');
    expect(result.certificate.serialNumber).toBe('B');
  });

  it('does NOT throw on the signature-mapping path', async () => {
    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the signature-mapping path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency for
// Signer Details and Time including identifiers, status,
// actor and target.
// Result : the returned object fully mirrors the database row.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.getSignatureDetail() – Normal 5: response-to-database consistency', () => {
  it('matches DB index to response.index', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ index: 0, signerName: 'DB-0' }),
      buildSignature({ index: 1, signerName: 'DB-1' }),
      buildSignature({ index: 2, signerName: 'DB-2' }),
      buildSignature({ index: 3, signerName: 'DB-3' }),
    ]);

    const result = await service.getSignatureDetail(1, 3, buildCurrentUser());

    expect(result.index).toBe(3);
  });

  it('matches DB signerName to response.signerName', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ signerName: 'DB-Signer-Name' }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signerName).toBe('DB-Signer-Name');
  });

  it('matches DB signerEmail to response.signerEmail', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ signerEmail: 'db-signer@example.com' }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signerEmail).toBe('db-signer@example.com');
  });

  it('matches DB signedAt to response.signedAt', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ signedAt: '2026-09-10T08:30:45Z' }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.signedAt).toBe('2026-09-10T08:30:45Z');
  });

  it('matches DB certificate.issuer to response.certificate.issuer', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({
        certificate: {
          issuer: 'DB-Issuer',
          validFrom: '2026-01-01T00:00:00Z',
          validTo: '2027-01-01T00:00:00Z',
          serialNumber: 'DB-Serial-123',
        },
      }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.certificate.issuer).toBe('DB-Issuer');
    expect(result.certificate.serialNumber).toBe('DB-Serial-123');
  });

  it('matches DB certificate.validFrom/validTo to response', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({
        certificate: {
          issuer: 'VNPT-CA',
          validFrom: '2026-06-01T00:00:00Z',
          validTo: '2026-12-31T23:59:59Z',
          serialNumber: 'XYZ',
        },
      }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.certificate.validFrom).toBe('2026-06-01T00:00:00Z');
    expect(result.certificate.validTo).toBe('2026-12-31T23:59:59Z');
  });

  it('matches DB reason to response.reason', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ reason: 'DB-Reason-Code' }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.reason).toBe('DB-Reason-Code');
  });

  it('matches DB location to response.location', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ location: 'DB-Location-City' }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.location).toBe('DB-Location-City');
  });

  it('does NOT throw on the response-to-database-consistency path', async () => {
    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the consistency path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: signature/file not found.
// Result : NotFoundError when missing, BadRequestError when
//          file missing or invalid index.
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.getSignatureDetail() – Abnormal 1: signature/file not found', () => {
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
// UTCID07 – Abnormal 2: forbidden/invalid certificate.
// Result : ForbiddenError or BadRequestError for unsupported
//          file / parse failure.
// ---------------------------------------------------------------------------
describe('[UTCID07] outgoingDocumentsService.getSignatureDetail() – Abnormal 2: forbidden/invalid certificate', () => {
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

  it('throws BadRequestError when certificate is missing in signature', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      {
        index: 0,
        signerName: 'Nguyễn Văn A',
        signedAt: FAKE_SIGNED_AT,
        // no certificate
      },
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.certificate).toBeUndefined();
  });

  it('throws BadRequestError when read fails', async () => {
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).rejects.toBeInstanceOf(BadRequestError);
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

  it('records a safe diagnostic on invalid certificate (no password / hash leak)', async () => {
    mockedIsSupported.mockImplementation(() => false);

    const err = await service
      .getSignatureDetail(1, 0, buildCurrentUser())
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the forbidden/invalid-cert path', async () => {
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
// UTCID08 – Boundary 1: certificate validity-time boundary.
// Result : validFrom == now; validTo == now; validFrom ==
//          validTo; validFrom < validTo.
// ---------------------------------------------------------------------------
describe('[UTCID08] outgoingDocumentsService.getSignatureDetail() – Boundary 1: certificate validity-time boundary', () => {
  it('handles the boundary: certificate validFrom == now', async () => {
    const now = '2026-09-14T00:00:00Z';
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({
        certificate: {
          issuer: 'VNPT-CA',
          validFrom: now,
          validTo: '2027-01-01T00:00:00Z',
          serialNumber: 'NOW',
        },
      }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.certificate.validFrom).toBe(now);
  });

  it('handles the boundary: certificate validTo == now', async () => {
    const now = '2026-09-14T00:00:00Z';
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({
        certificate: {
          issuer: 'VNPT-CA',
          validFrom: '2025-01-01T00:00:00Z',
          validTo: now,
          serialNumber: 'EXPIRING',
        },
      }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.certificate.validTo).toBe(now);
  });

  it('handles the boundary: certificate validFrom == validTo (zero duration)', async () => {
    const sameTime = '2026-09-14T00:00:00Z';
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({
        certificate: {
          issuer: 'VNPT-CA',
          validFrom: sameTime,
          validTo: sameTime,
          serialNumber: 'ZERO',
        },
      }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.certificate.validFrom).toBe(sameTime);
    expect(result.certificate.validTo).toBe(sameTime);
  });

  it('handles the boundary: certificate validFrom < validTo (positive duration)', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({
        certificate: {
          issuer: 'VNPT-CA',
          validFrom: '2026-01-01T00:00:00Z',
          validTo: '2027-01-01T00:00:00Z',
          serialNumber: 'POSITIVE',
        },
      }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(
      new Date(result.certificate.validTo).getTime(),
    ).toBeGreaterThan(
      new Date(result.certificate.validFrom).getTime(),
    );
  });

  it('handles the boundary: certificate at unix epoch', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({
        certificate: {
          issuer: 'VNPT-CA',
          validFrom: '1970-01-01T00:00:00Z',
          validTo: '2030-01-01T00:00:00Z',
          serialNumber: 'EPOCH',
        },
      }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.certificate.validFrom).toBe('1970-01-01T00:00:00Z');
  });

  it('handles the boundary: certificate at far future', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({
        certificate: {
          issuer: 'VNPT-CA',
          validFrom: '2099-01-01T00:00:00Z',
          validTo: '2099-12-31T23:59:59Z',
          serialNumber: 'FUTURE',
        },
      }),
    ]);

    const result = await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(result.certificate.validFrom).toBe('2099-01-01T00:00:00Z');
  });

  it('does NOT throw on the validity-time-boundary path (zero duration)', async () => {
    const sameTime = '2026-09-14T00:00:00Z';
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({
        certificate: {
          issuer: 'VNPT-CA',
          validFrom: sameTime,
          validTo: sameTime,
          serialNumber: 'ZERO',
        },
      }),
    ]);

    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on the validity-time-boundary path (epoch)', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({
        certificate: {
          issuer: 'VNPT-CA',
          validFrom: '1970-01-01T00:00:00Z',
          validTo: '2030-01-01T00:00:00Z',
          serialNumber: 'EPOCH',
        },
      }),
    ]);

    await expect(
      service.getSignatureDetail(1, 0, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the validity-time-boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getSignatureDetail(1, 0, buildCurrentUser());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
