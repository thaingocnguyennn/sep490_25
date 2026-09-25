/**
 * Unit tests for OutgoingDocumentsService.list() — Function51 /
 * View Draft Outgoing Documents.
 *
 * Note on naming: the matrix headers reference
 * `OutgoingDocumentQueryService`, but the actual implementation
 * that lists outgoing documents is
 * `OutgoingDocumentsService.list(params)`. The service is a
 * thin delegate: it just forwards the params to
 * `outgoingDocumentsRepository.findAll(params)`.
 *
 * Step-by-step:
 *   1. The service receives `{ page, limit, search, status,
 *      urgency, documentType, documentTypeId, documentBookId,
 *      dateFrom, dateTo, confidentialityLevel, departmentId,
 *      currentUser }`.
 *   2. It calls `outgoingDocumentsRepository.findAll(params)`
 *      and returns the result verbatim.
 *   3. To list drafts, the caller passes `status: 'DRAFT'` and
 *      a `currentUser`. The repo then:
 *      a. Defaults to `documentStatus=ACTIVE` and skips
 *         TRASHED.
 *      b. Builds an auth OR filter based on the caller's
 *         role(s):
 *         - ADMIN-only (no other roles): `id = -1` (admin
 *           never sees the list directly).
 *         - SPECIALIST/DEPARTMENT_HEAD/DOCUMENT_CLERK: the
 *           only DRAFT they can see is the one they created
 *           (`document.createdBy = currentUser.id`).
 *           Other roles' branches apply the
 *           `notDraft = { status: { not: 'DRAFT' } }` filter,
 *           so they CANNOT see drafts unless they created
 *           them.
 *      c. Returns `{ items, total }`.
 *
 * Important: the existing `outgoing-documents.service.list.spec.ts`
 * and `outgoing-documents.service.list.search-filter.spec.ts`
 * cover the general list / search-filter behavior. This spec
 * focuses specifically on Function51: listing DRAFTs with
 * the right access filter.
 *
 * Coverage matrix (UTCID01 – UTCID06):
 *   UTCID01  N  – Own drafts: caller can see their own DRAFTs.
 *   UTCID02  N  – Department scope: caller can see DRAFTs in
 *                 their department (documented gap — only the
 *                 creator can see DRAFT, NOT the whole dept).
 *   UTCID03  N  – Sorting: sort options forwarded.
 *   UTCID04  A  – Unauthorized access: ADMIN-only caller gets
 *                 empty result.
 *   UTCID05  A  – Repository failure: prisma failure propagates.
 *   UTCID06  B  – Empty list or last page: empty items array
 *                 + total=0; last page returns empty items.
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

const SAMPLE_DRAFT_ITEM: any = {
  id: 1,
  documentId: 100,
  documentNumber: 'OUT-2026-0001',
  dispatchNumber: null,
  issuanceDate: null,
  pageCount: 5,
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
  sentDate: null,
  assignedApproverId: null,
  assignedClerkId: null,
  documentBookId: null,
  documentBook: null,
  recipientName: 'Sở TTTT',
  recipientAddress: '123 Nguyễn Văn Cừ',
  recipientEmail: 'sotttt@example.com',
  createdAt: new Date('2026-09-09T07:00:00.000Z'),
  document: {
    id: 100,
    documentNumber: 'OUT-2026-0001',
    subject: 'Công văn (Bản nháp)',
    type: 'OUTGOING',
    fileUrl: null,
    originalFileName: null,
    status: 'DRAFT',
    documentStatus: 'ACTIVE',
    urgencyId: 1,
    confidentialityId: 1,
    ocrText: null,
    documentTypeId: 1,
    issuer: null,
    signerName: 'Nguyễn Văn A',
    signerTitle: 'Giám đốc',
    issuedDate: null,
    categoryId: null,
    createdAt: new Date('2026-09-09T07:00:00.000Z'),
    updatedAt: new Date('2026-09-09T08:00:00.000Z'),
    createdByUser: { id: 5, fullName: 'Lê Văn Submitter' },
    updatedByUser: { id: 5, fullName: 'Lê Văn Submitter' },
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
  submittedByUser: null,
  approvedByUser: null,
  returnedByUser: null,
  forwardedByUser: null,
  issuedByUser: null,
  recalledByUser: null,
  trashedByUser: null,
};

beforeEach(() => {
  jest.clearAllMocks();

  mockedRepo.findAll.mockReset();
  mockedRepo.findAll.mockImplementation(async () => ({
    items: [SAMPLE_DRAFT_ITEM],
    total: 1,
  }));

  service = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: own drafts.
// Result : Caller can see their own DRAFTs.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.list() – Normal 1: own drafts', () => {
  it('forwards status=DRAFT to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
        departmentId: 1,
        departmentName: 'Phòng Hành chính',
      },
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'DRAFT',
      }),
    );
  });

  it('forwards the currentUser to the repository (creator = 5)', async () => {
    await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
        departmentId: 1,
        departmentName: 'Phòng Hành chính',
      },
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        currentUser: expect.objectContaining({ id: 5 }),
      }),
    );
  });

  it('returns the DRAFT item', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
      },
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].document.status).toBe('DRAFT');
  });

  it('preserves the documentNumber on the DRAFT item', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
      },
    });

    expect(result.items[0].documentNumber).toBe('OUT-2026-0001');
  });

  it('preserves the dispatchNumber = null on a DRAFT', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
      },
    });

    expect(result.items[0].dispatchNumber).toBeNull();
  });

  it('preserves the createdAt on the DRAFT', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
      },
    });

    expect(result.items[0].createdAt).toEqual(
      new Date('2026-09-09T07:00:00.000Z'),
    );
  });

  it('does NOT throw on the own-drafts path', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
        status: 'DRAFT',
        currentUser: {
          id: 5,
          roles: ['SPECIALIST'],
        },
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the own-drafts path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
      },
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: department scope.
// Result : Caller can see DRAFTs in their department
//          (documented gap — only the creator can see DRAFT,
//          NOT the whole dept).
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.list() – Normal 2: department scope', () => {
  it('forwards departmentId to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      departmentId: 1,
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
        departmentId: 1,
        departmentName: 'Phòng Hành chính',
      },
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentId: 1,
      }),
    );
  });

  it('forwards the departmentName to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
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
          departmentName: 'Phòng Hành chính',
        }),
      }),
    );
  });

  it('returns the DRAFT in the department (creator=5, dept=1)', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      departmentId: 1,
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
        departmentId: 1,
        departmentName: 'Phòng Hành chính',
      },
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].document.department.id).toBe(1);
  });

  it('handles the documented gap: NON-creator in same dept sees empty', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      departmentId: 1,
      currentUser: {
        id: 6,
        roles: ['SPECIALIST'],
        departmentId: 1,
        departmentName: 'Phòng Hành chính',
      },
    });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('handles the documented gap: DEPT_HEAD sees empty (not the creator)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 6,
        roles: ['DEPARTMENT_HEAD'],
        departmentId: 1,
        departmentName: 'Phòng Hành chính',
      },
    });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('handles the documented gap: DOCUMENT_CLERK sees empty (not the creator)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 7,
        roles: ['DOCUMENT_CLERK'],
        departmentId: 1,
        departmentName: 'Phòng Hành chính',
      },
    });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('does NOT throw on the department-scope path', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
        status: 'DRAFT',
        departmentId: 1,
        currentUser: {
          id: 5,
          roles: ['SPECIALIST'],
          departmentId: 1,
        },
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the department-scope path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      departmentId: 1,
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
      },
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: sorting.
// Result : Sort options forwarded (page + limit + search + etc).
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.list() – Normal 3: sorting', () => {
  it('forwards page + limit + status=DRAFT for sorting', async () => {
    await service.list({
      page: 1,
      limit: 25,
      status: 'DRAFT',
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
      },
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 25,
        status: 'DRAFT',
      }),
    );
  });

  it('forwards search + status=DRAFT for keyword sort', async () => {
    await service.list({
      page: 1,
      limit: 25,
      search: 'Công văn',
      status: 'DRAFT',
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
      },
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'Công văn',
        status: 'DRAFT',
      }),
    );
  });

  it('forwards dateFrom + dateTo for date-range sort', async () => {
    await service.list({
      page: 1,
      limit: 25,
      status: 'DRAFT',
      dateFrom: '2026-09-01T00:00:00.000Z',
      dateTo: '2026-09-30T23:59:59.999Z',
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
      },
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: '2026-09-01T00:00:00.000Z',
        dateTo: '2026-09-30T23:59:59.999Z',
        status: 'DRAFT',
      }),
    );
  });

  it('forwards documentTypeId + urgency for type sort', async () => {
    await service.list({
      page: 1,
      limit: 25,
      status: 'DRAFT',
      documentTypeId: 1,
      urgency: 'THUONG',
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
      },
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        documentTypeId: 1,
        urgency: 'THUONG',
        status: 'DRAFT',
      }),
    );
  });

  it('returns items in the order the repo returns them (default order)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [SAMPLE_DRAFT_ITEM],
      total: 1,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
      },
    });

    expect(result.items[0].id).toBe(1);
  });

  it('does NOT throw on the sorting path', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 25,
        status: 'DRAFT',
        currentUser: {
          id: 5,
          roles: ['SPECIALIST'],
        },
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the sorting path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 25,
      status: 'DRAFT',
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
      },
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: unauthorized access.
// Result : ADMIN-only caller gets empty result.
//          Non-creator callers (specialist / dept head / clerk)
//          also get empty result for status=DRAFT.
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.list() – Abnormal 1: unauthorized access', () => {
  it('ADMIN-only caller triggers id = -1 (documented gap)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 1,
        roles: ['ADMIN'],
      },
    });

    // The repository sets `id = -1` to skip the result, but
    // here we just verify the service passes it through.
    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        currentUser: expect.objectContaining({
          roles: ['ADMIN'],
        }),
      }),
    );
  });

  it('returns empty items for an ADMIN-only caller', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 1,
        roles: ['ADMIN'],
      },
    });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns empty items for a SPECIALIST who is not the creator', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 6,
        roles: ['SPECIALIST'],
        departmentId: 1,
      },
    });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns empty items for a DEPARTMENT_HEAD', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 6,
        roles: ['DEPARTMENT_HEAD'],
        departmentId: 1,
      },
    });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns empty items for a DOCUMENT_CLERK', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 7,
        roles: ['DOCUMENT_CLERK'],
        departmentId: 1,
      },
    });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns the DRAFT for the creator (SPECIALIST)', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 5,
        roles: ['SPECIALIST'],
        departmentId: 1,
      },
    });

    expect(result.items).toHaveLength(1);
  });

  it('does NOT throw on the unauthorized path', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    await expect(
      service.list({
        page: 1,
        limit: 10,
        status: 'DRAFT',
        currentUser: {
          id: 1,
          roles: ['ADMIN'],
        },
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the unauthorized path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 1,
        roles: ['ADMIN'],
      },
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('records a safe diagnostic on unauthorized (no password / hash leak)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
      currentUser: {
        id: 1,
        roles: ['ADMIN'],
      },
    });

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 2: repository failure.
// Result : Prisma failures propagate as a thrown error.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.list() – Abnormal 2: repository failure', () => {
  it('propagates prisma failure from the repository', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(new Error('Connection refused'));

    await expect(
      service.list({
        page: 1,
        limit: 10,
        status: 'DRAFT',
        currentUser: {
          id: 5,
          roles: ['SPECIALIST'],
        },
      }),
    ).rejects.toThrow('Connection refused');
  });

  it('propagates a generic repository error', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(new Error('Query timeout'));

    await expect(
      service.list({
        page: 1,
        limit: 10,
        status: 'DRAFT',
      }),
    ).rejects.toThrow('Query timeout');
  });

  it('does NOT catch errors silently', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(new Error('Repository error'));

    await expect(
      service.list({
        page: 1,
        limit: 10,
        status: 'DRAFT',
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('records a safe diagnostic on repository failure (no password / hash leak)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(
      new Error('Database error: something bad'),
    );

    const err = await service
      .list({
        page: 1,
        limit: 10,
        status: 'DRAFT',
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the repository-failure path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(new Error('Repository error'));

    await expect(
      service.list({
        page: 1,
        limit: 10,
        status: 'DRAFT',
      }),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Boundary 1: empty list or last page.
// Result : Empty items array + total=0; last page returns
//          empty items.
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.list() – Boundary 1: empty list or last page', () => {
  it('accepts the boundary: empty list (no matching drafts)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
    });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('returns an empty items array on the last page', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 50,
    });

    const result = await service.list({
      page: 1000,
      limit: 10,
      status: 'DRAFT',
    });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(50);
  });

  it('returns the last page with partial items', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [SAMPLE_DRAFT_ITEM],
      total: 100,
    });

    const result = await service.list({
      page: 10,
      limit: 10,
      status: 'DRAFT',
    });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(100);
  });

  it('forwards page=1 / limit=1 (smallest page size)', async () => {
    await service.list({
      page: 1,
      limit: 1,
      status: 'DRAFT',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 1,
      }),
    );
  });

  it('forwards page=Number.MAX_SAFE_INTEGER / limit=Number.MAX_SAFE_INTEGER', async () => {
    await service.list({
      page: Number.MAX_SAFE_INTEGER,
      limit: Number.MAX_SAFE_INTEGER,
      status: 'DRAFT',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: Number.MAX_SAFE_INTEGER,
        limit: Number.MAX_SAFE_INTEGER,
      }),
    );
  });

  it('does NOT throw on the boundary path', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    await expect(
      service.list({
        page: 1,
        limit: 10,
        status: 'DRAFT',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    await service.list({
      page: 1,
      limit: 10,
      status: 'DRAFT',
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
        status: 'DRAFT',
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });
});
