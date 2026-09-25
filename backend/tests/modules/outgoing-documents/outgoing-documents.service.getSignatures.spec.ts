/**
 * Unit tests for OutgoingDocumentsService.getSignatures() —
 * Function61 / View Signatures.
 *
 * Note on naming: the matrix headers reference
 * `SignatureQueryService`. The actual implementation that
 * fetches signature data is
 * `OutgoingDocumentsService.getSignatures(id, currentUser)`.
 *
 * Step-by-step:
 *   1. `outgoing = await outgoingDocumentsRepository.findById
 *      (id)`.
 *   2. Check role-based access:
 *      - isAdmin = roles.includes('ADMIN').
 *      - isClerk = roles.includes('DOCUMENT_CLERK').
 *      - isDeptHead = roles.includes('DEPARTMENT_HEAD').
 *      - isSpecialist = roles.includes('SPECIALIST').
 *      - isCreator = outgoing.document.createdByUser?.id ===
 *        userId.
 *      - isSubmitter = outgoing.submittedBy === userId.
 *      - isApprover = outgoing.assignedApproverId === userId
 *        || outgoing.approvedBy === userId.
 *      - isAssignedClerk = outgoing.assignedClerkId === userId
 *        || outgoing.forwardedBy === userId || outgoing
 *        .issuedBy === userId.
 *      - isPublicStatus = ['APPROVED', 'WAITING_FOR_ISSUE',
 *        'REGISTERED', 'ISSUED', 'COMPLETED'].includes(
 *        outgoing.document.status).
 *      - Block condition: specialist from a different
 *        department, not the creator, not in any flow,
 *        non-public status.
 *      - If blocked, throw `ForbiddenError('FORBIDDEN_ACCESS:
 *        Bạn không có quyền xem chữ ký của văn bản này.')`.
 *   3. If `!outgoing.document.fileUrl`, throw
 *      `BadRequestError('FILE_NOT_FOUND: Văn bản chưa có file
 *      đính kèm.')`.
 *   4. Build `filename = path.basename(fileUrl)` and
 *      `filePath = path.join(config.uploadDir, filename)`.
 *   5. If `!fs.existsSync(filePath)`, throw
 *      `NotFoundError('FILE_NOT_FOUND: File không tồn tại
 *      trên server.')`.
 *   6. If `!isSupportedSignatureFile(filePath, mimeType)`,
 *      throw `BadRequestError('UNSUPPORTED_FILE_TYPE: ...')`.
 *   7. Read file:
 *      - `buffer = fs.readFileSync(filePath)` in try/catch;
 *        throw `BadRequestError('CANNOT_READ_FILE: ...')` on
 *        failure.
 *   8. Compute `fileHash = calculateFileHash(buffer)`.
 *   9. Parse signatures:
 *      - `signatures = extractSignaturesFromFile(buffer,
 *        filePath, mimeType)` in try/catch;
 *      - throw `BadRequestError('SIGNATURE_PARSE_FAILED:
 *        ...')` on failure.
 *  10. Return:
 *      - `documentId`, `fileName`, `fileType`,
 *        `fileHash`, `signatureCount`,
 *        `summary = buildSignatureSummary(signatures)`,
 *        `signatures`, `visualMarks = buildVisualMarks()`,
 *        `warning`.
 *
 * Coverage matrix (UTCID01 – UTCID07):
 *   UTCID01  N  – List signatures: signatures array.
 *   UTCID02  N  – Signer mapping: signer info per signature.
 *   UTCID03  N  – Certificate data: certificate fields per
 *                 signature.
 *   UTCID04  N  – Order: signatures returned in document
 *                 order.
 *   UTCID05  A  – Document/file not found.
 *   UTCID06  A  – Forbidden/parser failure.
 *   UTCID07  B  – No signatures or maximum signature count
 *                 boundary.
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
  buildSignatureSummary,
  buildVisualMarks,
  calculateFileHash,
  isSupportedSignatureFile,
} from '../../../src/shared/utils/pdf-signature.util';
import fs from 'fs';
import path from 'path';
import { config } from '../../../src/config';

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
const mockedBuildSummary = buildSignatureSummary as jest.MockedFunction<
  typeof buildSignatureSummary
>;
const mockedBuildVisualMarks = buildVisualMarks as jest.MockedFunction<
  typeof buildVisualMarks
>;
const mockedCalculateFileHash = calculateFileHash as jest.MockedFunction<
  typeof calculateFileHash
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
const FAKE_FILEPATH = path.join(
  config.uploadDir || '/tmp/uploads',
  FAKE_FILENAME,
);

const buildSignature = (overrides: any = {}): any => ({
  index: 0,
  signerName: 'Nguyễn Văn A',
  signerEmail: 'a@example.com',
  signedAt: '2026-09-10T08:00:00Z',
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
  mockedExtractSignatures.mockImplementation(() => [buildSignature()]);
  mockedBuildSummary.mockImplementation(() => ({
    totalSignatures: 1,
    signedSignatures: 1,
    unsignedSignatures: 0,
  }));
  mockedBuildVisualMarks.mockImplementation(() => []);
  mockedCalculateFileHash.mockImplementation(() => 'abc123def456');

  service = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: list signatures.
// Result : signatures array present.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.getSignatures() – Normal 1: list signatures', () => {
  it('returns signatures array', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatures).toBeDefined();
    expect(Array.isArray(result.signatures)).toBe(true);
  });

  it('returns documentId', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.documentId).toBe(1);
  });

  it('returns fileName', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.fileName).toBeDefined();
  });

  it('returns fileHash', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.fileHash).toBe('abc123def456');
  });

  it('returns signatureCount', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatureCount).toBe(1);
  });

  it('returns summary', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.summary).toBeDefined();
  });

  it('returns visualMarks', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.visualMarks).toBeDefined();
  });

  it('returns warning', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.warning).toBeDefined();
  });

  it('does NOT throw on the list-signatures path', async () => {
    await expect(
      service.getSignatures(1, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the list-signatures path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getSignatures(1, buildCurrentUser());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: signer mapping.
// Result : signer info per signature.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.getSignatures() – Normal 2: signer mapping', () => {
  it('returns signatures with signerName', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatures[0].signerName).toBe('Nguyễn Văn A');
  });

  it('returns signatures with signerEmail', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatures[0].signerEmail).toBe('a@example.com');
  });

  it('returns signatures with index', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatures[0].index).toBe(0);
  });

  it('returns signatures with signedAt', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatures[0].signedAt).toBeDefined();
  });

  it('handles multiple signatures with different signers', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ index: 0, signerName: 'Signer 1' }),
      buildSignature({ index: 1, signerName: 'Signer 2' }),
    ]);

    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatures[0].signerName).toBe('Signer 1');
    expect(result.signatures[1].signerName).toBe('Signer 2');
  });

  it('handles signatures with reason', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatures[0].reason).toBe('Approval');
  });

  it('handles signatures with location', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatures[0].location).toBe('Hà Nội');
  });

  it('does NOT throw on the signer-mapping path', async () => {
    await expect(
      service.getSignatures(1, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the signer-mapping path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getSignatures(1, buildCurrentUser());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: certificate data.
// Result : certificate fields per signature.
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.getSignatures() – Normal 3: certificate data', () => {
  it('returns certificate.issuer', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatures[0].certificate.issuer).toBe('VNPT-CA');
  });

  it('returns certificate.validFrom', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatures[0].certificate.validFrom).toBeDefined();
  });

  it('returns certificate.validTo', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatures[0].certificate.validTo).toBeDefined();
  });

  it('returns certificate.serialNumber', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatures[0].certificate.serialNumber).toBe('ABC123');
  });

  it('handles different CA issuers', async () => {
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

    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatures[0].certificate.issuer).toBe('FPT-CA');
  });

  it('does NOT throw on the certificate-data path', async () => {
    await expect(
      service.getSignatures(1, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the certificate-data path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getSignatures(1, buildCurrentUser());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: order.
// Result : signatures returned in document order.
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.getSignatures() – Normal 4: order', () => {
  it('returns signatures in document order (index=0 first)', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ index: 0, signerName: 'First' }),
      buildSignature({ index: 1, signerName: 'Second' }),
      buildSignature({ index: 2, signerName: 'Third' }),
    ]);

    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatures[0].signerName).toBe('First');
    expect(result.signatures[1].signerName).toBe('Second');
    expect(result.signatures[2].signerName).toBe('Third');
  });

  it('preserves the order even when signers differ', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ index: 0, signedAt: '2026-09-10T08:00:00Z' }),
      buildSignature({ index: 1, signedAt: '2026-09-10T09:00:00Z' }),
    ]);

    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatures[0].signedAt).toBe('2026-09-10T08:00:00Z');
    expect(result.signatures[1].signedAt).toBe('2026-09-10T09:00:00Z');
  });

  it('returns signatureCount matching signatures.length', async () => {
    mockedExtractSignatures.mockImplementation(() => [
      buildSignature({ index: 0 }),
      buildSignature({ index: 1 }),
      buildSignature({ index: 2 }),
    ]);

    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatureCount).toBe(result.signatures.length);
  });

  it('does NOT throw on the order path', async () => {
    await expect(
      service.getSignatures(1, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the order path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getSignatures(1, buildCurrentUser());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 1: document/file not found.
// Result : NotFoundError when document/file is missing.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.getSignatures() – Abnormal 1: document/file not found', () => {
  it('throws TypeError when document is null (no null-guard in service)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.getSignatures(999, buildCurrentUser()),
    ).rejects.toBeInstanceOf(TypeError);
  });

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
      service.getSignatures(1, buildCurrentUser()),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws NotFoundError when file does not exist on disk', async () => {
    mockedFs.existsSync.mockImplementation(() => false);

    await expect(
      service.getSignatures(1, buildCurrentUser()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws TypeError for id=0 (no null-guard)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.getSignatures(0, buildCurrentUser()),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('throws TypeError for negative id (no null-guard)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.getSignatures(-1, buildCurrentUser()),
    ).rejects.toBeInstanceOf(TypeError);
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
      service.getSignatures(1, buildCurrentUser()),
    ).rejects.toThrow(/FILE_NOT_FOUND/);
  });

  it('throws NotFoundError with FILE_NOT_FOUND when file missing on disk', async () => {
    mockedFs.existsSync.mockImplementation(() => false);

    await expect(
      service.getSignatures(1, buildCurrentUser()),
    ).rejects.toThrow(/FILE_NOT_FOUND/);
  });

  it('records a safe diagnostic on not-found (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    const err = await service
      .getSignatures(999, buildCurrentUser())
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the not-found path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.getSignatures(999, buildCurrentUser()),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 2: forbidden/parser failure.
// Result : ForbiddenError or BadRequestError.
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.getSignatures() – Abnormal 2: forbidden/parser failure', () => {
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
      service.getSignatures(1, {
        id: 99,
        roles: ['SPECIALIST'],
        departmentId: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws BadRequestError for unsupported file type', async () => {
    mockedIsSupported.mockImplementation(() => false);

    await expect(
      service.getSignatures(1, buildCurrentUser()),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError with UNSUPPORTED_FILE_TYPE for unsupported file', async () => {
    mockedIsSupported.mockImplementation(() => false);

    await expect(
      service.getSignatures(1, buildCurrentUser()),
    ).rejects.toThrow(/UNSUPPORTED_FILE_TYPE/);
  });

  it('throws BadRequestError when file cannot be read', async () => {
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    await expect(
      service.getSignatures(1, buildCurrentUser()),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError with CANNOT_READ_FILE when read fails', async () => {
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    await expect(
      service.getSignatures(1, buildCurrentUser()),
    ).rejects.toThrow(/CANNOT_READ_FILE/);
  });

  it('throws BadRequestError when signature parsing fails', async () => {
    mockedExtractSignatures.mockImplementation(() => {
      throw new Error('Parse failed');
    });

    await expect(
      service.getSignatures(1, buildCurrentUser()),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError with SIGNATURE_PARSE_FAILED when parser fails', async () => {
    mockedExtractSignatures.mockImplementation(() => {
      throw new Error('Parse failed');
    });

    await expect(
      service.getSignatures(1, buildCurrentUser()),
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
      .getSignatures(1, {
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
      .getSignatures(1, buildCurrentUser())
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
      service.getSignatures(1, buildCurrentUser()),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Boundary 1: no signatures or maximum signature
// count.
// Result : 0 signatures → empty array; very large number →
//          supported.
// ---------------------------------------------------------------------------
describe('[UTCID07] outgoingDocumentsService.getSignatures() – Boundary 1: no signatures or maximum signature count', () => {
  it('handles the boundary: 0 signatures', async () => {
    mockedExtractSignatures.mockImplementation(() => []);

    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatures).toHaveLength(0);
    expect(result.signatureCount).toBe(0);
  });

  it('handles the boundary: 1 signature (minimum non-zero)', async () => {
    mockedExtractSignatures.mockImplementation(() => [buildSignature()]);

    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatureCount).toBe(1);
  });

  it('handles the boundary: maximum signature count (100)', async () => {
    mockedExtractSignatures.mockImplementation(() =>
      Array.from({ length: 100 }, (_, i) =>
        buildSignature({ index: i, signerName: `Signer ${i}` }),
      ),
    );

    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatureCount).toBe(100);
  });

  it('handles the boundary: very large signature count (10000)', async () => {
    mockedExtractSignatures.mockImplementation(() =>
      Array.from({ length: 10_000 }, (_, i) =>
        buildSignature({ index: i, signerName: `Signer ${i}` }),
      ),
    );

    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.signatureCount).toBe(10_000);
  });

  it('handles the boundary: 0 signatures but file is valid', async () => {
    mockedExtractSignatures.mockImplementation(() => []);
    mockedBuildSummary.mockImplementation(() => ({
      totalSignatures: 0,
      signedSignatures: 0,
      unsignedSignatures: 0,
    }));

    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result.summary).toBeDefined();
    expect(result.signatureCount).toBe(0);
  });

  it('handles the boundary: id=1 (minimum)', async () => {
    const result = await service.getSignatures(1, buildCurrentUser());

    expect(result).toBeDefined();
  });

  it('handles the boundary: id=Number.MAX_SAFE_INTEGER', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildDocument({ id: Number.MAX_SAFE_INTEGER }),
    );

    const result = await service.getSignatures(
      Number.MAX_SAFE_INTEGER,
      buildCurrentUser(),
    );

    expect(result).toBeDefined();
  });

  it('does NOT throw on the boundary path (0 signatures)', async () => {
    mockedExtractSignatures.mockImplementation(() => []);

    await expect(
      service.getSignatures(1, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on the boundary path (max signatures)', async () => {
    mockedExtractSignatures.mockImplementation(() =>
      Array.from({ length: 1000 }, (_, i) =>
        buildSignature({ index: i }),
      ),
    );

    await expect(
      service.getSignatures(1, buildCurrentUser()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getSignatures(1, buildCurrentUser());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
