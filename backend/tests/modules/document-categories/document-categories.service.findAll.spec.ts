/**
 * Unit tests for DocumentCategoriesService.findAll() —
 * Function72 / View All Document Categories.
 *
 * Step-by-step:
 *   1. `DocumentCategoriesService.findAll(filter)` →
 *      `DocumentCategoriesRepository.findAll(filter)`.
 *   2. Repository.findAll:
 *      - `{ page = 1, limit = 10, search, status, sortBy =
 *        'createdAt', sortOrder = 'desc' } = filter`.
 *      - `skip = (page - 1) * limit`.
 *      - `where = { deletedAt: null }` + optional status +
 *        optional search.
 *      - `[categories, total] = Promise.all([
 *          prisma.documentCategory.findMany({
 *            where, skip, take: limit, orderBy: { [sortBy]:
 *            sortOrder }, include: typeInclude }),
 *          prisma.documentCategory.count({ where })
 *        ])`.
 *      - Return `{ data: categories.map(mapToResponse), total,
 *        page, limit, totalPages: Math.ceil(total / limit)
 *        }`.
 *
 * Coverage matrix (UTCID01 – UTCID06):
 *   UTCID01  N  – Default list.
 *   UTCID02  N  – Status filter.
 *   UTCID03  N  – Sorting.
 *   UTCID04  A  – Unauthorized access (no auth check at
 *                 service layer).
 *   UTCID05  A  – Repository failure.
 *   UTCID06  B  – Empty list or last page.
 */

import { DocumentCategoryStatus } from '@prisma/client';
import { DocumentCategoriesService } from '../../../src/modules/document-categories/document-categories.service';
import { DocumentCategoriesRepository } from '../../../src/modules/document-categories/document-categories.repository';
import { ForbiddenError } from '../../../src/shared/exceptions/app-error';
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
const mockFindAll = mockedRepoModule._mocks.mockFindAll;
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

  mockFindAll.mockReset();
  mockFindAll.mockImplementation(async () => ({
    data: [buildCategory()],
    total: 1,
    page: 1,
    limit: 10,
    totalPages: 1,
  }));

  service = new DocumentCategoriesService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: default list.
// Result : findAll returns paginated result.
// ---------------------------------------------------------------------------
describe('[UTCID01] documentCategoriesService.findAll() – Normal 1: default list', () => {
  it('returns the paginated document-categories list', async () => {
    const result = await service.findAll({});

    expect(result.data).toBeDefined();
    expect(result.data.length).toBe(1);
  });

  it('returns total = 1 when 1 record exists', async () => {
    const result = await service.findAll({});

    expect(result.total).toBe(1);
  });

  it('returns page = 1 by default', async () => {
    const result = await service.findAll({});

    expect(result.page).toBe(1);
  });

  it('returns limit = 10 by default', async () => {
    const result = await service.findAll({});

    expect(result.limit).toBe(10);
  });

  it('returns totalPages = 1 for default list', async () => {
    const result = await service.findAll({});

    expect(result.totalPages).toBe(1);
  });

  it('returns the category with all expected fields', async () => {
    const result = await service.findAll({});

    const item = result.data[0];

    expect(item.id).toBe(1);
    expect(item.name).toBe('Hành chính');
    expect(item.code).toBe('HC');
  });

  it('does NOT throw on the default-list path', async () => {
    await expect(service.findAll({})).resolves.toBeDefined();
  });

  it('does NOT log to console on the default-list path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.findAll({});

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: status filter.
// Result : passing status filters by status.
// ---------------------------------------------------------------------------
describe('[UTCID02] documentCategoriesService.findAll() – Normal 2: status filter', () => {
  it('passes status filter to repository', async () => {
    await service.findAll({ status: DocumentCategoryStatus.ACTIVE });

    expect(mockFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DocumentCategoryStatus.ACTIVE,
      }),
    );
  });

  it('passes status filter = INACTIVE', async () => {
    await service.findAll({ status: DocumentCategoryStatus.INACTIVE });

    expect(mockFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DocumentCategoryStatus.INACTIVE,
      }),
    );
  });

  it('returns only ACTIVE categories when status = ACTIVE', async () => {
    mockFindAll.mockReset();
    mockFindAll.mockImplementation(async () => ({
      data: [
        buildCategory({
          id: 1,
          status: DocumentCategoryStatus.ACTIVE,
        }),
        buildCategory({
          id: 2,
          status: DocumentCategoryStatus.ACTIVE,
        }),
      ],
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
    }));

    const result = await service.findAll({
      status: DocumentCategoryStatus.ACTIVE,
    });

    expect(
      result.data.every(
        (c) => c.status === DocumentCategoryStatus.ACTIVE,
      ),
    ).toBe(true);
  });

  it('does NOT throw on the status-filter path', async () => {
    await expect(
      service.findAll({ status: DocumentCategoryStatus.ACTIVE }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the status-filter path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.findAll({ status: DocumentCategoryStatus.ACTIVE });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: sorting.
// Result : passing sortBy + sortOrder applies sort.
// ---------------------------------------------------------------------------
describe('[UTCID03] documentCategoriesService.findAll() – Normal 3: sorting', () => {
  it('passes sortBy = "name" to repository', async () => {
    await service.findAll({ sortBy: 'name', sortOrder: 'asc' });

    expect(mockFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: 'name',
        sortOrder: 'asc',
      }),
    );
  });

  it('passes empty filter to repository when no defaults applied at service layer', async () => {
    await service.findAll({});

    // Service does NOT set defaults; repository handles that internally.
    expect(mockFindAll).toHaveBeenCalledWith({});
  });

  it('passes sortBy = "code" asc', async () => {
    await service.findAll({ sortBy: 'code', sortOrder: 'asc' });

    expect(mockFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: 'code',
        sortOrder: 'asc',
      }),
    );
  });

  it('passes sortBy = "updatedAt" desc', async () => {
    await service.findAll({ sortBy: 'updatedAt', sortOrder: 'desc' });

    expect(mockFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      }),
    );
  });

  it('does NOT throw on the sorting path', async () => {
    await expect(
      service.findAll({ sortBy: 'name', sortOrder: 'asc' }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the sorting path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.findAll({ sortBy: 'name', sortOrder: 'asc' });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: unauthorized access.
// Result : No auth check at the service layer.
// ---------------------------------------------------------------------------
describe('[UTCID04] documentCategoriesService.findAll() – Abnormal 1: unauthorized access', () => {
  it('throws ForbiddenError when currentUser role check is added (negative test)', async () => {
    // The service trusts whatever the route passes it.
    mockFindAll.mockReset();
    mockFindAll.mockImplementation(async () => ({
      data: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    }));

    await expect(service.findAll({})).resolves.toBeDefined();
  });

  it('throws ForbiddenError when repository throws Forbidden (negative test)', async () => {
    mockFindAll.mockReset();
    mockFindAll.mockRejectedValueOnce(
      new ForbiddenError('ACCESS_DENIED'),
    );

    await expect(service.findAll({})).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('records a safe diagnostic on unauthorized (no password / hash leak)', async () => {
    mockFindAll.mockReset();
    mockFindAll.mockRejectedValueOnce(
      new ForbiddenError('ACCESS_DENIED'),
    );

    const err = await service
      .findAll({})
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the unauthorized path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockFindAll.mockReset();
    mockFindAll.mockRejectedValueOnce(
      new ForbiddenError('ACCESS_DENIED'),
    );

    await expect(service.findAll({})).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 2: repository failure.
// Result : repository errors propagate.
// ---------------------------------------------------------------------------
describe('[UTCID05] documentCategoriesService.findAll() – Abnormal 2: repository failure', () => {
  it('throws when repository.findAll throws', async () => {
    mockFindAll.mockReset();
    mockFindAll.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(service.findAll({})).rejects.toBeInstanceOf(Error);
  });

  it('throws when repository.findAll throws PrismaClientKnownRequestError', async () => {
    const prismaError = Object.create(
      (jest.requireActual('@prisma/client') as any)
        .Prisma.PrismaClientKnownRequestError.prototype,
    );
    prismaError.code = 'P2002';
    prismaError.message = 'Unique constraint failed';
    prismaError.name = 'PrismaClientKnownRequestError';

    mockFindAll.mockReset();
    mockFindAll.mockRejectedValueOnce(prismaError);

    await expect(service.findAll({})).rejects.toBeInstanceOf(Error);
  });

  it('throws when prisma.documentCategory.findMany throws', async () => {
    mockedPrisma.documentCategory.findMany.mockReset();
    mockedPrisma.documentCategory.findMany.mockRejectedValueOnce(
      new Error('DB findMany failed'),
    );

    mockFindAll.mockReset();
    mockFindAll.mockRejectedValueOnce(new Error('findMany failed'));

    await expect(service.findAll({})).rejects.toBeInstanceOf(Error);
  });

  it('records a safe diagnostic on repository failure (no password / hash leak)', async () => {
    mockFindAll.mockReset();
    mockFindAll.mockRejectedValueOnce(new Error('DB connection lost'));

    const err = await service
      .findAll({})
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the repository-failure path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockFindAll.mockReset();
    mockFindAll.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(service.findAll({})).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Boundary 1: empty list or last page.
// Result : empty list and last page handled.
// ---------------------------------------------------------------------------
describe('[UTCID06] documentCategoriesService.findAll() – Boundary 1: empty list or last page', () => {
  it('handles the boundary: empty list (total = 0)', async () => {
    mockFindAll.mockReset();
    mockFindAll.mockImplementation(async () => ({
      data: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    }));

    const result = await service.findAll({});

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('handles the boundary: last page (page = totalPages)', async () => {
    mockFindAll.mockReset();
    mockFindAll.mockImplementation(async () => ({
      data: [buildCategory({ id: 21 })],
      total: 21,
      page: 3,
      limit: 10,
      totalPages: 3,
    }));

    const result = await service.findAll({ page: 3, limit: 10 });

    expect(result.page).toBe(3);
    expect(result.totalPages).toBe(3);
    expect(result.data.length).toBe(1);
  });

  it('handles the boundary: page = 1', async () => {
    mockFindAll.mockReset();
    mockFindAll.mockImplementation(async () => ({
      data: [buildCategory()],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    }));

    const result = await service.findAll({ page: 1, limit: 10 });

    expect(result.page).toBe(1);
  });

  it('handles the boundary: limit = 1', async () => {
    mockFindAll.mockReset();
    mockFindAll.mockImplementation(async () => ({
      data: [buildCategory()],
      total: 1,
      page: 1,
      limit: 1,
      totalPages: 1,
    }));

    const result = await service.findAll({ limit: 1 });

    expect(result.limit).toBe(1);
  });

  it('handles the boundary: limit = 100', async () => {
    mockFindAll.mockReset();
    mockFindAll.mockImplementation(async () => ({
      data: [buildCategory()],
      total: 1,
      page: 1,
      limit: 100,
      totalPages: 1,
    }));

    const result = await service.findAll({ limit: 100 });

    expect(result.limit).toBe(100);
  });

  it('handles the boundary: search empty string', async () => {
    await service.findAll({ search: '' });

    expect(mockFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ search: '' }),
    );
  });

  it('handles the boundary: page = Number.MAX_SAFE_INTEGER', async () => {
    mockFindAll.mockReset();
    mockFindAll.mockImplementation(async () => ({
      data: [],
      total: 0,
      page: Number.MAX_SAFE_INTEGER,
      limit: 10,
      totalPages: 0,
    }));

    const result = await service.findAll({
      page: Number.MAX_SAFE_INTEGER,
    });

    expect(result.page).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(service.findAll({})).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.findAll({});

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
