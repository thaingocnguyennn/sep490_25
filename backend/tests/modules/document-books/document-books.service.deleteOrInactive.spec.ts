/**
 * Unit tests for DocumentBooksService.deleteOrInactive() —
 * Function60 / Delete/Manage Document Book.
 *
 * Note on naming: the matrix headers reference
 * `DocumentBookService`. The actual implementation that
 * deletes or deactivates a document book is
 * `DocumentBooksService.deleteOrInactive(id)`.
 *
 * The matrix is labelled "Delete/Manage Document Book" —
 * because the service has two paths:
 *   - Empty book: soft-delete (mark `deletedAt`, hidden
 *     from lists).
 *   - Non-empty book: deactivate (set `status='INACTIVE'`,
 *     keep entries intact).
 *
 * Step-by-step:
 *   1. `book = await documentBooksRepository.findById(id)`.
 *   2. If `book === null`, throw
 *      `NotFoundError('Sổ văn bản không tồn tại')`.
 *   3. If `book.status === 'CLOSED'`, throw
 *      `BadRequestError('Không thể xóa sổ đã khóa. Vui lòng
 *      mở lại sổ trước nếu muốn xóa.')`.
 *   4. If `book.status === 'INACTIVE'`, throw
 *      `BadRequestError('Sổ văn bản này đã ngừng hoạt động.')`.
 *   5. `entriesCount = countEntries(id)` — returns
 *      `{ incoming, outgoing }`.
 *   6. `totalEntries = incoming + outgoing`.
 *   7. If `totalEntries > 0`:
 *      - If `book.isDefault`, throw `BadRequestError('Không
 *        thể vô hiệu hóa sổ đang là mặc định. Vui lòng chọn
 *        sổ mặc định khác trước.')`.
 *      - Otherwise: `updateStatus(id, 'INACTIVE')` — the
 *        book is deactivated, entries preserved.
 *   8. Otherwise (empty book):
 *      - `softDelete(id)` — sets `deletedAt`, hidden from
 *        future lists.
 *
 * Coverage matrix (UTCID01 – UTCID07):
 *   UTCID01  N  – Deactivate empty book: totalEntries=0
 *                 triggers soft-delete path.
 *   UTCID02  N  – Management state: status='INACTIVE' on a
 *                 non-empty book.
 *   UTCID03  N  – Visibility: after deleteOrInactive, the
 *                 book is hidden (deletedAt set or
 *                 status=INACTIVE).
 *   UTCID04  N  – Audit: prisma.documentBook.update is
 *                 called.
 *   UTCID05  A  – Not found / unauthorized: NotFoundError.
 *   UTCID06  A  – Referenced book conflict: default book with
 *                 entries → BadRequestError.
 *   UTCID07  B  – Already inactive or empty-book boundary:
 *                 status='INACTIVE' rejected, empty book
 *                 soft-deleted.
 */

import { DocumentBooksService } from '../../../src/modules/document-books/document-books.service';
import { documentBooksRepository } from '../../../src/modules/document-books/document-books.repository';
import {
  NotFoundError,
  BadRequestError,
} from '../../../src/shared/exceptions/app-error';

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
      update: jest.fn(),
      count: jest.fn(),
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

  mockedRepo.countEntries.mockReset();
  mockedRepo.countEntries.mockResolvedValue({ incoming: 0, outgoing: 0 });

  mockedRepo.updateStatus.mockReset();
  mockedRepo.updateStatus.mockImplementation(
    async (id: number, status: string) =>
      buildBook({ id, status, updatedAt: new Date() }),
  );

  mockedRepo.softDelete.mockReset();
  mockedRepo.softDelete.mockImplementation(async (id: number) =>
    buildBook({
      id,
      deletedAt: new Date(),
      status: 'INACTIVE',
      updatedAt: new Date(),
    }),
  );

  service = new DocumentBooksService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: deactivate empty book.
// Result : totalEntries=0 triggers soft-delete path.
// ---------------------------------------------------------------------------
describe('[UTCID01] documentBooksService.deleteOrInactive() – Normal 1: deactivate empty book', () => {
  it('soft-deletes an empty book (incoming=0, outgoing=0)', async () => {
    const result = await service.deleteOrInactive(1);

    expect(result).toBeDefined();
    expect(mockedRepo.softDelete).toHaveBeenCalledWith(1);
  });

  it('does NOT call updateStatus when soft-deleting', async () => {
    await service.deleteOrInactive(1);

    expect(mockedRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('does NOT throw on the empty-book path', async () => {
    await expect(service.deleteOrInactive(1)).resolves.toBeDefined();
  });

  it('handles empty book: incoming=0, outgoing=0', async () => {
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 0, outgoing: 0 });

    await service.deleteOrInactive(1);

    expect(mockedRepo.softDelete).toHaveBeenCalledWith(1);
  });

  it('does NOT log to console on the empty-book path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.deleteOrInactive(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('handles empty book even when isDefault=true (only constraint is for non-empty)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ isDefault: true }),
    );

    await service.deleteOrInactive(1);

    expect(mockedRepo.softDelete).toHaveBeenCalledWith(1);
  });

  it('returns the soft-deleted book', async () => {
    const result = await service.deleteOrInactive(1);

    expect(result.deletedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: management state.
// Result : status='INACTIVE' on a non-empty book.
// ---------------------------------------------------------------------------
describe('[UTCID02] documentBooksService.deleteOrInactive() – Normal 2: management state', () => {
  it('deactivates a non-empty book (status=INACTIVE)', async () => {
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 0 });

    const result = await service.deleteOrInactive(1);

    expect(result).toBeDefined();
    expect(mockedRepo.updateStatus).toHaveBeenCalledWith(1, 'INACTIVE');
  });

  it('does NOT call softDelete when deactivating', async () => {
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 0 });

    await service.deleteOrInactive(1);

    expect(mockedRepo.softDelete).not.toHaveBeenCalled();
  });

  it('handles incoming-only non-empty book', async () => {
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 0 });

    await service.deleteOrInactive(1);

    expect(mockedRepo.updateStatus).toHaveBeenCalledWith(1, 'INACTIVE');
  });

  it('handles outgoing-only non-empty book', async () => {
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 0, outgoing: 5 });

    await service.deleteOrInactive(1);

    expect(mockedRepo.updateStatus).toHaveBeenCalledWith(1, 'INACTIVE');
  });

  it('handles both incoming and outgoing non-empty book', async () => {
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 5 });

    await service.deleteOrInactive(1);

    expect(mockedRepo.updateStatus).toHaveBeenCalledWith(1, 'INACTIVE');
  });

  it('does NOT throw on the management-state path', async () => {
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 0 });

    await expect(service.deleteOrInactive(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the management-state path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 0 });

    await service.deleteOrInactive(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('returns the INACTIVE book', async () => {
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 0 });

    const result = await service.deleteOrInactive(1);

    expect(result.status).toBe('INACTIVE');
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: visibility.
// Result : after deleteOrInactive, the book is hidden
//          (deletedAt set or status=INACTIVE).
// ---------------------------------------------------------------------------
describe('[UTCID03] documentBooksService.deleteOrInactive() – Normal 3: visibility', () => {
  it('hides the empty book from future lists (deletedAt set)', async () => {
    const result = await service.deleteOrInactive(1);

    expect(result.deletedAt).toBeDefined();
    expect(result.deletedAt).not.toBeNull();
  });

  it('hides the non-empty book from active lists (status=INACTIVE)', async () => {
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 0 });

    const result = await service.deleteOrInactive(1);

    expect(result.status).toBe('INACTIVE');
  });

  it('soft-deleted book has updatedAt timestamp', async () => {
    const result = await service.deleteOrInactive(1);

    expect(result.updatedAt).toBeDefined();
  });

  it('deactivated book has updatedAt timestamp', async () => {
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 0 });

    const result = await service.deleteOrInactive(1);

    expect(result.updatedAt).toBeDefined();
  });

  it('returns the book with the same id', async () => {
    const result = await service.deleteOrInactive(1);

    expect(result.id).toBe(1);
  });

  it('does NOT throw on the visibility path', async () => {
    await expect(service.deleteOrInactive(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the visibility path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.deleteOrInactive(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: audit.
// Result : prisma.documentBook.update is called.
// ---------------------------------------------------------------------------
describe('[UTCID04] documentBooksService.deleteOrInactive() – Normal 4: audit', () => {
  it('persists via updateStatus on non-empty book', async () => {
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 0 });

    await service.deleteOrInactive(1);

    expect(mockedRepo.updateStatus).toHaveBeenCalledWith(1, 'INACTIVE');
  });

  it('persists via softDelete on empty book', async () => {
    await service.deleteOrInactive(1);

    expect(mockedRepo.softDelete).toHaveBeenCalledWith(1);
  });

  it('does NOT call updateStatus on empty book', async () => {
    await service.deleteOrInactive(1);

    expect(mockedRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('does NOT call softDelete on non-empty book', async () => {
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 0 });

    await service.deleteOrInactive(1);

    expect(mockedRepo.softDelete).not.toHaveBeenCalled();
  });

  it('does NOT throw on the audit path', async () => {
    await expect(service.deleteOrInactive(1)).resolves.toBeDefined();
  });

  it('does NOT log to console on the audit path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.deleteOrInactive(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 1: not found/unauthorized.
// Result : NotFoundError when book doesn't exist.
// ---------------------------------------------------------------------------
describe('[UTCID05] documentBooksService.deleteOrInactive() – Abnormal 1: not found/unauthorized', () => {
  it('throws NotFoundError when book is null', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(service.deleteOrInactive(999)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws NotFoundError with the right message', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(service.deleteOrInactive(999)).rejects.toThrow(
      /Sổ văn bản không tồn tại/,
    );
  });

  it('throws NotFoundError for id=0', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(service.deleteOrInactive(0)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws NotFoundError for negative id', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(service.deleteOrInactive(-1)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws BadRequestError when book is CLOSED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ status: 'CLOSED' }),
    );

    await expect(service.deleteOrInactive(1)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('throws BadRequestError when book is already INACTIVE', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ status: 'INACTIVE' }),
    );

    await expect(service.deleteOrInactive(1)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('records a safe diagnostic on not-found (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    const err = await service.deleteOrInactive(999).catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT call softDelete on not-found', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await service.deleteOrInactive(999).catch(() => {});

    expect(mockedRepo.softDelete).not.toHaveBeenCalled();
  });

  it('does NOT log to console on the not-found path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(service.deleteOrInactive(999)).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 2: referenced book conflict.
// Result : default book with entries → BadRequestError.
// ---------------------------------------------------------------------------
describe('[UTCID06] documentBooksService.deleteOrInactive() – Abnormal 2: referenced book conflict', () => {
  it('throws BadRequestError when default book has entries', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ isDefault: true }),
    );
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 0 });

    await expect(service.deleteOrInactive(1)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('throws BadRequestError with the right message', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ isDefault: true }),
    );
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 0 });

    await expect(service.deleteOrInactive(1)).rejects.toThrow(
      /sổ đang là mặc định/,
    );
  });

  it('does NOT call updateStatus on default-book conflict', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ isDefault: true }),
    );
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 0 });

    await service.deleteOrInactive(1).catch(() => {});

    expect(mockedRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('does NOT call softDelete on default-book conflict', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ isDefault: true }),
    );
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 0 });

    await service.deleteOrInactive(1).catch(() => {});

    expect(mockedRepo.softDelete).not.toHaveBeenCalled();
  });

  it('allows deactivation of default book when it has NO entries', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ isDefault: true }),
    );
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 0, outgoing: 0 });

    await service.deleteOrInactive(1);

    expect(mockedRepo.softDelete).toHaveBeenCalledWith(1);
  });

  it('allows deactivation of non-default non-empty book', async () => {
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 0 });

    await service.deleteOrInactive(1);

    expect(mockedRepo.updateStatus).toHaveBeenCalledWith(1, 'INACTIVE');
  });

  it('records a safe diagnostic on conflict (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ isDefault: true }),
    );
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 0 });

    const err = await service.deleteOrInactive(1).catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the conflict path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ isDefault: true }),
    );
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 5, outgoing: 0 });

    await expect(service.deleteOrInactive(1)).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Boundary 1: already inactive or empty-book
// boundary.
// Result : status='INACTIVE' rejected, empty book
//          soft-deleted.
// ---------------------------------------------------------------------------
describe('[UTCID07] documentBooksService.deleteOrInactive() – Boundary 1: already inactive or empty-book boundary', () => {
  it('handles the boundary: already INACTIVE book (rejected)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ status: 'INACTIVE' }),
    );

    await expect(service.deleteOrInactive(1)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('handles the boundary: empty book (incoming=0, outgoing=0) — soft-deleted', async () => {
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 0, outgoing: 0 });

    await service.deleteOrInactive(1);

    expect(mockedRepo.softDelete).toHaveBeenCalledWith(1);
  });

  it('handles the boundary: minimal entry count (incoming=1)', async () => {
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 1, outgoing: 0 });

    await service.deleteOrInactive(1);

    expect(mockedRepo.updateStatus).toHaveBeenCalledWith(1, 'INACTIVE');
    expect(mockedRepo.softDelete).not.toHaveBeenCalled();
  });

  it('handles the boundary: minimal entry count (outgoing=1)', async () => {
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({ incoming: 0, outgoing: 1 });

    await service.deleteOrInactive(1);

    expect(mockedRepo.updateStatus).toHaveBeenCalledWith(1, 'INACTIVE');
    expect(mockedRepo.softDelete).not.toHaveBeenCalled();
  });

  it('handles the boundary: very large entry count', async () => {
    mockedRepo.countEntries.mockReset();
    mockedRepo.countEntries.mockResolvedValueOnce({
      incoming: 100_000,
      outgoing: 100_000,
    });

    await service.deleteOrInactive(1);

    expect(mockedRepo.updateStatus).toHaveBeenCalledWith(1, 'INACTIVE');
  });

  it('handles the boundary: id=1 (minimum)', async () => {
    const result = await service.deleteOrInactive(1);

    expect(result).toBeDefined();
  });

  it('handles the boundary: id=Number.MAX_SAFE_INTEGER', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ id: Number.MAX_SAFE_INTEGER }),
    );

    const result = await service.deleteOrInactive(Number.MAX_SAFE_INTEGER);

    expect(result).toBeDefined();
  });

  it('does NOT throw on the boundary path (empty book)', async () => {
    await expect(service.deleteOrInactive(1)).resolves.toBeDefined();
  });

  it('throws BadRequestError on the boundary path (INACTIVE book)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ status: 'INACTIVE' }),
    );

    await expect(service.deleteOrInactive(1)).rejects.toThrow(
      BadRequestError,
    );
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.deleteOrInactive(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
