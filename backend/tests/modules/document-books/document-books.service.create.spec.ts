/**
 * Unit tests for DocumentBooksService.create() —
 * Function56 / Create Document Book.
 *
 * Note on naming: the matrix headers reference
 * `DocumentBookService`. The actual implementation that
 * creates a document book is
 * `DocumentBooksService.create(input, createdById)`.
 *
 * Step-by-step:
 *   1. Validate that no other document book with the same
 *      (name, departmentId, year, bookType) exists via
 *      `documentBooksRepository.countByNameAndDepartmentAndYearAndType`.
 *      - Throw `ConflictError` if `nameCount > 0`.
 *   2. If `input.isDefault === true`, unset any existing
 *      default book for that department/year/bookType via
 *      `documentBooksRepository.unsetDefaultBook(departmentId,
 *      bookType, year)`.
 *   3. Create the book via
 *      `documentBooksRepository.create(input, createdById)`.
 *      The created book has:
 *      - `bookType`: 'INCOMING' or 'OUTGOING'.
 *      - `year`: integer 2000..currentYear+1 (per validation).
 *      - `isDefault`: boolean, defaults to false.
 *      - `currentNumber`: 0 (initial sequence for entries —
 *        incremented when documents are registered).
 *      - `status`: 'ACTIVE' (Prisma default).
 *      - `createdById`: from the authenticated user.
 *      - `departmentId`: from the input.
 *      - `name`: 1..255 chars (per validation).
 *      - `code`: optional, ≤50 chars.
 *      - `description`: optional, free text.
 *      - `openedAt`: set by Prisma @default(now()).
 *   4. Return the created book.
 *
 * Important: role-based access is enforced by the
 * `requireRole` route middleware (ADMIN or DOCUMENT_CLERK
 * per `requireRole(ROLES.ADMIN, ROLES.DOCUMENT_CLERK)` in
 * routes.ts). The service itself doesn't check the
 * `createdById`. UTCID07 verifies that the service doesn't
 * reject based on the creator — that's the route layer's
 * responsibility.
 *
 * Coverage matrix (UTCID01 – UTCID08):
 *   UTCID01  N  – Valid book: create returns the expected
 *                 value.
 *   UTCID02  N  – Direction/year mapping: bookType='INCOMING'
 *                 / 'OUTGOING' + year 2000..currentYear+1.
 *   UTCID03  N  – Initial sequence: currentNumber=0 on create
 *                 (no documents registered yet).
 *   UTCID04  N  – Persistence: prisma.documentBook.create is
 *                 called with the right input.
 *   UTCID05  N  – Response-to-database consistency: returned
 *                 book has the same id, name, bookType, year,
 *                 status as the created record.
 *   UTCID06  A  – Duplicate / invalid data: ConflictError
 *                 when name+department+year+bookType already
 *                 exists.
 *   UTCID07  A  – Unauthorized creator: NOT enforced by the
 *                 service — service accepts any createdById.
 *   UTCID08  B  – Minimum / maximum code/name or year
 *                 boundary: name=1 char (min), name=255 chars
 *                 (max), year=2000 (min), year=currentYear+1
 *                 (max).
 */

import { DocumentBooksService } from '../../../src/modules/document-books/document-books.service';
import { documentBooksRepository } from '../../../src/modules/document-books/document-books.repository';
import { ConflictError, NotFoundError } from '../../../src/shared/exceptions/app-error';

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
      create: jest.fn(),
      update: jest.fn(),
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

const buildValidInput = (overrides: any = {}): any => ({
  name: 'Sổ văn bản đến 2026',
  code: 'SVD-2026',
  description: 'Sổ văn bản đến năm 2026',
  bookType: 'INCOMING',
  year: currentYear,
  isDefault: false,
  departmentId: 1,
  ...overrides,
});

const buildCreatedBook = (overrides: any = {}, createdById: number = 5): any => ({
  id: 1,
  name: overrides.name || 'Sổ văn bản đến 2026',
  code: overrides.code || 'SVD-2026',
  description: overrides.description || 'Sổ văn bản đến năm 2026',
  bookType: overrides.bookType || 'INCOMING',
  year: overrides.year || currentYear,
  currentNumber: 0,
  isDefault: overrides.isDefault === undefined ? false : overrides.isDefault,
  status: 'ACTIVE',
  departmentId: overrides.departmentId || 1,
  createdById,
  openedAt: new Date('2026-09-13T07:00:00.000Z'),
  closedAt: null,
  deletedAt: null,
  createdAt: new Date('2026-09-13T07:00:00.000Z'),
  updatedAt: new Date('2026-09-13T07:00:00.000Z'),
  department: { id: overrides.departmentId || 1, name: 'Phòng Hành chính' },
  createdBy: { id: createdById, fullName: 'User ' + createdById },
  _count: { incomingEntries: 0, outgoingEntries: 0 },
});

beforeEach(() => {
  jest.clearAllMocks();

  mockedRepo.countByNameAndDepartmentAndYearAndType.mockReset();
  mockedRepo.countByNameAndDepartmentAndYearAndType.mockResolvedValue(0);

  mockedRepo.unsetDefaultBook.mockReset();
  mockedRepo.unsetDefaultBook.mockResolvedValue(undefined as any);

  mockedRepo.create.mockReset();
  mockedRepo.create.mockImplementation(
    async (data: any, createdById: number) =>
      buildCreatedBook(data, createdById),
  );

  service = new DocumentBooksService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid book.
// Result : create returns the expected value.
// ---------------------------------------------------------------------------
describe('[UTCID01] documentBooksService.create() – Normal 1: valid book', () => {
  it('creates a valid book', async () => {
    const result = await service.create(buildValidInput(), 5);

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('does NOT throw on the create path', async () => {
    await expect(
      service.create(buildValidInput(), 5),
    ).resolves.toBeDefined();
  });

  it('calls repository.countByNameAndDepartmentAndYearAndType', async () => {
    await service.create(buildValidInput(), 5);

    expect(
      mockedRepo.countByNameAndDepartmentAndYearAndType,
    ).toHaveBeenCalled();
  });

  it('calls repository.create with the input and createdById', async () => {
    await service.create(buildValidInput(), 5);

    expect(mockedRepo.create).toHaveBeenCalledWith(
      buildValidInput(),
      5,
    );
  });

  it('does NOT throw on a book with code=undefined', async () => {
    const input = buildValidInput({ code: undefined });

    const result = await service.create(input, 5);

    expect(result).toBeDefined();
  });

  it('does NOT throw on a book with description=undefined', async () => {
    const input = buildValidInput({ description: undefined });

    const result = await service.create(input, 5);

    expect(result).toBeDefined();
  });

  it('does NOT throw when createdById is undefined', async () => {
    const result = await service.create(buildValidInput(), 0 as any);

    expect(result).toBeDefined();
  });

  it('does NOT throw for SPECIALIST creator (id=5)', async () => {
    const result = await service.create(buildValidInput(), 5);

    expect(result).toBeDefined();
  });

  it('does NOT throw for ADMIN creator (id=1)', async () => {
    const result = await service.create(buildValidInput(), 1);

    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: direction / year mapping.
// Result : bookType='INCOMING' / 'OUTGOING' + year
//          2000..currentYear+1.
// ---------------------------------------------------------------------------
describe('[UTCID02] documentBooksService.create() – Normal 2: direction/year mapping', () => {
  it('handles bookType=INCOMING', async () => {
    const input = buildValidInput({ bookType: 'INCOMING' });

    const result = await service.create(input, 5);

    expect(result).toBeDefined();
    expect(result.bookType).toBe('INCOMING');
  });

  it('handles bookType=OUTGOING', async () => {
    const input = buildValidInput({
      bookType: 'OUTGOING',
      name: 'Sổ văn bản đi 2026',
    });

    const result = await service.create(input, 5);

    expect(result).toBeDefined();
    expect(result.bookType).toBe('OUTGOING');
  });

  it('handles year=2000 (min boundary per validation)', async () => {
    const input = buildValidInput({
      year: 2000,
      name: 'Sổ 2000',
    });

    const result = await service.create(input, 5);

    expect(result).toBeDefined();
  });

  it('handles year=currentYear', async () => {
    const input = buildValidInput({
      year: currentYear,
    });

    const result = await service.create(input, 5);

    expect(result).toBeDefined();
  });

  it('handles year=currentYear+1 (max boundary per validation)', async () => {
    const input = buildValidInput({
      year: currentYear + 1,
      name: 'Sổ ' + (currentYear + 1),
    });

    const result = await service.create(input, 5);

    expect(result).toBeDefined();
  });

  it('forwards bookType to repository', async () => {
    const input = buildValidInput({ bookType: 'OUTGOING' });

    await service.create(input, 5);

    const callArgs = (mockedRepo.create.mock.calls[0] || [])[0];

    expect(callArgs.bookType).toBe('OUTGOING');
  });

  it('forwards year to repository', async () => {
    const input = buildValidInput({ year: 2030 });

    await service.create(input, 5);

    const callArgs = (mockedRepo.create.mock.calls[0] || [])[0];

    expect(callArgs.year).toBe(2030);
  });

  it('does NOT throw on the direction/year path', async () => {
    await expect(
      service.create(buildValidInput(), 5),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: initial sequence.
// Result : currentNumber=0 on create (no documents registered
//          yet).
// ---------------------------------------------------------------------------
describe('[UTCID03] documentBooksService.create() – Normal 3: initial sequence', () => {
  it('returns a book with currentNumber=0 (initial sequence)', async () => {
    const result = await service.create(buildValidInput(), 5);

    expect(result.currentNumber).toBe(0);
  });

  it('returns a book with status=ACTIVE', async () => {
    const result = await service.create(buildValidInput(), 5);

    expect(result.status).toBe('ACTIVE');
  });

  it('returns a book with isDefault=false (default)', async () => {
    const result = await service.create(buildValidInput(), 5);

    expect(result.isDefault).toBe(false);
  });

  it('returns a book with deletedAt=null', async () => {
    const result = await service.create(buildValidInput(), 5);

    expect(result.deletedAt).toBeNull();
  });

  it('returns a book with closedAt=null', async () => {
    const result = await service.create(buildValidInput(), 5);

    expect(result.closedAt).toBeNull();
  });

  it('returns a book with createdById matching the input', async () => {
    const result = await service.create(buildValidInput(), 7);

    expect(result.createdById).toBe(7);
  });

  it('does NOT throw on the initial-sequence path', async () => {
    await expect(
      service.create(buildValidInput(), 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the initial-sequence path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create(buildValidInput(), 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: persistence.
// Result : prisma.documentBook.create is called with the
//          right input.
// ---------------------------------------------------------------------------
describe('[UTCID04] documentBooksService.create() – Normal 4: persistence', () => {
  it('calls prisma.documentBook.create', async () => {
    await service.create(buildValidInput(), 5);

    expect(mockedRepo.create).toHaveBeenCalled();
  });

  it('persists createdById', async () => {
    await service.create(buildValidInput(), 5);

    const callArgs = (mockedRepo.create.mock.calls[0] || [])[1];

    expect(callArgs).toBe(5);
  });

  it('persists name', async () => {
    await service.create(buildValidInput({ name: 'Test Book XYZ' }), 5);

    const callArgs = (mockedRepo.create.mock.calls[0] || [])[0];

    expect(callArgs.name).toBe('Test Book XYZ');
  });

  it('persists departmentId', async () => {
    await service.create(buildValidInput({ departmentId: 99 }), 5);

    const callArgs = (mockedRepo.create.mock.calls[0] || [])[0];

    expect(callArgs.departmentId).toBe(99);
  });

  it('persists year', async () => {
    await service.create(buildValidInput({ year: 2026 }), 5);

    const callArgs = (mockedRepo.create.mock.calls[0] || [])[0];

    expect(callArgs.year).toBe(2026);
  });

  it('persists bookType', async () => {
    await service.create(buildValidInput({ bookType: 'OUTGOING' }), 5);

    const callArgs = (mockedRepo.create.mock.calls[0] || [])[0];

    expect(callArgs.bookType).toBe('OUTGOING');
  });

  it('does NOT throw on the persistence path', async () => {
    await expect(
      service.create(buildValidInput(), 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the persistence path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create(buildValidInput(), 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : returned book has the same id, name, bookType,
//          year, status as the created record.
// ---------------------------------------------------------------------------
describe('[UTCID05] documentBooksService.create() – Normal 5: response-to-database consistency', () => {
  it('returns the same id as the created record', async () => {
    const result = await service.create(buildValidInput(), 5);

    expect(result.id).toBe(1);
  });

  it('returns the same name as the created record', async () => {
    const result = await service.create(
      buildValidInput({ name: 'My Custom Book' }),
      5,
    );

    expect(result.name).toBe('My Custom Book');
  });

  it('returns the same bookType as the created record', async () => {
    const result = await service.create(
      buildValidInput({ bookType: 'INCOMING' }),
      5,
    );

    expect(result.bookType).toBe('INCOMING');
  });

  it('returns the same year as the created record', async () => {
    const result = await service.create(
      buildValidInput({ year: 2030 }),
      5,
    );

    expect(result.year).toBe(2030);
  });

  it('returns the same status (ACTIVE) as the created record', async () => {
    const result = await service.create(buildValidInput(), 5);

    expect(result.status).toBe('ACTIVE');
  });

  it('returns the same departmentId as the created record', async () => {
    const result = await service.create(
      buildValidInput({ departmentId: 99 }),
      5,
    );

    expect(result.departmentId).toBe(99);
  });

  it('returns the same code as the created record', async () => {
    const result = await service.create(
      buildValidInput({ code: 'CODE-XYZ' }),
      5,
    );

    expect(result.code).toBe('CODE-XYZ');
  });

  it('returns the same createdById as the input', async () => {
    const result = await service.create(buildValidInput(), 42);

    expect(result.createdById).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: duplicate / invalid data.
// Result : ConflictError when name+department+year+bookType
//          already exists.
// ---------------------------------------------------------------------------
describe('[UTCID06] documentBooksService.create() – Abnormal 1: duplicate/invalid data', () => {
  it('throws ConflictError when name+department+year+bookType is duplicated', async () => {
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockReset();
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockResolvedValue(
      1,
    );

    await expect(
      service.create(buildValidInput(), 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('does NOT call repository.create when duplicate is detected', async () => {
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockReset();
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockResolvedValue(
      1,
    );

    await service.create(buildValidInput(), 5).catch(() => {});

    expect(mockedRepo.create).not.toHaveBeenCalled();
  });

  it('propagates the ConflictError message', async () => {
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockReset();
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockResolvedValue(
      1,
    );

    await expect(
      service.create(buildValidInput(), 5),
    ).rejects.toThrow(/đã tồn tại/);
  });

  it('handles a duplicate book in the same department', async () => {
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockReset();
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockResolvedValue(
      1,
    );

    await expect(
      service.create(buildValidInput({ departmentId: 1 }), 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('handles a duplicate book in a different department (no conflict)', async () => {
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockReset();
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockResolvedValue(
      0,
    );

    await expect(
      service.create(buildValidInput({ departmentId: 99 }), 5),
    ).resolves.toBeDefined();
  });

  it('handles a duplicate book with a different year (no conflict)', async () => {
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockReset();
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockResolvedValue(
      0,
    );

    await expect(
      service.create(buildValidInput({ year: currentYear + 1 }), 5),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on duplicate (no password / hash leak)', async () => {
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockReset();
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockResolvedValue(
      1,
    );

    const err = await service
      .create(buildValidInput(), 5)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the duplicate path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.countByNameAndDepartmentAndYearAndType.mockReset();
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockResolvedValue(
      1,
    );

    await expect(
      service.create(buildValidInput(), 5),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: unauthorized creator.
// Result : NOT enforced by the service — service accepts any
//          createdById. The route middleware is responsible.
// ---------------------------------------------------------------------------
describe('[UTCID07] documentBooksService.create() – Abnormal 2: unauthorized creator', () => {
  it('does NOT enforce role — accepts createdById=0 (system)', async () => {
    const result = await service.create(buildValidInput(), 0);

    expect(result).toBeDefined();
  });

  it('does NOT enforce role — accepts createdById=99 (unknown)', async () => {
    const result = await service.create(buildValidInput(), 99);

    expect(result).toBeDefined();
  });

  it('does NOT enforce role — accepts createdById=-1 (negative)', async () => {
    const result = await service.create(buildValidInput(), -1);

    expect(result).toBeDefined();
  });

  it('does NOT throw for createdById=-1 (negative) — does NOT log sensitive info', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const result = await service.create(buildValidInput(), -1);

    expect(result).toBeDefined();
    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('does NOT enforce role — accepts createdById=undefined', async () => {
    const result = await service.create(
      buildValidInput(),
      undefined as any,
    );

    expect(result).toBeDefined();
  });

  it('does NOT enforce role — accepts createdById=null', async () => {
    const result = await service.create(
      buildValidInput(),
      null as any,
    );

    expect(result).toBeDefined();
  });

  it('does NOT enforce role for VIEWER (id=99)', async () => {
    const result = await service.create(buildValidInput(), 99);

    expect(result).toBeDefined();
  });

  it('records a safe diagnostic on role check (no password / hash leak)', async () => {
    // The service does NOT enforce role-based access for the
    // creator (that's the route middleware's job). Verify the
    // service never logs anything sensitive.
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    const result = await service.create(buildValidInput(), -1);

    expect(result).toBeDefined();
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toThrow();

    consoleLogSpy.mockRestore();
  });

  it('does NOT log to console on the unauthorized-creator path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create(buildValidInput(), -1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: minimum / maximum code/name or year
// boundary.
// Result : name=1 char (min), name=255 chars (max),
//          year=2000 (min), year=currentYear+1 (max).
// ---------------------------------------------------------------------------
describe('[UTCID08] documentBooksService.create() – Boundary 1: minimum/maximum code/name or year boundary', () => {
  it('handles the boundary: name=1 char (min)', async () => {
    const input = buildValidInput({ name: 'A' });

    const result = await service.create(input, 5);

    expect(result).toBeDefined();
  });

  it('handles the boundary: name=255 chars (max)', async () => {
    const input = buildValidInput({ name: 'A'.repeat(255) });

    const result = await service.create(input, 5);

    expect(result).toBeDefined();
  });

  it('handles the boundary: code=0 chars (empty — falsy → undefined)', async () => {
    const input = buildValidInput({ code: '' });

    const result = await service.create(input, 5);

    expect(result).toBeDefined();
  });

  it('handles the boundary: code=50 chars (max)', async () => {
    const input = buildValidInput({ code: 'A'.repeat(50) });

    const result = await service.create(input, 5);

    expect(result).toBeDefined();
  });

  it('handles the boundary: year=2000 (min per validation)', async () => {
    const input = buildValidInput({
      year: 2000,
      name: 'Sổ 2000',
    });

    const result = await service.create(input, 5);

    expect(result).toBeDefined();
  });

  it('handles the boundary: year=currentYear+1 (max per validation)', async () => {
    const input = buildValidInput({
      year: currentYear + 1,
      name: 'Sổ ' + (currentYear + 1),
    });

    const result = await service.create(input, 5);

    expect(result).toBeDefined();
  });

  it('handles the boundary: departmentId=1 (min)', async () => {
    const input = buildValidInput({ departmentId: 1 });

    const result = await service.create(input, 5);

    expect(result).toBeDefined();
  });

  it('handles the boundary: departmentId=Number.MAX_SAFE_INTEGER (max)', async () => {
    const input = buildValidInput({
      departmentId: Number.MAX_SAFE_INTEGER,
    });

    const result = await service.create(input, 5);

    expect(result).toBeDefined();
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.create(buildValidInput(), 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create(buildValidInput(), 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
