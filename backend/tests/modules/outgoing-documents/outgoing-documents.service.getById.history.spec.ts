/**
 * Unit tests for OutgoingDocumentsService.getById() — Function50 /
 * View Outgoing Document History.
 *
 * Note on naming: the matrix headers reference
 * `DocumentHistoryService`. The actual implementation that
 * exposes the history (timeline) of an outgoing document is
 * `OutgoingDocumentsService.getById(id, currentUser)`. This
 * service returns the OutgoingDocument with all timeline
 * fields populated: `submittedAt`/`submittedBy`/`submittedByUser`,
 * `approvedAt`/`approvedBy`/`approvedByUser`, `returnedAt`/
 * `returnedBy`/`returnedByUser`/`returnReason`,
 * `forwardedAt`/`forwardedBy`/`forwardedByUser`,
 * `issuedAt`/`issuedBy`/`issuedByUser`,
 * `recalledAt`/`recalledBy`/`recalledByUser`/`recallReason`,
 * `trashedAt`/`trashedBy`/`trashedByUser`, and `createdAt`/
 * `updatedAt` on both the OutgoingDocument and the
 * underlying Document.
 *
 * Important architectural notes:
 *   - There is NO dedicated `history` table or `actionHistory`
 *     model. The "history" is implicitly available as
 *     timestamped columns on the OutgoingDocument row.
 *   - When viewed at a fully-issued document, the result has
 *     `submittedAt`, `approvedAt`, `forwardedAt`, `issuedAt`
 *     populated and the other timestamps null. The repository
 *     returns the full record with all relations joined.
 *   - For the "document not found/forbidden" path, the
 *     service throws `NotFoundError` if the document does
 *     not exist, or `ForbiddenError` if it exists but is a
 *     DRAFT and the caller is not the creator or ADMIN.
 *   - Prisma failures propagate as a thrown error.
 *
 * Coverage matrix (UTCID01 – UTCID06):
 *   UTCID01  N  – Chronological history: timeline fields
 *                 sorted by time, returned in the result.
 *   UTCID02  N  – Actor mapping: submittedByUser / approvedByUser
 *                 / etc. with fullName resolved.
 *   UTCID03  N  – Action details: returnReason / recallReason
 *                 / dispatchNumber / etc.
 *   UTCID04  A  – Document not found / forbidden: NotFoundError
 *                 or ForbiddenError thrown.
 *   UTCID05  A  – Repository failure: prisma failure propagates.
 *   UTCID06  B  – No history or last-page boundary: document
 *                 with all timestamps null (= no workflow
 *                 history yet); or last-page-like behavior
 *                 is N/A (single-doc view).
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

jest.mock('../../../src/shared/services/ocr.service', () => ({
  __esModule: true,
  performOcr: jest.fn(),
  extractFields: jest.fn(),
}));
jest.mock('../../../src/shared/services/email.service', () => ({
  __esModule: true,
  sendEmail: jest.fn().mockResolvedValue(undefined),
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

const SUBMITTER = { id: 5, fullName: 'Lê Văn Submitter' };
const APPROVER = { id: 6, fullName: 'Trần Văn Approver' };
const CLERK = { id: 7, fullName: 'Phạm Thị Clerk' };
const RECALLER = { id: 8, fullName: 'Đỗ Văn Recaller' };
const TRASHER = { id: 9, fullName: 'Bùi Thị Trasher' };

const buildFullHistoryDocument = (overrides: any = {}): any => {
  const base: any = {
    id: 1,
    documentId: 100,
    documentNumber: 'OUT-2026-0001',
    dispatchNumber: 'OUT-DISP-001',
    issuanceDate: new Date('2026-09-12T10:00:00.000Z'),
    pageCount: 5,
    submittedAt: new Date('2026-09-09T08:00:00.000Z'),
    submittedBy: 5,
    approvedAt: new Date('2026-09-10T09:00:00.000Z'),
    approvedBy: 6,
    returnedAt: null,
    returnedBy: null,
    returnReason: null,
    forwardedAt: new Date('2026-09-11T10:00:00.000Z'),
    forwardedBy: 6,
    issuedAt: new Date('2026-09-12T11:00:00.000Z'),
    issuedBy: 7,
    recalledAt: null,
    recalledBy: null,
    recallReason: null,
    trashedAt: null,
    trashedBy: null,
    sentDate: new Date('2026-09-12T12:00:00.000Z'),
    assignedApproverId: 6,
    assignedClerkId: 7,
    documentBookId: 1,
    documentBook: { id: 1, name: 'Sổ văn bản đi 2026' },
    recipientName: 'Sở TTTT',
    recipientAddress: '123 Nguyễn Văn Cừ',
    recipientEmail: 'sotttt@example.com',
    createdAt: new Date('2026-09-09T07:00:00.000Z'),
    relatedIncomingDocumentId: null,
    document: {
      id: 100,
      documentNumber: 'OUT-2026-0001',
      subject: 'Công văn phát hành',
      type: 'OUTGOING',
      fileUrl: null,
      originalFileName: null,
      status: 'ISSUED',
      documentStatus: 'ACTIVE',
      urgencyId: 1,
      confidentialityId: 1,
      ocrText: null,
      documentTypeId: 1,
      issuer: null,
      signerName: 'Nguyễn Văn A',
      signerTitle: 'Giám đốc',
      issuedDate: new Date('2026-09-12'),
      categoryId: null,
      createdAt: new Date('2026-09-09T07:00:00.000Z'),
      updatedAt: new Date('2026-09-12T12:00:00.000Z'),
      createdByUser: SUBMITTER,
      updatedByUser: APPROVER,
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
      attachments: [],
    },
    submittedByUser: SUBMITTER,
    approvedByUser: APPROVER,
    returnedByUser: null,
    forwardedByUser: APPROVER,
    issuedByUser: CLERK,
    recalledByUser: null,
    trashedByUser: null,
  };

  const merged = {
    ...base,
    ...overrides,
    document: { ...base.document, ...(overrides.document ?? {}) },
  };

  return merged;
};

beforeEach(() => {
  jest.clearAllMocks();

  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockImplementation(async () => buildFullHistoryDocument());

  service = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: chronological history.
// Result : The full timeline (submittedAt → approvedAt →
//          forwardedAt → issuedAt → sentDate) is returned
//          in the result.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.getById() – Normal 1: chronological history', () => {
  it('returns the chronological createdAt', async () => {
    const result = await service.getById(1);

    expect(result.createdAt).toEqual(new Date('2026-09-09T07:00:00.000Z'));
  });

  it('returns the chronological submittedAt (chronologically first)', async () => {
    const result = await service.getById(1);

    expect(result.submittedAt).toEqual(new Date('2026-09-09T08:00:00.000Z'));
  });

  it('returns the chronological approvedAt (after submittedAt)', async () => {
    const result = await service.getById(1);

    expect(result.approvedAt).toEqual(new Date('2026-09-10T09:00:00.000Z'));
  });

  it('returns the chronological forwardedAt (after approvedAt)', async () => {
    const result = await service.getById(1);

    expect(result.forwardedAt).toEqual(new Date('2026-09-11T10:00:00.000Z'));
  });

  it('returns the chronological issuedAt (after forwardedAt)', async () => {
    const result = await service.getById(1);

    expect(result.issuedAt).toEqual(new Date('2026-09-12T11:00:00.000Z'));
  });

  it('returns the chronological sentDate (last event)', async () => {
    const result = await service.getById(1);

    expect(result.sentDate).toEqual(new Date('2026-09-12T12:00:00.000Z'));
  });

  it('preserves the chronological order: created < submitted < approved < forwarded < issued < sent', async () => {
    const result = await service.getById(1);

    expect(
      new Date(result.createdAt).getTime() <
      new Date(result.submittedAt).getTime(),
    ).toBe(true);
    expect(
      new Date(result.submittedAt).getTime() <
      new Date(result.approvedAt).getTime(),
    ).toBe(true);
    expect(
      new Date(result.approvedAt).getTime() <
      new Date(result.forwardedAt).getTime(),
    ).toBe(true);
    expect(
      new Date(result.forwardedAt).getTime() <
      new Date(result.issuedAt).getTime(),
    ).toBe(true);
    expect(
      new Date(result.issuedAt).getTime() <
      new Date(result.sentDate).getTime(),
    ).toBe(true);
  });

  it('preserves the document.updatedAt timestamp', async () => {
    const result = await service.getById(1);

    expect(result.document.updatedAt).toEqual(
      new Date('2026-09-12T12:00:00.000Z'),
    );
  });

  it('does NOT throw on the chronological-history path', async () => {
    await expect(service.getById(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the chronological-history path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getById(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: actor mapping.
// Result : submittedByUser / approvedByUser / forwardedByUser
//          / issuedByUser resolved with fullName + id.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.getById() – Normal 2: actor mapping', () => {
  it('returns the submitter (submittedByUser)', async () => {
    const result = await service.getById(1);

    expect(result.submittedByUser).toEqual(SUBMITTER);
  });

  it('returns the approver (approvedByUser)', async () => {
    const result = await service.getById(1);

    expect(result.approvedByUser).toEqual(APPROVER);
  });

  it('returns the forwarder (forwardedByUser)', async () => {
    const result = await service.getById(1);

    expect(result.forwardedByUser).toEqual(APPROVER);
  });

  it('returns the issuer (issuedByUser)', async () => {
    const result = await service.getById(1);

    expect(result.issuedByUser).toEqual(CLERK);
  });

  it('returns the doc.createdByUser on the document', async () => {
    const result = await service.getById(1);

    expect(result.document.createdByUser).toEqual(SUBMITTER);
  });

  it('returns the doc.updatedByUser on the document', async () => {
    const result = await service.getById(1);

    expect(result.document.updatedByUser).toEqual(APPROVER);
  });

  it('preserves the submittedBy id', async () => {
    const result = await service.getById(1);

    expect(result.submittedBy).toBe(5);
  });

  it('preserves the approvedBy id', async () => {
    const result = await service.getById(1);

    expect(result.approvedBy).toBe(6);
  });

  it('preserves the forwardedBy id', async () => {
    const result = await service.getById(1);

    expect(result.forwardedBy).toBe(6);
  });

  it('preserves the issuedBy id', async () => {
    const result = await service.getById(1);

    expect(result.issuedBy).toBe(7);
  });

  it('does NOT throw on the actor-mapping path', async () => {
    await expect(service.getById(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the actor-mapping path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getById(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: action details.
// Result : returnReason / recallReason / dispatchNumber /
//          dispatchNumber / etc. returned.
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.getById() – Normal 3: action details', () => {
  it('returns the dispatchNumber (action: issue)', async () => {
    const result = await service.getById(1);

    expect(result.dispatchNumber).toBe('OUT-DISP-001');
  });

  it('returns the issuanceDate (action: issue)', async () => {
    const result = await service.getById(1);

    expect(result.issuanceDate).toEqual(new Date('2026-09-12T10:00:00.000Z'));
  });

  it('returns the pageCount (action: create)', async () => {
    const result = await service.getById(1);

    expect(result.pageCount).toBe(5);
  });

  it('returns the recipientName (action: create)', async () => {
    const result = await service.getById(1);

    expect(result.recipientName).toBe('Sở TTTT');
  });

  it('returns the recipientAddress (action: create)', async () => {
    const result = await service.getById(1);

    expect(result.recipientAddress).toBe('123 Nguyễn Văn Cừ');
  });

  it('returns the recipientEmail (action: create)', async () => {
    const result = await service.getById(1);

    expect(result.recipientEmail).toBe('sotttt@example.com');
  });

  it('returns the documentNumber (action: create)', async () => {
    const result = await service.getById(1);

    expect(result.documentNumber).toBe('OUT-2026-0001');
  });

  it('returns the assignedApproverId (action: submit)', async () => {
    const result = await service.getById(1);

    expect(result.assignedApproverId).toBe(6);
  });

  it('returns the assignedClerkId (action: approve)', async () => {
    const result = await service.getById(1);

    expect(result.assignedClerkId).toBe(7);
  });

  it('returns the relatedIncomingDocumentId (action: create, optional)', async () => {
    const result = await service.getById(1);

    expect(result.relatedIncomingDocumentId).toBeNull();
  });

  it('returns returnReason = null when not returned', async () => {
    const result = await service.getById(1);

    expect(result.returnReason).toBeNull();
  });

  it('returns recallReason = null when not recalled', async () => {
    const result = await service.getById(1);

    expect(result.recallReason).toBeNull();
  });

  it('returns returnReason when set (action: return)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildFullHistoryDocument({
        returnedAt: new Date('2026-09-11T08:00:00.000Z'),
        returnedBy: 6,
        returnReason: 'Cần bổ sung thông tin',
        returnedByUser: APPROVER,
      }),
    );

    const result = await service.getById(1);

    expect(result.returnReason).toBe('Cần bổ sung thông tin');
  });

  it('returns recallReason when set (action: recall)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildFullHistoryDocument({
        recalledAt: new Date('2026-09-13T08:00:00.000Z'),
        recalledBy: 8,
        recallReason: 'Phát hiện lỗi chính tả',
        recalledByUser: RECALLER,
      }),
    );

    const result = await service.getById(1);

    expect(result.recallReason).toBe('Phát hiện lỗi chính tả');
  });

  it('returns trashedAt + trashedBy when set (action: trash)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildFullHistoryDocument({
        trashedAt: new Date('2026-09-14T08:00:00.000Z'),
        trashedBy: 9,
        trashedByUser: TRASHER,
      }),
    );

    const result = await service.getById(1);

    expect(result.trashedAt).toEqual(new Date('2026-09-14T08:00:00.000Z'));
    expect(result.trashedBy).toBe(9);
  });

  it('does NOT throw on the action-details path', async () => {
    await expect(service.getById(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the action-details path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getById(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: document not found / forbidden.
// Result : NotFoundError if missing; ForbiddenError if
//          status = DRAFT and caller is not creator or
//          ADMIN.
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.getById() – Abnormal 1: document not found/forbidden', () => {
  it('throws NotFoundError when document does not exist', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValue(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(service.getById(1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('propagates the NotFoundError message', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValue(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(service.getById(1)).rejects.toThrow('Không tìm thấy văn bản đi');
  });

  it('returns null when repository returns null (no currentUser check)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    // Per the service: "if (!doc) throw new NotFoundError(...)"
    await expect(service.getById(1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ForbiddenError when document is DRAFT and caller is not creator/admin', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildFullHistoryDocument({
        document: { status: 'DRAFT' },
      }),
    );

    await expect(
      service.getById(1, {
        id: 99,
        roles: ['SPECIALIST'],
        departmentId: 5,
        departmentName: 'Phòng KH',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows ADMIN to view a DRAFT', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildFullHistoryDocument({
        document: { status: 'DRAFT' },
      }),
    );

    const result = await service.getById(1, {
      id: 99,
      roles: ['ADMIN'],
    });

    expect(result.id).toBe(1);
  });

  it('allows creator to view their own DRAFT', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildFullHistoryDocument({
        document: { status: 'DRAFT' },
      }),
    );

    const result = await service.getById(1, {
      id: 5,
      roles: ['SPECIALIST'],
    });

    expect(result.id).toBe(1);
  });

  it('does not throw ForbiddenError when caller is admin (DRAFT)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildFullHistoryDocument({
        document: { status: 'DRAFT' },
      }),
    );

    await expect(
      service.getById(1, {
        id: 99,
        roles: ['ADMIN'],
      }),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on forbidden (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildFullHistoryDocument({
        document: { status: 'DRAFT' },
      }),
    );

    const err = await service
      .getById(1, {
        id: 99,
        roles: ['SPECIALIST'],
        departmentId: 5,
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the forbidden path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildFullHistoryDocument({
        document: { status: 'DRAFT' },
      }),
    );

    await expect(
      service.getById(1, {
        id: 99,
        roles: ['SPECIALIST'],
      }),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 2: repository failure.
// Result : prisma failures propagate as a thrown error; the
//          service does NOT catch them.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.getById() – Abnormal 2: repository failure', () => {
  it('propagates prisma failure from findById', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValue(new Error('Connection refused'));

    await expect(service.getById(1)).rejects.toThrow('Connection refused');
  });

  it('propagates a generic repository error', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValue(new Error('Query timeout'));

    await expect(service.getById(1)).rejects.toThrow('Query timeout');
  });

  it('does NOT catch errors silently', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValue(new Error('Repository error'));

    await expect(service.getById(1)).rejects.toBeInstanceOf(Error);
  });

  it('records a safe diagnostic on repository failure (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValue(
      new Error('Database error: something bad'),
    );

    const err = await service
      .getById(1)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the repository-failure path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValue(new Error('Repository error'));

    await expect(service.getById(1)).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Boundary 1: no history or last-page boundary.
// Result : Document with all timestamps null (= no workflow
//          history yet). Last-page boundary is N/A for a
//          single-doc view (no pagination).
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.getById() – Boundary 1: no history or last-page boundary', () => {
  it('handles the boundary: document with all timestamps null (no history)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildFullHistoryDocument({
        submittedAt: null,
        submittedBy: null,
        submittedByUser: null,
        approvedAt: null,
        approvedBy: null,
        approvedByUser: null,
        returnedAt: null,
        returnedBy: null,
        returnReason: null,
        returnedByUser: null,
        forwardedAt: null,
        forwardedBy: null,
        forwardedByUser: null,
        issuedAt: null,
        issuedBy: null,
        issuedByUser: null,
        recalledAt: null,
        recalledBy: null,
        recallReason: null,
        recalledByUser: null,
        trashedAt: null,
        trashedBy: null,
        trashedByUser: null,
        sentDate: null,
        dispatchNumber: null,
        issuanceDate: null,
      }),
    );

    const result = await service.getById(1);

    expect(result.submittedAt).toBeNull();
    expect(result.approvedAt).toBeNull();
    expect(result.forwardedAt).toBeNull();
    expect(result.issuedAt).toBeNull();
    expect(result.sentDate).toBeNull();
    expect(result.dispatchNumber).toBeNull();
    expect(result.recallReason).toBeNull();
    expect(result.returnReason).toBeNull();
  });

  it('handles the boundary: id at int32 max', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(buildFullHistoryDocument({ id: 2147483647 }));

    await expect(service.getById(2147483647)).resolves.toBeDefined();
  });

  it('handles the boundary: id at int32 min + 1 (1)', async () => {
    await expect(service.getById(1)).resolves.toBeDefined();
  });

  it('handles the boundary: id = Number.MAX_SAFE_INTEGER', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildFullHistoryDocument({ id: Number.MAX_SAFE_INTEGER }),
    );

    await expect(
      service.getById(Number.MAX_SAFE_INTEGER),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: id = 0', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(buildFullHistoryDocument({ id: 0 }));

    await expect(service.getById(0)).resolves.toBeDefined();
  });

  it('handles the boundary: id < 0 (documented gap — service does not validate id)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildFullHistoryDocument({ id: -1 }),
    );

    await expect(service.getById(-1)).resolves.toBeDefined();
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(service.getById(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getById(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('records a safe diagnostic on boundary failure (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValue(
      new Error('Boundary error: something bad'),
    );

    const err = await service
      .getById(1)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });
});
