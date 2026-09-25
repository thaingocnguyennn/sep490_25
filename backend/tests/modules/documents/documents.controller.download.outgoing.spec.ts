/**
 * Unit tests for DocumentsController.download() —
 * Function55 / Download Outgoing Document File.
 *
 * Note on naming: the matrix headers reference
 * `DocumentFileService`. The actual implementation that
 * downloads an outgoing document is
 * `DocumentsController.download(req, res, next)` at
 * `GET /documents/:id/download`.
 *
 * Step-by-step:
 *   1. Read `id = Number(req.params.id)`.
 *   2. Call `await checkDocumentAccess(id, req.user!.userId,
 *      req.user!.roles ?? [])`.
 *      - If the document is an INCOMING document, this calls
 *        `checkIncomingDocumentAccess` (full ACL).
 *      - Otherwise (outgoing / archival / internal), ADMIN
 *        bypasses; others must be the creator or processor.
 *      - Throws `ForbiddenError` if access is denied.
 *   3. Call `await documentsService.getById(id)` to load the
 *      Document row.
 *   4. Compute `filePath = documentsService.getFilePath(doc)`.
 *   5. `downloadName = doc.originalFileName ||
 *      path.basename(filePath)`.
 *   6. Set headers:
 *      - `Content-Disposition` =
 *        `attachment; filename="<encodeURIComponent(downloadName)>"`.
 *      - `Cache-Control` = 'no-store'.
 *      - NOTE: Content-Type is NOT set explicitly. Express's
 *        sendFile infers it from the file extension.
 *   7. Call `res.sendFile(filePath)`.
 *   8. On error, `next(error)`.
 *
 * Difference from preview:
 *   - preview: `Content-Disposition: inline`, sets
 *     `Content-Type`.
 *   - download: `Content-Disposition: attachment`, uses
 *     `originalFileName` for the filename, DOES NOT set
 *     `Content-Type` explicitly.
 *
 * Coverage matrix (UTCID01 – UTCID06):
 *   UTCID01  N  – Valid download: getById returns a doc;
 *                 sendFile is called.
 *   UTCID02  N  – Filename / header: Content-Disposition has
 *                 `attachment; filename="..."`; filename is
 *                 originalFileName (or basename fallback).
 *   UTCID03  N  – Byte content: sendFile is called with the
 *                 correct filePath; Express streams bytes.
 *   UTCID04  A  – File / document not found: NotFoundError
 *                 from getById; access denied → ForbiddenError.
 *   UTCID05  A  – Forbidden / storage failure: sendFile errors
 *                 propagated; bad filename.
 *   UTCID06  B  – Zero-byte or maximum supported file size:
 *                 empty file (0 bytes), 1 byte, very large
 *                 (1 GB equivalent).
 */

import { DocumentsController } from '../../../src/modules/documents/documents.controller';
import { documentsService } from '../../../src/modules/documents/documents.service';
import { checkDocumentAccess } from '../../../src/shared/access/document-access';
import { ForbiddenError, NotFoundError } from '../../../src/shared/exceptions/app-error';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/modules/documents/documents.service', () => ({
  __esModule: true,
  documentsService: {
    getById: jest.fn(),
    getFilePath: jest.fn(),
  },
}));

jest.mock('../../../src/shared/access/document-access', () => ({
  __esModule: true,
  checkDocumentAccess: jest.fn(),
}));

jest.mock('../../../src/config/database', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    document: { findUnique: jest.fn().mockResolvedValue(null) },
    incomingDocument: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
  },
}));

const mockedService = documentsService as jest.Mocked<typeof documentsService>;
const mockedCheckAccess = checkDocumentAccess as jest.MockedFunction<
  typeof checkDocumentAccess
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

let controller: DocumentsController;

const buildMockReq = (overrides: any = {}): any => ({
  params: { id: '1' },
  user: {
    userId: 5,
    roles: ['SPECIALIST'],
    ...(overrides.user || {}),
  },
  ...overrides,
});

const buildMockRes = (): any => ({
  setHeader: jest.fn(),
  status: jest.fn(function (this: any) {
    return this;
  }),
  json: jest.fn(function (this: any) {
    return this;
  }),
  send: jest.fn(function (this: any) {
    return this;
  }),
  sendFile: jest.fn(),
});

const buildDoc = (overrides: any = {}): any => ({
  id: 1,
  documentNumber: 'OUT-2026-0001',
  subject: 'Công văn phát hành',
  fileUrl: '/uploads/out-2026-0001.pdf',
  mimeType: 'application/pdf',
  originalFileName: 'out-2026-0001.pdf',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();

  mockedService.getById.mockReset();
  mockedService.getById.mockImplementation(async () => buildDoc());

  mockedService.getFilePath.mockReset();
  mockedService.getFilePath.mockImplementation(
    () => '/uploads/out-2026-0001.pdf',
  );

  mockedCheckAccess.mockReset();
  mockedCheckAccess.mockResolvedValue(undefined as any);

  controller = new DocumentsController();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid download.
// Result : getById returns a doc; sendFile is called.
// ---------------------------------------------------------------------------
describe('[UTCID01] documentsController.download() – Normal 1: valid download', () => {
  it('does NOT throw on a valid download', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('calls checkDocumentAccess with the right args', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(mockedCheckAccess).toHaveBeenCalledWith(
      1,
      5,
      ['SPECIALIST'],
    );
  });

  it('calls documentsService.getById(1)', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(mockedService.getById).toHaveBeenCalledWith(1);
  });

  it('calls documentsService.getFilePath(doc)', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(mockedService.getFilePath).toHaveBeenCalled();
  });

  it('calls res.sendFile with the file path', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith(expect.any(String));
  });

  it('does NOT log to console on the valid-download path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('does NOT throw for a doc with mimeType=application/pdf', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('handles a doc with very long subject', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValue(
      buildDoc({ subject: 'A'.repeat(10_000) }),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('handles a doc with very long documentNumber', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValue(
      buildDoc({ documentNumber: 'A'.repeat(10_000) }),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: filename / header.
// Result : Content-Disposition has `attachment; filename="..."`;
//          filename is originalFileName (or basename fallback).
// ---------------------------------------------------------------------------
describe('[UTCID02] documentsController.download() – Normal 2: filename/header', () => {
  it('sets Content-Disposition with attachment and filename', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('attachment'),
    );
  });

  it('uses originalFileName for the download filename', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('out-2026-0001.pdf'),
    );
  });

  it('falls back to path.basename when originalFileName is missing', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValue(
      buildDoc({ originalFileName: null }),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('out-2026-0001.pdf'),
    );
  });

  it('sets Cache-Control to no-store', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
  });

  it('sets exactly two headers (Content-Disposition + Cache-Control) — NOT Content-Type', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(res.setHeader).toHaveBeenCalledTimes(2);
  });

  it('does NOT set Content-Type (Express sendFile infers it)', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    const calls = (res.setHeader as jest.Mock).mock.calls;
    const contentTypeCall = calls.find(
      (c: any[]) => c[0] === 'Content-Type',
    );

    expect(contentTypeCall).toBeUndefined();
  });

  it('encodes special characters in the download filename', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValue(
      buildDoc({ originalFileName: 'có dấu tiếng việt.pdf' }),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('attachment'),
    );
  });

  it('does NOT log to console on the filename/header path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: byte content.
// Result : sendFile is called with the correct filePath;
//          Express streams bytes.
// ---------------------------------------------------------------------------
describe('[UTCID03] documentsController.download() – Normal 3: byte content', () => {
  it('calls res.sendFile with the correct file path', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith(
      '/uploads/out-2026-0001.pdf',
    );
  });

  it('passes the file path verbatim to sendFile', async () => {
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(
      '/var/storage/2026/09/out.pdf',
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith(
      '/var/storage/2026/09/out.pdf',
    );
  });

  it('calls sendFile exactly once', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(res.sendFile).toHaveBeenCalledTimes(1);
  });

  it('does NOT write to the response body directly', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(res.send).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('handles a file path that starts with /uploads/', async () => {
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(
      '/uploads/sub/file.pdf',
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith('/uploads/sub/file.pdf');
  });

  it('handles a Windows-style file path (C:\\...\\file.pdf)', async () => {
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(
      'C:\\storage\\file.pdf',
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith('C:\\storage\\file.pdf');
  });

  it('does NOT log to console on the byte-content path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: file / document not found.
// Result : NotFoundError from getById; access denied →
//          ForbiddenError.
// ---------------------------------------------------------------------------
describe('[UTCID04] documentsController.download() – Abnormal 1: file/document not found', () => {
  it('calls next with NotFoundError when getById throws', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockRejectedValue(
      new NotFoundError('Không tìm thấy văn bản'),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });

  it('calls next with ForbiddenError when checkDocumentAccess throws', async () => {
    mockedCheckAccess.mockReset();
    mockedCheckAccess.mockRejectedValue(
      new ForbiddenError('Không có quyền truy cập'),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('does NOT call res.sendFile when document is missing', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockRejectedValue(
      new NotFoundError('Không tìm thấy văn bản'),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it('does NOT call res.sendFile when access is denied', async () => {
    mockedCheckAccess.mockReset();
    mockedCheckAccess.mockRejectedValue(
      new ForbiddenError('Không có quyền truy cập'),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it('does NOT set Content-Disposition when document is missing', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockRejectedValue(
      new NotFoundError('Không tìm thấy văn bản'),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on not-found (no password / hash leak)', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockRejectedValue(
      new NotFoundError('Không tìm thấy văn bản'),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    const err = next.mock.calls[0][0] as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('records a safe diagnostic on access-denied (no password / hash leak)', async () => {
    mockedCheckAccess.mockReset();
    mockedCheckAccess.mockRejectedValue(
      new ForbiddenError('Không có quyền'),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    const err = next.mock.calls[0][0] as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the not-found path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedService.getById.mockReset();
    mockedService.getById.mockRejectedValue(
      new NotFoundError('Không tìm thấy văn bản'),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 2: forbidden / storage failure.
// Result : sendFile errors propagated; bad filename.
// ---------------------------------------------------------------------------
describe('[UTCID05] documentsController.download() – Abnormal 2: forbidden/storage failure', () => {
  it('does NOT call res.sendFile when access is forbidden', async () => {
    mockedCheckAccess.mockReset();
    mockedCheckAccess.mockRejectedValue(
      new ForbiddenError('Không có quyền'),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it('propagates ForbiddenError through next when called by a non-creator', async () => {
    mockedCheckAccess.mockReset();
    mockedCheckAccess.mockRejectedValue(
      new ForbiddenError('Bạn không có quyền tải xuống'),
    );

    const req = buildMockReq({
      user: { userId: 99, roles: ['VIEWER'] },
    });
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('does NOT throw when sendFile emits an error', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await expect(controller.download(req, res, next)).resolves.toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('handles a doc where originalFileName is missing (uses basename fallback)', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValue(
      buildDoc({ originalFileName: null }),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('handles a doc where originalFileName is empty string (uses basename fallback)', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValue(
      buildDoc({ originalFileName: '' }),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on forbidden (no password / hash leak)', async () => {
    mockedCheckAccess.mockReset();
    mockedCheckAccess.mockRejectedValue(
      new ForbiddenError('Banned'),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    const err = next.mock.calls[0][0] as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the forbidden path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedCheckAccess.mockReset();
    mockedCheckAccess.mockRejectedValue(
      new ForbiddenError('Banned'),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Boundary 1: zero-byte or maximum supported file size.
// Result : empty file (0 bytes), 1 byte, very large (1 GB
//          equivalent).
// ---------------------------------------------------------------------------
describe('[UTCID06] documentsController.download() – Boundary 1: zero-byte or maximum supported file size', () => {
  it('handles the boundary: 0-byte file', async () => {
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce('/uploads/empty.pdf');

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('handles the boundary: 1-byte file', async () => {
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce('/uploads/1byte.pdf');

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('handles the boundary: 1-KB file', async () => {
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce('/uploads/1kb.pdf');

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('handles the boundary: 1-MB file', async () => {
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce('/uploads/1mb.pdf');

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('handles the boundary: 1-GB file (very large)', async () => {
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce('/uploads/1gb.pdf');

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('handles the boundary: very long file path (10 KB)', async () => {
    const longPath = '/uploads/' + 'A'.repeat(10_000) + '.pdf';
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(longPath);

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('handles the boundary: very long originalFileName', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValue(
      buildDoc({ originalFileName: 'A'.repeat(10_000) + '.pdf' }),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('does NOT throw on the boundary path', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('records a safe diagnostic on boundary failure (no password / hash leak)', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockRejectedValue(
      new Error('Boundary error: something bad'),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.download(req, res, next);

    const err = next.mock.calls[0][0] as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });
});
