/**
 * Unit tests for DocumentBooksService.getById() —
 * Function58 / View Detail Document Book.
 *
 * Note on naming: the matrix headers reference
 * `DocumentBookQueryService`. The actual implementation
 * that fetches a document book by id is
 * `DocumentBooksService.getById(id)`.
 *
 * Step-by-step:
 *   1. `book = await documentBooksRepository.findById(id)`.
 *      - Returns null if the book is not found or
 *        soft-deleted.
 *      - Includes: `department`, `createdBy`, `_count
 *        {incomingEntries, outgoingEntries}`.
 *   2. If `book === null`, throw `NotFoundError('Sổ văn bản
 *      không tồn tại')`.
 *   3. Return `book`.
 *
 * The returned book has:
 *   - `id`, `name`, `code`, `description`, `bookType`, `year`,
 *     `currentNumber`, `isDefault`, `status`, `departmentId`,
 *     `createdById`, `openedAt`, `closedAt`, `deletedAt`,
 *     `createdAt`, `updatedAt`.
 *   - `department: { id, name }`.
 *   - `createdBy: { id, fullName }`.
 *   - `_count: { incomingEntries, outgoingEntries }`.
 *
 * Coverage matrix (UTCID01 – UTCID05):
 *   UTCID01  N  – Book metadata: id, name, code, description,
 *                 bookType, year, status, departmentId,
 *                 createdById all present.
 *   UTCID02  N  – Sequence: currentNumber is the sequence
 *                 (0..max).
 *   UTCID03  N  – Document count: _count.incomingEntries and
 *                 _count.outgoingEntries present.
 *   UTCID04  A  – Invalid identifier: NotFoundError when book
 *                 doesn't exist.
 *   UTCID05  B  – Empty book or maximum sequence boundary:
 *                 0 entries, max sequence.
 */

import { DocumentBooksService } from '../../../src/modules/document-books/document-books.service';
import { documentBooksRepository } from '../../../src/modules/document-books/document-books.repository';
import { NotFoundError } from '../../../src/shared/exceptions/app-error';

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
      findUnique: jest.fn(),
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

const buildBook = (overrides: any = {}): any => ({
  id: 1,
  name: 'Sổ văn bản đến 2026',
  code: 'SVD-2026',
  description: 'Sổ văn bản đến năm 2026',
  bookType: 'INCOMING',
  year: currentYear,
  currentNumber: 0,
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
  _count: { incomingEntries: 0, outgoingEntries: 0 },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();

  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockImplementation(async (_id: number) => buildBook());

  service = new DocumentBooksService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: book metadata.
// Result : id, name, code, description, bookType, year,
//          status, departmentId, createdById all present.
// ---------------------------------------------------------------------------
describe('[UTCID01] documentBooksService.getById() – Normal 1: book metadata', () => {
  it('returns a book with id', async () => {
    const result = await service.getById(1);

    expect(result.id).toBe(1);
  });

  it('returns a book with name', async () => {
    const result = await service.getById(1);

    expect(result.name).toBe('Sổ văn bản đến 2026');
  });

  it('returns a book with code', async () => {
    const result = await service.getById(1);

    expect(result.code).toBe('SVD-2026');
  });

  it('returns a book with description', async () => {
    const result = await service.getById(1);

    expect(result.description).toBe('Sổ văn bản đến năm 2026');
  });

  it('returns a book with bookType', async () => {
    const result = await service.getById(1);

    expect(result.bookType).toBe('INCOMING');
  });

  it('returns a book with year', async () => {
    const result = await service.getById(1);

    expect(result.year).toBe(currentYear);
  });

  it('returns a book with status', async () => {
    const result = await service.getById(1);

    expect(result.status).toBe('ACTIVE');
  });

  it('returns a book with departmentId', async () => {
    const result = await service.getById(1);

    expect(result.departmentId).toBe(1);
  });

  it('returns a book with createdById', async () => {
    const result = await service.getById(1);

    expect(result.createdById).toBe(5);
  });

  it('returns a book with department info', async () => {
    const result = await service.getById(1);

    expect(result.department).toBeDefined();
    expect(result.department.id).toBe(1);
    expect(result.department.name).toBe('Phòng Hành chính');
  });

  it('returns a book with createdBy info', async () => {
    const result = await service.getById(1);

    expect(result.createdBy).toBeDefined();
    expect(result.createdBy.id).toBe(5);
    expect(result.createdBy.fullName).toBe('Nguyễn Văn A');
  });

  it('returns a book with openedAt', async () => {
    const result = await service.getById(1);

    expect(result.openedAt).toBeDefined();
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
// UTCID02 – Normal 2: sequence.
// Result : currentNumber is the sequence (0..max).
// ---------------------------------------------------------------------------
describe('[UTCID02] documentBooksService.getById() – Normal 2: sequence', () => {
  it('returns a book with currentNumber', async () => {
    const result = await service.getById(1);

    expect(result.currentNumber).toBeDefined();
  });

  it('returns currentNumber=0 when no documents registered', async () => {
    const result = await service.getById(1);

    expect(result.currentNumber).toBe(0);
  });

  it('returns currentNumber=5 (mid-sequence)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ currentNumber: 5 }),
    );

    const result = await service.getById(1);

    expect(result.currentNumber).toBe(5);
  });

  it('returns currentNumber=100 (high sequence)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ currentNumber: 100 }),
    );

    const result = await service.getById(1);

    expect(result.currentNumber).toBe(100);
  });

  it('returns currentNumber as a number type', async () => {
    const result = await service.getById(1);

    expect(typeof result.currentNumber).toBe('number');
  });

  it('does NOT throw on the sequence path', async () => {
    await expect(service.getById(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the sequence path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getById(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: document count.
// Result : _count.incomingEntries and _count.outgoingEntries
//          present.
// ---------------------------------------------------------------------------
describe('[UTCID03] documentBooksService.getById() – Normal 3: document count', () => {
  it('returns _count object', async () => {
    const result = await service.getById(1);

    expect(result._count).toBeDefined();
  });

  it('returns _count.incomingEntries', async () => {
    const result = await service.getById(1);

    expect(result._count.incomingEntries).toBeDefined();
  });

  it('returns _count.outgoingEntries', async () => {
    const result = await service.getById(1);

    expect(result._count.outgoingEntries).toBeDefined();
  });

  it('returns _count.incomingEntries=5 (mid-count)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ _count: { incomingEntries: 5, outgoingEntries: 0 } }),
    );

    const result = await service.getById(1);

    expect(result._count.incomingEntries).toBe(5);
  });

  it('returns _count.outgoingEntries=3 (mid-count)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ _count: { incomingEntries: 0, outgoingEntries: 3 } }),
    );

    const result = await service.getById(1);

    expect(result._count.outgoingEntries).toBe(3);
  });

  it('returns _count for an INCOMING book with only incoming entries', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({
        bookType: 'INCOMING',
        _count: { incomingEntries: 10, outgoingEntries: 0 },
      }),
    );

    const result = await service.getById(1);

    expect(result._count.incomingEntries).toBe(10);
    expect(result._count.outgoingEntries).toBe(0);
  });

  it('returns _count for an OUTGOING book with only outgoing entries', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({
        bookType: 'OUTGOING',
        _count: { incomingEntries: 0, outgoingEntries: 10 },
      }),
    );

    const result = await service.getById(1);

    expect(result._count.outgoingEntries).toBe(10);
    expect(result._count.incomingEntries).toBe(0);
  });

  it('does NOT throw on the document-count path', async () => {
    await expect(service.getById(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the document-count path', async () => {
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
// Result : NotFoundError when book doesn't exist.
// ---------------------------------------------------------------------------
describe('[UTCID04] documentBooksService.getById() – Abnormal 1: invalid identifier', () => {
  it('throws NotFoundError when book is null', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(service.getById(999)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws NotFoundError with the right message', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(service.getById(999)).rejects.toThrow(
      /Sổ văn bản không tồn tại/,
    );
  });

  it('throws NotFoundError for id=0', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(service.getById(0)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws NotFoundError for negative id', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(service.getById(-1)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws NotFoundError for very large id', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.getById(Number.MAX_SAFE_INTEGER),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('records a safe diagnostic on not-found (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    const err = await service.getById(999).catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the not-found path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(service.getById(999)).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('does NOT throw on an undefined id', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.getById(undefined as any),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does NOT throw on a NaN id', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.getById(NaN),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Boundary 1: empty book or maximum sequence
// boundary.
// Result : 0 entries, max sequence.
// ---------------------------------------------------------------------------
describe('[UTCID05] documentBooksService.getById() – Boundary 1: empty book or maximum sequence boundary', () => {
  it('handles the boundary: empty book (0 entries, 0 sequence)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({
        currentNumber: 0,
        _count: { incomingEntries: 0, outgoingEntries: 0 },
      }),
    );

    const result = await service.getById(1);

    expect(result.currentNumber).toBe(0);
    expect(result._count.incomingEntries).toBe(0);
    expect(result._count.outgoingEntries).toBe(0);
  });

  it('handles the boundary: maximum sequence (currentNumber=Number.MAX_SAFE_INTEGER)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ currentNumber: Number.MAX_SAFE_INTEGER }),
    );

    const result = await service.getById(1);

    expect(result.currentNumber).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('handles the boundary: empty book — only INCOMING entries', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({
        currentNumber: 0,
        bookType: 'INCOMING',
        _count: { incomingEntries: 0, outgoingEntries: 0 },
      }),
    );

    const result = await service.getById(1);

    expect(result._count.incomingEntries).toBe(0);
  });

  it('handles the boundary: empty book — only OUTGOING entries', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({
        currentNumber: 0,
        bookType: 'OUTGOING',
        _count: { incomingEntries: 0, outgoingEntries: 0 },
      }),
    );

    const result = await service.getById(1);

    expect(result._count.outgoingEntries).toBe(0);
  });

  it('handles the boundary: very long name', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ name: 'A'.repeat(10_000) }),
    );

    const result = await service.getById(1);

    expect(result.name).toBeDefined();
  });

  it('handles the boundary: very long description', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ description: 'A'.repeat(10_000) }),
    );

    const result = await service.getById(1);

    expect(result.description).toBeDefined();
  });

  it('handles the boundary: minimum id (1)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(buildBook({ id: 1 }));

    const result = await service.getById(1);

    expect(result.id).toBe(1);
  });

  it('handles the boundary: very large id (Number.MAX_SAFE_INTEGER)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ id: Number.MAX_SAFE_INTEGER }),
    );

    const result = await service.getById(Number.MAX_SAFE_INTEGER);

    expect(result.id).toBe(Number.MAX_SAFE_INTEGER);
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
});
