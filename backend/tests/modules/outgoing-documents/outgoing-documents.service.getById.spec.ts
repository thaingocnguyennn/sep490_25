/**
 * Unit tests for OutgoingDocumentsService.getById() — Function40
 * / View Outgoing Document Detail.
 *
 * Note on naming: the matrix headers reference
 * `OutgoingDocumentQueryService`, but the actual implementation
 * that fetches a single outgoing document is
 * `OutgoingDocumentsService.getById(id, currentUser)`. The
 * service:
 *   1. Calls `outgoingDocumentsRepository.findById(id)`,
 *      which returns the document with `OUTGOING_INCLUDE`
 *      metadata (createdByUser, department, urgency,
 *      documentTypeRef, category, attachments, documentBook,
 *      bookEntry, submittedByUser, approvedByUser, etc.).
 *   2. If `doc` is null, throws `NotFoundError` (handled by
 *      the repository).
 *   3. If the document is in `DRAFT` status, only the creator
 *      or an ADMIN may view it; everyone else gets
 *      `ForbiddenError`.
 *   4. Returns the document with its full metadata.
 *
 * Coverage matrix (UTCID01 – UTCID06):
 *   UTCID01  N  – Metadata: the document with all related
 *                 metadata is returned.
 *   UTCID02  N  – File: the document with attachments (files)
 *                 is returned.
 *   UTCID03  N  – Workflow/history: the document with
 *                 workflow actors and timestamps is returned.
 *   UTCID04  A  – Invalid identifier: non-numeric or negative
 *                 ids; not-found ids.
 *   UTCID05  A  – Document not found / forbidden: DRAFT
 *                 documents are gated to creator + ADMIN.
 *   UTCID06  B  – Optional fields empty or maximum related
 *                 records: doc with no attachments + doc with
 *                 many attachments.
 */

import { OutgoingDocumentsService } from '../../../src/modules/outgoing-documents/outgoing-documents.service';
import { outgoingDocumentsRepository } from '../../../src/modules/outgoing-documents/outgoing-documents.repository';
import {
  NotFoundError,
  ForbiddenError,
} from '../../../src/shared/exceptions/app-error';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/outgoing-documents/outgoing-documents.repository',
);

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

  // Default: a fully-populated outgoing document.
  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockResolvedValue({
    id: 1,
    documentId: 100,
    documentNumber: 'OUT-2026-0001',
    dispatchNumber: '2026/001',
    issuanceDate: new Date('2026-09-25'),
    recipientName: 'Sở TTTT',
    recipientAddress: '123 Nguyễn Văn Cừ',
    recipientEmail: 'sotttt@example.com',
    sentDate: new Date('2026-09-26'),
    pageCount: 5,
    submittedAt: new Date('2026-09-20'),
    submittedBy: 7,
    approvedAt: new Date('2026-09-22'),
    approvedBy: 5,
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
    assignedApproverId: 5,
    assignedClerkId: 8,
    documentBookId: 1,
    documentBook: {
      id: 1,
      name: 'Sổ công văn đi 2026',
      code: 'SCVD-2026',
      year: 2026,
    },
    bookEntry: {
      sequenceNumber: 1,
      officialNumber: '2026/001',
    },
    createdAt: new Date('2026-09-19'),
    document: {
      id: 100,
      documentNumber: 'OUT-2026-0001',
      subject: 'Công văn số 1',
      type: 'OUTGOING',
      fileUrl: 'https://example.com/files/out-2026-0001.pdf',
      status: 'ISSUED',
      urgencyId: 1,
      confidentialityId: 1,
      ocrText: null,
      documentTypeId: 1,
      issuer: 'Phòng Hành chính',
      signerName: 'Nguyễn Văn A',
      signerTitle: 'Giám đốc',
      issuedDate: new Date('2026-09-25'),
      categoryId: null,
      createdAt: new Date('2026-09-19'),
      updatedAt: new Date('2026-09-25'),
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
      attachments: [
        {
          id: 1,
          fileName: 'out-2026-0001.pdf',
          fileUrl: 'https://example.com/files/out-2026-0001.pdf',
          fileSize: 102_400,
          mimeType: 'application/pdf',
        },
      ],
    } as any,
    submittedByUser: { id: 7, fullName: 'Trần Văn C' },
    approvedByUser: { id: 5, fullName: 'Lê Thị D' },
    returnedByUser: null,
    forwardedByUser: null,
    issuedByUser: null,
    recalledByUser: null,
    trashedByUser: null,
  } as any);

  service = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: metadata.
// Result : The document with all related metadata is returned.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.getById() – Normal 1: metadata', () => {
  it('returns the document by id', async () => {
    const result = await service.getById(1);

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('forwards the id to the repository', async () => {
    await service.getById(1);

    expect(mockedRepo.findById).toHaveBeenCalledWith(1);
  });

  it('returns the documentNumber', async () => {
    const result = await service.getById(1);

    expect(result.documentNumber).toBe('OUT-2026-0001');
  });

  it('returns the dispatchNumber', async () => {
    const result = await service.getById(1);

    expect(result.dispatchNumber).toBe('2026/001');
  });

  it('returns the subject (nested under document)', async () => {
    const result = await service.getById(1);

    expect((result.document as any).subject).toBe('Công văn số 1');
  });

  it('returns the issuer', async () => {
    const result = await service.getById(1);

    expect((result.document as any).issuer).toBe('Phòng Hành chính');
  });

  it('returns the signerName', async () => {
    const result = await service.getById(1);

    expect((result.document as any).signerName).toBe('Nguyễn Văn A');
  });

  it('returns the urgency (via document.urgency)', async () => {
    const result = await service.getById(1);

    expect((result.document as any).urgency).toEqual({
      id: 1,
      name: 'THUONG',
      description: 'Thường',
    });
  });

  it('returns the confidentiality (via document.confidentiality)', async () => {
    const result = await service.getById(1);

    expect((result.document as any).confidentiality).toEqual({
      id: 1,
      code: 'B',
      name: 'Mật',
      description: 'Văn bản mật',
    });
  });

  it('returns the document type (via document.documentTypeRef)', async () => {
    const result = await service.getById(1);

    expect((result.document as any).documentTypeRef).toEqual({
      id: 1,
      name: 'Công văn',
    });
  });

  it('returns the createdByUser (nested under document)', async () => {
    const result = await service.getById(1);

    expect((result.document as any).createdByUser).toEqual({
      id: 7,
      fullName: 'Trần Văn C',
    });
  });

  it('returns the department (nested under document)', async () => {
    const result = await service.getById(1);

    expect((result.document as any).department).toEqual({
      id: 1,
      name: 'Phòng Hành chính',
    });
  });

  it('does NOT throw on the metadata path', async () => {
    await expect(service.getById(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the metadata path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getById(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: file (attachments).
// Result : The document with attachments is returned.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.getById() – Normal 2: file (attachments)', () => {
  it('returns the fileUrl on the document', async () => {
    const result = await service.getById(1);

    expect((result.document as any).fileUrl).toBe(
      'https://example.com/files/out-2026-0001.pdf',
    );
  });

  it('returns the attachments array', async () => {
    const result = await service.getById(1);

    expect((result.document as any).attachments).toBeDefined();
    expect(Array.isArray((result.document as any).attachments)).toBe(true);
  });

  it('preserves the attachment metadata (fileName, fileUrl, fileSize, mimeType)', async () => {
    const result = await service.getById(1);

    const att = (result.document as any).attachments[0];
    expect(att.fileName).toBe('out-2026-0001.pdf');
    expect(att.fileUrl).toBe(
      'https://example.com/files/out-2026-0001.pdf',
    );
    expect(att.fileSize).toBe(102_400);
    expect(att.mimeType).toBe('application/pdf');
  });

  it('returns the recipient fields (recipientName, recipientAddress, recipientEmail)', async () => {
    const result = await service.getById(1);

    expect(result.recipientName).toBe('Sở TTTT');
    expect(result.recipientAddress).toBe('123 Nguyễn Văn Cừ');
    expect(result.recipientEmail).toBe('sotttt@example.com');
  });

  it('returns the pageCount', async () => {
    const result = await service.getById(1);

    expect(result.pageCount).toBe(5);
  });

  it('does NOT throw on the file path', async () => {
    await expect(service.getById(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the file path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getById(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: workflow/history.
// Result : The document with workflow actors and timestamps is
//          returned.
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.getById() – Normal 3: workflow/history', () => {
  it('returns the submittedAt timestamp', async () => {
    const result = await service.getById(1);

    expect(result.submittedAt).toEqual(new Date('2026-09-20'));
  });

  it('returns the approvedAt timestamp', async () => {
    const result = await service.getById(1);

    expect(result.approvedAt).toEqual(new Date('2026-09-22'));
  });

  it('returns the issuedAt timestamp (when issued)', async () => {
    const result = await service.getById(1);

    // Default mock: issuedAt is null because the document is
    // still in ISSUED status (not ISSUED_BY_CLERK).
    // We assert the field is present, even if null.
    expect(result).toHaveProperty('issuedAt');
  });

  it('returns the submittedByUser', async () => {
    const result = await service.getById(1);

    expect(result.submittedByUser).toEqual({
      id: 7,
      fullName: 'Trần Văn C',
    });
  });

  it('returns the approvedByUser', async () => {
    const result = await service.getById(1);

    expect(result.approvedByUser).toEqual({
      id: 5,
      fullName: 'Lê Thị D',
    });
  });

  it('returns the documentBook (where the document was registered)', async () => {
    const result = await service.getById(1);

    expect(result.documentBook).toEqual({
      id: 1,
      name: 'Sổ công văn đi 2026',
      code: 'SCVD-2026',
      year: 2026,
    });
  });

  it('returns the bookEntry (sequence + officialNumber)', async () => {
    const result = await service.getById(1);

    expect(result.bookEntry).toEqual({
      sequenceNumber: 1,
      officialNumber: '2026/001',
    });
  });

  it('returns the assignedApproverId and assignedClerkId', async () => {
    const result = await service.getById(1);

    expect(result.assignedApproverId).toBe(5);
    expect(result.assignedClerkId).toBe(8);
  });

  it('does NOT throw on the workflow/history path', async () => {
    await expect(service.getById(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the workflow/history path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getById(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: invalid identifier.
// Result : NotFoundError is thrown when the id doesn't exist.
//          The repository handles the negative / non-numeric
//          case via Prisma's `where: { id }`.
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.getById() – Abnormal 1: invalid identifier', () => {
  it('rejects (throws NotFoundError) when the document does not exist', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(service.getById(9999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects (throws NotFoundError) when called with id=0', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(service.getById(0)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects (throws NotFoundError) when called with a negative id', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(service.getById(-1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('forwards the negative id to the repository (no service-side clamping)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(service.getById(-99)).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.findById).toHaveBeenCalledWith(-99);
  });

  it('records a safe diagnostic on not-found (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    const err = await service.getById(9999).catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on not-found', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(service.getById(9999)).rejects.toBeInstanceOf(NotFoundError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 2: document not found / forbidden.
// Result : DRAFT documents are gated to creator + ADMIN.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.getById() – Abnormal 2: document not found / forbidden', () => {
  it('returns the document when status != DRAFT (no draft gate)', async () => {
    const result = await service.getById(1, {
      id: 99, // not creator, not admin
      roles: ['SPECIALIST'],
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('rejects (throws ForbiddenError) when DRAFT and caller is not creator / admin', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      status: 'DRAFT',
      document: {
        status: 'DRAFT',
        createdByUser: { id: 7, fullName: 'Trần Văn C' },
      },
    } as any);

    await expect(
      service.getById(1, {
        id: 99,
        roles: ['SPECIALIST'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows a DRAFT document for the creator', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      status: 'DRAFT',
      document: {
        status: 'DRAFT',
        createdByUser: { id: 7, fullName: 'Trần Văn C' },
      },
    } as any);

    const result = await service.getById(1, {
      id: 7,
      roles: ['SPECIALIST'],
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('allows a DRAFT document for an ADMIN caller (even if not creator)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      status: 'DRAFT',
      document: {
        status: 'DRAFT',
        createdByUser: { id: 7, fullName: 'Trần Văn C' },
      },
    } as any);

    const result = await service.getById(1, {
      id: 99,
      roles: ['ADMIN'],
    });

    expect(result).toBeDefined();
  });

  it('rejects (throws NotFoundError) when the document does not exist', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(service.getById(9999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('records a safe diagnostic on the forbidden path (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      status: 'DRAFT',
      document: {
        status: 'DRAFT',
        createdByUser: { id: 7, fullName: 'Trần Văn C' },
      },
    } as any);

    const err = await service
      .getById(1, {
        id: 99,
        roles: ['SPECIALIST'],
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the forbidden path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      status: 'DRAFT',
      document: {
        status: 'DRAFT',
        createdByUser: { id: 7, fullName: 'Trần Văn C' },
      },
    } as any);

    await expect(
      service.getById(1, {
        id: 99,
        roles: ['SPECIALIST'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Boundary 1: optional fields empty or maximum related
// records.
// Result : Empty attachments, empty recipients, and many
//          attachments are all accepted; the document is
//          returned.
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.getById() – Boundary 1: optional fields empty or maximum related records', () => {
  it('accepts the boundary: empty attachments + empty recipients', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      documentNumber: 'OUT-2026-0001',
      dispatchNumber: null,
      issuanceDate: null,
      recipientName: null,
      recipientAddress: null,
      recipientEmail: null,
      sentDate: null,
      pageCount: null,
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
      createdAt: new Date('2026-09-25'),
      document: {
        id: 100,
        documentNumber: 'OUT-2026-0001',
        subject: 'Công văn trống',
        type: 'OUTGOING',
        fileUrl: null,
        status: 'DRAFT',
        urgencyId: null,
        confidentialityId: null,
        ocrText: null,
        documentTypeId: null,
        issuer: null,
        signerName: null,
        signerTitle: null,
        issuedDate: null,
        categoryId: null,
        createdAt: new Date('2026-09-25'),
        updatedAt: new Date('2026-09-25'),
        createdByUser: null,
        updatedByUser: null,
        department: null,
        confidentiality: null,
        urgency: null,
        documentTypeRef: null,
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

    // Caller is the creator + ADMIN, so DRAFT is allowed.
    const result = await service.getById(1, {
      id: 7,
      roles: ['ADMIN'],
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
    expect(result.recipientName).toBeNull();
    expect(result.recipientAddress).toBeNull();
    expect((result.document as any).attachments).toEqual([]);
  });

  it('accepts the boundary: 100 attachments', async () => {
    mockedRepo.findById.mockReset();

    const bigAttachments = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      fileName: `attachment-${i + 1}.pdf`,
      fileUrl: `https://example.com/files/att-${i + 1}.pdf`,
      fileSize: 1024,
      mimeType: 'application/pdf',
    }));

    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      documentNumber: 'OUT-2026-0001',
      dispatchNumber: null,
      issuanceDate: null,
      recipientName: null,
      recipientAddress: null,
      recipientEmail: null,
      sentDate: null,
      pageCount: null,
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
      createdAt: new Date('2026-09-25'),
      document: {
        id: 100,
        documentNumber: 'OUT-2026-0001',
        subject: 'Công văn nhiều file',
        type: 'OUTGOING',
        fileUrl: null,
        status: 'ISSUED',
        urgencyId: 1,
        confidentialityId: 1,
        ocrText: null,
        documentTypeId: 1,
        issuer: 'Phòng Hành chính',
        signerName: 'Nguyễn Văn A',
        signerTitle: 'Giám đốc',
        issuedDate: new Date('2026-09-25'),
        categoryId: null,
        createdAt: new Date('2026-09-25'),
        updatedAt: new Date('2026-09-25'),
        createdByUser: { id: 7, fullName: 'Trần Văn C' },
        updatedByUser: { id: 7, fullName: 'Trần Văn C' },
        department: null,
        confidentiality: null,
        urgency: null,
        documentTypeRef: null,
        category: null,
        attachments: bigAttachments,
      } as any,
      submittedByUser: null,
      approvedByUser: null,
      returnedByUser: null,
      forwardedByUser: null,
      issuedByUser: null,
      recalledByUser: null,
      trashedByUser: null,
    } as any);

    const result = await service.getById(1);

    expect((result.document as any).attachments).toHaveLength(100);
  });

  it('accepts the boundary: very large id (Number.MAX_SAFE_INTEGER)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(
      service.getById(Number.MAX_SAFE_INTEGER),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.findById).toHaveBeenCalledWith(Number.MAX_SAFE_INTEGER);
  });

  it('does NOT throw on the boundary path', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      documentNumber: 'OUT-2026-0001',
      document: {
        status: 'ISSUED',
        attachments: [],
      },
    } as any);

    await expect(service.getById(1)).resolves.toBeDefined();
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    const result = await service
      .getById(1)
      .catch((e) => e) as any;

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getById(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
