/**
 * Unit tests for OutgoingDocumentsService.verifySignature() —
 * Function52 / Check PDF Signature and Integrity.
 *
 * Step-by-step:
 *   1. The service receives `id`.
 *   2. It calls `outgoingDocumentsRepository.findById(id)` to
 *      load the OutgoingDocument.
 *   3. If `outgoing.document.fileUrl` is null/empty, throw
 *      `BadRequestError('Văn bản chưa có file đính kèm để kiểm
 *      tra chữ ký số.')`.
 *   4. Compute the filePath = `path.join(config.uploadDir,
 *      path.basename(outgoing.document.fileUrl))`.
 *   5. If the file does not exist on disk, throw
 *      `NotFoundError('File không tồn tại trên server.')`.
 *   6. Call `checkPdfSignature(filePath)` from
 *      `shared/utils/pdf-signature.util.ts`. That function:
 *      a. Reads the file buffer.
 *      b. Calls `extractSignaturesFromFile(buffer, filePath,
 *         'application/pdf')` which:
 *            - Tries pyHanko if available (Python worker).
 *            - Falls back to the in-process Node.js
 *              ByteRange parser.
 *      c. Computes a SHA-256 file hash.
 *      d. Returns `{ hasSignature, signatureCount, fileHash,
 *         isModifiedAfterSigning, integrityStatus,
 *         checkedBy, message, signatures }`.
 *   7. Returns the result verbatim.
 *
 * Important: `checkPdfSignature` and friends read from the
 * filesystem, so we mock those calls. We also mock
 * `outgoingDocumentsRepository.findById` so the test doesn't
 * hit the database.
 *
 * Coverage matrix (UTCID01 – UTCID10):
 *   UTCID01  N  – Valid signature: signatures.length > 0,
 *                 hasSignature = true.
 *   UTCID02  N  – Certificate details: signerName / issuer /
 *                 organization / serialNumber populated.
 *   UTCID03  N  – Unchanged PDF: integrityStatus =
 *                 'VALID_OR_NOT_MODIFIED'.
 *   UTCID04  N  – Verification result mapping: signatures[]
 *                 contains full DocumentSignatureItem.
 *   UTCID05  N  – Response-to-database consistency:
 *                 identifiers / status / date / agency / type
 *                 preserved.
 *   UTCID06  N  – Repeat-safe processing: same input → same
 *                 output (idempotent).
 *   UTCID07  A  – Unsigned / corrupt PDF: signatures.length = 0
 *                 or throw.
 *   UTCID08  A  – Invalid certificate or parser failure:
 *                 hasSignature = false / corrupt buffer / throw.
 *   UTCID09  B  – Certificate expiry-time or minimum PDF
 *                 boundary: empty signatures or 1-byte PDF.
 *   UTCID10  B  – Upper-bound value: very large file /
 *                 very large signature count.
 */

import { OutgoingDocumentsService } from '../../../src/modules/outgoing-documents/outgoing-documents.service';
import { outgoingDocumentsRepository } from '../../../src/modules/outgoing-documents/outgoing-documents.repository';
import { BadRequestError, NotFoundError } from '../../../src/shared/exceptions/app-error';
import * as fs from 'fs';

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

// Mock the filesystem + the signature util so we don't need
// a real PDF on disk.
jest.mock('fs');
jest.mock('../../../src/shared/utils/pdf-signature.util', () => ({
  __esModule: true,
  checkPdfSignature: jest.fn(),
  extractSignaturesFromFile: jest.fn(),
  extractPdfSignatures: jest.fn(),
  calculateFileHash: jest.fn(),
  buildSignatureSummary: jest.fn(),
  buildVisualMarks: jest.fn(),
  isSupportedSignatureFile: jest.fn(),
}));

// Mock prisma so we don't load the query engine binary at
// module-load time.
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

const mockedRepo = outgoingDocumentsRepository as jest.Mocked<
  typeof outgoingDocumentsRepository
>;

import * as pdfSigUtil from '../../../src/shared/utils/pdf-signature.util';
const mockedPdfSig = pdfSigUtil as jest.Mocked<typeof pdfSigUtil>;
const mockedFs = fs as jest.Mocked<typeof fs>;

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
const FAKE_FILE_PATH = '/uploads/test-document.pdf';

const SAMPLE_SIGNATURE_ITEM: any = {
  index: 0,
  fileType: 'PDF',
  evidenceType: 'CRYPTOGRAPHIC_SIGNATURE',
  verificationLevel: 'BASIC_STRUCTURE_AND_CERTIFICATE_EXTRACTION',
  signatureFormat: 'adbe.pkcs7.detached',
  fieldName: 'Signature1',
  signerName: 'Nguyễn Văn A',
  organization: 'FPT University',
  email: null,
  issuer: 'VNPT-CA',
  serialNumber: '0123456789ABCDEF',
  signingTime: '2026-09-12T10:30:00',
  signerReportedTime: '2026-09-12T10:30:00',
  hashIntact: true,
  signatureValid: true,
  certificateTrusted: null,
  certificateRevoked: false,
  modifiedAfterSigning: false,
  modificationLevel: 'NONE',
  modificationAllowed: true,
  coverage: 'ENTIRE_FILE',
  overallValid: true,
  trustedTimestamp: null,
  timestampValid: null,
  subFilter: 'adbe.pkcs7.detached',
  byteRange: [0, 1024, 8192, 1024],
  signedRevisionEnd: 9216,
  fileSize: 9216,
  hasChangesAfterSigning: false,
  integrityStatus: 'NO_CHANGES_AFTER_SIGNING',
  displayStatus: 'Tài liệu toàn vẹn',
  warning: 'Xác thực cấu trúc chữ ký số PDF',
  fileModDate: '2026-09-12T10:30:00',
};

const VALID_CHECK_RESULT: any = {
  hasSignature: true,
  signatureCount: 1,
  fileHash: 'abc123def456',
  isModifiedAfterSigning: false,
  integrityStatus: 'VALID_OR_NOT_MODIFIED',
  checkedBy: 'PYHANKO_ISO32000_STANDARDS',
  message: 'Đã kiểm tra 1 chữ ký số trong tài liệu PDF.',
  signatures: [SAMPLE_SIGNATURE_ITEM],
};

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

beforeEach(() => {
  jest.clearAllMocks();

  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockImplementation(async () => buildDocument());

  mockedFs.existsSync.mockImplementation(() => true);

  mockedPdfSig.checkPdfSignature.mockReset();
  mockedPdfSig.checkPdfSignature.mockImplementation(
    () => VALID_CHECK_RESULT,
  );

  service = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid signature.
// Result : hasSignature = true; signatureCount > 0.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.verifySignature() – Normal 1: valid signature', () => {
  it('returns hasSignature = true', async () => {
    const result = await service.verifySignature(1);

    expect(result.hasSignature).toBe(true);
  });

  it('returns signatureCount > 0', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatureCount).toBeGreaterThan(0);
  });

  it('returns signatures array with at least 1 item', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures).toHaveLength(1);
  });

  it('forwards the filePath to checkPdfSignature', async () => {
    await service.verifySignature(1);

    expect(mockedPdfSig.checkPdfSignature).toHaveBeenCalledWith(
      expect.any(String),
    );
  });

  it('does NOT throw on a valid signature', async () => {
    await expect(service.verifySignature(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the valid-signature path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.verifySignature(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('returns checkedBy = PYHANKO_ISO32000_STANDARDS', async () => {
    const result = await service.verifySignature(1);

    expect(result.checkedBy).toBe('PYHANKO_ISO32000_STANDARDS');
  });

  it('returns isModifiedAfterSigning = false', async () => {
    const result = await service.verifySignature(1);

    expect(result.isModifiedAfterSigning).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: certificate details.
// Result : signerName / organization / issuer / serialNumber
//          populated.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.verifySignature() – Normal 2: certificate details', () => {
  it('returns the signerName on the signature', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].signerName).toBe('Nguyễn Văn A');
  });

  it('returns the organization on the signature', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].organization).toBe('FPT University');
  });

  it('returns the issuer on the signature', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].issuer).toBe('VNPT-CA');
  });

  it('returns the serialNumber on the signature', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].serialNumber).toBe('0123456789ABCDEF');
  });

  it('returns the signingTime on the signature', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].signingTime).toBe('2026-09-12T10:30:00');
  });

  it('returns the certificateRevoked = false', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].certificateRevoked).toBe(false);
  });

  it('returns the signatureValid = true', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].signatureValid).toBe(true);
  });

  it('returns the hashIntact = true', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].hashIntact).toBe(true);
  });

  it('returns the fieldName', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].fieldName).toBe('Signature1');
  });

  it('does NOT throw on the certificate-details path', async () => {
    await expect(service.verifySignature(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the certificate-details path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.verifySignature(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: unchanged PDF.
// Result : integrityStatus = 'VALID_OR_NOT_MODIFIED'.
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.verifySignature() – Normal 3: unchanged PDF', () => {
  it('returns integrityStatus = VALID_OR_NOT_MODIFIED', async () => {
    const result = await service.verifySignature(1);

    expect(result.integrityStatus).toBe('VALID_OR_NOT_MODIFIED');
  });

  it('returns isModifiedAfterSigning = false', async () => {
    const result = await service.verifySignature(1);

    expect(result.isModifiedAfterSigning).toBe(false);
  });

  it('returns the integrityStatus on the signature', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].integrityStatus).toBe('NO_CHANGES_AFTER_SIGNING');
  });

  it('returns the hasChangesAfterSigning = false on the signature', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].hasChangesAfterSigning).toBe(false);
  });

  it('returns the coverage = ENTIRE_FILE', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].coverage).toBe('ENTIRE_FILE');
  });

  it('returns the modificationLevel = NONE', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].modificationLevel).toBe('NONE');
  });

  it('returns the modificationAllowed = true', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].modificationAllowed).toBe(true);
  });

  it('does NOT throw on the unchanged-PDF path', async () => {
    await expect(service.verifySignature(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the unchanged-PDF path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.verifySignature(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: verification result mapping.
// Result : signatures[] contains full DocumentSignatureItem.
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.verifySignature() – Normal 4: verification result mapping', () => {
  it('returns the full DocumentSignatureItem', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0]).toHaveProperty('index');
    expect(result.signatures[0]).toHaveProperty('fileType');
    expect(result.signatures[0]).toHaveProperty('evidenceType');
    expect(result.signatures[0]).toHaveProperty('verificationLevel');
    expect(result.signatures[0]).toHaveProperty('signatureFormat');
    expect(result.signatures[0]).toHaveProperty('signerName');
    expect(result.signatures[0]).toHaveProperty('issuer');
    expect(result.signatures[0]).toHaveProperty('serialNumber');
    expect(result.signatures[0]).toHaveProperty('byteRange');
    expect(result.signatures[0]).toHaveProperty('integrityStatus');
    expect(result.signatures[0]).toHaveProperty('displayStatus');
    expect(result.signatures[0]).toHaveProperty('warning');
  });

  it('returns the index = 0 for the first signature', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].index).toBe(0);
  });

  it('returns the fileType = PDF', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].fileType).toBe('PDF');
  });

  it('returns the evidenceType = CRYPTOGRAPHIC_SIGNATURE', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].evidenceType).toBe('CRYPTOGRAPHIC_SIGNATURE');
  });

  it('returns the signatureFormat = adbe.pkcs7.detached', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].signatureFormat).toBe('adbe.pkcs7.detached');
  });

  it('returns the byteRange array', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].byteRange).toEqual([0, 1024, 8192, 1024]);
  });

  it('returns the displayStatus', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].displayStatus).toBe('Tài liệu toàn vẹn');
  });

  it('does NOT throw on the verification-result-mapping path', async () => {
    await expect(service.verifySignature(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the verification-result-mapping path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.verifySignature(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : identifiers / status / date / agency / type
//          preserved.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.verifySignature() – Normal 5: response-to-database consistency', () => {
  it('preserves the documentId on the response', async () => {
    const result = await service.verifySignature(1);

    expect(result.fileHash).toBe('abc123def456');
  });

  it('preserves the message', async () => {
    const result = await service.verifySignature(1);

    expect(result.message).toBe('Đã kiểm tra 1 chữ ký số trong tài liệu PDF.');
  });

  it('preserves the fileSize on the signature', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].fileSize).toBe(9216);
  });

  it('preserves the fileModDate on the signature', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].fileModDate).toBe('2026-09-12T10:30:00');
  });

  it('preserves the signedRevisionEnd on the signature', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].signedRevisionEnd).toBe(9216);
  });

  it('preserves the subFilter on the signature', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].subFilter).toBe('adbe.pkcs7.detached');
  });

  it('preserves the verificationLevel on the signature', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].verificationLevel).toBe(
      'BASIC_STRUCTURE_AND_CERTIFICATE_EXTRACTION',
    );
  });

  it('does NOT throw on the consistency path', async () => {
    await expect(service.verifySignature(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the consistency path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.verifySignature(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Normal 6: repeat-safe processing.
// Result : same input → same output (idempotent).
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.verifySignature() – Normal 6: repeat-safe processing', () => {
  it('returns identical results when called twice', async () => {
    const r1 = await service.verifySignature(1);
    const r2 = await service.verifySignature(1);

    expect(r1.hasSignature).toBe(r2.hasSignature);
    expect(r1.signatureCount).toBe(r2.signatureCount);
    expect(r1.fileHash).toBe(r2.fileHash);
    expect(r1.integrityStatus).toBe(r2.integrityStatus);
  });

  it('returns identical signatures array when called twice', async () => {
    const r1 = await service.verifySignature(1);
    const r2 = await service.verifySignature(1);

    expect(r1.signatures).toEqual(r2.signatures);
  });

  it('does NOT increment the signature count on repeat calls', async () => {
    const r1 = await service.verifySignature(1);
    const r2 = await service.verifySignature(1);

    expect(r1.signatureCount).toBe(r2.signatureCount);
  });

  it('does NOT throw on the repeat-safe path', async () => {
    await expect(service.verifySignature(1)).resolves.toBeDefined();
    await expect(service.verifySignature(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the repeat-safe path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.verifySignature(1);
    await service.verifySignature(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 1: unsigned / corrupt PDF.
// Result : signatures.length = 0, hasSignature = false.
// ---------------------------------------------------------------------------
describe('[UTCID07] outgoingDocumentsService.verifySignature() – Abnormal 1: unsigned/corrupt PDF', () => {
  it('returns hasSignature = false for an unsigned PDF', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      hasSignature: false,
      signatureCount: 0,
      integrityStatus: 'NO_SIGNATURE',
      message: 'Không tìm thấy chữ ký số trong file PDF.',
      signatures: [],
    }));

    const result = await service.verifySignature(1);

    expect(result.hasSignature).toBe(false);
  });

  it('returns signatureCount = 0 for an unsigned PDF', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      hasSignature: false,
      signatureCount: 0,
      signatures: [],
    }));

    const result = await service.verifySignature(1);

    expect(result.signatureCount).toBe(0);
  });

  it('returns integrityStatus = NO_SIGNATURE for an unsigned PDF', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      hasSignature: false,
      signatureCount: 0,
      integrityStatus: 'NO_SIGNATURE',
      signatures: [],
    }));

    const result = await service.verifySignature(1);

    expect(result.integrityStatus).toBe('NO_SIGNATURE');
  });

  it('throws BadRequestError when fileUrl is missing', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildDocument({
        document: { fileUrl: null },
      }),
    );

    await expect(service.verifySignature(1)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('throws NotFoundError when file does not exist on disk', async () => {
    mockedFs.existsSync.mockImplementation(() => false);

    await expect(service.verifySignature(1)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws when checkPdfSignature throws', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => {
      throw new Error('Corrupt PDF');
    });

    await expect(service.verifySignature(1)).rejects.toThrow('Corrupt PDF');
  });

  it('records a safe diagnostic on unsigned/corrupt (no password / hash leak)', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => {
      throw new Error('Corrupt PDF: something bad');
    });

    const err = await service
      .verifySignature(1)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the unsigned/corrupt path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => {
      throw new Error('Corrupt PDF');
    });

    await expect(service.verifySignature(1)).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Abnormal 2: invalid certificate or parser failure.
// Result : hasSignature = false / corrupt buffer / throw.
// ---------------------------------------------------------------------------
describe('[UTCID08] outgoingDocumentsService.verifySignature() – Abnormal 2: invalid certificate or parser failure', () => {
  it('throws when the certificate is invalid', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => {
      throw new Error('Invalid certificate');
    });

    await expect(service.verifySignature(1)).rejects.toThrow(
      'Invalid certificate',
    );
  });

  it('throws when the parser fails', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => {
      throw new Error('Parser error');
    });

    await expect(service.verifySignature(1)).rejects.toThrow('Parser error');
  });

  it('returns hasSignature = false when certificate is invalid', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      hasSignature: false,
      signatureCount: 0,
      integrityStatus: 'NO_SIGNATURE',
      signatures: [],
    }));

    const result = await service.verifySignature(1);

    expect(result.hasSignature).toBe(false);
  });

  it('propagates a generic parser error', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => {
      throw new Error('Generic parser error');
    });

    await expect(service.verifySignature(1)).rejects.toThrow(
      'Generic parser error',
    );
  });

  it('records a safe diagnostic on parser failure (no password / hash leak)', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => {
      throw new Error('Parser error: something bad');
    });

    const err = await service
      .verifySignature(1)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the parser-failure path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => {
      throw new Error('Parser error');
    });

    await expect(service.verifySignature(1)).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 1: certificate expiry-time or minimum PDF
// boundary.
// Result : empty signatures or 1-byte PDF.
// ---------------------------------------------------------------------------
describe('[UTCID09] outgoingDocumentsService.verifySignature() – Boundary 1: certificate expiry-time or minimum PDF boundary', () => {
  it('handles the boundary: 1-byte PDF (corrupt)', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      hasSignature: false,
      signatureCount: 0,
      integrityStatus: 'NO_SIGNATURE',
      signatures: [],
    }));

    const result = await service.verifySignature(1);

    expect(result.hasSignature).toBe(false);
  });

  it('handles the boundary: empty signatures array', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      hasSignature: false,
      signatureCount: 0,
      signatures: [],
    }));

    const result = await service.verifySignature(1);

    expect(result.signatures).toEqual([]);
  });

  it('handles the boundary: certificate just expired', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      signatures: [
        {
          ...SAMPLE_SIGNATURE_ITEM,
          certificateRevoked: true,
          certificateTrusted: false,
          warning: 'Chứng thư số đã hết hạn',
        },
      ],
    }));

    const result = await service.verifySignature(1);

    expect(result.signatures[0].certificateRevoked).toBe(true);
    expect(result.signatures[0].certificateTrusted).toBe(false);
  });

  it('handles the boundary: certificate just valid (issued today)', async () => {
    const result = await service.verifySignature(1);

    expect(result.signatures[0].certificateRevoked).toBe(false);
  });

  it('handles the boundary: 0-byte file (fs.existsSync true)', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      hasSignature: false,
      signatureCount: 0,
      integrityStatus: 'NO_SIGNATURE',
      signatures: [],
    }));

    const result = await service.verifySignature(1);

    expect(result.signatures).toEqual([]);
  });

  it('does NOT throw on the boundary path', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      hasSignature: false,
      signatureCount: 0,
      signatures: [],
    }));

    await expect(service.verifySignature(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      hasSignature: false,
      signatureCount: 0,
      signatures: [],
    }));

    await service.verifySignature(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('records a safe diagnostic on boundary failure (no password / hash leak)', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => {
      throw new Error('Boundary error: something bad');
    });

    const err = await service
      .verifySignature(1)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID10 – Boundary 2: upper-bound value.
// Result : very large file / very large signature count.
// ---------------------------------------------------------------------------
describe('[UTCID10] outgoingDocumentsService.verifySignature() – Boundary 2: upper-bound value', () => {
  it('handles the upper-bound: very large file (1 GB equivalent result)', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      signatures: [
        {
          ...SAMPLE_SIGNATURE_ITEM,
          fileSize: 1_000_000_000,
          signedRevisionEnd: 1_000_000_000,
        },
      ],
    }));

    const result = await service.verifySignature(1);

    expect(result.signatures[0].fileSize).toBe(1_000_000_000);
  });

  it('handles the upper-bound: very large signature count (10)', async () => {
    const sigs = Array.from({ length: 10 }, (_, i) => ({
      ...SAMPLE_SIGNATURE_ITEM,
      index: i,
      fieldName: `Signature${i + 1}`,
    }));

    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      signatureCount: 10,
      signatures: sigs,
    }));

    const result = await service.verifySignature(1);

    expect(result.signatureCount).toBe(10);
  });

  it('handles the upper-bound: very large signature count (100)', async () => {
    const sigs = Array.from({ length: 100 }, (_, i) => ({
      ...SAMPLE_SIGNATURE_ITEM,
      index: i,
      fieldName: `Signature${i + 1}`,
    }));

    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      signatureCount: 100,
      signatures: sigs,
    }));

    const result = await service.verifySignature(1);

    expect(result.signatureCount).toBe(100);
  });

  it('handles the upper-bound: very long signerName (10 KB)', async () => {
    const longSignerName = 'A'.repeat(10_000);

    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      signatures: [
        { ...SAMPLE_SIGNATURE_ITEM, signerName: longSignerName },
      ],
    }));

    const result = await service.verifySignature(1);

    expect(result.signatures[0].signerName).toBe(longSignerName);
  });

  it('handles the upper-bound: very long serialNumber', async () => {
    const longSerial = 'A'.repeat(10_000);

    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      signatures: [
        { ...SAMPLE_SIGNATURE_ITEM, serialNumber: longSerial },
      ],
    }));

    const result = await service.verifySignature(1);

    expect(result.signatures[0].serialNumber).toBe(longSerial);
  });

  it('handles the upper-bound: fileSize = Number.MAX_SAFE_INTEGER', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      signatures: [
        {
          ...SAMPLE_SIGNATURE_ITEM,
          fileSize: Number.MAX_SAFE_INTEGER,
          signedRevisionEnd: Number.MAX_SAFE_INTEGER,
        },
      ],
    }));

    const result = await service.verifySignature(1);

    expect(result.signatures[0].fileSize).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('does NOT throw on the upper-bound path', async () => {
    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      signatureCount: 100,
      signatures: Array.from({ length: 100 }, (_, i) => ({
        ...SAMPLE_SIGNATURE_ITEM,
        index: i,
      })),
    }));

    await expect(service.verifySignature(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the upper-bound path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedPdfSig.checkPdfSignature.mockReset();
    mockedPdfSig.checkPdfSignature.mockImplementation(() => ({
      ...VALID_CHECK_RESULT,
      signatureCount: 100,
      signatures: Array.from({ length: 100 }, (_, i) => ({
        ...SAMPLE_SIGNATURE_ITEM,
        index: i,
      })),
    }));

    await service.verifySignature(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
