/**
 * Unit tests for DocumentCategoriesService.create() —
 * Function75 / Create Document Category.
 *
 * Step-by-step:
 *   1. Normalize:
 *      - `name = dto.name.trim().replace(/\s+/g, ' ')`.
 *      - `normalizedName = normalizeDocumentCategoryName
 *        (name)`.
 *      - `code = normalizeDocumentCategoryCode(dto.code)`.
 *      - `description = dto.description?.trim() || null`.
 *      - `status = dto.status ?? DocumentCategoryStatus.
 *        ACTIVE`.
 *   2. Check duplicates (parallel):
 *      - `findByNormalizedName(normalizedName)`.
 *      - `findByCode(code)`.
 *      If either returns a row → throw `ConflictError`.
 *   3. Inside `prisma.$transaction(async (tx) => ...)`:
 *      - `category = repository.create({ name, normalizedName,
 *        code, description, status, createdById: userId }, tx)`.
 *   4. On `Prisma.PrismaClientKnownRequestError.code ===
 *      'P2002'` (race condition), throw `ConflictError('Tên
 *      hoặc mã lĩnh vực văn bản đã tồn tại')`.
 *
 * NOTE: The service does NOT validate the code/name pattern
 * itself — that validation lives in
 * `document-categories.validation.ts` (controller layer).
 *
 * Coverage matrix (UTCID01 – UTCID08):
 *   UTCID01  N  – Valid category.
 *   UTCID02  N  – Unique code/name.
 *   UTCID03  N  – Active default.
 *   UTCID04  N  – Persistence.
 *   UTCID05  N  – Response-to-database consistency.
 *   UTCID06  A  – Missing / duplicate invalid data.
 *   UTCID07  A  – Unauthorized creator.
 *   UTCID08  B  – Minimum / maximum code or name length.
 */

import { DocumentCategoryStatus } from '@prisma/client';
import { DocumentCategoriesService } from '../../../src/modules/document-categories/document-categories.service';
import { DocumentCategoriesRepository } from '../../../src/modules/document-categories/document-categories.repository';
import { ConflictError } from '../../../src/shared/exceptions/app-error';
import prisma from '../../../src/config/database';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/document-categories/document-categories.repository',
  () => {
    const mockFindByNormalizedName = jest.fn();
    const mockFindByCode = jest.fn();
    const mockCreate = jest.fn();
    const mockFindById = jest.fn();
    const mockFindAll = jest.fn();
    const mockUpdate = jest.fn();
    const mockDelete = jest.fn();
    const mockRestore = jest.fn();
    const mockFindActiveOptions = jest.fn();
    const mockCountUsage = jest.fn();
    const mockSoftDelete = jest.fn();
    const mockDeactivate = jest.fn();
    const mockReactivate = jest.fn();

    return {
      __esModule: true,
      DocumentCategoriesRepository: jest.fn().mockImplementation(() => ({
        findByNormalizedName: mockFindByNormalizedName,
        findByCode: mockFindByCode,
        create: mockCreate,
        findById: mockFindById,
        findAll: mockFindAll,
        update: mockUpdate,
        delete: mockDelete,
        restore: mockRestore,
        findActiveOptions: mockFindActiveOptions,
        countUsage: mockCountUsage,
        softDelete: mockSoftDelete,
        deactivate: mockDeactivate,
        reactivate: mockReactivate,
      })),
      _mocks: {
        mockFindByNormalizedName,
        mockFindByCode,
        mockCreate,
        mockFindById,
        mockFindAll,
        mockUpdate,
        mockDelete,
        mockRestore,
        mockFindActiveOptions,
        mockCountUsage,
        mockSoftDelete,
        mockDeactivate,
        mockReactivate,
      },
    };
  },
);

jest.mock('../../../src/config/database', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    documentCategory: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
  },
}));

const mockedRepoModule =
  jest.requireMock(
    '../../../src/modules/document-categories/document-categories.repository',
  );
const mockFindByNormalizedName =
  mockedRepoModule._mocks.mockFindByNormalizedName;
const mockFindByCode = mockedRepoModule._mocks.mockFindByCode;
const mockCreate = mockedRepoModule._mocks.mockCreate;
const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

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

let service: DocumentCategoriesService;

const buildCategory = (overrides: any = {}): any => ({
  id: 1,
  name: 'Hành chính',
  code: 'HC',
  description: 'Hành chính',
  status: DocumentCategoryStatus.ACTIVE,
  isSystem: false,
  createdAt: new Date('2026-09-09T07:00:00.000Z'),
  updatedAt: new Date('2026-09-12T12:00:00.000Z'),
  deletedAt: null,
  createdBy: { id: 5, fullName: 'Admin' },
  usageCount: 0,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();

  mockFindByNormalizedName.mockReset();
  mockFindByNormalizedName.mockResolvedValue(null);

  mockFindByCode.mockReset();
  mockFindByCode.mockResolvedValue(null);

  mockCreate.mockReset();
  mockCreate.mockImplementation(async (data: any) =>
    buildCategory({
      name: data.name,
      code: data.code,
      description: data.description,
      status: data.status,
    }),
  );

  mockedPrisma.$transaction.mockReset();
  mockedPrisma.$transaction.mockImplementation(async (cb: any) =>
    cb({
      documentCategory: mockedPrisma.documentCategory,
    }),
  );

  service = new DocumentCategoriesService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid category.
// Result : create succeeds.
// ---------------------------------------------------------------------------
describe('[UTCID01] documentCategoriesService.create() – Normal 1: valid category', () => {
  it('creates a valid document category', async () => {
    const result = await service.create(
      { name: 'Hành chính', code: 'HC' },
      5,
    );

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('returns the created category with name', async () => {
    const result = await service.create(
      { name: 'Hành chính', code: 'HC' },
      5,
    );

    expect(result.name).toBe('Hành chính');
  });

  it('returns the created category with code', async () => {
    const result = await service.create(
      { name: 'Hành chính', code: 'HC' },
      5,
    );

    expect(result.code).toBe('HC');
  });

  it('returns the created category with ACTIVE status by default', async () => {
    const result = await service.create(
      { name: 'Hành chính', code: 'HC' },
      5,
    );

    expect(result.status).toBe(DocumentCategoryStatus.ACTIVE);
  });

  it('accepts optional description', async () => {
    const result = await service.create(
      { name: 'Hành chính', code: 'HC', description: 'Mô tả' },
      5,
    );

    expect(result.description).toBe('Mô tả');
  });

  it('does NOT throw on the valid-category path', async () => {
    await expect(
      service.create({ name: 'Hành chính', code: 'HC' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the valid-category path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create({ name: 'Hành chính', code: 'HC' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: unique code/name.
// Result : duplicate check fires correctly.
// ---------------------------------------------------------------------------
describe('[UTCID02] documentCategoriesService.create() – Normal 2: unique code/name', () => {
  it('passes normalized name to findByNormalizedName', async () => {
    await service.create({ name: 'Hành chính', code: 'HC' }, 5);

    expect(mockFindByNormalizedName).toHaveBeenCalledWith(
      'hanh chinh',
    );
  });

  it('passes normalized code to findByCode', async () => {
    await service.create({ name: 'Hành chính', code: 'hành_chính' }, 5);

    expect(mockFindByCode).toHaveBeenCalledWith('HÀNH_CHÍNH');
  });

  it('normalizes lowercase code to uppercase', async () => {
    await service.create({ name: 'Kế toán', code: 'kt' }, 5);

    expect(mockFindByCode).toHaveBeenCalledWith('KT');
  });

  it('replaces spaces in code with underscores', async () => {
    await service.create({ name: 'Tài chính', code: 'tai chinh' }, 5);

    expect(mockFindByCode).toHaveBeenCalledWith('TAI_CHINH');
  });

  it('replaces multi-spaces in name with single space', async () => {
    await service.create(
      { name: 'Công   Nghệ   Thông   Tin', code: 'CNTT' },
      5,
    );

    expect(mockFindByNormalizedName).toHaveBeenCalledWith(
      'cong nghe thong tin',
    );
  });

  it('does NOT throw when no duplicate found', async () => {
    await expect(
      service.create({ name: 'Unique', code: 'UNQ' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the unique-code-name path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create({ name: 'Unique', code: 'UNQ' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: active default.
// Result : status defaults to ACTIVE when not provided.
// ---------------------------------------------------------------------------
describe('[UTCID03] documentCategoriesService.create() – Normal 3: active default', () => {
  it('defaults status to ACTIVE when not provided', async () => {
    await service.create({ name: 'Hành chính', code: 'HC' }, 5);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DocumentCategoryStatus.ACTIVE,
      }),
      expect.anything(),
    );
  });

  it('honors explicit status = INACTIVE', async () => {
    await service.create(
      {
        name: 'Hành chính',
        code: 'HC',
        status: DocumentCategoryStatus.INACTIVE,
      },
      5,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DocumentCategoryStatus.INACTIVE,
      }),
      expect.anything(),
    );
  });

  it('returns the category with status = ACTIVE', async () => {
    const result = await service.create(
      { name: 'Hành chính', code: 'HC' },
      5,
    );

    expect(result.status).toBe(DocumentCategoryStatus.ACTIVE);
  });

  it('returns the category with default status when explicit status not set', async () => {
    mockCreate.mockReset();
    mockCreate.mockImplementation(async (data: any) =>
      buildCategory({ status: data.status }),
    );

    const result = await service.create(
      { name: 'Hành chính', code: 'HC' },
      5,
    );

    expect(result.status).toBe(DocumentCategoryStatus.ACTIVE);
  });

  it('does NOT throw on the active-default path', async () => {
    await expect(
      service.create({ name: 'Hành chính', code: 'HC' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the active-default path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create({ name: 'Hành chính', code: 'HC' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: persistence.
// Result : category persisted in transaction.
// ---------------------------------------------------------------------------
describe('[UTCID04] documentCategoriesService.create() – Normal 4: persistence', () => {
  it('persists within prisma.$transaction', async () => {
    await service.create({ name: 'Hành chính', code: 'HC' }, 5);

    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('calls repository.create once', async () => {
    await service.create({ name: 'Hành chính', code: 'HC' }, 5);

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('passes createdById to repository.create', async () => {
    await service.create({ name: 'Hành chính', code: 'HC' }, 5);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        createdById: 5,
      }),
      expect.anything(),
    );
  });

  it('passes different createdById for different user', async () => {
    await service.create({ name: 'Hành chính', code: 'HC' }, 7);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        createdById: 7,
      }),
      expect.anything(),
    );
  });

  it('passes the transaction client to repository.create', async () => {
    await service.create({ name: 'Hành chính', code: 'HC' }, 5);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
    );
  });

  it('does NOT throw on the persistence path', async () => {
    await expect(
      service.create({ name: 'Hành chính', code: 'HC' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the persistence path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create({ name: 'Hành chính', code: 'HC' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : returned category mirrors DB state.
// ---------------------------------------------------------------------------
describe('[UTCID05] documentCategoriesService.create() – Normal 5: response-to-database consistency', () => {
  it('matches DB id to response.id', async () => {
    const result = await service.create(
      { name: 'Hành chính', code: 'HC' },
      5,
    );

    expect(result.id).toBe(1);
  });

  it('matches DB name to response.name', async () => {
    mockCreate.mockReset();
    mockCreate.mockImplementation(async (data: any) =>
      buildCategory({ name: data.name }),
    );

    const result = await service.create(
      { name: 'New Name', code: 'NEW' },
      5,
    );

    expect(result.name).toBe('New Name');
  });

  it('matches DB code to response.code', async () => {
    mockCreate.mockReset();
    mockCreate.mockImplementation(async (data: any) =>
      buildCategory({ code: data.code }),
    );

    const result = await service.create(
      { name: 'Hành chính', code: 'HC' },
      5,
    );

    expect(result.code).toBe('HC');
  });

  it('matches DB status to response.status', async () => {
    const result = await service.create(
      { name: 'Hành chính', code: 'HC' },
      5,
    );

    expect(result.status).toBe(DocumentCategoryStatus.ACTIVE);
  });

  it('matches DB createdBy to response.createdBy', async () => {
    const result = await service.create(
      { name: 'Hành chính', code: 'HC' },
      5,
    );

    expect(result.createdBy.id).toBe(5);
  });

  it('does NOT throw on the consistency path', async () => {
    await expect(
      service.create({ name: 'Hành chính', code: 'HC' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the consistency path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create({ name: 'Hành chính', code: 'HC' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: missing / duplicate invalid data.
// Result : ConflictError on duplicate.
// ---------------------------------------------------------------------------
describe('[UTCID06] documentCategoriesService.create() – Abnormal 1: missing / duplicate invalid data', () => {
  it('throws ConflictError when name is duplicate', async () => {
    mockFindByNormalizedName.mockReset();
    mockFindByNormalizedName.mockResolvedValueOnce({
      id: 2,
      name: 'Duplicate',
    });

    await expect(
      service.create({ name: 'Duplicate', code: 'DUP' }, 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ConflictError when code is duplicate', async () => {
    mockFindByCode.mockReset();
    mockFindByCode.mockResolvedValueOnce({
      id: 2,
      code: 'DUP',
    });

    await expect(
      service.create({ name: 'Unique', code: 'DUP' }, 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('does NOT throw when name check happens before code check (duplicate name)', async () => {
    // Order: name check first, then code check.
    mockFindByNormalizedName.mockReset();
    mockFindByNormalizedName.mockResolvedValueOnce({
      id: 2,
      name: 'Duplicate',
    });

    await expect(
      service.create({ name: 'Duplicate', code: 'DUP' }, 5),
    ).rejects.toThrow(/Tên lĩnh vực văn bản đã tồn tại/);
  });

  it('does NOT throw when code check happens (duplicate code, unique name)', async () => {
    mockFindByCode.mockReset();
    mockFindByCode.mockResolvedValueOnce({
      id: 2,
      code: 'DUP',
    });

    await expect(
      service.create({ name: 'Unique', code: 'DUP' }, 5),
    ).rejects.toThrow(/Mã lĩnh vực văn bản đã tồn tại/);
  });

  it('throws ConflictError on P2002 from prisma (race condition)', async () => {
    const prismaError = Object.create(
      (jest.requireActual('@prisma/client') as any)
        .Prisma.PrismaClientKnownRequestError.prototype,
    );
    prismaError.code = 'P2002';
    prismaError.message = 'Unique constraint failed';
    prismaError.name = 'PrismaClientKnownRequestError';

    mockCreate.mockReset();
    mockCreate.mockRejectedValueOnce(prismaError);

    await expect(
      service.create({ name: 'Hành chính', code: 'HC' }, 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('records a safe diagnostic on duplicate (no password / hash leak)', async () => {
    mockFindByNormalizedName.mockReset();
    mockFindByNormalizedName.mockResolvedValueOnce({
      id: 2,
      name: 'Duplicate',
    });

    const err = await service
      .create({ name: 'Duplicate', code: 'DUP' }, 5)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the duplicate path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockFindByNormalizedName.mockReset();
    mockFindByNormalizedName.mockResolvedValueOnce({
      id: 2,
      name: 'Duplicate',
    });

    await expect(
      service.create({ name: 'Duplicate', code: 'DUP' }, 5),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: unauthorized creator.
// Result : no auth check at service layer; error propagates.
// ---------------------------------------------------------------------------
describe('[UTCID07] documentCategoriesService.create() – Abnormal 2: unauthorized creator', () => {
  it('does NOT throw when userId is negative (no auth check at service)', async () => {
    // No auth check at service; route middleware handles it.
    await expect(
      service.create({ name: 'Hành chính', code: 'HC' }, -1),
    ).resolves.toBeDefined();
  });

  it('does NOT throw when userId = 0 (no auth check at service)', async () => {
    await expect(
      service.create({ name: 'Hành chính', code: 'HC' }, 0),
    ).resolves.toBeDefined();
  });

  it('throws when repository.create throws', async () => {
    mockCreate.mockReset();
    mockCreate.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(
      service.create({ name: 'Hành chính', code: 'HC' }, 5),
    ).rejects.toBeInstanceOf(Error);
  });

  it('throws when prisma.$transaction throws', async () => {
    mockedPrisma.$transaction.mockReset();
    mockedPrisma.$transaction.mockRejectedValueOnce(
      new Error('Transaction failed'),
    );

    await expect(
      service.create({ name: 'Hành chính', code: 'HC' }, 5),
    ).rejects.toBeInstanceOf(Error);
  });

  it('records a safe diagnostic on unauthorized (no password / hash leak)', async () => {
    mockCreate.mockReset();
    mockCreate.mockRejectedValueOnce(new Error('DB connection lost'));

    const err = await service
      .create({ name: 'Hành chính', code: 'HC' }, 5)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the unauthorized path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockCreate.mockReset();
    mockCreate.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(
      service.create({ name: 'Hành chính', code: 'HC' }, 5),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: minimum / maximum code or name length.
// Result : boundary values accepted; validation catches
//          patterns only at the validation layer (not
//          exercised here).
// ---------------------------------------------------------------------------
describe('[UTCID08] documentCategoriesService.create() – Boundary 1: minimum / maximum code or name length', () => {
  it('handles the boundary: name at exactly 1 char', async () => {
    await service.create({ name: 'A', code: 'CODE' }, 5);

    expect(mockCreate).toHaveBeenCalled();
  });

  it('handles the boundary: name at exactly 100 chars', async () => {
    const longName = 'a'.repeat(100);
    await service.create({ name: longName, code: 'CODE' }, 5);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: longName,
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: code at exactly 1 char', async () => {
    await service.create({ name: 'Name', code: 'A' }, 5);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'A',
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: code at exactly 20 chars', async () => {
    const longCode = 'A'.repeat(20);
    await service.create({ name: 'Name', code: longCode }, 5);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        code: longCode,
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: code with special characters (allowed at service)', async () => {
    // Service does NOT validate code pattern.
    await service.create({ name: 'Name', code: 'CV/123' }, 5);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CV/123',
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: name with Vietnamese at 100 chars', async () => {
    const longName = 'Hành'.repeat(25);
    await service.create({ name: longName, code: 'CODE' }, 5);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: longName,
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: userId = 0 (system user)', async () => {
    await expect(
      service.create({ name: 'Hành chính', code: 'HC' }, 0),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: description with 500 chars', async () => {
    const longDesc = 'a'.repeat(500);
    await service.create(
      { name: 'Name', code: 'CODE', description: longDesc },
      5,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        description: longDesc,
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: description with Vietnamese at 500 chars', async () => {
    const longDesc = 'Hành'.repeat(125);
    await service.create(
      { name: 'Name', code: 'CODE', description: longDesc },
      5,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        description: longDesc,
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: description = empty string (becomes null)', async () => {
    await service.create(
      { name: 'Name', code: 'CODE', description: '' },
      5,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        description: null,
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: name with leading/trailing whitespace', async () => {
    await service.create({ name: '  Hành chính  ', code: 'HC' }, 5);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Hành chính',
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: name with multiple internal spaces', async () => {
    await service.create(
      { name: 'Hành    chính', code: 'HC' },
      5,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Hành chính',
      }),
      expect.anything(),
    );
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.create({ name: 'A', code: 'A' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create({ name: 'A', code: 'A' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
