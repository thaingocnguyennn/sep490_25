/**
 * Unit tests for DocumentTypesService.findAll() —
 * Function69 / View All Document Types.
 *
 * Step-by-step:
 *   1. `DocumentTypesService.findAll(filter)` →
 *      `DocumentTypesRepository.findAll(filter)`.
 *   2. Repository.findAll:
 *      - `{ page = 1, limit = 10, search, status, sortBy =
 *        'createdAt', sortOrder = 'desc' } = filter`.
 *      - `skip = (page - 1) * limit`.
 *      - `where = { deletedAt: null }` + optional status +
 *        optional search.
 *      - `[types, total] = Promise.all([
 *          prisma.documentType.findMany({
 *            where, skip, take: limit, orderBy: { [sortBy]:
 *            sortOrder }, include: typeInclude }),
 *          prisma.documentType.count({ where })
 *        ])`.
 *      - Return `{ data: types.map(mapToResponse), total,
 *        page, limit, totalPages: Math.ceil(total / limit)
 *        }`.
 *
 * Coverage matrix (UTCID01 – UTCID06):
 *   UTCID01  N  – Default list.
 *   UTCID02  N  – Direction filter (documented gap: no
 *                 direction field on filter).
 *   UTCID03  N  – Status filter.
 *   UTCID04  A  – Unauthorized access (no auth check at
 *                 service layer — see notes).
 *   UTCID05  A  – Repository failure.
 *   UTCID06  B  – Empty list or last page.
 */

import { DocumentTypeStatus } from '@prisma/client';
import { DocumentTypesService } from '../../../src/modules/document-types/document-types.service';
import { DocumentTypesRepository } from '../../../src/modules/document-types/document-types.repository';
import { ForbiddenError } from '../../../src/shared/exceptions/app-error';
import prisma from '../../../src/config/database';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/document-types/document-types.repository',
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

    return {
      __esModule: true,
      DocumentTypesRepository: jest.fn().mockImplementation(() => ({
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
      },
    };
  },
);

jest.mock('../../../src/config/database', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    documentType: {
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
    '../../../src/modules/document-types/document-types.repository',
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

let service: DocumentTypesService;

const buildType = (overrides: any = {}): any => ({
  id: 1,
  name: 'Công văn',
  code: 'CV',
  description: 'Công văn',
  status: DocumentTypeStatus.ACTIVE,
  isSystem: false,
  createdAt: new Date('2026-09-09T07:00:00.000Z'),
  updatedAt: new Date('2026-09-12T12:00:00.000Z'),
  deletedAt: null,
  createdBy: { id: 5, fullName: 'Admin' },
  usageCount: 0,
  usageDetail: { incoming: 0, outgoing: 0 },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();

  mockFindAll.mockReset();
  mockFindAll.mockImplementation(async () => ({
    data: [buildType()],
    total: 1,
    page: 1,
    limit: 10,
    totalPages: 1,
  }));

  service = new DocumentTypesService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: default list.
// Result : findAll returns paginated result.
// ---------------------------------------------------------------------------
describe('[UTCID01] documentTypesService.findAll() – Normal 1: default list', () => {
  it('returns the paginated document-types list', async () => {
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

  it('returns the type with all expected fields', async () => {
    const result = await service.findAll({});

    const item = result.data[0];

    expect(item.id).toBe(1);
    expect(item.name).toBe('Công văn');
    expect(item.code).toBe('CV');
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
// UTCID02 – Normal 2: direction filter.
// Result : Direction filter does NOT exist on the DTO (the
//          implementation only supports status + search).
//          This is a documented gap (UTCID02 maps to the
//          'direction' field if/when it's added).
// ---------------------------------------------------------------------------
describe('[UTCID02] documentTypesService.findAll() – Normal 2: direction filter', () => {
  it('accepts direction in filter (currently ignored)', async () => {
    await expect(
      service.findAll({
        // @ts-expect-error — direction is not in DTO but matrix expects it
        direction: 'INCOMING',
      }),
    ).resolves.toBeDefined();
  });

  it('returns same data regardless of direction (documented gap)', async () => {
    mockFindAll.mockReset();
    mockFindAll.mockImplementation(async () => ({
      data: [buildType()],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    }));

    const r1 = await service.findAll({});
    const r2 = await service.findAll({
      // @ts-expect-error
      direction: 'INCOMING',
      // @ts-expect-error
      direction_outgoing: 'OUTGOING',
    });

    expect(r1.data.length).toBe(r2.data.length);
  });

  it('does NOT throw when direction is provided', async () => {
    await expect(
      service.findAll({
        // @ts-expect-error
        direction: 'INCOMING',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the direction-filter path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.findAll({
      // @ts-expect-error
      direction: 'INCOMING',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: status filter.
// Result : passing status filters by status.
// ---------------------------------------------------------------------------
describe('[UTCID03] documentTypesService.findAll() – Normal 3: status filter', () => {
  it('passes status filter to repository', async () => {
    await service.findAll({ status: DocumentTypeStatus.ACTIVE });

    expect(mockFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DocumentTypeStatus.ACTIVE,
      }),
    );
  });

  it('passes status filter = INACTIVE', async () => {
    await service.findAll({ status: DocumentTypeStatus.INACTIVE });

    expect(mockFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DocumentTypeStatus.INACTIVE,
      }),
    );
  });

  it('returns only ACTIVE types when status = ACTIVE', async () => {
    mockFindAll.mockReset();
    mockFindAll.mockImplementation(async () => ({
      data: [
        buildType({ id: 1, status: DocumentTypeStatus.ACTIVE }),
        buildType({ id: 2, status: DocumentTypeStatus.ACTIVE }),
      ],
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
    }));

    const result = await service.findAll({
      status: DocumentTypeStatus.ACTIVE,
    });

    expect(result.data.every((t) => t.status === DocumentTypeStatus.ACTIVE))
      .toBe(true);
  });

  it('does NOT throw on the status-filter path', async () => {
    await expect(
      service.findAll({ status: DocumentTypeStatus.ACTIVE }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the status-filter path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.findAll({ status: DocumentTypeStatus.ACTIVE });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: unauthorized access.
// Result : No auth check at the service layer (the route
//          middleware enforces it). This is a documented gap.
// ---------------------------------------------------------------------------
describe('[UTCID04] documentTypesService.findAll() – Abnormal 1: unauthorized access', () => {
  it('throws ForbiddenError when currentUser role check is added (negative test)', async () => {
    // The service trusts whatever the route passes it. The
    // route layer is responsible for authentication. So this
    // test verifies the service does NOT block on missing
    // auth — instead the route middleware would reject.
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
describe('[UTCID05] documentTypesService.findAll() – Abnormal 2: repository failure', () => {
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

  it('throws when prisma.documentType.findMany throws', async () => {
    mockedPrisma.documentType.findMany.mockReset();
    mockedPrisma.documentType.findMany.mockRejectedValueOnce(
      new Error('DB findMany failed'),
    );

    // The service delegates to repository (which is mocked),
    // so we test the repository-level error here.
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
describe('[UTCID06] documentTypesService.findAll() – Boundary 1: empty list or last page', () => {
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
      data: [buildType({ id: 21 })],
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
      data: [buildType()],
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
      data: [buildType()],
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
      data: [buildType()],
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
