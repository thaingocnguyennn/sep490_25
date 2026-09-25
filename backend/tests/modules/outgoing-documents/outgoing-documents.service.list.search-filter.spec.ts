/**
 * Unit tests for OutgoingDocumentsService.list() — Function49 /
 * Search and Filter Outgoing Document.
 *
 * Note on naming: the matrix headers reference
 * `OutgoingDocumentQueryService`, but the actual implementation
 * that lists outgoing documents is
 * `OutgoingDocumentsService.list(params)`. The service is a
 * thin delegate: it just forwards the params to
 * `outgoingDocumentsRepository.findAll(params)`. The repository
 * is where the role scope, the auth OR, and the search OR get
 * applied.
 *
 * Step-by-step:
 *   1. The service receives `{ page, limit, search, status,
 *      urgency, documentType, documentTypeId, documentBookId,
 *      dateFrom, dateTo, confidentialityLevel, departmentId,
 *      currentUser }`.
 *   2. It calls `outgoingDocumentsRepository.findAll(params)`
 *      and returns the result verbatim.
 *   3. The repository:
 *      a. Defaults to `documentStatus=ACTIVE` and skips
 *         TRASHED unless `includeTrashed`.
 *      b. If `currentUser` is supplied, builds an auth OR
 *         filter based on the caller's role(s).
 *      c. Adds search OR (over dispatchNumber, subject,
 *         documentNumber, ocrText, signerName, recipientName).
 *      d. Applies status / urgency / documentTypeId /
 *         documentBookId / dateFrom/dateTo /
 *         confidentialityLevel / departmentId filters.
 *      e. Returns `{ items, total }`.
 *
 * Important: the service does NOT do any search / filter
 * logic. It's a pure delegation. All the search / filter
 * behavior lives in the repository. This spec verifies that
 * the right params are forwarded and the result is
 * preserved.
 *
 * Coverage matrix (UTCID01 – UTCID09):
 *   UTCID01  N  – Keyword: search forwards to repo, OR
 *                 applies on dispatchNumber / subject /
 *                 documentNumber / ocrText / signerName /
 *                 recipientName.
 *   UTCID02  N  – Status / date: status + dateFrom / dateTo
 *                 forward to repo.
 *   UTCID03  N  – Agency / type: departmentId +
 *                 documentTypeId / urgency / confidentiality
 *                 forward to repo.
 *   UTCID04  N  – Combined pagination: page + limit
 *                 forward to repo; combined with all filters.
 *   UTCID05  N  – Response-to-database consistency: items +
 *                 total reflect the underlying groups.
 *   UTCID06  A  – Invalid filter / range: invalid status,
 *                 invalid date, invalid agency / type.
 *   UTCID07  A  – Unauthorized / repository failure: no
 *                 role / prisma failure propagates.
 *   UTCID08  B  – Equal date range or last page: equal
 *                 dateFrom / dateTo; last page returns
 *                 empty items.
 *   UTCID09  B  – Upper-bound value: very wide date range;
 *                 very large department id; very long search.
 */

import { OutgoingDocumentsService } from '../../../src/modules/outgoing-documents/outgoing-documents.service';
import { outgoingDocumentsRepository } from '../../../src/modules/outgoing-documents/outgoing-documents.repository';

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

const SAMPLE_OUTGOING_ITEM: any = {
  id: 1,
  documentId: 100,
  documentNumber: 'OUT-2026-0001',
  dispatchNumber: 'OUT-DISP-001',
  issuanceDate: new Date('2026-09-12'),
  pageCount: 5,
  submittedAt: new Date('2026-09-10'),
  submittedBy: 5,
  approvedAt: new Date('2026-09-11'),
  approvedBy: 6,
  issuedAt: new Date('2026-09-12'),
  issuedBy: 7,
  sentDate: null,
  returnedAt: null,
  returnedBy: null,
  returnReason: null,
  forwardedAt: null,
  forwardedBy: null,
  recalledAt: null,
  recalledBy: null,
  recallReason: null,
  trashedAt: null,
  trashedBy: null,
  assignedApproverId: 6,
  assignedClerkId: 7,
  documentBookId: 1,
  documentBook: { id: 1, name: 'Sổ văn bản đi 2026' },
  recipientName: 'Sở TTTT',
  recipientAddress: '123 Nguyễn Văn Cừ',
  recipientEmail: 'sotttt@example.com',
  createdAt: new Date('2026-09-09'),
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
    ocrText: 'Nội dung OCR',
    documentTypeId: 1,
    issuer: null,
    signerName: 'Nguyễn Văn A',
    signerTitle: 'Giám đốc',
    issuedDate: new Date('2026-09-12'),
    categoryId: 1,
    createdAt: new Date('2026-09-09'),
    updatedAt: new Date('2026-09-09'),
    createdByUser: { id: 5, fullName: 'Lê Văn Submitter' },
    updatedByUser: { id: 6, fullName: 'Trần Văn Approver' },
    department: { id: 1, name: 'Phòng Hành chính' },
    confidentiality: { id: 1, code: 'B', name: 'Mật', description: 'Văn bản mật' },
    urgency: { id: 1, name: 'THUONG', description: 'Thường' },
    documentTypeRef: { id: 1, name: 'Công văn' },
    category: { id: 1, name: 'Hành chính' },
    attachments: [],
  },
  submittedByUser: { id: 5, fullName: 'Lê Văn Submitter' },
  approvedByUser: { id: 6, fullName: 'Trần Văn Approver' },
  issuedByUser: { id: 7, fullName: 'Phạm Thị Clerk' },
  returnedByUser: null,
  forwardedByUser: null,
  recalledByUser: null,
  trashedByUser: null,
};

beforeEach(() => {
  jest.clearAllMocks();

  mockedRepo.findAll.mockReset();
  mockedRepo.findAll.mockImplementation(async (params: any) => ({
    items: [SAMPLE_OUTGOING_ITEM],
    total: 1,
  }));

  service = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: keyword.
// Result : Search forwards to repo, OR applies on
//          dispatchNumber / subject / documentNumber /
//          ocrText / signerName / recipientName.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.list() – Normal 1: keyword', () => {
  it('forwards the search keyword to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: 'OUT-DISP-001',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'OUT-DISP-001',
      }),
    );
  });

  it('forwards a subject keyword', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: 'Công văn phát hành',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'Công văn phát hành',
      }),
    );
  });

  it('forwards a recipient keyword (recipientName)', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: 'Sở TTTT',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'Sở TTTT',
      }),
    );
  });

  it('forwards case-insensitive search (lowercase)', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: 'out-disp-001',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'out-disp-001',
      }),
    );
  });

  it('returns items that match the keyword search', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
      search: 'OUT-DISP-001',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].dispatchNumber).toBe('OUT-DISP-001');
  });

  it('does NOT throw on the keyword path', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
        search: 'OUT-DISP-001',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the keyword path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
      search: 'OUT-DISP-001',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: status/date.
// Result : status + dateFrom / dateTo forward to repo.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.list() – Normal 2: status/date', () => {
  it('forwards status filter to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      status: 'ISSUED',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ISSUED',
      }),
    );
  });

  it('forwards dateFrom filter to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      dateFrom: '2026-01-01T00:00:00.000Z',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: '2026-01-01T00:00:00.000Z',
      }),
    );
  });

  it('forwards dateTo filter to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      dateTo: '2026-12-31T23:59:59.999Z',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        dateTo: '2026-12-31T23:59:59.999Z',
      }),
    );
  });

  it('forwards status + dateFrom + dateTo together', async () => {
    await service.list({
      page: 1,
      limit: 10,
      status: 'ISSUED',
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: '2026-12-31T23:59:59.999Z',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ISSUED',
        dateFrom: '2026-01-01T00:00:00.000Z',
        dateTo: '2026-12-31T23:59:59.999Z',
      }),
    );
  });

  it('returns items that match the status/date filter', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
      status: 'ISSUED',
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: '2026-12-31T23:59:59.999Z',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].document.status).toBe('ISSUED');
  });

  it('does NOT throw on the status/date path', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
        status: 'ISSUED',
        dateFrom: '2026-01-01T00:00:00.000Z',
        dateTo: '2026-12-31T23:59:59.999Z',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the status/date path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
      status: 'ISSUED',
      dateFrom: '2026-01-01T00:00:00.000Z',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: agency/type.
// Result : departmentId + documentTypeId / urgency /
//          confidentiality forward to repo.
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.list() – Normal 3: agency/type', () => {
  it('forwards departmentId to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      departmentId: 1,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentId: 1,
      }),
    );
  });

  it('forwards documentTypeId to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      documentTypeId: 1,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        documentTypeId: 1,
      }),
    );
  });

  it('forwards urgency to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      urgency: 'THUONG',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        urgency: 'THUONG',
      }),
    );
  });

  it('forwards confidentialityLevel to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      confidentialityLevel: 'B',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        confidentialityLevel: 'B',
      }),
    );
  });

  it('forwards documentBookId to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      documentBookId: 1,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        documentBookId: 1,
      }),
    );
  });

  it('returns items that match the agency/type filter', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
      departmentId: 1,
      documentTypeId: 1,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].document.department.id).toBe(1);
  });

  it('does NOT throw on the agency/type path', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
        departmentId: 1,
        documentTypeId: 1,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the agency/type path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
      departmentId: 1,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: combined pagination.
// Result : page + limit forward to repo; combined with all
//          filters.
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.list() – Normal 4: combined pagination', () => {
  it('forwards page + limit to the repository', async () => {
    await service.list({
      page: 2,
      limit: 25,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 25,
      }),
    );
  });

  it('forwards page + limit + search + status', async () => {
    await service.list({
      page: 2,
      limit: 25,
      search: 'OUT-DISP-001',
      status: 'ISSUED',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 25,
        search: 'OUT-DISP-001',
        status: 'ISSUED',
      }),
    );
  });

  it('forwards page + limit + all filters together', async () => {
    await service.list({
      page: 3,
      limit: 50,
      search: 'Công văn',
      status: 'ISSUED',
      urgency: 'THUONG',
      documentTypeId: 1,
      documentBookId: 1,
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: '2026-12-31T23:59:59.999Z',
      confidentialityLevel: 'B',
      departmentId: 1,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 3,
        limit: 50,
        search: 'Công văn',
        status: 'ISSUED',
        urgency: 'THUONG',
        documentTypeId: 1,
        documentBookId: 1,
        dateFrom: '2026-01-01T00:00:00.000Z',
        dateTo: '2026-12-31T23:59:59.999Z',
        confidentialityLevel: 'B',
        departmentId: 1,
      }),
    );
  });

  it('returns items + total for the combined-pagination path', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [SAMPLE_OUTGOING_ITEM],
      total: 100,
    });

    const result = await service.list({
      page: 2,
      limit: 25,
      search: 'Công văn',
    });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(100);
  });

  it('does NOT throw on the combined-pagination path', async () => {
    await expect(
      service.list({
        page: 2,
        limit: 25,
        search: 'Công văn',
        status: 'ISSUED',
        departmentId: 1,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the combined-pagination path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 2,
      limit: 25,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency for
// and Filter Outgoing Document including identifiers,
// status, date, agency and type.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.list() – Normal 5: response-to-database consistency', () => {
  it('preserves the items array from the repository', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(1);
  });

  it('preserves the total from the repository', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [SAMPLE_OUTGOING_ITEM],
      total: 99,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(result.total).toBe(99);
  });

  it('preserves the documentNumber on the item', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(result.items[0].documentNumber).toBe('OUT-2026-0001');
  });

  it('preserves the dispatchNumber on the item', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(result.items[0].dispatchNumber).toBe('OUT-DISP-001');
  });

  it('preserves the status on the document', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(result.items[0].document.status).toBe('ISSUED');
  });

  it('preserves the subject on the document', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(result.items[0].document.subject).toBe('Công văn phát hành');
  });

  it('preserves the department on the document', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(result.items[0].document.department.name).toBe('Phòng Hành chính');
  });

  it('preserves the documentType on the document', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(result.items[0].document.documentTypeRef.name).toBe('Công văn');
  });

  it('does NOT throw on the consistency path', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the consistency path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: invalid filter/range.
// Result : Invalid status, invalid date, invalid agency /
//          type are forwarded to the repository (validation
//          happens at the route layer; the service is
//          permissive).
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.list() – Abnormal 1: invalid filter/range', () => {
  it('forwards an invalid status to the repository (route validation only)', async () => {
    await service.list({
      page: 1,
      limit: 10,
      status: 'INVALID_STATUS' as any,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'INVALID_STATUS',
      }),
    );
  });

  it('forwards an invalid urgency to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      urgency: 'INVALID_URGENCY' as any,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        urgency: 'INVALID_URGENCY',
      }),
    );
  });

  it('forwards an invalid confidentialityLevel to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      confidentialityLevel: 'X' as any,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        confidentialityLevel: 'X',
      }),
    );
  });

  it('forwards an invalid dateFrom to the repository (NaN date)', async () => {
    await service.list({
      page: 1,
      limit: 10,
      dateFrom: 'not-a-date',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: 'not-a-date',
      }),
    );
  });

  it('forwards an invalid dateTo to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      dateTo: 'not-a-date',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        dateTo: 'not-a-date',
      }),
    );
  });

  it('forwards an invalid documentTypeId to the repository (negative)', async () => {
    await service.list({
      page: 1,
      limit: 10,
      documentTypeId: -1,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        documentTypeId: -1,
      }),
    );
  });

  it('forwards an invalid departmentId to the repository (zero)', async () => {
    await service.list({
      page: 1,
      limit: 10,
      departmentId: 0,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentId: 0,
      }),
    );
  });

  it('does NOT throw on invalid filter/range (documented gap)', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
        status: 'INVALID_STATUS' as any,
        urgency: 'INVALID_URGENCY' as any,
        dateFrom: 'not-a-date',
        dateTo: 'not-a-date',
      }),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on invalid filter (no password / hash leak)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(
      new Error('Invalid filter: something bad'),
    );

    const err = await service
      .list({
        page: 1,
        limit: 10,
        status: 'INVALID_STATUS' as any,
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the invalid-filter path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
      status: 'INVALID_STATUS' as any,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: unauthorized/repository failure.
// Result : Prisma failures propagate as a thrown error; no
//          role / unauthorized caller triggers `id = -1`
//          in the repository.
// ---------------------------------------------------------------------------
describe('[UTCID07] outgoingDocumentsService.list() – Abnormal 2: unauthorized/repository failure', () => {
  it('propagates prisma failure from the repository', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(
      new Error('Connection refused'),
    );

    await expect(
      service.list({
        page: 1,
        limit: 10,
      }),
    ).rejects.toThrow('Connection refused');
  });

  it('propagates a repository error', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(new Error('Repository error'));

    await expect(
      service.list({
        page: 1,
        limit: 10,
      }),
    ).rejects.toThrow('Repository error');
  });

  it('does NOT catch errors silently', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(new Error('Repository error'));

    await expect(
      service.list({
        page: 1,
        limit: 10,
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('forwards the currentUser to the repository for auth filter', async () => {
    await service.list({
      page: 1,
      limit: 10,
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
        departmentId: 1,
        departmentName: 'Phòng Hành chính',
      },
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        currentUser: expect.objectContaining({
          id: 5,
          roles: ['SPECIALIST'],
        }),
      }),
    );
  });

  it('records a safe diagnostic on repository failure (no password / hash leak)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(
      new Error('Query failure: something bad'),
    );

    const err = await service
      .list({
        page: 1,
        limit: 10,
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the unauthorized path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(new Error('Repository error'));

    await expect(
      service.list({
        page: 1,
        limit: 10,
      }),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: equal date range or last page.
// Result : Equal dateFrom / dateTo produces a same-day
//          filter; last page returns empty items.
// ---------------------------------------------------------------------------
describe('[UTCID08] outgoingDocumentsService.list() – Boundary 1: equal date range or last page', () => {
  it('forwards equal dateFrom / dateTo (same-day period)', async () => {
    await service.list({
      page: 1,
      limit: 10,
      dateFrom: '2026-09-12T00:00:00.000Z',
      dateTo: '2026-09-12T23:59:59.999Z',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: '2026-09-12T00:00:00.000Z',
        dateTo: '2026-09-12T23:59:59.999Z',
      }),
    );
  });

  it('returns empty items on the last page (page past total)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 50,
    });

    const result = await service.list({
      page: 100,
      limit: 10,
    });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(50);
  });

  it('returns the last page with partial items', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [SAMPLE_OUTGOING_ITEM],
      total: 100,
    });

    const result = await service.list({
      page: 10,
      limit: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(100);
  });

  it('forwards page=1 / limit=1 (smallest page size)', async () => {
    await service.list({
      page: 1,
      limit: 1,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 1,
      }),
    );
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
        dateFrom: '2026-09-12T00:00:00.000Z',
        dateTo: '2026-09-12T23:59:59.999Z',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
      dateFrom: '2026-09-12T00:00:00.000Z',
      dateTo: '2026-09-12T23:59:59.999Z',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('records a safe diagnostic on boundary failure (no password / hash leak)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(
      new Error('Boundary error: something bad'),
    );

    const err = await service
      .list({
        page: 1,
        limit: 10,
        dateFrom: '2026-09-12T00:00:00.000Z',
        dateTo: '2026-09-12T23:59:59.999Z',
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 2: upper-bound value just at the supported
// limit for Search and Filter Outgoing Document.
// Result : Very wide date range; very large department id;
//          very long search.
// ---------------------------------------------------------------------------
describe('[UTCID09] outgoingDocumentsService.list() – Boundary 2: upper-bound value', () => {
  it('accepts the upper-bound: very wide date range', async () => {
    await service.list({
      page: 1,
      limit: 10,
      dateFrom: '1970-01-01T00:00:00.000Z',
      dateTo: '2099-12-31T23:59:59.999Z',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: '1970-01-01T00:00:00.000Z',
        dateTo: '2099-12-31T23:59:59.999Z',
      }),
    );
  });

  it('accepts the upper-bound: very large departmentId', async () => {
    await service.list({
      page: 1,
      limit: 10,
      departmentId: Number.MAX_SAFE_INTEGER,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentId: Number.MAX_SAFE_INTEGER,
      }),
    );
  });

  it('accepts the upper-bound: very large documentTypeId', async () => {
    await service.list({
      page: 1,
      limit: 10,
      documentTypeId: Number.MAX_SAFE_INTEGER,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        documentTypeId: Number.MAX_SAFE_INTEGER,
      }),
    );
  });

  it('accepts the upper-bound: very large documentBookId', async () => {
    await service.list({
      page: 1,
      limit: 10,
      documentBookId: Number.MAX_SAFE_INTEGER,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        documentBookId: Number.MAX_SAFE_INTEGER,
      }),
    );
  });

  it('accepts the upper-bound: very long search (1 KB)', async () => {
    const longSearch = 'A'.repeat(1_000);

    await service.list({
      page: 1,
      limit: 10,
      search: longSearch,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: longSearch,
      }),
    );
  });

  it('accepts the upper-bound: very long search (1 MB)', async () => {
    const longSearch = 'A'.repeat(1_000_000);

    await expect(
      service.list({
        page: 1,
        limit: 10,
        search: longSearch,
      }),
    ).resolves.toBeDefined();
  });

  it('forwards page=Number.MAX_SAFE_INTEGER / limit=Number.MAX_SAFE_INTEGER', async () => {
    await service.list({
      page: Number.MAX_SAFE_INTEGER,
      limit: Number.MAX_SAFE_INTEGER,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: Number.MAX_SAFE_INTEGER,
        limit: Number.MAX_SAFE_INTEGER,
      }),
    );
  });

  it('does NOT throw on the upper-bound path', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
        dateFrom: '1970-01-01T00:00:00.000Z',
        dateTo: '2099-12-31T23:59:59.999Z',
        departmentId: Number.MAX_SAFE_INTEGER,
        search: 'A'.repeat(1_000_000),
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the upper-bound path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
      dateFrom: '1970-01-01T00:00:00.000Z',
      dateTo: '2099-12-31T23:59:59.999Z',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
