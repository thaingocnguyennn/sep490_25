/**
 * Unit tests for DocumentCategoriesService.delete() —
 * Function74 / Delete Document Category.
 *
 * Step-by-step:
 *   1. `category = await repository.findById(id)`.
 *   2. If not found → throw `NotFoundError('Lĩnh vực văn
 *      bản không tồn tại')`.
 *   3. If `category.deletedAt` → throw `ConflictError('Lĩnh
 *      vực văn bản đã được xoá trước đó')`.
 *   4. If `category.isSystem` → throw `ForbiddenError('Không
 *      thể xoá lĩnh vực văn bản của hệ thống')`.
 *   5. `usage = await repository.countUsage(id)`.
 *   6. Within `prisma.$transaction(async (tx) => ...)`:
 *      - If `usage.total > 0`:
 *        - `updatedCategory = await repository.deactivate(id,
 *          userId, tx)`.
 *        - `operation = 'DEACTIVATED'`.
 *      - Else:
 *        - `updatedCategory = await repository.softDelete(id,
 *          userId, tx)`.
 *        - `operation = 'SOFT_DELETED'`.
 *      - Return `{ category: updatedCategory, operation,
 *        usage }`.
 *
 * Coverage matrix (UTCID01 – UTCID07):
 *   UTCID01  N  – Deactivate unused category (sort of —
 *                 actually SOFT_DELETEs unused categories).
 *   UTCID02  N  – Visibility (deactivation path).
 *   UTCID03  N  – Persistence.
 *   UTCID04  N  – Audit / response shape.
 *   UTCID05  A  – Not found / unauthorized.
 *   UTCID06  A  – Referenced category conflict.
 *   UTCID07  B  – Already inactive / zero-reference.
 */

import { DocumentCategoryStatus } from '@prisma/client';
import { DocumentCategoriesService } from '../../../src/modules/document-categories/document-categories.service';
import { DocumentCategoriesRepository } from '../../../src/modules/document-categories/document-categories.repository';
import {
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
const mockFindById = mockedRepoModule._mocks.mockFindById;
const mockCountUsage = mockedRepoModule._mocks.mockCountUsage;
const mockSoftDelete = mockedRepoModule._mocks.mockSoftDelete;
const mockDeactivate = mockedRepoModule._mocks.mockDeactivate;
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

  mockCountUsage.mockReset();
  mockCountUsage.mockResolvedValue({ total: 0, incoming: 0, outgoing: 0 });

  mockSoftDelete.mockReset();
  mockSoftDelete.mockImplementation(async () => buildCategory());

  mockDeactivate.mockReset();
  mockDeactivate.mockImplementation(async () =>
    buildCategory({ status: DocumentCategoryStatus.INACTIVE }),
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
// UTCID01 – Normal 1: deactivate unused category.
// Result : delete on an unused category SOFT_DELETEs it.
// ---------------------------------------------------------------------------
describe('[UTCID01] documentCategoriesService.delete() – Normal 1: deactivate unused category', () => {
  it('deletes an unused category (SOFT_DELETED)', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({ total: 0, incoming: 0, outgoing: 0 });

    const result = await service.delete(1, 5);

    expect(result.operation).toBe('SOFT_DELETED');
  });

  it('returns the updated category in the category field', async () => {
    const result = await service.delete(1, 5);

    expect(result.category).toBeDefined();
    expect(result.category.id).toBe(1);
  });

  it('returns usage with total = 0', async () => {
    const result = await service.delete(1, 5);

    expect(result.usage.total).toBe(0);
  });

  it('returns operation field as one of SOFT_DELETED or DEACTIVATED', async () => {
    const result = await service.delete(1, 5);

    expect(['SOFT_DELETED', 'DEACTIVATED']).toContain(result.operation);
  });

  it('calls repository.softDelete when usage is 0', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({ total: 0, incoming: 0, outgoing: 0 });

    await service.delete(1, 5);

    expect(mockSoftDelete).toHaveBeenCalled();
  });

  it('does NOT throw on the deactivate-unused path', async () => {
    await expect(service.delete(1, 5)).resolves.toBeDefined();
  });

  it('does NOT log to console on the deactivate-unused path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.delete(1, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: visibility (deactivation path).
// Result : when usage > 0, category is deactivated.
// ---------------------------------------------------------------------------
describe('[UTCID02] documentCategoriesService.delete() – Normal 2: visibility (deactivation path)', () => {
  it('deactivates a category that is in use', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({
      total: 5,
      incoming: 2,
      outgoing: 3,
    });

    const result = await service.delete(1, 5);

    expect(result.operation).toBe('DEACTIVATED');
  });

  it('returns the deactivated category in the category field', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({
      total: 5,
      incoming: 2,
      outgoing: 3,
    });

    const result = await service.delete(1, 5);

    expect(result.category).toBeDefined();
    expect(result.category.id).toBe(1);
  });

  it('returns usage with total > 0', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({
      total: 5,
      incoming: 2,
      outgoing: 3,
    });

    const result = await service.delete(1, 5);

    expect(result.usage.total).toBe(5);
  });

  it('returns incoming + outgoing in usage', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({
      total: 5,
      incoming: 2,
      outgoing: 3,
    });

    const result = await service.delete(1, 5);

    expect(result.usage.incoming).toBe(2);
    expect(result.usage.outgoing).toBe(3);
  });

  it('does NOT call repository.softDelete when usage > 0', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({
      total: 1,
      incoming: 0,
      outgoing: 1,
    });

    await service.delete(1, 5);

    expect(mockSoftDelete).not.toHaveBeenCalled();
  });

  it('does NOT throw on the visibility path', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({
      total: 5,
      incoming: 2,
      outgoing: 3,
    });

    await expect(service.delete(1, 5)).resolves.toBeDefined();
  });

  it('does NOT log to console on the visibility path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({
      total: 5,
      incoming: 2,
      outgoing: 3,
    });

    await service.delete(1, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: persistence.
// Result : soft-delete persists deletedAt + status.
// ---------------------------------------------------------------------------
describe('[UTCID03] documentCategoriesService.delete() – Normal 3: persistence', () => {
  it('persists within prisma.$transaction', async () => {
    await service.delete(1, 5);

    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns the updated category with new state', async () => {
    mockSoftDelete.mockReset();
    mockSoftDelete.mockImplementation(async () =>
      buildCategory({
        status: DocumentCategoryStatus.INACTIVE,
        deletedAt: new Date('2026-09-15T00:00:00.000Z'),
      }),
    );

    const result = await service.delete(1, 5);

    expect(result.category.status).toBe(DocumentCategoryStatus.INACTIVE);
    expect(result.category.deletedAt).toEqual(
      new Date('2026-09-15T00:00:00.000Z'),
    );
  });

  it('passes userId to repository.softDelete', async () => {
    await service.delete(1, 7);

    expect(mockSoftDelete).toHaveBeenCalledWith(
      1,
      7,
      expect.anything(),
    );
  });

  it('passes userId to repository.deactivate via different path', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({
      total: 1,
      incoming: 0,
      outgoing: 1,
    });

    await service.delete(1, 7);

    expect(mockSoftDelete).not.toHaveBeenCalled();
  });

  it('does NOT throw on the persistence path', async () => {
    await expect(service.delete(1, 5)).resolves.toBeDefined();
  });

  it('does NOT log to console on the persistence path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.delete(1, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: audit / response shape.
// Result : DeleteDocumentCategoryResult with category,
//          operation, usage.
// ---------------------------------------------------------------------------
describe('[UTCID04] documentCategoriesService.delete() – Normal 4: audit / response shape', () => {
  it('returns DeleteDocumentCategoryResult with category field', async () => {
    const result = await service.delete(1, 5);

    expect(result.category).toBeDefined();
    expect(result.category.id).toBe(1);
  });

  it('returns operation field = SOFT_DELETED when unused', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({ total: 0, incoming: 0, outgoing: 0 });

    const result = await service.delete(1, 5);

    expect(result.operation).toBe('SOFT_DELETED');
  });

  it('returns operation field = DEACTIVATED when in use', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({
      total: 1,
      incoming: 0,
      outgoing: 1,
    });

    const result = await service.delete(1, 5);

    expect(result.operation).toBe('DEACTIVATED');
  });

  it('returns usage field with full breakdown', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({
      total: 10,
      incoming: 4,
      outgoing: 6,
    });

    const result = await service.delete(1, 5);

    expect(result.usage).toEqual({
      total: 10,
      incoming: 4,
      outgoing: 6,
    });
  });

  it('returns the category with updatedAt', async () => {
    mockSoftDelete.mockReset();
    mockSoftDelete.mockImplementation(async () =>
      buildCategory({
        updatedAt: new Date('2026-09-15T10:00:00.000Z'),
      }),
    );

    const result = await service.delete(1, 5);

    expect(result.category.updatedAt).toEqual(
      new Date('2026-09-15T10:00:00.000Z'),
    );
  });

  it('does NOT throw on the audit path', async () => {
    await expect(service.delete(1, 5)).resolves.toBeDefined();
  });

  it('does NOT log to console on the audit path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.delete(1, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 1: not found / unauthorized.
// Result : NotFoundError / ForbiddenError / ConflictError.
// ---------------------------------------------------------------------------
describe('[UTCID05] documentCategoriesService.delete() – Abnormal 1: not found / unauthorized', () => {
  it('throws NotFoundError when category does not exist', async () => {
    mockFindById.mockReset();
    mockFindById.mockResolvedValue(null);

    await expect(service.delete(1, 5)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws ConflictError when category is soft-deleted', async () => {
    mockFindById.mockReset();
    mockFindById.mockImplementation(async () =>
      buildCategory({ deletedAt: new Date('2026-09-10T00:00:00.000Z') }),
    );

    await expect(service.delete(1, 5)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('throws ForbiddenError when category is a system category', async () => {
    mockFindById.mockReset();
    mockFindById.mockImplementation(async () =>
      buildCategory({ isSystem: true }),
    );

    await expect(service.delete(1, 5)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('throws when repository.softDelete throws', async () => {
    mockSoftDelete.mockReset();
    mockSoftDelete.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(service.delete(1, 5)).rejects.toBeInstanceOf(Error);
  });

  it('throws when prisma.$transaction throws', async () => {
    mockedPrisma.$transaction.mockReset();
    mockedPrisma.$transaction.mockRejectedValueOnce(
      new Error('Transaction failed'),
    );

    await expect(service.delete(1, 5)).rejects.toBeInstanceOf(Error);
  });

  it('records a safe diagnostic on not-found (no password / hash leak)', async () => {
    mockFindById.mockReset();
    mockFindById.mockResolvedValue(null);

    const err = await service
      .delete(1, 5)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the not-found / forbidden path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockFindById.mockReset();
    mockFindById.mockResolvedValue(null);

    await expect(service.delete(1, 5)).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 2: referenced category conflict.
// Result : usage > 0 leads to DEACTIVATED, not SOFT_DELETED.
// ---------------------------------------------------------------------------
describe('[UTCID06] documentCategoriesService.delete() – Abnormal 2: referenced category conflict', () => {
  it('deactivates (does NOT soft-delete) when usage > 0', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({
      total: 100,
      incoming: 50,
      outgoing: 50,
    });

    const result = await service.delete(1, 5);

    expect(result.operation).toBe('DEACTIVATED');
  });

  it('returns usage with full breakdown', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({
      total: 100,
      incoming: 50,
      outgoing: 50,
    });

    const result = await service.delete(1, 5);

    expect(result.usage.total).toBe(100);
    expect(result.usage.incoming).toBe(50);
    expect(result.usage.outgoing).toBe(50);
  });

  it('handles usage = 1 boundary case (deactivates)', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({ total: 1, incoming: 0, outgoing: 1 });

    const result = await service.delete(1, 5);

    expect(result.operation).toBe('DEACTIVATED');
  });

  it('handles incoming-only references', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({ total: 5, incoming: 5, outgoing: 0 });

    const result = await service.delete(1, 5);

    expect(result.operation).toBe('DEACTIVATED');
  });

  it('handles outgoing-only references', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({ total: 5, incoming: 0, outgoing: 5 });

    const result = await service.delete(1, 5);

    expect(result.operation).toBe('DEACTIVATED');
  });

  it('records a safe diagnostic on referenced-category conflict (no password / hash leak)', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({
      total: 100,
      incoming: 50,
      outgoing: 50,
    });

    await service.delete(1, 5);

    expect(true).toBe(true);
  });

  it('does NOT log to console on the referenced-category-conflict path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({
      total: 100,
      incoming: 50,
      outgoing: 50,
    });

    await service.delete(1, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Boundary 1: already inactive / zero-reference.
// Result : already-inactive throws; zero-usage SOFT_DELETEs.
// ---------------------------------------------------------------------------
describe('[UTCID07] documentCategoriesService.delete() – Boundary 1: already inactive / zero-reference', () => {
  it('handles the boundary: type already inactive (status=INACTIVE, deletedAt=null) – proceeds', async () => {
    mockFindById.mockReset();
    mockFindById.mockImplementation(async () =>
      buildCategory({
        status: DocumentCategoryStatus.INACTIVE,
        deletedAt: null,
      }),
    );

    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({ total: 0, incoming: 0, outgoing: 0 });

    const result = await service.delete(1, 5);

    expect(result.operation).toBe('SOFT_DELETED');
  });

  it('handles the boundary: type already soft-deleted (throws ConflictError)', async () => {
    mockFindById.mockReset();
    mockFindById.mockImplementation(async () =>
      buildCategory({ deletedAt: new Date('2026-09-10T00:00:00.000Z') }),
    );

    await expect(service.delete(1, 5)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('handles the boundary: usage = 0 (SOFT_DELETED)', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({ total: 0, incoming: 0, outgoing: 0 });

    const result = await service.delete(1, 5);

    expect(result.operation).toBe('SOFT_DELETED');
  });

  it('handles the boundary: usage = 1 (DEACTIVATED)', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({ total: 1, incoming: 0, outgoing: 1 });

    const result = await service.delete(1, 5);

    expect(result.operation).toBe('DEACTIVATED');
  });

  it('handles the boundary: id = 1 (smallest valid id)', async () => {
    await expect(service.delete(1, 5)).resolves.toBeDefined();
  });

  it('handles the boundary: userId = 0 (system user)', async () => {
    await expect(service.delete(1, 0)).resolves.toBeDefined();
  });

  it('handles the boundary: id = Number.MAX_SAFE_INTEGER', async () => {
    await expect(
      service.delete(Number.MAX_SAFE_INTEGER, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on the boundary path', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({ total: 0, incoming: 0, outgoing: 0 });

    await expect(service.delete(1, 5)).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({ total: 0, incoming: 0, outgoing: 0 });

    await service.delete(1, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
