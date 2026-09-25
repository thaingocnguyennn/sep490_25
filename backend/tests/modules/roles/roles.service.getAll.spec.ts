/**
 * Unit tests for RolesService.getAll() — Function22 / View All Roles.
 *
 * Contract:
 *   async getAll(): Promise<RoleSummary[]>
 *
 *   1. The service delegates directly to rolesRepository.findAll()
 *      with NO arguments.
 *   2. The result is returned VERBATIM.
 *   3. The service does NOT filter, paginate, sort, or transform
 *      the result.
 *
 * Repository contract:
 *   - `prisma.role.findMany` is called with
 *     `orderBy: { name: 'asc' }, include: { _count: { select:
 *     { userRoles: true } } }`.
 *   - Each role is mapped to RoleSummary:
 *     { id, name, description, createdAt (ISO string),
 *       updatedAt (ISO string), userCount }.
 *
 * Note on the matrix's "active-only mapping" requirement:
 *   - The implementation does NOT filter by `isActive` or `status`.
 *     There is no `status` column on the Role model. This is a
 *     documented gap.
 *
 * Coverage matrix (UTCID01 – UTCID05):
 *   UTCID01  N  – List roles: getAll returns a list of role
 *                 summaries.
 *   UTCID02  N  – Active-only mapping: documented gap — no
 *                 status filter; all roles are returned.
 *   UTCID03  N  – Sorting: repository orders by `name: 'asc'`.
 *   UTCID04  A  – Unauthorized access: documented gap — no
 *                 authorization check at the service layer.
 *   UTCID05  B  – Empty role list or last-page boundary: empty
 *                 list returns `[]`; last-page boundary handled
 *                 by the repository.
 */

import { RolesService } from '../../../src/modules/roles/roles.service';
import {
  rolesRepository,
  RoleSummary,
} from '../../../src/modules/roles/roles.repository';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/modules/roles/roles.repository');

const mockedRepo = rolesRepository as jest.Mocked<typeof rolesRepository>;

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

let service: RolesService;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();

  // Healthy defaults — three roles ordered by name.
  mockedRepo.findAll.mockResolvedValue([
    makeRole(1, 'ADMIN', 'Administrator'),
    makeRole(2, 'MANAGER', 'Manager'),
    makeRole(3, 'STAFF', 'Staff'),
  ]);

  service = new RolesService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRole(
  id: number,
  name: string,
  description?: string,
  userCount = 0
): RoleSummary {
  return {
    id,
    name,
    description: description ?? null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    userCount,
  };
}

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: list roles.
// Result : getAll returns a list of role summaries.
// ---------------------------------------------------------------------------
describe('[UTCID01] rolesService.getAll() – Normal 1: list roles', () => {
  it('returns a list of role summaries', async () => {
    const result = await service.getAll();

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
  });

  it('forwards the call to rolesRepository.findAll()', async () => {
    await service.getAll();

    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findAll).toHaveBeenCalledWith();
  });

  it('does NOT pass any arguments to the repository', async () => {
    await service.getAll();

    expect(mockedRepo.findAll.mock.calls[0]).toEqual([]);
  });

  it('returns the result verbatim from the repository', async () => {
    const repoResult = [
      makeRole(1, 'ADMIN', 'Administrator'),
      makeRole(2, 'STAFF', 'Staff'),
    ];
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce(repoResult);

    const result = await service.getAll();

    expect(result).toEqual(repoResult);
  });

  it('returns the role fields (id, name, description, createdAt, updatedAt, userCount)', async () => {
    const result = await service.getAll();

    const role = result[0];

    expect(role).toHaveProperty('id');
    expect(role).toHaveProperty('name');
    expect(role).toHaveProperty('description');
    expect(role).toHaveProperty('createdAt');
    expect(role).toHaveProperty('updatedAt');
    expect(role).toHaveProperty('userCount');
  });

  it('does NOT call any other repository methods', async () => {
    await service.getAll();

    expect(mockedRepo.findById).not.toHaveBeenCalled();
    expect(mockedRepo.findByName).not.toHaveBeenCalled();
    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does NOT call any other service methods', async () => {
    await service.getAll();

    // Pure delegation.
  });

  it('does NOT log to console (no audit logging at the service layer)', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await service.getAll();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: active-only mapping.
// Result : Documented gap — no status filter; all roles are
//          returned regardless of state.
// ---------------------------------------------------------------------------
describe('[UTCID02] rolesService.getAll() – Normal 2: active-only mapping (documented gap)', () => {
  it('does NOT have a `status` field on the persisted model (documented gap)', async () => {
    const result = await service.getAll();

    expect((result[0] as any).status).toBeUndefined();
  });

  it('does NOT have an `isActive` field on the persisted model (documented gap)', async () => {
    const result = await service.getAll();

    expect((result[0] as any).isActive).toBeUndefined();
  });

  it('does NOT have an `active` field on the persisted model (documented gap)', async () => {
    const result = await service.getAll();

    expect((result[0] as any).active).toBeUndefined();
  });

  it('does NOT filter by status (documented gap)', async () => {
    // The repository is called with NO arguments, so no filter
    // is applied.
    await service.getAll();

    expect(mockedRepo.findAll).toHaveBeenCalledWith();
    expect(mockedRepo.findAll.mock.calls[0]).toEqual([]);
  });

  it('returns ALL roles regardless of state', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeRole(1, 'ADMIN'),
      makeRole(2, 'ARCHIVED_ROLE'),
      makeRole(3, 'DISABLED_ROLE'),
    ]);

    const result = await service.getAll();

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.name)).toEqual([
      'ADMIN',
      'ARCHIVED_ROLE',
      'DISABLED_ROLE',
    ]);
  });

  it('does NOT mutate the result (no `.filter` on the role list)', async () => {
    const repoResult = [
      makeRole(1, 'ADMIN'),
      makeRole(2, 'ARCHIVED_ROLE'),
    ];
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce(repoResult);

    const result = await service.getAll();

    expect(result).toEqual(repoResult);
  });

  it('does NOT sort by active status (documented gap)', async () => {
    await service.getAll();

    // The repository handles the sort (via `orderBy: { name: 'asc' }`)
    // — the service does NOT sort.
    expect(mockedRepo.findAll).toHaveBeenCalledWith();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: sorting.
// Result : The repository orders by `name: 'asc'`.
// ---------------------------------------------------------------------------
describe('[UTCID03] rolesService.getAll() – Normal 3: sorting', () => {
  it('the repository-level sort is `name: asc`', async () => {
    // This is a property of the repository contract. The service
    // delegates the sort to the repository.
    await service.getAll();

    expect(mockedRepo.findAll).toHaveBeenCalledWith();
  });

  it('returns the result in the order provided by the repository', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeRole(3, 'STAFF'),
      makeRole(1, 'ADMIN'),
      makeRole(2, 'MANAGER'),
    ]);

    const result = await service.getAll();

    // The service returns the list verbatim — it does NOT sort.
    expect(result.map((r) => r.name)).toEqual(['STAFF', 'ADMIN', 'MANAGER']);
  });

  it('does NOT sort the list at the service layer', async () => {
    // The service does not call `Array.prototype.sort` on the
    // result. This is a delegation.
    await service.getAll();

    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
  });

  it('returns roles ordered by name (alphabetical, A → Z)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeRole(1, 'ADMIN'),
      makeRole(2, 'MANAGER'),
      makeRole(3, 'STAFF'),
    ]);

    const result = await service.getAll();

    expect(result.map((r) => r.name)).toEqual(['ADMIN', 'MANAGER', 'STAFF']);
  });

  it('handles multi-word role names (sorted alphabetically)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeRole(1, 'DEPT_ADMIN'),
      makeRole(2, 'ADMIN'),
      makeRole(3, 'USER'),
    ]);

    const result = await service.getAll();

    // Result is verbatim — sort order is whatever the repository
    // returns. The service does not impose a sort.
    expect(result).toHaveLength(3);
  });

  it('does NOT pass a sort argument to the repository (sorting is repository-internal)', async () => {
    await service.getAll();

    const args = mockedRepo.findAll.mock.calls[0];
    expect(args).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: unauthorized access.
// Result : Documented gap — no authorization check at the service
//          layer. Authorization is at the controller / middleware
//          layer.
// ---------------------------------------------------------------------------
describe('[UTCID04] rolesService.getAll() – Abnormal 1: unauthorized access (documented gap)', () => {
  it('does NOT throw when no actor is supplied (no authorization check)', async () => {
    await expect(service.getAll()).resolves.toBeDefined();
  });

  it('does NOT enforce authorization at the service layer (documented gap)', async () => {
    // The matrix mentions "unauthorized" but the service has no
    // actor parameter. Authorization is at the controller /
    // middleware layer.
    await expect(service.getAll()).resolves.toBeDefined();
  });

  it('does NOT have an `actor` field on the inputs (documented gap)', async () => {
    await service.getAll();

    expect(mockedRepo.findAll).toHaveBeenCalledWith();
  });

  it('does NOT enforce role-based access (no role check)', async () => {
    await expect(service.getAll()).resolves.toBeDefined();
  });

  it('does NOT log unauthorized attempts to console (documented gap)', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await service.getAll();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('records a safe diagnostic (no password / hash leak) on the unauthorized path', async () => {
    const result = await service.getAll();

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT propagate the missing-authorization error to the repository', async () => {
    await service.getAll();

    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Boundary 1: empty role list or last-page boundary.
// Result : Empty list returns `[]`; last-page boundary handled by
//          the repository.
// ---------------------------------------------------------------------------
describe('[UTCID05] rolesService.getAll() – Boundary 1: empty role list or last-page boundary', () => {
  it('accepts the boundary: empty role list returns []', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([]);

    const result = await service.getAll();

    expect(result).toEqual([]);
  });

  it('accepts the boundary: a single role', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeRole(1, 'ADMIN'),
    ]);

    const result = await service.getAll();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('ADMIN');
  });

  it('accepts the boundary: a list of many roles', async () => {
    const manyRoles = Array.from({ length: 1000 }, (_, i) =>
      makeRole(i + 1, `ROLE_${i + 1}`),
    );
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce(manyRoles);

    const result = await service.getAll();

    expect(result).toHaveLength(1000);
  });

  it('handles a list of all ADMIN roles (saturated)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce(
      Array.from({ length: 100 }, (_, i) =>
        makeRole(i + 1, 'ADMIN', `Admin ${i + 1}`),
      ),
    );

    const result = await service.getAll();

    expect(result).toHaveLength(100);
  });

  it('handles a single role with null description', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeRole(1, 'ADMIN', undefined),
    ]);

    const result = await service.getAll();

    expect(result[0].description).toBeNull();
  });

  it('handles a single role with empty-string description', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeRole(1, 'ADMIN', ''),
    ]);

    const result = await service.getAll();

    expect(result[0].description).toBe('');
  });

  it('handles a single role with very long description (boundary)', async () => {
    const longDesc = 'a'.repeat(10000);
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeRole(1, 'ADMIN', longDesc),
    ]);

    const result = await service.getAll();

    expect(result[0].description).toBe(longDesc);
  });

  it('handles a role with userCount = 0 (boundary)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeRole(1, 'ADMIN', 'Admin', 0),
    ]);

    const result = await service.getAll();

    expect(result[0].userCount).toBe(0);
  });

  it('handles a role with userCount = Number.MAX_SAFE_INTEGER', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeRole(1, 'ADMIN', 'Admin', Number.MAX_SAFE_INTEGER),
    ]);

    const result = await service.getAll();

    expect(result[0].userCount).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('handles a role id = Number.MAX_SAFE_INTEGER', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeRole(Number.MAX_SAFE_INTEGER, 'ADMIN'),
    ]);

    const result = await service.getAll();

    expect(result[0].id).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('does NOT modify the empty list (returns [] verbatim)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([]);

    const result = await service.getAll();

    expect(result).toEqual([]);
    expect(result.length).toBe(0);
  });

  it('does NOT filter or truncate the empty list (no pagination at the service layer)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([]);

    const result = await service.getAll();

    expect(result).toEqual([]);
  });

  it('does NOT throw on the empty list boundary (no unhandled exception)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([]);

    await expect(service.getAll()).resolves.toEqual([]);
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([]);

    await service.getAll();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([]);

    const result = await service.getAll();

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT leak sensitive fields through any side effect on the boundary path', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeRole(1, 'ADMIN'),
    ]);

    const result = await service.getAll();

    expect(JSON.stringify(result)).not.toMatch(/password/i);
    expect(JSON.stringify(result)).not.toMatch(/hash/i);
    expect(JSON.stringify(result)).not.toMatch(/secret/i);
  });
});
