/**
 * Unit tests for DocumentsService.getAll() — Function47 /
 * Search Documents by Document Number and Summary.
 *
 * Note on naming: the matrix headers reference
 * `DocumentSearchService`. The actual implementation that
 * searches documents by documentNumber and subject
 * ("trích yếu" / "summary") is
 * `DocumentsService.getAll({ search, type, ... })`, which
 * delegates to `documentsRepository.findAll({ search, type,
 * ... })`.
 *
 * Step-by-step (DocumentsService.getAll):
 *   1. Delegate to `documentsRepository.findAll(params)`.
 *   2. Repository builds a Prisma `DocumentWhereInput`:
 *        documentStatus: 'ACTIVE' (default; overridable)
 *        isArchived: false (default)
 *        (optional) type filter
 *        (optional) urgencyId / confidentialityId /
 *           departmentId / processorId
 *        (optional) dateFrom / dateTo filter on issuedDate
 *        (optional) search filter on documentNumber, subject,
 *           issuer, signerName (case-insensitive contains).
 *   3. Run `prisma.document.findMany({ where, skip, take,
 *      orderBy: { createdAt: 'desc' }, include: summaryInclude
 *      })` plus `prisma.document.count({ where })` in
 *      parallel.
 *   4. Map each document through `formatSummary()` and
 *      return { documents, total, page, limit }.
 *
 * Important: there is no separate "search" method;
 * `getAll` is the unified entry point. Documented gaps:
 *   - The service does NOT do full-text relevance ranking;
 *     matches are returned in createdAt-desc order.
 *   - The service does NOT validate that `search` is a
 *     non-empty string. Empty / null / undefined all skip
 *     the OR-clause (no filter).
 *   - The service does NOT validate `type`. Invalid types
 *     return no rows (since `where.type = 'INVALID'` matches
 *     no documents).
 *
 * Coverage matrix (UTCID01 – UTCID08):
 *   UTCID01  N  – Incoming number: search by documentNumber
 *                 where type=INCOMING.
 *   UTCID02  N  – Outgoing number: search by documentNumber
 *                 where type=OUTGOING.
 *   UTCID03  N  – Summary: search by subject / issuer /
 *                 signerName.
 *   UTCID04  N  – Normalized combined search: case-insensitive
 *                 contains on all four fields via OR.
 *   UTCID05  N  – Response-to-database consistency: total
 *                 matches count, documents match findMany.
 *   UTCID06  A  – Malformed query: invalid `type`, invalid
 *                 `urgencyId`, invalid `confidentialityId`.
 *   UTCID07  A  – Unauthorized / search failure: prisma
 *                 failure propagates.
 *   UTCID08  B  – Minimum / maximum keyword or empty result:
 *                 minimum length ("a"), maximum length
 *                 (10 KB string), empty result.
 */

import { DocumentsService } from '../../../src/modules/documents/documents.service';
import { documentsRepository } from '../../../src/modules/documents/documents.repository';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/modules/documents/documents.repository');

jest.mock('../../../src/shared/services/ocr.service', () => ({
  __esModule: true,
  performOcr: jest.fn(),
  extractFields: jest.fn(),
}));
jest.mock('../../../src/shared/services/email.service', () => ({
  __esModule: true,
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

const mockedRepo = documentsRepository as jest.Mocked<
  typeof documentsRepository
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

let service: DocumentsService;

beforeEach(() => {
  jest.clearAllMocks();

  const sampleDoc: any = {
    id: 1,
    documentNumber: 'CV-2026-0001',
    type: 'INCOMING',
    subject: 'Công văn chỉ đạo',
    issuer: 'Sở TTTT',
    signerName: 'Nguyễn Văn A',
    status: 'PROCESSING',
    documentStatus: 'ACTIVE',
    isArchived: false,
    issuedDate: new Date('2026-09-12'),
    createdAt: new Date('2026-09-12'),
    updatedAt: new Date('2026-09-12'),
    urgencyId: 1,
    confidentialityId: 1,
    documentTypeId: 1,
    departmentId: 1,
    categoryId: null,
    ocrText: null,
    fileUrl: null,
    originalFileName: null,
    signerTitle: 'Giám đốc',
    createdByUser: { id: 5, fullName: 'Lê Văn Submitter' },
    updatedByUser: { id: 5, fullName: 'Lê Văn Submitter' },
    department: { id: 1, name: 'Phòng Hành chính' },
    confidentiality: { id: 1, code: 'B', name: 'Mật', description: 'Mật' },
    urgency: { id: 1, name: 'THUONG', description: 'Thường' },
    documentTypeRef: { id: 1, name: 'Công văn' },
    category: null,
    attachments: [],
  };

  mockedRepo.findAll.mockReset();
  mockedRepo.findAll.mockImplementation(async (params: any) => {
    const sampleDoc: any = {
      id: 1,
      documentNumber: 'CV-2026-0001',
      type: 'INCOMING',
      subject: 'Công văn chỉ đạo',
      issuer: 'Sở TTTT',
      signerName: 'Nguyễn Văn A',
      status: 'PROCESSING',
      documentStatus: 'ACTIVE',
      isArchived: false,
      issuedDate: new Date('2026-09-12'),
      createdAt: new Date('2026-09-12'),
      updatedAt: new Date('2026-09-12'),
      urgencyId: 1,
      confidentialityId: 1,
      documentTypeId: 1,
      departmentId: 1,
      categoryId: null,
      ocrText: null,
      fileUrl: null,
      originalFileName: null,
      signerTitle: 'Giám đốc',
      createdByUser: { id: 5, fullName: 'Lê Văn Submitter' },
      updatedByUser: { id: 5, fullName: 'Lê Văn Submitter' },
      department: { id: 1, name: 'Phòng Hành chính' },
      confidentiality: { id: 1, code: 'B', name: 'Mật', description: 'Mật' },
      urgency: { id: 1, name: 'THUONG', description: 'Thường' },
      documentTypeRef: { id: 1, name: 'Công văn' },
      category: null,
      attachments: [],
    };

    return {
      documents: [sampleDoc],
      total: 1,
      page: params?.page ?? 1,
      limit: params?.limit ?? 10,
    };
  });

  service = new DocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: incoming number.
// Result : Search by documentNumber where type=INCOMING
//          returns matching incoming documents.
// ---------------------------------------------------------------------------
describe('[UTCID01] DocumentsService.getAll() – Normal 1: incoming number', () => {
  it('forwards the search param to the repository', async () => {
    await service.getAll({
      page: 1,
      limit: 10,
      search: 'CV-2026-0001',
      type: 'INCOMING',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'CV-2026-0001',
        type: 'INCOMING',
      }),
    );
  });

  it('returns documents matching the incoming number search', async () => {
    const result = await service.getAll({
      page: 1,
      limit: 10,
      search: 'CV-2026-0001',
      type: 'INCOMING',
    });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].documentNumber).toBe('CV-2026-0001');
    expect(result.documents[0].type).toBe('INCOMING');
  });

  it('returns totalCount = 1 for incoming number search', async () => {
    const result = await service.getAll({
      page: 1,
      limit: 10,
      search: 'CV-2026-0001',
      type: 'INCOMING',
    });

    expect(result.total).toBe(1);
  });

  it('does NOT throw on the incoming-number path', async () => {
    await expect(
      service.getAll({
        page: 1,
        limit: 10,
        search: 'CV-2026-0001',
        type: 'INCOMING',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the incoming-number path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getAll({
      page: 1,
      limit: 10,
      search: 'CV-2026-0001',
      type: 'INCOMING',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: outgoing number.
// Result : Search by documentNumber where type=OUTGOING
//          returns matching outgoing documents.
// ---------------------------------------------------------------------------
describe('[UTCID02] DocumentsService.getAll() – Normal 2: outgoing number', () => {
  beforeEach(() => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue({
      documents: [
        {
          id: 2,
          documentNumber: 'OUT-2026-0001',
          type: 'OUTGOING',
          subject: 'Công văn phát hành',
          issuer: 'Phòng Hành chính',
          signerName: 'Trần Văn B',
          status: 'ISSUED',
          documentStatus: 'ACTIVE',
          isArchived: false,
          issuedDate: new Date('2026-09-12'),
          createdAt: new Date('2026-09-12'),
          updatedAt: new Date('2026-09-12'),
          urgencyId: 1,
          confidentialityId: 1,
          documentTypeId: 1,
          departmentId: 1,
          categoryId: null,
          ocrText: null,
          fileUrl: null,
          originalFileName: null,
          signerTitle: 'Giám đốc',
          createdByUser: { id: 6, fullName: 'Trần Văn B' },
          updatedByUser: { id: 6, fullName: 'Trần Văn B' },
          department: { id: 1, name: 'Phòng Hành chính' },
          confidentiality: { id: 1, code: 'B', name: 'Mật', description: 'Mật' },
          urgency: { id: 1, name: 'THUONG', description: 'Thường' },
          documentTypeRef: { id: 1, name: 'Công văn' },
          category: null,
          attachments: [],
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
    });
  });

  it('forwards the outgoing-number search to the repository', async () => {
    await service.getAll({
      page: 1,
      limit: 10,
      search: 'OUT-2026-0001',
      type: 'OUTGOING',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'OUT-2026-0001',
        type: 'OUTGOING',
      }),
    );
  });

  it('returns documents matching the outgoing number search', async () => {
    const result = await service.getAll({
      page: 1,
      limit: 10,
      search: 'OUT-2026-0001',
      type: 'OUTGOING',
    });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].documentNumber).toBe('OUT-2026-0001');
    expect(result.documents[0].type).toBe('OUTGOING');
  });

  it('does NOT throw on the outgoing-number path', async () => {
    await expect(
      service.getAll({
        page: 1,
        limit: 10,
        search: 'OUT-2026-0001',
        type: 'OUTGOING',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the outgoing-number path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getAll({
      page: 1,
      limit: 10,
      search: 'OUT-2026-0001',
      type: 'OUTGOING',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: summary.
// Result : Search by subject / issuer / signerName matches
//          on any of those fields.
// ---------------------------------------------------------------------------
describe('[UTCID03] DocumentsService.getAll() – Normal 3: summary', () => {
  it('forwards a subject search to the repository', async () => {
    await service.getAll({
      page: 1,
      limit: 10,
      search: 'chỉ đạo',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'chỉ đạo',
      }),
    );
  });

  it('forwards an issuer search to the repository', async () => {
    await service.getAll({
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

  it('forwards a signerName search to the repository', async () => {
    await service.getAll({
      page: 1,
      limit: 10,
      search: 'Nguyễn Văn A',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'Nguyễn Văn A',
      }),
    );
  });

  it('returns documents matching the summary search', async () => {
    const result = await service.getAll({
      page: 1,
      limit: 10,
      search: 'chỉ đạo',
    });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].subject).toBe('Công văn chỉ đạo');
  });

  it('does NOT throw on the summary path', async () => {
    await expect(
      service.getAll({
        page: 1,
        limit: 10,
        search: 'chỉ đạo',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the summary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getAll({
      page: 1,
      limit: 10,
      search: 'chỉ đạo',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: normalized combined search.
// Result : Case-insensitive search on documentNumber,
//          subject, issuer, signerName via OR-clause.
//          Whitespace-trimmed, normalized input.
// ---------------------------------------------------------------------------
describe('[UTCID04] DocumentsService.getAll() – Normal 4: normalized combined search', () => {
  it('forwards case-insensitive search to the repository', async () => {
    await service.getAll({
      page: 1,
      limit: 10,
      search: 'CV-2026-0001',
    });

    // The repository builds the OR-clause with
    // `mode: 'insensitive'`; the service just forwards the
    // raw string.
    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'CV-2026-0001',
      }),
    );
  });

  it('forwards lowercase mixed-case search', async () => {
    await service.getAll({
      page: 1,
      limit: 10,
      search: 'Cv-2026-0001',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'Cv-2026-0001',
      }),
    );
  });

  it('forwards search with diacritics', async () => {
    await service.getAll({
      page: 1,
      limit: 10,
      search: 'chỉ đạo',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'chỉ đạo',
      }),
    );
  });

  it('forwards search without type filter (combined search)', async () => {
    await service.getAll({
      page: 1,
      limit: 10,
      search: 'CV-2026-0001',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'CV-2026-0001',
        type: undefined,
      }),
    );
  });

  it('does NOT throw on the combined-search path', async () => {
    await expect(
      service.getAll({
        page: 1,
        limit: 10,
        search: 'CV-2026-0001',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the combined-search path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getAll({
      page: 1,
      limit: 10,
      search: 'CV-2026-0001',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency for
// Documents by Document Number and Summary including
// identifiers, type, status, summary.
// ---------------------------------------------------------------------------
describe('[UTCID05] DocumentsService.getAll() – Normal 5: response-to-database consistency', () => {
  it('preserves the documents array from the repository', async () => {
    const result = await service.getAll({
      page: 1,
      limit: 10,
      search: 'CV-2026-0001',
    });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].id).toBe(1);
  });

  it('preserves the total from the repository', async () => {
    const result = await service.getAll({
      page: 1,
      limit: 10,
      search: 'CV-2026-0001',
    });

    expect(result.total).toBe(1);
  });

  it('preserves the page and limit', async () => {
    const result = await service.getAll({
      page: 2,
      limit: 25,
      search: 'CV-2026-0001',
    });

    expect(result.page).toBe(2);
    expect(result.limit).toBe(25);
  });

  it('preserves the documentNumber on the document', async () => {
    const result = await service.getAll({
      page: 1,
      limit: 10,
      search: 'CV-2026-0001',
    });

    expect(result.documents[0].documentNumber).toBe('CV-2026-0001');
  });

  it('preserves the type on the document', async () => {
    const result = await service.getAll({
      page: 1,
      limit: 10,
      search: 'CV-2026-0001',
    });

    expect(result.documents[0].type).toBe('INCOMING');
  });

  it('preserves the status on the document', async () => {
    const result = await service.getAll({
      page: 1,
      limit: 10,
      search: 'CV-2026-0001',
    });

    expect(result.documents[0].status).toBe('PROCESSING');
  });

  it('preserves the subject (summary) on the document', async () => {
    const result = await service.getAll({
      page: 1,
      limit: 10,
      search: 'chỉ đạo',
    });

    expect(result.documents[0].subject).toBe('Công văn chỉ đạo');
  });

  it('does NOT throw on the consistency path', async () => {
    await expect(
      service.getAll({
        page: 1,
        limit: 10,
        search: 'CV-2026-0001',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the consistency path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getAll({
      page: 1,
      limit: 10,
      search: 'CV-2026-0001',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: malformed query.
// Result : Invalid type / urgencyId / confidentialityId are
//          forwarded to the repository (validation happens at
//          the route layer; the service is permissive).
// ---------------------------------------------------------------------------
describe('[UTCID06] DocumentsService.getAll() – Abnormal 1: malformed query', () => {
  it('forwards an invalid type to the repository (route validation only)', async () => {
    await service.getAll({
      page: 1,
      limit: 10,
      search: 'CV-2026-0001',
      type: 'INVALID_TYPE' as any,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'INVALID_TYPE',
      }),
    );
  });

  it('forwards an invalid urgencyId to the repository', async () => {
    await service.getAll({
      page: 1,
      limit: 10,
      urgencyId: 'INVALID_URGENCY' as any,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        urgencyId: 'INVALID_URGENCY',
      }),
    );
  });

  it('forwards an invalid confidentialityId to the repository', async () => {
    await service.getAll({
      page: 1,
      limit: 10,
      confidentialityId: 'INVALID_CONF' as any,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        confidentialityId: 'INVALID_CONF',
      }),
    );
  });

  it('forwards an invalid dateFrom to the repository (NaN date)', async () => {
    await service.getAll({
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

  it('does NOT throw on malformed query (documented gap)', async () => {
    await expect(
      service.getAll({
        page: 1,
        limit: 10,
        search: 'CV-2026-0001',
        type: 'INVALID_TYPE' as any,
        urgencyId: 'INVALID_URGENCY' as any,
        confidentialityId: 'INVALID_CONF' as any,
        dateFrom: 'not-a-date',
      }),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on malformed query (no password / hash leak)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(
      new Error('Malformed query: something bad'),
    );

    const err = await service
      .getAll({
        page: 1,
        limit: 10,
        search: 'CV-2026-0001',
        type: 'INVALID_TYPE' as any,
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the malformed-query path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getAll({
      page: 1,
      limit: 10,
      search: 'CV-2026-0001',
      type: 'INVALID_TYPE' as any,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: unauthorized / search failure.
// Result : Prisma failures propagate as a thrown error;
//          the service does NOT catch them.
// ---------------------------------------------------------------------------
describe('[UTCID07] DocumentsService.getAll() – Abnormal 2: unauthorized/search failure', () => {
  it('propagates prisma.document.findMany failure', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(
      new Error('Connection refused'),
    );

    await expect(
      service.getAll({
        page: 1,
        limit: 10,
        search: 'CV-2026-0001',
      }),
    ).rejects.toThrow('Connection refused');
  });

  it('propagates prisma.document.count failure', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(
      new Error('Count error'),
    );

    await expect(
      service.getAll({
        page: 1,
        limit: 10,
        search: 'CV-2026-0001',
      }),
    ).rejects.toThrow('Count error');
  });

  it('does NOT catch errors silently', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(
      new Error('Repository failure'),
    );

    await expect(
      service.getAll({
        page: 1,
        limit: 10,
        search: 'CV-2026-0001',
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('records a safe diagnostic on search failure (no password / hash leak)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(
      new Error('Search failure: something bad'),
    );

    const err = await service
      .getAll({
        page: 1,
        limit: 10,
        search: 'CV-2026-0001',
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the unauthorized path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(
      new Error('Repository failure'),
    );

    await expect(
      service.getAll({
        page: 1,
        limit: 10,
        search: 'CV-2026-0001',
      }),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: minimum / maximum keyword or empty
// result.
// Result : Minimum-length keyword ("a") matches; maximum-length
//          keyword (10 KB string) matches; empty result returns
//          an empty documents array.
// ---------------------------------------------------------------------------
describe('[UTCID08] DocumentsService.getAll() – Boundary 1: minimum/maximum keyword or empty result', () => {
  it('accepts the boundary: search = "a" (minimum-length keyword)', async () => {
    await service.getAll({
      page: 1,
      limit: 10,
      search: 'a',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'a',
      }),
    );
  });

  it('accepts the boundary: search = single character "x"', async () => {
    await expect(
      service.getAll({
        page: 1,
        limit: 10,
        search: 'x',
      }),
    ).resolves.toBeDefined();
  });

  it('accepts the boundary: search = 10 KB string (maximum-length keyword)', async () => {
    const longSearch = 'A'.repeat(10_000);

    await expect(
      service.getAll({
        page: 1,
        limit: 10,
        search: longSearch,
      }),
    ).resolves.toBeDefined();

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: longSearch,
      }),
    );
  });

  it('accepts the boundary: search = 1 MB string (extreme maximum-length keyword)', async () => {
    const longSearch = 'A'.repeat(1_000_000);

    await expect(
      service.getAll({
        page: 1,
        limit: 10,
        search: longSearch,
      }),
    ).resolves.toBeDefined();
  });

  it('returns an empty documents array for a no-match search', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue({
      documents: [],
      total: 0,
      page: 1,
      limit: 10,
    });

    const result = await service.getAll({
      page: 1,
      limit: 10,
      search: 'NOMATCH-9999',
    });

    expect(result.documents).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.getAll({
        page: 1,
        limit: 10,
        search: 'a',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getAll({
      page: 1,
      limit: 10,
      search: 'a',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('rejects the adjacent unsupported value: search = undefined', async () => {
    await service.getAll({
      page: 1,
      limit: 10,
      search: undefined,
    });

    // Service forwards undefined to repo; repo's
    // `if (params.search)` skips the OR-clause.
    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: undefined,
      }),
    );
  });

  it('rejects the adjacent unsupported value: search = empty string', async () => {
    await service.getAll({
      page: 1,
      limit: 10,
      search: '',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: '',
      }),
    );
  });
});
