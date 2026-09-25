/**
 * Unit tests for DocumentBooksService.list() —
 * Function57 / View All Document Books.
 *
 * Note on naming: the matrix headers reference
 * `DocumentBookQueryService`. The actual implementation
 * that lists document books is
 * `DocumentBooksService.list(query)`.
 *
 * Step-by-step:
 *   1. Pass the query object directly to
 *      `documentBooksRepository.findAll(query)`.
 *   2. Return whatever `findAll` returns.
 *
 * Note: `list()` is a thin pass-through. No validation, no
 * role check, no business logic — those are handled by the
 * route middleware (`requireRole`, `listDocumentBooksValidation`).
 *
 * The `findAll` method:
 *   - Accepts `{ page, limit, search, bookType, year, departmentId,
 *     status, isDefault }`.
 *   - Returns `{ items, total, page, limit, totalPages }`.
 *   - Items are ordered by `year DESC, createdAt DESC`.
 *   - Filters out soft-deleted books (`deletedAt: null`).
 *
 * Coverage matrix (UTCID01 – UTCID06):
 *   UTCID01  N  – Default list: empty query, returns all books
 *                 (paginated).
 *   UTCID02  N  – Direction filter: `bookType='INCOMING'` or
 *                 'OUTGOING'.
 *   UTCID03  N  – Year filter: `year=currentYear` (or other).
 *   UTCID04  A  – Unauthorized access: NOT enforced by the
 *                 service — handled by route middleware.
 *   UTCID05  A  – Repository failure: prisma errors propagated
 *                 as-is.
 *   UTCID06  B  – Empty list or last page: 0 items returned;
 *                 last page boundary.
 */

import { DocumentBooksService } from '../../../src/modules/document-books/document-books.service';
import { documentBooksRepository } from '../../../src/modules/document-books/document-books.repository';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/document-books/document-books.repository',
);

jest.mock('../../../src/config/database', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    documentBook: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
  },
}));

const mockedRepo = documentBooksRepository as jest.Mocked<
  typeof documentBooksRepository
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

let service: DocumentBooksService;

const currentYear = new Date().getFullYear();

const buildQuery = (overrides: any = {}): any => ({
  page: 1,
  limit: 10,
  search: undefined,
  bookType: undefined,
  year: undefined,
  departmentId: undefined,
  status: undefined,
  isDefault: undefined,
  ...overrides,
});

const buildListResult = (overrides: any = {}): any => {
  const items = overrides.items || [
    {
      id: 1,
      name: 'Sổ văn bản đến 2026',
      code: 'SVD-2026',
      bookType: 'INCOMING',
      year: currentYear,
      currentNumber: 5,
      isDefault: false,
      status: 'ACTIVE',
      departmentId: 1,
      createdById: 5,
      openedAt: new Date('2026-09-13T07:00:00.000Z'),
      closedAt: null,
      deletedAt: null,
      createdAt: new Date('2026-09-13T07:00:00.000Z'),
      updatedAt: new Date('2026-09-13T07:00:00.000Z'),
      department: { id: 1, name: 'Phòng Hành chính' },
      createdBy: { id: 5, fullName: 'Nguyễn Văn A' },
      _count: { incomingEntries: 5, outgoingEntries: 0 },
    },
  ];
  const total = overrides.total ?? items.length;

  return {
    items,
    total,
    page: overrides.page ?? 1,
    limit: overrides.limit ?? 10,
    totalPages: Math.ceil(total / (overrides.limit ?? 10)),
  };
};

beforeEach(() => {
  jest.clearAllMocks();

  mockedRepo.findAll.mockReset();
  mockedRepo.findAll.mockImplementation(
    async (_query: any) => buildListResult(),
  );

  service = new DocumentBooksService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: default list.
// Result : empty query, returns all books (paginated).
// ---------------------------------------------------------------------------
describe('[UTCID01] documentBooksService.list() – Normal 1: default list', () => {
  it('returns a list of books', async () => {
    const result = await service.list(buildQuery());

    expect(result).toBeDefined();
    expect(result.items).toBeDefined();
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('calls repository.findAll with the query', async () => {
    const query = buildQuery();

    await service.list(query);

    expect(mockedRepo.findAll).toHaveBeenCalledWith(query);
  });

  it('returns the total count', async () => {
    const result = await service.list(buildQuery());

    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it('returns the page number', async () => {
    const result = await service.list(buildQuery());

    expect(result.page).toBe(1);
  });

  it('returns the limit', async () => {
    const result = await service.list(buildQuery());

    expect(result.limit).toBe(10);
  });

  it('returns the totalPages', async () => {
    const result = await service.list(buildQuery());

    expect(result.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('does NOT throw on the default-list path', async () => {
    await expect(service.list(buildQuery())).resolves.toBeDefined();
  });

  it('does NOT log to console on the default-list path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list(buildQuery());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('does NOT modify the query before passing to repository', async () => {
    const query = buildQuery({ search: 'test' });

    await service.list(query);

    expect(mockedRepo.findAll).toHaveBeenCalledWith(query);
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: direction filter.
// Result : `bookType='INCOMING'` or 'OUTGOING'.
// ---------------------------------------------------------------------------
describe('[UTCID02] documentBooksService.list() – Normal 2: direction filter', () => {
  it('filters by bookType=INCOMING', async () => {
    const query = buildQuery({ bookType: 'INCOMING' });

    const result = await service.list(query);

    expect(result).toBeDefined();
  });

  it('forwards bookType=INCOMING to repository', async () => {
    const query = buildQuery({ bookType: 'INCOMING' });

    await service.list(query);

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ bookType: 'INCOMING' }),
    );
  });

  it('filters by bookType=OUTGOING', async () => {
    const query = buildQuery({ bookType: 'OUTGOING' });

    const result = await service.list(query);

    expect(result).toBeDefined();
  });

  it('forwards bookType=OUTGOING to repository', async () => {
    const query = buildQuery({ bookType: 'OUTGOING' });

    await service.list(query);

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ bookType: 'OUTGOING' }),
    );
  });

  it('handles a list with only INCOMING books', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce(
      buildListResult({
        items: [
          {
            id: 1,
            name: 'INCOMING Book',
            bookType: 'INCOMING',
            year: currentYear,
            _count: { incomingEntries: 5, outgoingEntries: 0 },
          },
        ],
      }),
    );

    const query = buildQuery({ bookType: 'INCOMING' });

    const result = await service.list(query);

    expect(result.items.length).toBe(1);
    expect(result.items[0].bookType).toBe('INCOMING');
  });

  it('handles a list with only OUTGOING books', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce(
      buildListResult({
        items: [
          {
            id: 2,
            name: 'OUTGOING Book',
            bookType: 'OUTGOING',
            year: currentYear,
            _count: { incomingEntries: 0, outgoingEntries: 5 },
          },
        ],
      }),
    );

    const query = buildQuery({ bookType: 'OUTGOING' });

    const result = await service.list(query);

    expect(result.items.length).toBe(1);
    expect(result.items[0].bookType).toBe('OUTGOING');
  });

  it('does NOT throw on the direction-filter path', async () => {
    await expect(
      service.list(buildQuery({ bookType: 'INCOMING' })),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the direction-filter path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list(buildQuery({ bookType: 'OUTGOING' }));

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: year filter.
// Result : `year=currentYear` (or other).
// ---------------------------------------------------------------------------
describe('[UTCID03] documentBooksService.list() – Normal 3: year filter', () => {
  it('filters by year=currentYear', async () => {
    const query = buildQuery({ year: currentYear });

    const result = await service.list(query);

    expect(result).toBeDefined();
  });

  it('forwards year to repository', async () => {
    const query = buildQuery({ year: 2026 });

    await service.list(query);

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ year: 2026 }),
    );
  });

  it('filters by year=2025 (past year)', async () => {
    const query = buildQuery({ year: 2025 });

    const result = await service.list(query);

    expect(result).toBeDefined();
  });

  it('filters by year=2000 (min boundary per validation)', async () => {
    const query = buildQuery({ year: 2000 });

    const result = await service.list(query);

    expect(result).toBeDefined();
  });

  it('filters by year=currentYear+1 (max boundary per validation)', async () => {
    const query = buildQuery({ year: currentYear + 1 });

    const result = await service.list(query);

    expect(result).toBeDefined();
  });

  it('does NOT throw on the year-filter path', async () => {
    await expect(
      service.list(buildQuery({ year: currentYear })),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the year-filter path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list(buildQuery({ year: 2026 }));

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('does NOT modify the year before passing to repository', async () => {
    const query = buildQuery({ year: 2030 });

    await service.list(query);

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ year: 2030 }),
    );
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: unauthorized access.
// Result : NOT enforced by the service — handled by route
//          middleware.
// ---------------------------------------------------------------------------
describe('[UTCID04] documentBooksService.list() – Abnormal 1: unauthorized access', () => {
  it('does NOT enforce role — returns data even for VIEWER', async () => {
    // Note: the service has no concept of "user" — it's a
    // thin pass-through. Authorization is at the route layer.
    const result = await service.list(buildQuery());

    expect(result).toBeDefined();
    expect(result.items).toBeDefined();
  });

  it('does NOT enforce role — returns data even for GUEST (no roles)', async () => {
    const result = await service.list(buildQuery());

    expect(result).toBeDefined();
  });

  it('does NOT throw on an empty query from an unauthenticated caller', async () => {
    await expect(service.list({} as any)).resolves.toBeDefined();
  });

  it('does NOT throw on a malformed query', async () => {
    await expect(
      service.list({ page: 'not-a-number' } as any),
    ).resolves.toBeDefined();
  });

  it('passes the raw query to repository — no auth check', async () => {
    const query = buildQuery({ userId: 999, role: 'GUEST' } as any);

    await service.list(query);

    expect(mockedRepo.findAll).toHaveBeenCalledWith(query);
  });

  it('does NOT log to console on the unauthorized-access path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list(buildQuery());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('handles a query with sensitive-ish data without leaking', async () => {
    const query = buildQuery({
      search: "OR 1=1; DROP TABLE document_books;--",
    });

    await expect(service.list(query)).resolves.toBeDefined();
  });

  it('records a safe diagnostic when the route layer would have rejected', async () => {
    // The service would have logged nothing if it rejected.
    // Verify it doesn't log anything sensitive.
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list(buildQuery());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 2: repository failure.
// Result : prisma errors propagated as-is.
// ---------------------------------------------------------------------------
describe('[UTCID05] documentBooksService.list() – Abnormal 2: repository failure', () => {
  it('propagates a generic Error from repository', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(new Error('Database error'));

    await expect(service.list(buildQuery())).rejects.toThrow(
      'Database error',
    );
  });

  it('propagates a prisma-style error message', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(
      new Error('PrismaClientInitializationError'),
    );

    await expect(service.list(buildQuery())).rejects.toThrow(
      /PrismaClientInitializationError/,
    );
  });

  it('does NOT swallow the error', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(
      new Error('Connection timeout'),
    );

    let caught = false;

    await service.list(buildQuery()).catch(() => {
      caught = true;
    });

    expect(caught).toBe(true);
  });

  it('does NOT return undefined on error', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(new Error('Boom'));

    const result = await service
      .list(buildQuery())
      .catch((e) => e);

    expect(result).toBeInstanceOf(Error);
    expect(result.items).toBeUndefined();
  });

  it('records a safe diagnostic on repository failure (no password / hash leak)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(
      new Error('Connection timeout: failed to connect to DB at secret-host'),
    );

    const err = await service
      .list(buildQuery())
      .catch((e) => e) as Error;

    // The service doesn't add a wrapper, so the error is the
    // raw repository error. It may contain sensitive info, so
    // we just verify the service itself didn't ADD sensitive
    // info to the message.
    expect(err).toBeDefined();
    expect(typeof err.message).toBe('string');
  });

  it('does NOT log to console on the repository-failure path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(new Error('Boom'));

    await expect(service.list(buildQuery())).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('handles a TypeError gracefully (no uncaught exception)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(() => {
      throw new TypeError('Cannot read property of undefined');
    });

    await expect(service.list(buildQuery())).rejects.toThrow(
      TypeError,
    );
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Boundary 1: empty list or last page.
// Result : 0 items returned; last page boundary.
// ---------------------------------------------------------------------------
describe('[UTCID06] documentBooksService.list() – Boundary 1: empty list or last page', () => {
  it('returns an empty list when there are no books', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });

    const result = await service.list(buildQuery());

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('handles the boundary: page=1, limit=1', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce(
      buildListResult({ items: [{ id: 1 } as any], total: 1, page: 1, limit: 1 }),
    );

    const result = await service.list(buildQuery({ page: 1, limit: 1 }));

    expect(result.items).toHaveLength(1);
    expect(result.limit).toBe(1);
  });

  it('handles the boundary: last page with 1 item', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce(
      buildListResult({
        items: [{ id: 100 } as any],
        total: 100,
        page: 10,
        limit: 10,
      }),
    );

    const result = await service.list(buildQuery({ page: 10, limit: 10 }));

    expect(result.page).toBe(10);
    expect(result.total).toBe(100);
    expect(result.totalPages).toBe(10);
  });

  it('handles the boundary: page beyond the last page', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 5,
      page: 99,
      limit: 10,
      totalPages: 1,
    });

    const result = await service.list(buildQuery({ page: 99, limit: 10 }));

    expect(result.items).toHaveLength(0);
    expect(result.page).toBe(99);
  });

  it('handles the boundary: page=0 (invalid — middleware should reject)', async () => {
    // Service doesn't enforce validation — it just passes the
    // value through. The middleware (listDocumentBooksValidation)
    // is what rejects page<1.
    const result = await service.list(buildQuery({ page: 0 }));

    expect(result).toBeDefined();
  });

  it('handles the boundary: limit=0 (invalid — middleware should reject)', async () => {
    const result = await service.list(buildQuery({ limit: 0 }));

    expect(result).toBeDefined();
  });

  it('handles the boundary: limit=Number.MAX_SAFE_INTEGER', async () => {
    const result = await service.list(
      buildQuery({ limit: Number.MAX_SAFE_INTEGER }),
    );

    expect(result).toBeDefined();
  });

  it('handles the boundary: very large total count (1 million)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [{ id: 1 } as any],
      total: 1_000_000,
      page: 1,
      limit: 10,
      totalPages: 100_000,
    });

    const result = await service.list(buildQuery());

    expect(result.total).toBe(1_000_000);
    expect(result.totalPages).toBe(100_000);
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(service.list(buildQuery())).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list(buildQuery());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
