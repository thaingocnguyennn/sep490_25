/**
 * Unit tests for DocumentCategoriesService.update() —
 * Function73 / Update Document Category.
 *
 * Step-by-step:
 *   1. `category = await repository.findById(id)`.
 *   2. If not found → throw `NotFoundError('Lĩnh vực văn
 *      bản không tồn tại')`.
 *   3. Guard:
 *      - If `category.deletedAt` → throw `ConflictError
 *        ('Lĩnh vực văn bản đã bị xoá, không thể chỉnh
 *        sửa')`.
 *      - If `category.isSystem` → throw `ForbiddenError
 *        ('Không thể chỉnh sửa lĩnh vực văn bản của hệ
 *        thống')`.
 *   4. At least one field must be provided (name, code,
 *      description, or status). If none → throw
 *      `BadRequestError('Không có thông tin nào được cung
 *      cấp để cập nhật')`.
 *   5. If `dto.name` is provided:
 *      - Normalize: `name = dto.name.trim().replace(/\s+/g,
 *        ' ')`; `normalizedName = normalizeDocumentCategory
 *        Name(name)`.
 *      - Check duplicate: `findByNormalizedName
 *        (normalizedName, id)`; if exists → throw
 *        `ConflictError('Tên lĩnh vực văn bản đã tồn
 *        tại')`.
 *      - Set `updateData.name = name; updateData.normalized
 *        Name = normalizedName`.
 *   6. If `dto.code` is provided:
 *      - Normalize: `code = normalizeDocumentCategoryCode
 *        (dto.code)`.
 *      - If `code !== category.code`:
 *        - `usage = repository.countUsage(id)`; if usage
 *          > 0 → throw `ConflictError('Không thể thay đổi
 *          mã lĩnh vực vì đang được sử dụng bởi văn bản')`.
 *        - `findByCode(code, id)`; if exists → throw
 *          `ConflictError`.
 *      - Set `updateData.code = code`.
 *   7. If `dto.description` is provided:
 *      - `description === null ? null : trim() || null`.
 *   8. If `dto.status` is provided:
 *      - Set `updateData.status = dto.status`.
 *   9. Update inside `prisma.$transaction(async (tx) =>
 *      repository.update(id, updateData, tx))`.
 *  10. On `Prisma.PrismaClientKnownRequestError.code ===
 *      'P2002'`, throw `ConflictError`.
 *
 * NOTE: The service does NOT validate the code pattern
 * itself — that validation lives in
 * `document-categories.validation.ts`. The service trusts
 * the route layer to have validated inputs. Pattern-violation
 * cases should be exercised at the controller/integration
 * level, not at the service unit level.
 *
 * Coverage matrix (UTCID01 – UTCID08):
 *   UTCID01  N  – Valid update.
 *   UTCID02  N  – Partial update.
 *   UTCID03  N  – Status change.
 *   UTCID04  N  – Persistence/audit.
 *   UTCID05  N  – Response-to-database consistency.
 *   UTCID06  A  – Duplicate/invalid data.
 *   UTCID07  A  – Not found / unauthorized.
 *   UTCID08  B  – Maximum code/name length.
 */

import { DocumentCategoryStatus } from '@prisma/client';
import { DocumentCategoriesService } from '../../../src/modules/document-categories/document-categories.service';
import { DocumentCategoriesRepository } from '../../../src/modules/document-categories/document-categories.repository';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../src/shared/exceptions/app-error';
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
const mockFindById = mockedRepoModule._mocks.mockFindById;
const mockUpdate = mockedRepoModule._mocks.mockUpdate;
const mockCountUsage = mockedRepoModule._mocks.mockCountUsage;
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

  mockFindById.mockReset();
  mockFindById.mockImplementation(async () => buildCategory());

  mockFindByNormalizedName.mockReset();
  mockFindByNormalizedName.mockResolvedValue(null);

  mockFindByCode.mockReset();
  mockFindByCode.mockResolvedValue(null);

  mockCountUsage.mockReset();
  mockCountUsage.mockResolvedValue({ total: 0, incoming: 0, outgoing: 0 });

  mockUpdate.mockReset();
  mockUpdate.mockImplementation(async () => buildCategory());

  mockedPrisma.$transaction.mockReset();
  mockedPrisma.$transaction.mockImplementation(async (cb: any) =>
    cb({
      documentCategory: mockedPrisma.documentCategory,
    }),
  );

  service = new DocumentCategoriesService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid update.
// Result : update succeeds.
// ---------------------------------------------------------------------------
describe('[UTCID01] documentCategoriesService.update() – Normal 1: valid update', () => {
  it('updates a valid document category', async () => {
    const result = await service.update(
      1,
      { name: 'Kế toán', code: 'KT' },
      5,
    );

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('returns the updated id', async () => {
    const result = await service.update(
      1,
      { name: 'Kế toán' },
      5,
    );

    expect(result.id).toBe(1);
  });

  it('accepts update with only name', async () => {
    await service.update(1, { name: 'New Name' }, 5);

    expect(mockUpdate).toHaveBeenCalled();
  });

  it('accepts update with only code', async () => {
    await service.update(1, { code: 'NEW' }, 5);

    expect(mockUpdate).toHaveBeenCalled();
  });

  it('accepts update with only description', async () => {
    await service.update(1, { description: 'New description' }, 5);

    expect(mockUpdate).toHaveBeenCalled();
  });

  it('accepts update with only status', async () => {
    await service.update(
      1,
      { status: DocumentCategoryStatus.INACTIVE },
      5,
    );

    expect(mockUpdate).toHaveBeenCalled();
  });

  it('does NOT throw on the valid-update path', async () => {
    await expect(
      service.update(1, { name: 'New Name' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the valid-update path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.update(1, { name: 'New Name' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: partial update.
// Result : only specified fields updated.
// ---------------------------------------------------------------------------
describe('[UTCID02] documentCategoriesService.update() – Normal 2: partial update', () => {
  it('passes only name to repository when only name is provided', async () => {
    await service.update(1, { name: 'New Name' }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        name: 'New Name',
        normalizedName: 'new name',
        updatedBy: { connect: { id: 5 } },
      }),
      expect.anything(),
    );
  });

  it('passes only code to repository when only code is provided', async () => {
    await service.update(1, { code: 'newcode' }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        code: 'NEWCODE',
      }),
      expect.anything(),
    );
  });

  it('passes only description to repository when only description is provided', async () => {
    await service.update(1, { description: 'desc' }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        description: 'desc',
      }),
      expect.anything(),
    );
  });

  it('passes description = null when explicitly null', async () => {
    await service.update(1, { description: null }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        description: null,
      }),
      expect.anything(),
    );
  });

  it('passes only status to repository when only status is provided', async () => {
    await service.update(
      1,
      { status: DocumentCategoryStatus.INACTIVE },
      5,
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        status: DocumentCategoryStatus.INACTIVE,
      }),
      expect.anything(),
    );
  });

  it('does NOT throw on the partial-update path', async () => {
    await expect(
      service.update(1, { name: 'New' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the partial-update path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.update(1, { name: 'New' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: status change.
// Result : status change succeeds.
// ---------------------------------------------------------------------------
describe('[UTCID03] documentCategoriesService.update() – Normal 3: status change', () => {
  it('changes status ACTIVE → INACTIVE', async () => {
    await service.update(
      1,
      { status: DocumentCategoryStatus.INACTIVE },
      5,
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        status: DocumentCategoryStatus.INACTIVE,
      }),
      expect.anything(),
    );
  });

  it('changes status INACTIVE → ACTIVE', async () => {
    mockFindById.mockReset();
    mockFindById.mockImplementation(async () =>
      buildCategory({ status: DocumentCategoryStatus.INACTIVE }),
    );

    await service.update(
      1,
      { status: DocumentCategoryStatus.ACTIVE },
      5,
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        status: DocumentCategoryStatus.ACTIVE,
      }),
      expect.anything(),
    );
  });

  it('handles multiple field updates together', async () => {
    await service.update(
      1,
      {
        name: 'New Name',
        status: DocumentCategoryStatus.INACTIVE,
        description: 'New desc',
      },
      5,
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        name: 'New Name',
        normalizedName: 'new name',
        status: DocumentCategoryStatus.INACTIVE,
        description: 'New desc',
      }),
      expect.anything(),
    );
  });

  it('does NOT throw on the status-change path', async () => {
    await expect(
      service.update(
        1,
        { status: DocumentCategoryStatus.INACTIVE },
        5,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the status-change path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.update(
      1,
      { status: DocumentCategoryStatus.INACTIVE },
      5,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: persistence/audit.
// Result : repository.update called within transaction.
// ---------------------------------------------------------------------------
describe('[UTCID04] documentCategoriesService.update() – Normal 4: persistence/audit', () => {
  it('persists within prisma.$transaction', async () => {
    await service.update(1, { name: 'New Name' }, 5);

    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('calls repository.update once', async () => {
    await service.update(1, { name: 'New Name' }, 5);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('passes updatedBy connect to repository', async () => {
    await service.update(1, { name: 'New Name' }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        updatedBy: { connect: { id: 5 } },
      }),
      expect.anything(),
    );
  });

  it('passes different updatedBy for different user', async () => {
    await service.update(1, { name: 'New Name' }, 7);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        updatedBy: { connect: { id: 7 } },
      }),
      expect.anything(),
    );
  });

  it('passes the transaction client to repository.update', async () => {
    await service.update(1, { name: 'New Name' }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.anything(),
      expect.anything(),
    );
  });

  it('does NOT throw on the persistence/audit path', async () => {
    await expect(
      service.update(1, { name: 'New Name' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the persistence/audit path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.update(1, { name: 'New Name' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : returned category mirrors DB state.
// ---------------------------------------------------------------------------
describe('[UTCID05] documentCategoriesService.update() – Normal 5: response-to-database consistency', () => {
  it('matches DB id to response.id', async () => {
    const result = await service.update(1, { name: 'New' }, 5);

    expect(result.id).toBe(1);
  });

  it('matches DB name to response.name', async () => {
    mockUpdate.mockReset();
    mockUpdate.mockImplementation(async () =>
      buildCategory({ name: 'Updated Name' }),
    );

    const result = await service.update(1, { name: 'Updated' }, 5);

    expect(result.name).toBe('Updated Name');
  });

  it('matches DB code to response.code', async () => {
    mockUpdate.mockReset();
    mockUpdate.mockImplementation(async () =>
      buildCategory({ code: 'NEWCODE' }),
    );

    const result = await service.update(1, { code: 'NEWCODE' }, 5);

    expect(result.code).toBe('NEWCODE');
  });

  it('matches DB status to response.status', async () => {
    mockUpdate.mockReset();
    mockUpdate.mockImplementation(async () =>
      buildCategory({ status: DocumentCategoryStatus.INACTIVE }),
    );

    const result = await service.update(
      1,
      { status: DocumentCategoryStatus.INACTIVE },
      5,
    );

    expect(result.status).toBe(DocumentCategoryStatus.INACTIVE);
  });

  it('matches DB createdBy to response.createdBy', async () => {
    const result = await service.update(1, { name: 'New' }, 5);

    expect(result.createdBy.id).toBe(5);
  });

  it('does NOT throw on the consistency path', async () => {
    await expect(
      service.update(1, { name: 'New' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the consistency path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.update(1, { name: 'New' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: duplicate/invalid data.
// Result : ConflictError / BadRequestError on invalid input.
// ---------------------------------------------------------------------------
describe('[UTCID06] documentCategoriesService.update() – Abnormal 1: duplicate/invalid data', () => {
  it('throws ConflictError when name is duplicate', async () => {
    mockFindByNormalizedName.mockReset();
    mockFindByNormalizedName.mockResolvedValue({
      id: 2,
      name: 'Duplicate Name',
    });

    await expect(
      service.update(1, { name: 'Duplicate Name' }, 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws BadRequestError when no fields provided', async () => {
    await expect(
      service.update(1, {}, 5),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws ConflictError when code is duplicate and not same as current', async () => {
    mockFindByCode.mockReset();
    mockFindByCode.mockResolvedValue({ id: 2, code: 'OTHER' });

    await expect(
      service.update(1, { code: 'OTHER' }, 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ConflictError when code is in use', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({ total: 5, incoming: 0, outgoing: 5 });

    await expect(
      service.update(1, { code: 'NEWCODE' }, 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('does NOT throw when code matches current (no usage check)', async () => {
    // Code = current code → no usage check, no duplicate check.
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({ total: 5, incoming: 0, outgoing: 5 });

    await expect(
      service.update(1, { code: 'HC' }, 5),
    ).resolves.toBeDefined();
  });

  it('throws ConflictError on P2002 from prisma', async () => {
    const prismaError = Object.create(
      (jest.requireActual('@prisma/client') as any)
        .Prisma.PrismaClientKnownRequestError.prototype,
    );
    prismaError.code = 'P2002';
    prismaError.message = 'Unique constraint failed';
    prismaError.name = 'PrismaClientKnownRequestError';

    mockUpdate.mockReset();
    mockUpdate.mockRejectedValueOnce(prismaError);

    await expect(
      service.update(1, { name: 'New' }, 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('records a safe diagnostic on duplicate (no password / hash leak)', async () => {
    mockFindByNormalizedName.mockReset();
    mockFindByNormalizedName.mockResolvedValue({
      id: 2,
      name: 'Duplicate',
    });

    const err = await service
      .update(1, { name: 'Duplicate' }, 5)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the duplicate path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockFindByNormalizedName.mockReset();
    mockFindByNormalizedName.mockResolvedValue({
      id: 2,
      name: 'Duplicate',
    });

    await expect(
      service.update(1, { name: 'Duplicate' }, 5),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: not found / unauthorized.
// Result : NotFoundError / ForbiddenError.
// ---------------------------------------------------------------------------
describe('[UTCID07] documentCategoriesService.update() – Abnormal 2: not found / unauthorized', () => {
  it('throws NotFoundError when category does not exist', async () => {
    mockFindById.mockReset();
    mockFindById.mockResolvedValue(null);

    await expect(
      service.update(1, { name: 'New' }, 5),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ConflictError when category is soft-deleted', async () => {
    mockFindById.mockReset();
    mockFindById.mockImplementation(async () =>
      buildCategory({ deletedAt: new Date('2026-09-10T00:00:00.000Z') }),
    );

    await expect(
      service.update(1, { name: 'New' }, 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ForbiddenError when category is a system category', async () => {
    mockFindById.mockReset();
    mockFindById.mockImplementation(async () =>
      buildCategory({ isSystem: true }),
    );

    await expect(
      service.update(1, { name: 'New' }, 5),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws when repository.update throws', async () => {
    mockUpdate.mockReset();
    mockUpdate.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(
      service.update(1, { name: 'New' }, 5),
    ).rejects.toBeInstanceOf(Error);
  });

  it('throws when prisma.$transaction throws', async () => {
    mockedPrisma.$transaction.mockReset();
    mockedPrisma.$transaction.mockRejectedValueOnce(
      new Error('Transaction failed'),
    );

    await expect(
      service.update(1, { name: 'New' }, 5),
    ).rejects.toBeInstanceOf(Error);
  });

  it('records a safe diagnostic on not-found (no password / hash leak)', async () => {
    mockFindById.mockReset();
    mockFindById.mockResolvedValue(null);

    const err = await service
      .update(1, { name: 'New' }, 5)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the not-found / forbidden path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockFindById.mockReset();
    mockFindById.mockResolvedValue(null);

    await expect(
      service.update(1, { name: 'New' }, 5),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: maximum code/name length.
// Result : boundary values accepted; validation catches
//          patterns only at the validation layer (not
//          exercised here).
// ---------------------------------------------------------------------------
describe('[UTCID08] documentCategoriesService.update() – Boundary 1: maximum code/name length', () => {
  it('handles the boundary: name at exactly 100 chars', async () => {
    const longName = 'a'.repeat(100);
    await service.update(1, { name: longName }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        name: longName,
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: code at exactly 20 chars', async () => {
    const longCode = 'A'.repeat(20);
    await service.update(1, { code: longCode }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        code: longCode,
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: code with Vietnamese characters (only allowed at service)', async () => {
    // The service does NOT validate code pattern — it normalizes
    // (uppercase) and trusts the route layer to have validated.
    await service.update(1, { code: 'QĐ_CL' }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        code: 'QĐ_CL',
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: id = 1 (smallest valid id)', async () => {
    await expect(
      service.update(1, { name: 'New' }, 5),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: userId = 0 (system user)', async () => {
    await expect(
      service.update(1, { name: 'New' }, 0),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: description with 500 chars', async () => {
    const longDesc = 'a'.repeat(500);
    await service.update(1, { description: longDesc }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        description: longDesc,
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: description with Vietnamese at 500 chars', async () => {
    const longDesc = 'Hành'.repeat(125);
    await service.update(1, { description: longDesc }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        description: longDesc,
      }),
      expect.anything(),
    );
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.update(1, { name: 'a' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.update(1, { name: 'a' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
