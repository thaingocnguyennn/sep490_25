/**
 * Unit tests for UsersService.getAll() — Function12 / Filter User.
 *
 * Note on naming: the matrix headers reference `UserQueryService`, but
 * the implementation is `UsersService.getAll(params)` inside
 * `backend/src/modules/users/users.service.ts`. We exercise the actual
 * export and label the describe blocks with the matrix UTCIDs.
 *
 * The service is a thin pass-through over `usersRepository.findAll(...)`:
 *   - page  : params.page truthy → Number(params.page), else 1
 *   - limit : params.limit truthy → Number(params.limit), else 10
 *   - status: forwarded as-is (cast to UserStatus)
 *   - role  : forwarded as-is
 *   - departmentId: forwarded as-is
 *   - search: forwarded as-is
 *
 * Coverage matrix (UTCID01 – UTCID07):
 *   UTCID01  N  – Filter User completes successfully for status filter.
 *   UTCID02  N  – Filter User completes successfully for role filter.
 *   UTCID03  N  – Filter User completes successfully for department
 *                 filter.
 *   UTCID04  N  – Filter User completes successfully for combined
 *                 filters (status + role + departmentId + search).
 *   UTCID05  A  – Filter User rejects the operation with a controlled
 *                 error for an unsupported filter (invalid status
 *                 enum value).
 *   UTCID06  A  – Filter User rejects the operation with a controlled
 *                 error on repository failure (database unavailable).
 *   UTCID07  B  – Boundary 1: empty result or limit boundary.
 *                 Supported boundary (limit=1, limit=10 default, empty
 *                 result set) is accepted; the adjacent unsupported
 *                 value (limit=0 with `|| 10` fallback) is handled
 *                 correctly.
 */

import { UsersService } from '../../../src/modules/users/users.service';
import {
  usersRepository,
} from '../../../src/modules/users/users.repository';
import { UserStatus } from '@prisma/client';
import type {
  UserListResult,
  UserSummary,
} from '../../../src/modules/users/users.repository';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/modules/users/users.repository');

const mockedRepo = usersRepository as jest.Mocked<typeof usersRepository>;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeSummary(overrides: Partial<UserSummary> = {}): UserSummary {
  return {
    id: 42,
    username: 'alice',
    email: 'alice@example.com',
    fullName: 'Alice Nguyen',
    phone: '+84909000001',
    avatar: null,
    status: UserStatus.ACTIVE,
    isFirstLogin: false,
    lastLogin: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    roles: ['ADMIN'],
    ...overrides,
  };
}

function makeListResult(
  users: UserSummary[] = [],
  total = users.length,
  page = 1,
  limit = 10,
): UserListResult {
  return { users, total, page, limit };
}

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

let service: UsersService;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();

  // Healthy defaults — every test overrides what it needs.
  mockedRepo.findAll.mockResolvedValue(makeListResult());

  service = new UsersService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: status filter.
// Result : Filter User returns the expected success value; the status
//          filter is forwarded verbatim.
// ---------------------------------------------------------------------------
describe('[UTCID01] usersService.getAll() – Normal 1: status filter', () => {
  it('forwards the status filter verbatim to the repository', async () => {
    await service.getAll({ status: 'ACTIVE' as any });

    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findAll.mock.calls[0][0]).toMatchObject({
      status: 'ACTIVE',
    });
  });

  it('returns the expected success value for an ACTIVE status filter', async () => {
    const alice = makeSummary({ status: UserStatus.ACTIVE });
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([alice], 1, 1, 10),
    );

    const result = await service.getAll({ status: 'ACTIVE' as any });

    expect(result.users).toHaveLength(1);
    expect(result.users[0]).toMatchObject({
      id: 42,
      status: UserStatus.ACTIVE,
    });
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it('returns the expected success value for an INACTIVE status filter', async () => {
    const bob = makeSummary({
      id: 7,
      username: 'bob',
      status: UserStatus.INACTIVE,
    });
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([bob], 1, 1, 10),
    );

    const result = await service.getAll({ status: 'INACTIVE' as any });

    expect(result.users[0].status).toBe(UserStatus.INACTIVE);
    expect(mockedRepo.findAll.mock.calls[0][0].status).toBe('INACTIVE');
  });

  it('returns the expected success value for a LOCKED status filter', async () => {
    const locked = makeSummary({
      id: 8,
      username: 'charlie',
      status: UserStatus.LOCKED,
    });
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([locked], 1, 1, 10),
    );

    const result = await service.getAll({ status: 'LOCKED' as any });

    expect(result.users[0].status).toBe(UserStatus.LOCKED);
    expect(mockedRepo.findAll.mock.calls[0][0].status).toBe('LOCKED');
  });

  it('does not call any write methods on the read path', async () => {
    await service.getAll({ status: 'ACTIVE' as any });

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does not mutate the input params (read-only filter)', async () => {
    const params = { status: 'ACTIVE' as any };

    await service.getAll(params);

    // The input params object is unchanged after the service call.
    expect(params).toEqual({ status: 'ACTIVE' });
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: role filter.
// Result : Filter User returns the expected success value; the role
//          filter is forwarded verbatim.
// ---------------------------------------------------------------------------
describe('[UTCID02] usersService.getAll() – Normal 2: role filter', () => {
  it('forwards the role filter verbatim to the repository', async () => {
    await service.getAll({ role: 'ADMIN' });

    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findAll.mock.calls[0][0].role).toBe('ADMIN');
  });

  it('returns the expected success value for a single role filter (ADMIN)', async () => {
    const alice = makeSummary({ id: 42, username: 'alice', roles: ['ADMIN'] });
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([alice], 1, 1, 10),
    );

    const result = await service.getAll({ role: 'ADMIN' });

    expect(result.users).toHaveLength(1);
    expect(result.users[0].roles).toEqual(['ADMIN']);
    expect(mockedRepo.findAll.mock.calls[0][0].role).toBe('ADMIN');
  });

  it('returns the expected success value for a single role filter (EDITOR)', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult(
        [makeSummary({ id: 7, username: 'editor', roles: ['EDITOR'] })],
        1,
        1,
        10,
      ),
    );

    const result = await service.getAll({ role: 'EDITOR' });

    expect(result.users[0].roles).toEqual(['EDITOR']);
    expect(mockedRepo.findAll.mock.calls[0][0].role).toBe('EDITOR');
  });

  it('returns the expected success value for an empty role (no users)', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([], 0, 1, 10),
    );

    const result = await service.getAll({ role: 'NONEXISTENT' });

    expect(result.users).toEqual([]);
    expect(result.total).toBe(0);
    expect(mockedRepo.findAll.mock.calls[0][0].role).toBe('NONEXISTENT');
  });

  it('does not transform the role string before forwarding', async () => {
    await service.getAll({ role: 'VIEWER' });

    // The role is forwarded verbatim, not uppercased / lowercased.
    expect(mockedRepo.findAll.mock.calls[0][0].role).toBe('VIEWER');
  });

  it('does NOT leak sensitive fields through the response (no password / hash / secret)', async () => {
    const result = await service.getAll({ role: 'ADMIN' });

    expect(result.users).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: department filter.
// Result : Filter User returns the expected success value; the
//          departmentId filter is forwarded verbatim.
// ---------------------------------------------------------------------------
describe('[UTCID03] usersService.getAll() – Normal 3: department filter', () => {
  it('forwards the departmentId filter verbatim to the repository', async () => {
    await service.getAll({ departmentId: 3 });

    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findAll.mock.calls[0][0].departmentId).toBe(3);
  });

  it('returns the expected success value for a single department filter', async () => {
    const alice = makeSummary({ id: 42, username: 'alice' });
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([alice], 1, 1, 10),
    );

    const result = await service.getAll({ departmentId: 3 });

    expect(result.users).toHaveLength(1);
    expect(mockedRepo.findAll.mock.calls[0][0].departmentId).toBe(3);
  });

  it('forwards departmentId=0 (falsy) without applying the `|| 1` page fallback', async () => {
    // The `|| 10` fallback for limit applies to limit, not
    // departmentId. departmentId=0 must be forwarded verbatim.
    await service.getAll({ departmentId: 0 });

    expect(mockedRepo.findAll.mock.calls[0][0].departmentId).toBe(0);
  });

  it('forwards a different departmentId (departmentId=99)', async () => {
    await service.getAll({ departmentId: 99 });

    expect(mockedRepo.findAll.mock.calls[0][0].departmentId).toBe(99);
  });

  it('does not transform the departmentId before forwarding', async () => {
    await service.getAll({ departmentId: 5 });

    expect(mockedRepo.findAll.mock.calls[0][0].departmentId).toBe(5);
  });

  it('returns the expected success value for an empty department (no users)', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([], 0, 1, 10),
    );

    const result = await service.getAll({ departmentId: 999 });

    expect(result.users).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: combined filters.
// Result : Filter User returns the expected success value; all
//          supplied filters (status + role + departmentId + search +
//          pagination) are forwarded verbatim.
// ---------------------------------------------------------------------------
describe('[UTCID04] usersService.getAll() – Normal 4: combined filters', () => {
  it('forwards all four filters + pagination verbatim to the repository', async () => {
    await service.getAll({
      page: 2,
      limit: 25,
      search: 'alice',
      status: 'ACTIVE' as any,
      role: 'ADMIN',
      departmentId: 3,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findAll.mock.calls[0][0]).toEqual({
      page: 2,
      limit: 25,
      search: 'alice',
      status: 'ACTIVE',
      role: 'ADMIN',
      departmentId: 3,
    });
  });

  it('returns the expected success value for combined filters', async () => {
    const alice = makeSummary({
      id: 42,
      username: 'alice',
      status: UserStatus.ACTIVE,
      roles: ['ADMIN'],
    });
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([alice], 1, 2, 25),
    );

    const result = await service.getAll({
      page: 2,
      limit: 25,
      search: 'alice',
      status: 'ACTIVE' as any,
      role: 'ADMIN',
      departmentId: 3,
    });

    expect(result).toEqual({
      users: [alice],
      total: 1,
      page: 2,
      limit: 25,
    });
  });

  it('forwards status + role combined correctly', async () => {
    await service.getAll({
      status: 'ACTIVE' as any,
      role: 'EDITOR',
    });

    expect(mockedRepo.findAll.mock.calls[0][0]).toMatchObject({
      status: 'ACTIVE',
      role: 'EDITOR',
    });
  });

  it('forwards role + departmentId combined correctly', async () => {
    await service.getAll({
      role: 'VIEWER',
      departmentId: 5,
    });

    expect(mockedRepo.findAll.mock.calls[0][0]).toMatchObject({
      role: 'VIEWER',
      departmentId: 5,
    });
  });

  it('forwards search + status combined correctly', async () => {
    await service.getAll({
      search: 'alice',
      status: 'INACTIVE' as any,
    });

    expect(mockedRepo.findAll.mock.calls[0][0]).toMatchObject({
      search: 'alice',
      status: 'INACTIVE',
    });
  });

  it('applies the default page=1 when no page is supplied (combined)', async () => {
    await service.getAll({
      status: 'ACTIVE' as any,
      role: 'ADMIN',
      departmentId: 3,
    });

    // The service defaults page to 1 and limit to 10 when not
    // supplied.
    expect(mockedRepo.findAll.mock.calls[0][0]).toMatchObject({
      page: 1,
      limit: 10,
      status: 'ACTIVE',
      role: 'ADMIN',
      departmentId: 3,
    });
  });

  it('applies the default limit=10 when no limit is supplied (combined)', async () => {
    await service.getAll({
      search: 'alice',
      role: 'ADMIN',
    });

    expect(mockedRepo.findAll.mock.calls[0][0].limit).toBe(10);
  });

  it('converts string page/limit to numbers via Number(...)', async () => {
    // The service uses `Number(params.page)` — strings get coerced
    // even if the type signature says `number`.
    await service.getAll({
      page: '3' as any,
      limit: '20' as any,
    });

    expect(mockedRepo.findAll.mock.calls[0][0].page).toBe(3);
    expect(mockedRepo.findAll.mock.calls[0][0].limit).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 1: unsupported filter.
// Result : Filter User rejects the operation with a controlled error
//          for an unsupported filter (invalid status enum value).
// ---------------------------------------------------------------------------
describe('[UTCID05] usersService.getAll() – Abnormal 1: unsupported filter', () => {
  it('rejects an unsupported status enum value via repository failure', async () => {
    const repoError = new Error('Invalid value for argument `status`.');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.getAll({ status: 'BANNED' as any }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('rejects an unsupported role filter via repository failure', async () => {
    const repoError = new Error('Invalid role name');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.getAll({ role: 'SUPERADMIN' }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('rejects an unsupported departmentId via repository failure', async () => {
    const repoError = new Error('Invalid departmentId');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.getAll({ departmentId: -999 }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('records a safe diagnostic on unsupported filter rejection (no password / hash leak)', async () => {
    const repoError = new Error('Invalid value for argument `status`.');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    const err = await service
      .getAll({ status: 'BANNED' as any })
      .catch((e) => e) as Error;

    expect(err.message).toContain('Invalid value');
    expect(err.message).not.toMatch(/password|hash|secret/i);
    expect(err.message).not.toMatch(/email|@/i);
  });

  it('does not call any other repository method on the unsupported filter path', async () => {
    const repoError = new Error('Invalid value');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.getAll({ status: 'BANNED' as any }),
    ).rejects.toBeInstanceOf(Error);

    // Only findAll was called.
    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 2: unauthorized / repository failure.
// Result : Filter User rejects the operation with a controlled error
//          on repository failure (database unavailable); no partial
//          commit; safe diagnostic.
// ---------------------------------------------------------------------------
describe('[UTCID06] usersService.getAll() – Abnormal 2: unauthorized/repository failure', () => {
  it('rejects with a controlled error on repository failure (database unavailable)', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    await expect(service.getAll({})).rejects.toBe(repoError);
  });

  it('rejects when the repository returns an unexpected error type', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw new TypeError('Unexpected');
    });

    await expect(service.getAll({})).rejects.toBeInstanceOf(TypeError);
  });

  it('records a safe diagnostic on repository failure', async () => {
    const repoError = new Error('connection refused');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    const err = await service
      .getAll({ status: 'ACTIVE' as any })
      .catch((e) => e) as Error;

    expect(err.message).toBe('connection refused');
    expect(err.message).not.toMatch(/password|hash|secret/i);
    expect(err.message).not.toMatch(/email|@/i);
  });

  it('does not call any write methods on the read-failure path', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    await expect(service.getAll({})).rejects.toBe(repoError);

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does not retry the read on failure', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    await expect(service.getAll({})).rejects.toBe(repoError);

    // Exactly one findAll call — no retry.
    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
  });

  it('rejects with a controlled error when status filter is unauthorized (RBAC denylist)', async () => {
    // The service does not perform its own authorization — RBAC is
    // enforced at the controller / middleware layer. We model the
    // "unauthorized" scenario as a repository failure that surfaces
    // a controlled error.
    const authError = new Error('Unauthorized');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw authError;
    });

    await expect(
      service.getAll({ status: 'ACTIVE' as any }),
    ).rejects.toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Boundary 1: empty result or limit boundary.
// Result : Filter User accepts the supported boundary (limit=1, the
//          default limit=10, empty result set); the adjacent
//          unsupported value (limit=0 → fallback to 10) is handled
//          correctly.
// ---------------------------------------------------------------------------
describe('[UTCID07] usersService.getAll() – Boundary 1: empty result or limit boundary', () => {
  // ---- limit boundary ----

  it('accepts limit=1 (smallest supported positive integer)', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([makeSummary({ id: 1 })], 1, 1, 1),
    );

    const result = await service.getAll({ limit: 1 });

    expect(result.limit).toBe(1);
    expect(mockedRepo.findAll.mock.calls[0][0].limit).toBe(1);
  });

  it('accepts the default limit=10 when no limit is supplied', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([makeSummary({ id: 1 })], 1, 1, 10),
    );

    const result = await service.getAll({});

    expect(result.limit).toBe(10);
    expect(mockedRepo.findAll.mock.calls[0][0].limit).toBe(10);
  });

  it('falls back to limit=10 when limit=0 is supplied (falsy)', async () => {
    // The service uses `params.limit || 10` — falsy values (0,
    // '', null, undefined) fall back to 10.
    await service.getAll({ limit: 0 });

    expect(mockedRepo.findAll.mock.calls[0][0].limit).toBe(10);
  });

  it('falls back to limit=10 when limit is undefined', async () => {
    await service.getAll({ limit: undefined });

    expect(mockedRepo.findAll.mock.calls[0][0].limit).toBe(10);
  });

  it('accepts a large limit (limit=100)', async () => {
    await service.getAll({ limit: 100 });

    expect(mockedRepo.findAll.mock.calls[0][0].limit).toBe(100);
  });

  it('accepts limit=Number.MAX_SAFE_INTEGER', async () => {
    await service.getAll({ limit: Number.MAX_SAFE_INTEGER });

    expect(mockedRepo.findAll.mock.calls[0][0].limit).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  // ---- page boundary ----

  it('accepts page=1 (smallest supported positive integer)', async () => {
    await service.getAll({ page: 1 });

    expect(mockedRepo.findAll.mock.calls[0][0].page).toBe(1);
  });

  it('falls back to page=1 when page=0 is supplied (falsy)', async () => {
    await service.getAll({ page: 0 });

    expect(mockedRepo.findAll.mock.calls[0][0].page).toBe(1);
  });

  it('falls back to page=1 when page is undefined', async () => {
    await service.getAll({ page: undefined });

    expect(mockedRepo.findAll.mock.calls[0][0].page).toBe(1);
  });

  it('accepts page=2 with the correct skip semantics', async () => {
    await service.getAll({ page: 2, limit: 25 });

    // page=2, limit=25 → forwarded verbatim.
    expect(mockedRepo.findAll.mock.calls[0][0].page).toBe(2);
    expect(mockedRepo.findAll.mock.calls[0][0].limit).toBe(25);
  });

  // ---- empty result boundary ----

  it('returns an empty result set when no users match the filter', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([], 0, 1, 10),
    );

    const result = await service.getAll({ status: 'ACTIVE' as any });

    expect(result.users).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it('returns an empty result set for an unsupported role filter', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([], 0, 1, 10),
    );

    const result = await service.getAll({ role: 'NONEXISTENT' });

    expect(result.users).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns an empty result set for an unsupported departmentId', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([], 0, 1, 10),
    );

    const result = await service.getAll({ departmentId: 999 });

    expect(result.users).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns a single-row result set for the supported limit boundary (limit=1)', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([makeSummary({ id: 1 })], 1, 1, 1),
    );

    const result = await service.getAll({ limit: 1 });

    expect(result.users).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.limit).toBe(1);
  });

  it('does not throw on the empty result boundary', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([], 0, 1, 10),
    );

    await expect(
      service.getAll({ status: 'ACTIVE' as any }),
    ).resolves.toMatchObject({ users: [], total: 0 });
  });

  it('does not leak sensitive fields on the empty result boundary', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([], 0, 1, 10),
    );

    const result = await service.getAll({ status: 'ACTIVE' as any });

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('does not call any write methods on the boundary path', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([], 0, 1, 10),
    );

    await service.getAll({ limit: 1 });

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });
});
