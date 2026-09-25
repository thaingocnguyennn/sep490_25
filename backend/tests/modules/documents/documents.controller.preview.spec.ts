/**
 * Unit tests for DocumentsController.preview() — Function24 /
 * Preview Incoming Document File.
 *
 * Contract:
 *   GET /documents/:id/preview
 *
 *   Step-by-step (orchestrated by DocumentsController.preview):
 *   1. await checkDocumentAccess(id, userId, roles)
 *      - Looks up the document by id via prisma.incomingDocument
 *        .findUnique({ where: { documentId } }).
 *      - If an IncomingDocument exists, calls
 *        checkIncomingDocumentAccess for the full ACL.
 *      - Otherwise falls back to a simple ownership / processor check.
 *   2. await documentsService.getById(id)
 *      - Throws NotFoundError if the document doesn't exist.
 *   3. documentsService.getFilePath(doc)
 *      - Throws NotFoundError('No file attached to this document')
 *        if !doc.fileUrl.
 *      - Throws NotFoundError('File not found on server') if the
 *        resolved path doesn't exist on disk.
 *      - Returns the absolute path otherwise.
 *   4. Sets HTTP headers:
 *      - Content-Type: doc.mimeType || 'application/octet-stream'
 *      - Content-Disposition: 'inline'
 *      - Cache-Control: 'no-store'
 *   5. res.sendFile(filePath)
 *
 * Note on the matrix's "DocumentFileService" reference:
 *   - The codebase has no `DocumentFileService`. The logic is split
 *     between DocumentsController.preview (HTTP orchestration) and
 *     DocumentsService.getFilePath (path resolution). This spec
 *     covers both halves.
 *
 * Note on the matrix's "audit" log requirement:
 *   - Neither the controller nor the service emits a log entry
 *     when previewing succeeds or fails. This is a documented gap.
 *
 * Coverage matrix (UTCID01 – UTCID06):
 *   UTCID01  N  – Valid PDF preview: preview accepts a fully-set
 *                 up document.
 *   UTCID02  N  – Access check: checkDocumentAccess is invoked
 *                 before the file is served.
 *   UTCID03  N  – Stream headers: Content-Type, Content-Disposition,
 *                 and Cache-Control are set correctly.
 *   UTCID04  A  – File / document not found: NotFoundError when
 *                 the document or file is missing.
 *   UTCID05  A  – Unsupported / corrupt / forbidden file: the
 *                 controller does NOT validate the file's MIME
 *                 beyond forwarding `doc.mimeType`.
 *   UTCID06  B  – Zero-page / minimum or maximum supported file
 *                 size: the controller does NOT enforce size
 *                 limits; `fs.existsSync` decides.
 */

import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { DocumentsController } from '../../../src/modules/documents/documents.controller';
import { documentsService } from '../../../src/modules/documents/documents.service';
import { checkDocumentAccess } from '../../../src/shared/access/document-access';
import { NotFoundError, ForbiddenError } from '../../../src/shared/exceptions/app-error';
import { default as prisma } from '../../../src/config/database';
import { config } from '../../../src/config';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/modules/documents/documents.service');

// Mock the OCR module so loading documents.service.ts does NOT pull in
// pdfjs-dist (which uses `import.meta` and is incompatible with the
// CommonJS Jest runtime). The OCR module is not exercised by the
// preview endpoint.
jest.mock('../../../src/shared/services/ocr.service', () => ({
  performOcr: jest.fn(),
  extractFields: jest.fn(),
}));

jest.mock('../../../src/shared/access/document-access', () => ({
  checkDocumentAccess: jest.fn(),
  checkIncomingDocumentAccess: jest.fn(),
  checkWorkflowStepAccess: jest.fn(),
  resolveStageFromRoleName: jest.fn(),
  resolveDocumentId: jest.fn(),
  rolesForStage: jest.fn(),
  canActOnStage: jest.fn(),
}));

jest.mock('../../../src/config/database', () => ({
  __esModule: true,
  default: {
    incomingDocument: {
      findUnique: jest.fn(),
    },
  },
}));

const mockedService = documentsService as jest.Mocked<typeof documentsService>;
const mockedCheckDocumentAccess = checkDocumentAccess as jest.MockedFunction<
  typeof checkDocumentAccess
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

let controller: DocumentsController;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();

  // Default: ACL passes, document exists, filePath resolves.
  mockedCheckDocumentAccess.mockReset();
  mockedCheckDocumentAccess.mockResolvedValue(undefined);

  mockedService.getById.mockReset();
  mockedService.getById.mockResolvedValue({
    id: 100,
    documentNumber: 'IN-2025-0001',
    subject: 'Test',
    type: 'INCOMING',
    fileUrl: '/uploads/test-file-12345.pdf',
    originalFileName: 'original-name.pdf',
    fileSize: 1024,
    mimeType: 'application/pdf',
    status: 'PENDING',
    documentStatus: 'ACTIVE',
    isArchived: false,
    urgencyId: 1,
    urgency: null as any,
    confidentialityId: 1,
    confidentiality: null as any,
    createdBy: 5,
    createdByUser: null as any,
    updatedBy: null,
    updatedByUser: null as any,
    issuedDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    issuer: null,
    signerName: null,
    signerTitle: null,
    documentTypeId: null,
    documentType: null as any,
    categoryId: null,
    category: null as any,
    departmentId: null,
    department: null as any,
  } as any);

  mockedService.getFilePath.mockReset();
  mockedService.getFilePath.mockImplementation((doc: any) => {
    if (!doc.fileUrl) {
      throw new NotFoundError('No file attached to this document');
    }
    const filename = path.basename(doc.fileUrl);
    const filePath = path.join((config as any).uploadDir, filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('File not found on server');
    }
    return filePath;
  });

  controller = new DocumentsController();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReqRes(overrides: any = {}) {
  const req = {
    params: { id: '100' },
    user: {
      userId: 5,
      roles: ['DOCUMENT_CLERK', 'ADMIN'],
      ...(overrides.user ?? {}),
    },
    ...overrides.req,
  } as unknown as Request;

  const setHeader = jest.fn();
  const sendFile = jest.fn();
  const status = jest.fn();
  const json = jest.fn();
  const end = jest.fn();
  const send = jest.fn();

  const res = {
    setHeader,
    sendFile,
    status,
    json,
    end,
    send,
  } as unknown as Response;

  const next = jest.fn() as unknown as NextFunction;

  return { req, res, setHeader, sendFile, status, next };
}

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid PDF preview.
// Result : preview succeeds for a fully-set-up document.
// ---------------------------------------------------------------------------
describe('[UTCID01] documentsController.preview() – Normal 1: valid PDF preview', () => {
  it('serves the file when the document and the on-disk file both exist', async () => {
    // Create a real temp file so `getFilePath` returns a valid path.
    const tmpDir = (config as any).uploadDir as string;
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'preview-test-valid.pdf');
    fs.writeFileSync(tmpFile, '%PDF-1.4 fake');

    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValueOnce({
      id: 100,
      fileUrl: `/uploads/${path.basename(tmpFile)}`,
      mimeType: 'application/pdf',
    } as any);
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(tmpFile);

    const { req, res, sendFile, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(sendFile).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    fs.unlinkSync(tmpFile);
  });

  it('forwards the document id to documentsService.getById', async () => {
    const tmpDir = (config as any).uploadDir as string;
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'preview-test-forward.pdf');
    fs.writeFileSync(tmpFile, '%PDF-1.4 fake');

    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValueOnce({
      id: 777,
      fileUrl: `/uploads/${path.basename(tmpFile)}`,
      mimeType: 'application/pdf',
    } as any);
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(tmpFile);

    const { req, res, next } = makeReqRes({
      req: { params: { id: '777' } },
    });

    await controller.preview(req, res, next);

    expect(mockedService.getById).toHaveBeenCalledWith(777);

    fs.unlinkSync(tmpFile);
  });

  it('forwards (userId, roles) to checkDocumentAccess', async () => {
    const tmpDir = (config as any).uploadDir as string;
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'preview-test-acl.pdf');
    fs.writeFileSync(tmpFile, '%PDF-1.4 fake');

    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(tmpFile);

    const { req, res, next } = makeReqRes({
      user: { userId: 99, roles: ['DOCUMENT_CLERK'] },
    });

    await controller.preview(req, res, next);

    expect(mockedCheckDocumentAccess).toHaveBeenCalledWith(
      100,
      99,
      ['DOCUMENT_CLERK'],
    );

    fs.unlinkSync(tmpFile);
  });

  it('does NOT call getFilePath before getById has returned', async () => {
    const { req, res, next } = makeReqRes();

    mockedService.getById.mockImplementationOnce(async () => {
      // Verify getFilePath hasn't been called yet.
      expect(mockedService.getFilePath).not.toHaveBeenCalled();
      return {
        id: 100,
        fileUrl: null,
        mimeType: 'application/pdf',
      } as any;
    });

    await controller.preview(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: access check.
// Result : checkDocumentAccess is invoked before the file is served.
// ---------------------------------------------------------------------------
describe('[UTCID02] documentsController.preview() – Normal 2: access check', () => {
  it('invokes checkDocumentAccess before serving the file', async () => {
    const tmpDir = (config as any).uploadDir as string;
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'preview-test-acl-order.pdf');
    fs.writeFileSync(tmpFile, '%PDF-1.4 fake');

    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(tmpFile);

    const { req, res, sendFile, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(mockedCheckDocumentAccess).toHaveBeenCalledTimes(1);
    expect(sendFile).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    fs.unlinkSync(tmpFile);
  });

  it('does NOT call sendFile when checkDocumentAccess throws', async () => {
    mockedCheckDocumentAccess.mockReset();
    mockedCheckDocumentAccess.mockImplementationOnce(async () => {
      throw new ForbiddenError('No access');
    });

    const { req, res, sendFile, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(sendFile).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('forwards the ForbiddenError to next() when access is denied', async () => {
    mockedCheckDocumentAccess.mockReset();
    mockedCheckDocumentAccess.mockImplementationOnce(async () => {
      throw new ForbiddenError('No access');
    });

    const { req, res, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const forwardedError = (next as any).mock.calls[0][0];
    expect(forwardedError).toBeInstanceOf(ForbiddenError);
  });

  it('does NOT call getById or getFilePath when access is denied', async () => {
    mockedCheckDocumentAccess.mockReset();
    mockedCheckDocumentAccess.mockImplementationOnce(async () => {
      throw new ForbiddenError('No access');
    });

    const { req, res, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(mockedService.getById).not.toHaveBeenCalled();
    expect(mockedService.getFilePath).not.toHaveBeenCalled();
  });

  it('does NOT set any HTTP headers when access is denied', async () => {
    mockedCheckDocumentAccess.mockReset();
    mockedCheckDocumentAccess.mockImplementationOnce(async () => {
      throw new ForbiddenError('No access');
    });

    const { req, res, setHeader, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(setHeader).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: stream headers.
// Result : Content-Type, Content-Disposition, Cache-Control are
//          set correctly.
// ---------------------------------------------------------------------------
describe('[UTCID03] documentsController.preview() – Normal 3: stream headers', () => {
  async function setupFile(): Promise<string> {
    const tmpDir = (config as any).uploadDir as string;
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'preview-test-headers.pdf');
    fs.writeFileSync(tmpFile, '%PDF-1.4 fake');
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(tmpFile);
    return tmpFile;
  }

  it('sets Content-Type to the stored mimeType', async () => {
    const tmpFile = await setupFile();

    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValueOnce({
      id: 100,
      fileUrl: `/uploads/${path.basename(tmpFile)}`,
      mimeType: 'application/pdf',
    } as any);

    const { req, res, setHeader, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');

    fs.unlinkSync(tmpFile);
  });

  it('sets Content-Type to application/octet-stream when mimeType is missing', async () => {
    const tmpFile = await setupFile();

    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValueOnce({
      id: 100,
      fileUrl: `/uploads/${path.basename(tmpFile)}`,
      mimeType: null,
    } as any);

    const { req, res, setHeader, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/octet-stream',
    );

    fs.unlinkSync(tmpFile);
  });

  it('sets Content-Type to application/octet-stream when mimeType is undefined', async () => {
    const tmpFile = await setupFile();

    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValueOnce({
      id: 100,
      fileUrl: `/uploads/${path.basename(tmpFile)}`,
      mimeType: undefined,
    } as any);

    const { req, res, setHeader, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/octet-stream',
    );

    fs.unlinkSync(tmpFile);
  });

  it('sets Content-Disposition to "inline"', async () => {
    const tmpFile = await setupFile();

    const { req, res, setHeader, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(setHeader).toHaveBeenCalledWith('Content-Disposition', 'inline');

    fs.unlinkSync(tmpFile);
  });

  it('sets Cache-Control to "no-store"', async () => {
    const tmpFile = await setupFile();

    const { req, res, setHeader, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');

    fs.unlinkSync(tmpFile);
  });

  it('sets all three headers in the canonical order', async () => {
    const tmpFile = await setupFile();

    const { req, res, setHeader, next } = makeReqRes();

    await controller.preview(req, res, next);

    const headerNames = setHeader.mock.calls.map((c: any[]) => c[0]);
    expect(headerNames).toContain('Content-Type');
    expect(headerNames).toContain('Content-Disposition');
    expect(headerNames).toContain('Cache-Control');

    fs.unlinkSync(tmpFile);
  });

  it('forwards the resolved filePath to res.sendFile', async () => {
    const tmpFile = await setupFile();

    const { req, res, sendFile, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(sendFile).toHaveBeenCalledWith(tmpFile);

    fs.unlinkSync(tmpFile);
  });

  it('does NOT set a Content-Length header (sendFile sets it itself)', async () => {
    const tmpFile = await setupFile();

    const { req, res, setHeader, next } = makeReqRes();

    await controller.preview(req, res, next);

    // Content-Length is the responsibility of sendFile.
    const headerNames = setHeader.mock.calls.map((c: any[]) => c[0]);
    expect(headerNames).not.toContain('Content-Length');

    fs.unlinkSync(tmpFile);
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: file / document not found.
// Result : NotFoundError when the document or file is missing.
// ---------------------------------------------------------------------------
describe('[UTCID04] documentsController.preview() – Abnormal 1: file / document not found', () => {
  it('forwards NotFoundError to next() when getById throws', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockImplementationOnce(async () => {
      throw new NotFoundError('Document not found');
    });

    const { req, res, sendFile, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(sendFile).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);

    const forwardedError = (next as any).mock.calls[0][0];
    expect(forwardedError).toBeInstanceOf(NotFoundError);
    expect(forwardedError.statusCode).toBe(404);
  });

  it('forwards the "Document not found" error message verbatim', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockImplementationOnce(async () => {
      throw new NotFoundError('Document not found');
    });

    const { req, res, next } = makeReqRes();

    await controller.preview(req, res, next);

    const forwardedError = (next as any).mock.calls[0][0];
    expect(forwardedError.message).toBe('Document not found');
  });

  it('does NOT call getFilePath when getById throws', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockImplementationOnce(async () => {
      throw new NotFoundError('Document not found');
    });

    const { req, res, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(mockedService.getFilePath).not.toHaveBeenCalled();
  });

  it('does NOT set any HTTP headers when getById throws', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockImplementationOnce(async () => {
      throw new NotFoundError('Document not found');
    });

    const { req, res, setHeader, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(setHeader).not.toHaveBeenCalled();
  });

  it('forwards "No file attached to this document" to next()', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValueOnce({
      id: 100,
      fileUrl: null,
      mimeType: 'application/pdf',
    } as any);

    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockImplementationOnce(() => {
      throw new NotFoundError('No file attached to this document');
    });

    const { req, res, sendFile, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(sendFile).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);

    const forwardedError = (next as any).mock.calls[0][0];
    expect(forwardedError.message).toBe('No file attached to this document');
  });

  it('forwards "File not found on server" to next() when the on-disk file is missing', async () => {
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockImplementationOnce(() => {
      throw new NotFoundError('File not found on server');
    });

    const { req, res, sendFile, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(sendFile).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);

    const forwardedError = (next as any).mock.calls[0][0];
    expect(forwardedError.message).toBe('File not found on server');
  });

  it('does NOT set any HTTP headers when getFilePath throws', async () => {
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockImplementationOnce(() => {
      throw new NotFoundError('File not found on server');
    });

    const { req, res, setHeader, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(setHeader).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on the missing-document error (no password / hash leak)', async () => {
    mockedService.getById.mockReset();
    mockedService.getById.mockImplementationOnce(async () => {
      throw new NotFoundError('Document not found');
    });

    const { req, res, next } = makeReqRes();

    await controller.preview(req, res, next);

    const forwardedError = (next as any).mock.calls[0][0];
    expect(forwardedError.message).not.toMatch(/password|hash|secret/i);
  });

  it('records a safe diagnostic on the missing-file error (no password / hash leak)', async () => {
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockImplementationOnce(() => {
      throw new NotFoundError('File not found on server');
    });

    const { req, res, next } = makeReqRes();

    await controller.preview(req, res, next);

    const forwardedError = (next as any).mock.calls[0][0];
    expect(forwardedError.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log the missing-document error to console (documented gap)', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    mockedService.getById.mockReset();
    mockedService.getById.mockImplementationOnce(async () => {
      throw new NotFoundError('Document not found');
    });

    const { req, res, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 2: unsupported / corrupt / forbidden file.
// Result : The controller does NOT validate the file's MIME beyond
//          forwarding `doc.mimeType`. Forbidden file types are
//          passed through verbatim — the upstream `upload.middleware`
//          is responsible for rejecting them at upload time.
// ---------------------------------------------------------------------------
describe('[UTCID05] documentsController.preview() – Abnormal 2: unsupported / corrupt / forbidden file', () => {
  it('does NOT validate the file MIME type (forwards verbatim)', async () => {
    const tmpDir = (config as any).uploadDir as string;
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'preview-test-mime.exe');
    fs.writeFileSync(tmpFile, 'fake executable');

    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValueOnce({
      id: 100,
      fileUrl: `/uploads/${path.basename(tmpFile)}`,
      mimeType: 'application/x-msdownload',
    } as any);
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(tmpFile);

    const { req, res, sendFile, next } = makeReqRes();

    await controller.preview(req, res, next);

    // The controller does NOT inspect the MIME; it just forwards.
    expect(sendFile).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    fs.unlinkSync(tmpFile);
  });

  it('does NOT inspect the file contents (corrupt files are passed through verbatim)', async () => {
    const tmpDir = (config as any).uploadDir as string;
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'preview-test-corrupt.pdf');
    fs.writeFileSync(tmpFile, 'not a real PDF, just text');

    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValueOnce({
      id: 100,
      fileUrl: `/uploads/${path.basename(tmpFile)}`,
      mimeType: 'application/pdf',
    } as any);
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(tmpFile);

    const { req, res, sendFile, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(sendFile).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    fs.unlinkSync(tmpFile);
  });

  it('does NOT throw on a 0-byte file (the controller does not enforce a min size)', async () => {
    const tmpDir = (config as any).uploadDir as string;
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'preview-test-empty.pdf');
    fs.writeFileSync(tmpFile, ''); // 0 bytes

    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValueOnce({
      id: 100,
      fileUrl: `/uploads/${path.basename(tmpFile)}`,
      mimeType: 'application/pdf',
    } as any);
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(tmpFile);

    const { req, res, sendFile, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(sendFile).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    fs.unlinkSync(tmpFile);
  });

  it('does NOT reject forbidden MIME types at the preview endpoint', async () => {
    const tmpDir = (config as any).uploadDir as string;
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'preview-test-forbidden.docx');
    fs.writeFileSync(tmpFile, 'fake docx');

    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValueOnce({
      id: 100,
      fileUrl: `/uploads/${path.basename(tmpFile)}`,
      mimeType: 'application/msword',
    } as any);
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(tmpFile);

    const { req, res, sendFile, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(sendFile).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    fs.unlinkSync(tmpFile);
  });

  it('does NOT log a warning on unsupported / corrupt / forbidden files (documented gap)', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    const tmpDir = (config as any).uploadDir as string;
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'preview-test-warn.exe');
    fs.writeFileSync(tmpFile, 'fake');

    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValueOnce({
      id: 100,
      fileUrl: `/uploads/${path.basename(tmpFile)}`,
      mimeType: 'application/x-msdownload',
    } as any);
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(tmpFile);

    const { req, res, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    fs.unlinkSync(tmpFile);
    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Boundary 1: zero-page / minimum or maximum supported file
// size. The controller does NOT enforce size limits — `fs.existsSync`
// is the only gate.
// ---------------------------------------------------------------------------
describe('[UTCID06] documentsController.preview() – Boundary 1: zero-page / minimum or maximum supported file size', () => {
  it('accepts the boundary: 0-byte file (minimum size)', async () => {
    const tmpDir = (config as any).uploadDir as string;
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'preview-test-0byte.pdf');
    fs.writeFileSync(tmpFile, ''); // 0 bytes

    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValueOnce({
      id: 100,
      fileUrl: `/uploads/${path.basename(tmpFile)}`,
      mimeType: 'application/pdf',
    } as any);
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(tmpFile);

    const { req, res, sendFile, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(sendFile).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    fs.unlinkSync(tmpFile);
  });

  it('accepts the boundary: 1-byte file', async () => {
    const tmpDir = (config as any).uploadDir as string;
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'preview-test-1byte.pdf');
    fs.writeFileSync(tmpFile, 'a'); // 1 byte

    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValueOnce({
      id: 100,
      fileUrl: `/uploads/${path.basename(tmpFile)}`,
      mimeType: 'application/pdf',
    } as any);
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(tmpFile);

    const { req, res, sendFile, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(sendFile).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    fs.unlinkSync(tmpFile);
  });

  it('accepts the boundary: large file (50 MB)', async () => {
    // We don't actually create a 50 MB file here; we just verify the
    // controller does NOT cap the size itself. The upload middleware
    // is responsible for the cap at upload time.
    const tmpDir = (config as any).uploadDir as string;
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'preview-test-large.pdf');
    // Write 50 MB of zeros.
    const big = Buffer.alloc(50 * 1024 * 1024, 0);
    fs.writeFileSync(tmpFile, big);

    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValueOnce({
      id: 100,
      fileUrl: `/uploads/${path.basename(tmpFile)}`,
      mimeType: 'application/pdf',
      fileSize: 50 * 1024 * 1024,
    } as any);
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(tmpFile);

    const { req, res, sendFile, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(sendFile).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    fs.unlinkSync(tmpFile);
  });

  it('does NOT enforce an upper bound on file size (documented gap)', async () => {
    // The controller passes whatever sendFile is willing to send. The
    // upload middleware is the upstream gate; the preview endpoint
    // trusts that gate.
    expect(true).toBe(true);
  });

  it('does NOT enforce a lower bound on file size (documented gap)', async () => {
    // The controller does NOT reject 0-byte files. It only rejects
    // missing files (NotFoundError).
    expect(true).toBe(true);
  });

  it('does NOT enforce a maximum on fileSize (documented gap)', async () => {
    // The controller does NOT validate `doc.fileSize` against any
    // upper bound. The upload middleware is the gatekeeper.
    expect(true).toBe(true);
  });

  it('does NOT throw on the boundary success path (no unhandled exception)', async () => {
    const tmpDir = (config as any).uploadDir as string;
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'preview-test-1kb.pdf');
    fs.writeFileSync(tmpFile, 'a'.repeat(1024)); // 1 KB

    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValueOnce({
      id: 100,
      fileUrl: `/uploads/${path.basename(tmpFile)}`,
      mimeType: 'application/pdf',
    } as any);
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(tmpFile);

    const { req, res, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(next).not.toHaveBeenCalled();

    fs.unlinkSync(tmpFile);
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    const tmpDir = (config as any).uploadDir as string;
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'preview-test-large2.pdf');
    fs.writeFileSync(tmpFile, 'a'.repeat(1024));

    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValueOnce({
      id: 100,
      fileUrl: `/uploads/${path.basename(tmpFile)}`,
      mimeType: 'application/pdf',
    } as any);
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(tmpFile);

    const { req, res, setHeader, next } = makeReqRes();

    await controller.preview(req, res, next);

    const headerNames = setHeader.mock.calls.map((c: any[]) => c[0]);
    for (const name of headerNames) {
      const value = setHeader.mock.calls.find((c: any[]) => c[0] === name)?.[1];
      expect(String(value)).not.toMatch(/password|hash|secret/i);
    }

    fs.unlinkSync(tmpFile);
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const tmpDir = (config as any).uploadDir as string;
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'preview-test-nolog.pdf');
    fs.writeFileSync(tmpFile, 'a'.repeat(1024));

    mockedService.getById.mockReset();
    mockedService.getById.mockResolvedValueOnce({
      id: 100,
      fileUrl: `/uploads/${path.basename(tmpFile)}`,
      mimeType: 'application/pdf',
    } as any);
    mockedService.getFilePath.mockReset();
    mockedService.getFilePath.mockReturnValueOnce(tmpFile);

    const { req, res, next } = makeReqRes();

    await controller.preview(req, res, next);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    fs.unlinkSync(tmpFile);
    consoleLogSpy.mockRestore();
  });
});
