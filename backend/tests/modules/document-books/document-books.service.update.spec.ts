/**
 * Unit tests for DocumentBooksService.update() —
 * Function59 / Update Document Book.
 *
 * Note on naming: the matrix headers reference
 * `DocumentBookService`. The actual implementation that
 * updates a document book is
 * `DocumentBooksService.update(id, input)`.
 *
 * Step-by-step:
 *   1. `book = await documentBooksRepository.findById(id)`.
 *   2. If `book === null`, throw
 *      `NotFoundError('Sổ văn bản không tồn tại')`.
 *   3. If `book.status === 'CLOSED'`, throw
 *      `BadRequestError('Không thể chỉnh sửa sổ đã khóa. Vui
 *      lòng mở lại sổ trước.')`.
 *   4. If `book.status === 'INACTIVE'`, throw
 *      `BadRequestError('Không thể chỉnh sửa sổ đang ngừng
 *      hoạt động.')`.
 *   5. If `input.name && input.name !== book.name`, check
 *      duplicate: `nameCount = countByNameAndDepartmentAnd
 *      YearAndType(name, departmentId, year, bookType, id)`.
 *      If `nameCount > 0`, throw
 *      `ConflictError('Tên sổ văn bản đã tồn tại')`.
 *   6. If `input.isDefault && !book.isDefault`, call
 *      `unsetDefaultBook(departmentId, bookType, year)`.
 *   7. `return documentBooksRepository.update(id, input)`.
 *
 * Important: the service signature is `update(id, input)`.
 * No `userId` parameter — the route middleware handles
 * authorization. UTCID07 verifies that the service doesn't
 * reject based on the caller — that's the route layer's
 * responsibility.
 *
 * Coverage matrix (UTCID01 – UTCID08):
 *   UTCID01  N  – Valid update: full update with all fields.
 *   UTCID02  N  – Partial update: only some fields.
 *   UTCID03  N  – Status change: status='CLOSED'/'INACTIVE'/
 *                 'ACTIVE'.
 *   UTCID04  N  – Persistence/audit: prisma.documentBook
 *                 .update is called with the right input.
 *   UTCID05  N  – Response-to-database consistency: returned
 *                 book has the same updated fields.
 *   UTCID06  A  – Duplicate / invalid data: ConflictError
 *                 when name already exists.
 *   UTCID07  A  – Not found / unauthorized: NotFoundError when
 *                 book doesn't exist.
 *   UTCID08  B  – Maximum field or sequence boundary:
 *                 name=255 chars (max), code=50 chars (max).
 */

import { DocumentBooksService } from '../../../src/modules/document-books/document-books.service';
import { documentBooksRepository } from '../../../src/modules/document-books/document-books.repository';
import {
  NotFoundError,
  ConflictError,
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

const buildValidInput = (overrides: any = {}): any => ({
  name: 'Sổ văn bản đến 2026 updated',
  code: 'SVD-2026-NEW',
  description: 'Updated description',
  isDefault: false,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();

  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockImplementation(async (_id: number) => buildBook());

  mockedRepo.countByNameAndDepartmentAndYearAndType.mockReset();
  mockedRepo.countByNameAndDepartmentAndYearAndType.mockResolvedValue(0);

  mockedRepo.unsetDefaultBook.mockReset();
  mockedRepo.unsetDefaultBook.mockResolvedValue(undefined as any);

  mockedRepo.update.mockReset();
  mockedRepo.update.mockImplementation(
    async (id: number, data: any) =>
      buildBook({ id, ...data, updatedAt: new Date() }),
  );

  service = new DocumentBooksService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid update.
// Result : full update with all fields.
// ---------------------------------------------------------------------------
describe('[UTCID01] documentBooksService.update() – Normal 1: valid update', () => {
  it('updates a valid book', async () => {
    const result = await service.update(1, buildValidInput());

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('does NOT throw on the update path', async () => {
    await expect(
      service.update(1, buildValidInput()),
    ).resolves.toBeDefined();
  });

  it('calls repository.findById', async () => {
    await service.update(1, buildValidInput());

    expect(mockedRepo.findById).toHaveBeenCalledWith(1);
  });

  it('calls repository.update with the input', async () => {
    const input = buildValidInput();

    await service.update(1, input);

    expect(mockedRepo.update).toHaveBeenCalledWith(1, input);
  });

  it('returns the updated book', async () => {
    const result = await service.update(1, buildValidInput());

    expect(result.name).toBe('Sổ văn bản đến 2026 updated');
  });

  it('handles a name-only update', async () => {
    const input = buildValidInput({
      name: 'Just name',
      code: undefined,
      description: undefined,
    });

    const result = await service.update(1, input);

    expect(result).toBeDefined();
  });

  it('handles a code-only update', async () => {
    const input = buildValidInput({
      name: undefined,
      code: 'NEW-CODE',
      description: undefined,
    });

    const result = await service.update(1, input);

    expect(result).toBeDefined();
  });

  it('handles a description-only update', async () => {
    const input = buildValidInput({
      name: undefined,
      code: undefined,
      description: 'New desc',
    });

    const result = await service.update(1, input);

    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: partial update.
// Result : only some fields.
// ---------------------------------------------------------------------------
describe('[UTCID02] documentBooksService.update() – Normal 2: partial update', () => {
  it('handles partial update: only name', async () => {
    const input = buildValidInput({
      code: undefined,
      description: undefined,
    });

    const result = await service.update(1, input);

    expect(result).toBeDefined();
  });

  it('handles partial update: only isDefault', async () => {
    const input = buildValidInput({
      name: undefined,
      code: undefined,
      description: undefined,
      isDefault: true,
    });

    const result = await service.update(1, input);

    expect(result).toBeDefined();
  });

  it('handles partial update: only status', async () => {
    const input = buildValidInput({
      name: undefined,
      code: undefined,
      description: undefined,
      isDefault: undefined,
      status: 'CLOSED',
    });

    const result = await service.update(1, input);

    expect(result).toBeDefined();
  });

  it('handles partial update: only code', async () => {
    const input = buildValidInput({
      name: undefined,
      description: undefined,
    });

    const result = await service.update(1, input);

    expect(result).toBeDefined();
  });

  it('handles partial update: empty input', async () => {
    const input = {};

    const result = await service.update(1, input);

    expect(result).toBeDefined();
  });

  it('does NOT call unsetDefaultBook when isDefault is not in input', async () => {
    const input = buildValidInput({ isDefault: undefined });

    await service.update(1, input);

    expect(mockedRepo.unsetDefaultBook).not.toHaveBeenCalled();
  });

  it('does NOT call unsetDefaultBook when isDefault is already true', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ isDefault: true }),
    );

    const input = buildValidInput({ isDefault: true });

    await service.update(1, input);

    expect(mockedRepo.unsetDefaultBook).not.toHaveBeenCalled();
  });

  it('does NOT throw on the partial-update path', async () => {
    await expect(
      service.update(1, { name: 'X' }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: status change.
// Result : status='CLOSED'/'INACTIVE'/'ACTIVE'.
// ---------------------------------------------------------------------------
describe('[UTCID03] documentBooksService.update() – Normal 3: status change', () => {
  it('handles status=ACTIVE', async () => {
    const input = buildValidInput({ status: 'ACTIVE' });

    const result = await service.update(1, input);

    expect(result).toBeDefined();
  });

  it('handles status=CLOSED', async () => {
    const input = buildValidInput({ status: 'CLOSED' });

    const result = await service.update(1, input);

    expect(result).toBeDefined();
  });

  it('handles status=INACTIVE', async () => {
    const input = buildValidInput({ status: 'INACTIVE' });

    const result = await service.update(1, input);

    expect(result).toBeDefined();
  });

  it('forwards status to repository', async () => {
    const input = buildValidInput({ status: 'INACTIVE' });

    await service.update(1, input);

    expect(mockedRepo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'INACTIVE' }),
    );
  });

  it('rejects update on a CLOSED book', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ status: 'CLOSED' }),
    );

    await expect(
      service.update(1, buildValidInput()),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects update on an INACTIVE book', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ status: 'INACTIVE' }),
    );

    await expect(
      service.update(1, buildValidInput()),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT throw on the status-change path', async () => {
    await expect(
      service.update(1, buildValidInput()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the status-change path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.update(1, buildValidInput());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: persistence/audit.
// Result : prisma.documentBook.update is called with the
//          right input.
// ---------------------------------------------------------------------------
describe('[UTCID04] documentBooksService.update() – Normal 4: persistence/audit', () => {
  it('calls prisma.documentBook.update', async () => {
    await service.update(1, buildValidInput());

    expect(mockedRepo.update).toHaveBeenCalled();
  });

  it('persists the id', async () => {
    await service.update(1, buildValidInput());

    expect(mockedRepo.update).toHaveBeenCalledWith(1, expect.anything());
  });

  it('persists the name', async () => {
    const input = buildValidInput({ name: 'Persisted Name' });

    await service.update(1, input);

    expect(mockedRepo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ name: 'Persisted Name' }),
    );
  });

  it('persists the code', async () => {
    const input = buildValidInput({ code: 'PERSISTED-CODE' });

    await service.update(1, input);

    expect(mockedRepo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ code: 'PERSISTED-CODE' }),
    );
  });

  it('persists the description', async () => {
    const input = buildValidInput({ description: 'Persisted desc' });

    await service.update(1, input);

    expect(mockedRepo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ description: 'Persisted desc' }),
    );
  });

  it('persists isDefault', async () => {
    const input = buildValidInput({ isDefault: true });

    await service.update(1, input);

    expect(mockedRepo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ isDefault: true }),
    );
  });

  it('does NOT throw on the persistence path', async () => {
    await expect(
      service.update(1, buildValidInput()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the persistence path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.update(1, buildValidInput());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : returned book has the same updated fields.
// ---------------------------------------------------------------------------
describe('[UTCID05] documentBooksService.update() – Normal 5: response-to-database consistency', () => {
  it('returns the same id as the input', async () => {
    const result = await service.update(1, buildValidInput());

    expect(result.id).toBe(1);
  });

  it('returns the same name as the input', async () => {
    const result = await service.update(1, buildValidInput({ name: 'New Name XYZ' }));

    expect(result.name).toBe('New Name XYZ');
  });

  it('returns the same code as the input', async () => {
    const result = await service.update(1, buildValidInput({ code: 'NEW-CODE-XYZ' }));

    expect(result.code).toBe('NEW-CODE-XYZ');
  });

  it('returns the same description as the input', async () => {
    const result = await service.update(1, buildValidInput({ description: 'New desc XYZ' }));

    expect(result.description).toBe('New desc XYZ');
  });

  it('returns the same isDefault as the input', async () => {
    const result = await service.update(1, buildValidInput({ isDefault: true }));

    expect(result.isDefault).toBe(true);
  });

  it('returns the same status as the input', async () => {
    const result = await service.update(1, buildValidInput({ status: 'CLOSED' }));

    expect(result.status).toBe('CLOSED');
  });

  it('returns the same departmentId as the existing record', async () => {
    const result = await service.update(1, buildValidInput());

    expect(result.departmentId).toBe(1);
  });

  it('returns the same year as the existing record', async () => {
    const result = await service.update(1, buildValidInput());

    expect(result.year).toBe(currentYear);
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: duplicate/invalid data.
// Result : ConflictError when name already exists.
// ---------------------------------------------------------------------------
describe('[UTCID06] documentBooksService.update() – Abnormal 1: duplicate/invalid data', () => {
  it('throws ConflictError when name already exists', async () => {
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockReset();
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockResolvedValue(1);

    await expect(
      service.update(1, buildValidInput({ name: 'Duplicate Name' })),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ConflictError with the right message', async () => {
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockReset();
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockResolvedValue(1);

    await expect(
      service.update(1, buildValidInput({ name: 'Duplicate Name' })),
    ).rejects.toThrow(/đã tồn tại/);
  });

  it('does NOT throw when name is the same as existing', async () => {
    await expect(
      service.update(1, buildValidInput({ name: 'Sổ văn bản đến 2026' })),
    ).resolves.toBeDefined();
  });

  it('does NOT throw when name is undefined (no rename)', async () => {
    await expect(
      service.update(1, buildValidInput({ name: undefined })),
    ).resolves.toBeDefined();
  });

  it('does NOT call repository.update when duplicate is detected', async () => {
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockReset();
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockResolvedValue(1);

    await service.update(1, buildValidInput({ name: 'Dup' })).catch(() => {});

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on duplicate (no password / hash leak)', async () => {
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockReset();
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockResolvedValue(1);

    const err = await service
      .update(1, buildValidInput({ name: 'Dup' }))
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the duplicate path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.countByNameAndDepartmentAndYearAndType.mockReset();
    mockedRepo.countByNameAndDepartmentAndYearAndType.mockResolvedValue(1);

    await expect(
      service.update(1, buildValidInput({ name: 'Dup' })),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: not found/unauthorized.
// Result : NotFoundError when book doesn't exist.
// ---------------------------------------------------------------------------
describe('[UTCID07] documentBooksService.update() – Abnormal 2: not found/unauthorized', () => {
  it('throws NotFoundError when book is null', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.update(999, buildValidInput()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError with the right message', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.update(999, buildValidInput()),
    ).rejects.toThrow(/Sổ văn bản không tồn tại/);
  });

  it('throws NotFoundError for id=0', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.update(0, buildValidInput()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError for negative id', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.update(-1, buildValidInput()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws BadRequestError for CLOSED book', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ status: 'CLOSED' }),
    );

    await expect(
      service.update(1, buildValidInput()),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError for INACTIVE book', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ status: 'INACTIVE' }),
    );

    await expect(
      service.update(1, buildValidInput()),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('records a safe diagnostic on not-found (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    const err = await service
      .update(999, buildValidInput())
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the not-found path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.update(999, buildValidInput()),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: maximum field or sequence boundary.
// Result : name=255 chars (max), code=50 chars (max).
// ---------------------------------------------------------------------------
describe('[UTCID08] documentBooksService.update() – Boundary 1: maximum field or sequence boundary', () => {
  it('handles the boundary: name=255 chars (max per validation)', async () => {
    const input = buildValidInput({ name: 'A'.repeat(255) });

    const result = await service.update(1, input);

    expect(result).toBeDefined();
  });

  it('handles the boundary: name=1 char (min per validation)', async () => {
    const input = buildValidInput({ name: 'A' });

    const result = await service.update(1, input);

    expect(result).toBeDefined();
  });

  it('handles the boundary: code=50 chars (max per validation)', async () => {
    const input = buildValidInput({ code: 'A'.repeat(50) });

    const result = await service.update(1, input);

    expect(result).toBeDefined();
  });

  it('handles the boundary: code=empty string (cleared)', async () => {
    const input = buildValidInput({ code: '' });

    const result = await service.update(1, input);

    expect(result).toBeDefined();
  });

  it('handles the boundary: code=null (cleared)', async () => {
    const input = buildValidInput({ code: null });

    const result = await service.update(1, input);

    expect(result).toBeDefined();
  });

  it('handles the boundary: description=very long', async () => {
    const input = buildValidInput({ description: 'A'.repeat(10_000) });

    const result = await service.update(1, input);

    expect(result).toBeDefined();
  });

  it('handles the boundary: id=Number.MAX_SAFE_INTEGER', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildBook({ id: Number.MAX_SAFE_INTEGER }),
    );
    mockedRepo.update.mockReset();
    mockedRepo.update.mockImplementation(
      async (id: number, data: any) =>
        buildBook({ id, ...data, updatedAt: new Date() }),
    );

    const result = await service.update(
      Number.MAX_SAFE_INTEGER,
      buildValidInput(),
    );

    expect(result).toBeDefined();
  });

  it('handles the boundary: minimum id (1)', async () => {
    const result = await service.update(1, buildValidInput());

    expect(result).toBeDefined();
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.update(1, buildValidInput()),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.update(1, buildValidInput());

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
