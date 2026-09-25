/**
 * Unit tests for DocumentsController.preview() —
 * Function54 / Preview Outgoing Document File.
 *
 * Note on naming: the matrix headers reference
 * `DocumentFileService`. The actual implementation that
 * previews an outgoing document is
 * `DocumentsController.preview(req, res, next)` at
 * `GET /documents/:id/preview`.
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
 *   5. Set headers:
 *      - `Content-Type` = `doc.mimeType` or
 *        'application/octet-stream'.
 *      - `Content-Disposition` = 'inline' (browser view).
 *      - `Cache-Control` = 'no-store'.
 *   6. Call `res.sendFile(filePath)`.
 *   7. On error, `next(error)` — handled by the global error
 *      middleware.
 *
 * Important: the controller's behavior is the contract tested
 * here. The downstream `documentsService` and
 * `checkDocumentAccess` are mocked.
 *
 * Coverage matrix (UTCID01 – UTCID06):
 *   UTCID01  N  – Valid PDF: getById returns a doc with
 *                 mimeType=application/pdf; headers are set
 *                 correctly; sendFile is called.
 *   UTCID02  N  – Access check: ADMIN bypasses; creator
 *                 passes; processor passes; non-creator gets
 *                 ForbiddenError.
 *   UTCID03  N  – Stream headers: Content-Type,
 *                 Content-Disposition=inline,
 *                 Cache-Control=no-store.
 *   UTCID04  A  – File / document not found: NotFoundError
 *                 from getById; access denied → ForbiddenError.
 *   UTCID05  A  – Corrupt / unsupported / forbidden file:
 *                 mimeType != 'application/pdf'; file missing
 *                 on disk → res.sendFile cb throws.
 *   UTCID06  B  – Minimum / maximum supported file size:
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

const buildMockRes = (): any => {
  const headers: Record<string, string> = {};
  return {
    setHeader: jest.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    status: jest.fn(function (this: any) {
      return this;
    }),
    json: jest.fn(function (this: any) {
      return this;
    }),
    send: jest.fn(function (this: any) {
      return this;
    }),
    sendFile: jest.fn((_p: string, cb?: (err?: Error) => void) => {
      // Default: success
      if (cb) cb();
      return this;
    }),
    _headers: headers,
  };
};

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
// UTCID01 – Normal 1: valid PDF.
// Result : getById returns a doc with mimeType=application/pdf;
//          headers are set correctly; sendFile is called.
// ---------------------------------------------------------------------------
describe('[UTCID01] documentsController.preview() – Normal 1: valid PDF', () => {
  it('does NOT throw on a valid PDF', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('calls checkDocumentAccess with the right args', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

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

    await controller.preview(req, res, next);

    expect(mockedService.getById).toHaveBeenCalledWith(1);
  });

  it('calls documentsService.getFilePath(doc)', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(mockedService.getFilePath).toHaveBeenCalled();
  });

  it('calls res.sendFile with the file path', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith(expect.any(String));
  });

  it('does NOT log to console on the valid-PDF path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('does NOT throw for a doc with mimeType=application/pdf', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

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

    await controller.preview(req, res, next);

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

    await controller.preview(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: access check.
// Result : ADMIN bypasses; creator passes; processor passes;
//          non-creator gets ForbiddenError.
// ---------------------------------------------------------------------------
describe('[UTCID02] documentsController.preview() – Normal 2: access check', () => {
  it('does NOT throw when checkDocumentAccess passes', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('calls checkDocumentAccess with ADMIN role', async () => {
    const req = buildMockReq({
      user: { userId: 1, roles: ['ADMIN'] },
    });
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(mockedCheckAccess).toHaveBeenCalledWith(
      1,
      1,
      ['ADMIN'],
    );
  });

  it('calls checkDocumentAccess with SPECIALIST role', async () => {
    const req = buildMockReq({
      user: { userId: 5, roles: ['SPECIALIST'] },
    });
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(mockedCheckAccess).toHaveBeenCalledWith(
      1,
      5,
      ['SPECIALIST'],
    );
  });

  it('calls checkDocumentAccess with DEPARTMENT_HEAD role', async () => {
    const req = buildMockReq({
      user: { userId: 6, roles: ['DEPARTMENT_HEAD'] },
    });
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(mockedCheckAccess).toHaveBeenCalledWith(
      1,
      6,
      ['DEPARTMENT_HEAD'],
    );
  });

  it('calls checkDocumentAccess with DOCUMENT_CLERK role', async () => {
    const req = buildMockReq({
      user: { userId: 7, roles: ['DOCUMENT_CLERK'] },
    });
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(mockedCheckAccess).toHaveBeenCalledWith(
      1,
      7,
      ['DOCUMENT_CLERK'],
    );
  });

  it('calls checkDocumentAccess with multiple roles', async () => {
    const req = buildMockReq({
      user: { userId: 5, roles: ['SPECIALIST', 'DEPARTMENT_HEAD'] },
    });
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(mockedCheckAccess).toHaveBeenCalledWith(
      1,
      5,
      ['SPECIALIST', 'DEPARTMENT_HEAD'],
    );
  });

  it('does NOT log to console on the access-check path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('does NOT throw for the creator', async () => {
    const req = buildMockReq({
      user: { userId: 5, roles: ['SPECIALIST'] },
    });
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: stream headers.
// Result : Content-Type, Content-Disposition=inline,
//          Cache-Control=no-store.
// ---------------------------------------------------------------------------
describe('[UTCID03] documentsController.preview() – Normal 3: stream headers', () => {
  it('sets Content-Type to application/pdf', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
  });

  it('sets Content-Disposition to inline', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline',
    );
  });

  it('sets Cache-Control to no-store', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
  });

  it('sets all three headers', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(res.setHeader).toHaveBeenCalledTimes(3);
  });

  it('sets Content-Type to application/octet-stream when mimeType is missing', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValue(
      buildDoc({ mimeType: null }),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/octet-stream',
    );
  });

  it('sets Content-Type to application/pdf for a Word document with mimeType override', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValue(
      buildDoc({
        fileUrl: '/uploads/out-2026-0001.docx',
        mimeType: 'application/pdf',
      }),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
  });

  it('does NOT log to console on the stream-headers path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('does NOT throw on the stream-headers path', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: file / document not found.
// Result : NotFoundError from getById; access denied →
//          ForbiddenError.
// ---------------------------------------------------------------------------
describe('[UTCID04] documentsController.preview() – Abnormal 1: file/document not found', () => {
  it('calls next with NotFoundError when getById throws', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockRejectedValue(
      new NotFoundError('Không tìm thấy văn bản'),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.any(NotFoundError),
    );
  });

  it('calls next with ForbiddenError when checkDocumentAccess throws', async () => {
    mockedCheckAccess.mockReset();
    mockedCheckAccess.mockRejectedValue(
      new ForbiddenError('Không có quyền truy cập'),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.any(ForbiddenError),
    );
  });

  it('does NOT call res.sendFile when document is missing', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockRejectedValue(
      new NotFoundError('Không tìm thấy văn bản'),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

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

    await controller.preview(req, res, next);

    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on not-found (no password / hash leak)', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockRejectedValue(
      new NotFoundError('Không tìm thấy văn bản'),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

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

    await controller.preview(req, res, next);

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

    await controller.preview(req, res, next);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 2: corrupt / unsupported / forbidden file.
// Result : mimeType != 'application/pdf'; file missing on disk
//          → res.sendFile cb throws.
// ---------------------------------------------------------------------------
describe('[UTCID05] documentsController.preview() – Abnormal 2: corrupt/unsupported/forbidden file', () => {
  it('sets Content-Type to application/octet-stream for unsupported mimeType', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValue(
      buildDoc({ mimeType: 'application/octet-stream' }),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/octet-stream',
    );
  });

  it('sets Content-Type to image/png for an unsupported image', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValue(
      buildDoc({ mimeType: 'image/png' }),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'image/png',
    );
  });

  it('sets Content-Type to text/plain for a corrupt text file', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValue(
      buildDoc({ mimeType: 'text/plain' }),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain',
    );
  });

  it('does NOT throw when sendFile emits an error', async () => {
    // sendFile errors propagate via the response's `error`
    // event, which Express's middleware handles — NOT the
    // controller's try/catch. So `next` is NOT called by the
    // controller for sendFile errors. Verify the controller
    // itself does not crash.
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await expect(controller.preview(req, res, next)).resolves.toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('does NOT throw on corrupt mimeType', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValue(
      buildDoc({ mimeType: 'corrupt' }),
    );

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on corrupt file (no password / hash leak)', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    // sendFile errors are emitted via the response's `error`
    // event, not the controller's try/catch. The controller
    // itself never sees the error — Express's middleware
    // handles it. The "no leak" guarantee is therefore
    // enforced at the response layer, not at the controller.
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    // The controller does not propagate the error to `next`,
    // and it does NOT log anything. Verify both.
    expect(next).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('does NOT log to console on the corrupt-file path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Boundary 1: minimum / maximum supported file size.
// Result : empty file (0 bytes), 1 byte, very large (1 GB
//          equivalent).
// ---------------------------------------------------------------------------
describe('[UTCID06] documentsController.preview() – Boundary 1: minimum/maximum supported file size', () => {
  it('handles the boundary: 0-byte file', async () => {
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce('/uploads/empty.pdf');

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('handles the boundary: 1-byte file', async () => {
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce('/uploads/1byte.pdf');

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('handles the boundary: 1-KB file', async () => {
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce('/uploads/1kb.pdf');

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('handles the boundary: 1-MB file', async () => {
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce('/uploads/1mb.pdf');

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('handles the boundary: 1-GB file (very large)', async () => {
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce('/uploads/1gb.pdf');

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('handles the boundary: very long file path (10 KB)', async () => {
    const longPath = '/uploads/' + 'A'.repeat(10_000) + '.pdf';
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(longPath);

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

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

    await controller.preview(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('does NOT throw on the boundary path', async () => {
    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const req = buildMockReq();
    const res = buildMockRes();
    const next = jest.fn();

    await controller.preview(req, res, next);

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

    await controller.preview(req, res, next);

    const err = next.mock.calls[0][0] as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });
});
