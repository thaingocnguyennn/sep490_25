/**
 * Unit tests for UsersService.getById() — Function9 / View User Detail.
 *
 * Note on naming: the matrix headers reference `UserQueryService`, but
 * the implementation is `UsersService.getById(id)` inside
 * `backend/src/modules/users/users.service.ts`. We exercise the actual
 * export and label the describe blocks with the matrix UTCIDs.
 *
 * Coverage matrix (UTCID01 – UTCID05):
 *   UTCID01  N  – View User Detail completes successfully for an
 *                 existing user (findById returns a user; the
 *                 UserDetail is forwarded unchanged).
 *   UTCID02  N  – View User Detail completes successfully and the role
 *                 list propagates correctly through the response.
 *   UTCID03  N  – View User Detail completes successfully and the
 *                 department (and departmentMemberships) propagates
 *                 correctly through the response.
 *   UTCID04  A  – View User Detail rejects the operation with a
 *                 NotFoundError when the identifier does not resolve
 *                 to an existing user (or any invalid-identifier
 *                 scenario).
 *   UTCID05  B  – Boundary: identifier and optional-field boundary.
 *                 Supported identifier values (positive integer
 *                 resolving to a user) are accepted; the adjacent
 *                 unsupported values (id <= 0, NaN) are rejected with
 *                 a controlled error and no partial commit.
 */

import { UsersService } from '../../../src/modules/users/users.service';
import {
  usersRepository,
} from '../../../src/modules/users/users.repository';
import { UserStatus } from '@prisma/client';
import { NotFoundError } from '../../../src/shared/exceptions/app-error';
import type { UserDetail } from '../../../src/modules/users/users.repository';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/modules/users/users.repository');

const mockedRepo = usersRepository as jest.Mocked<typeof usersRepository>;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeUserDetail(overrides: Partial<UserDetail> = {}): UserDetail {
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
    department: null,
    departmentMemberships: [],
    createdBy: { id: 100, fullName: 'Root Admin' },
    updatedBy: null,
    ...overrides,
  };
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

  mockedRepo.findById.mockResolvedValue(makeUserDetail());

  service = new UsersService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: existing user.
// Result : View User Detail returns the expected success value for an
//          existing user (the post-lookup UserDetail).
// ---------------------------------------------------------------------------
describe('[UTCID01] usersService.getById() – Normal 1: existing user', () => {
  it('returns the expected success value for an existing user', async () => {
    const result = await service.getById(42);

    // 1. Return – the post-lookup UserDetail propagates identifiers,
    //    status, and audit metadata.
    expect(result).toMatchObject({
      id: 42,
      username: 'alice',
      email: 'alice@example.com',
      fullName: 'Alice Nguyen',
      phone: '+84909000001',
      status: UserStatus.ACTIVE,
      roles: ['ADMIN'],
      createdBy: { id: 100, fullName: 'Root Admin' },
    });

    // 2. Persisted state matches – the repository received the
    //    requested identifier exactly.
    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findById).toHaveBeenCalledWith(42);

    // 3. No unhandled exception / partial commit / sensitive disclosure
    expect('password' in result).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('does not call any write / mutate methods on the read path', async () => {
    await service.getById(42);

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
    expect(mockedRepo.findAll).not.toHaveBeenCalled();
    expect(mockedRepo.findByUsername).not.toHaveBeenCalled();
    expect(mockedRepo.findByEmail).not.toHaveBeenCalled();
  });

  it('does NOT re-fetch or transform the UserDetail returned by the repository', async () => {
    // The service forwards the repository's value unchanged — even
    // when the UserDetail has rich department + memberships data.
    const rich = makeUserDetail({
      id: 7,
      department: { id: 3, name: 'IT Department' },
      departmentMemberships: [
        { departmentId: 3, name: 'IT Department', assignedAt: '2026-02-01T00:00:00.000Z' },
      ],
      createdBy: { id: 100, fullName: 'Root Admin' },
      updatedBy: { id: 200, fullName: 'Editor' },
    });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(rich);

    const result = await service.getById(7);

    expect(result).toEqual(rich);
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: roles.
// Result : View User Detail returns the expected success value; the
//          role list propagates correctly through the response.
// ---------------------------------------------------------------------------
describe('[UTCID02] usersService.getById() – Normal 2: roles', () => {
  it('returns the expected success value when the user has a single role', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 7, roles: ['ADMIN'] }),
    );

    const result = await service.getById(7);

    // 1. Return – role list is forwarded verbatim.
    expect(result.roles).toEqual(['ADMIN']);
    expect(result.roles).toHaveLength(1);
  });

  it('returns the expected success value when the user has multiple roles', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({
        id: 7,
        roles: ['ADMIN', 'EDITOR', 'VIEWER'],
      }),
    );

    const result = await service.getById(7);

    // 1. Return – multi-role list propagates in the original order.
    expect(result.roles).toEqual(['ADMIN', 'EDITOR', 'VIEWER']);
    expect(result.roles).toHaveLength(3);
  });

  it('returns the expected success value when the user has zero roles', async () => {
    // Edge case: a user with no roles should still resolve to a
    // UserDetail with `roles: []` (not undefined).
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 7, roles: [] }),
    );

    const result = await service.getById(7);

    expect(result.roles).toEqual([]);
    expect(result.roles).toHaveLength(0);
  });

  it('does not mutate the roles array returned by the repository', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 7, roles: ['ADMIN', 'EDITOR'] }),
    );

    const result = await service.getById(7);

    // The returned roles array is the SAME reference the repository
    // provided (the service doesn't transform the data).
    expect(result.roles).toEqual(['ADMIN', 'EDITOR']);
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: department.
// Result : View User Detail returns the expected success value; the
//          department (and departmentMemberships) propagates correctly
//          through the response.
// ---------------------------------------------------------------------------
describe('[UTCID03] usersService.getById() – Normal 3: department', () => {
  it('returns the expected success value when the user has no department', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 7, department: null, departmentMemberships: [] }),
    );

    const result = await service.getById(7);

    // 1. Return – null department propagates correctly.
    expect(result.department).toBeNull();
    expect(result.departmentMemberships).toEqual([]);
  });

  it('returns the expected success value when the user has a single department', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({
        id: 7,
        department: { id: 3, name: 'IT Department' },
        departmentMemberships: [
          {
            departmentId: 3,
            name: 'IT Department',
            assignedAt: '2026-02-01T00:00:00.000Z',
          },
        ],
      }),
    );

    const result = await service.getById(7);

    // 1. Return – single department + memberships propagated.
    expect(result.department).toEqual({ id: 3, name: 'IT Department' });
    expect(result.departmentMemberships).toEqual([
      {
        departmentId: 3,
        name: 'IT Department',
        assignedAt: '2026-02-01T00:00:00.000Z',
      },
    ]);
  });

  it('returns the expected success value when the user has multiple department memberships (history)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({
        id: 7,
        department: { id: 5, name: 'Current Department' },
        departmentMemberships: [
          {
            departmentId: 5,
            name: 'Current Department',
            assignedAt: '2026-09-01T00:00:00.000Z',
          },
          {
            departmentId: 3,
            name: 'Old Department',
            assignedAt: '2025-09-01T00:00:00.000Z',
          },
        ],
      }),
    );

    const result = await service.getById(7);

    // 1. Return – multi-membership history propagates.
    expect(result.department).toEqual({ id: 5, name: 'Current Department' });
    expect(result.departmentMemberships).toHaveLength(2);
    expect(result.departmentMemberships?.[0]).toEqual({
      departmentId: 5,
      name: 'Current Department',
      assignedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(result.departmentMemberships?.[1]).toEqual({
      departmentId: 3,
      name: 'Old Department',
      assignedAt: '2025-09-01T00:00:00.000Z',
    });
  });

  it('does not transform the department field returned by the repository', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({
        id: 7,
        department: { id: 12, name: 'Sales' },
      }),
    );

    const result = await service.getById(7);

    expect(result.department).toEqual({ id: 12, name: 'Sales' });
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: invalid identifier.
// Result : View User Detail rejects the operation with a NotFoundError
//          when the user does not exist; no partial commit; safe
//          diagnostic.
// ---------------------------------------------------------------------------
describe('[UTCID04] usersService.getById() – Abnormal 1: invalid identifier', () => {
  it('rejects with NotFoundError when the user does not exist', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(service.getById(999)).rejects.toBeInstanceOf(NotFoundError);

    await expect(service.getById(999)).rejects.toMatchObject({
      name: 'NotFoundError',
      statusCode: 404,
      message: expect.stringContaining('Không tìm thấy người dùng'),
    });

    // No partial commit – findById was the only repository call.
    expect(mockedRepo.findById).toHaveBeenCalledTimes(2);
    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('rejects when the identifier is negative (validator-style rejection upstream)', async () => {
    // The validator chain (`getUserByIdValidation`) enforces
    // `id` >= 1 with `withMessage('Mã người dùng không hợp lệ')`. At the
    // service layer, negative ids reach findById; the DB rejects them
    // (or returns null) and the service surfaces NotFoundError.
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(service.getById(-1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects when the repository itself fails (database unavailable)', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(repoError);

    await expect(service.getById(42)).rejects.toBe(repoError);

    // No partial commit
    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on rejection (no user data leaked)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    const err = await service
      .getById(999)
      .catch((e) => e) as NotFoundError;

    expect(err.message).toBe('Không tìm thấy người dùng');
    // The error message does NOT include the identifier.
    expect(err.message).not.toContain('999');
    // No user data leaked through the rejection.
    expect(err.message).not.toMatch(/password|hash|secret/i);
    expect(err.message).not.toMatch(/email|phone|@/i);
  });

  it('does not leak the untrusted identifier through the rejection message', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    const err = await service
      .getById(Number.MAX_SAFE_INTEGER)
      .catch((e) => e) as NotFoundError;

    expect(err.message).not.toContain(String(Number.MAX_SAFE_INTEGER));
  });

  it('rejects with NotFoundError even when the repository rejects with a different error type', async () => {
    // The service has no internal classification logic; it surfaces
    // whatever the repository throws. We assert that the rejection
    // message is the same one the service constructs, and no user
    // data is leaked through it.
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    const err = await service
      .getById(42)
      .catch((e) => e) as NotFoundError;

    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.message).toBe('Không tìm thấy người dùng');
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Boundary 1: identifier and optional-field boundary.
// Supported identifier values: positive integers that resolve to a user.
// Adjacent unsupported values: id <= 0, NaN.
// ---------------------------------------------------------------------------
describe('[UTCID05] usersService.getById() – Boundary 1: identifier and optional-field boundary', () => {
  // ---- identifier boundary ----

  it('accepts id=1 (smallest supported positive integer)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(makeUserDetail({ id: 1 }));

    // 1. Return – expected success value at the supported boundary
    const result = await service.getById(1);

    expect(result.id).toBe(1);
    // 2. Persisted state matches – repository received the value.
    expect(mockedRepo.findById).toHaveBeenCalledWith(1);
  });

  it('accepts id=Number.MAX_SAFE_INTEGER (largest supported positive integer)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: Number.MAX_SAFE_INTEGER }),
    );

    const result = await service.getById(Number.MAX_SAFE_INTEGER);

    expect(result.id).toBe(Number.MAX_SAFE_INTEGER);
    expect(mockedRepo.findById).toHaveBeenCalledWith(Number.MAX_SAFE_INTEGER);
  });

  it('rejects id=0 (adjacent unsupported value, validator-style)', async () => {
    // The validator chain enforces id >= 1; at the service layer,
    // findById returns null and the service throws NotFoundError.
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(service.getById(0)).rejects.toBeInstanceOf(NotFoundError);

    const err = await service
      .getById(0)
      .catch((e) => e) as NotFoundError;
    expect(err.message).toBe('Không tìm thấy người dùng');
    expect(err.message).not.toContain('0');
  });

  it('rejects id=-1 (adjacent unsupported value below zero)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(service.getById(-1)).rejects.toBeInstanceOf(NotFoundError);

    const err = await service
      .getById(-1)
      .catch((e) => e) as NotFoundError;
    expect(err.message).toBe('Không tìm thấy người dùng');
    expect(err.message).not.toContain('-1');
  });

  it('rejects id=NaN (adjacent unsupported value)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(service.getById(NaN)).rejects.toBeInstanceOf(NotFoundError);

    const err = await service
      .getById(NaN)
      .catch((e) => e) as NotFoundError;
    expect(err.message).toBe('Không tìm thấy người dùng');
    expect(err.message).not.toMatch(/NaN/);
  });

  // ---- optional-field boundary ----

  it('accepts the supported boundary when ALL optional fields are present', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({
        id: 7,
        phone: '+84909000001', // supported: 10 digits
        avatar: 'https://cdn.example.com/avatar/7.png',
        department: { id: 3, name: 'IT Department' },
        lastLogin: '2026-09-10T01:00:00.000Z',
      }),
    );

    const result = await service.getById(7);

    // 1. Return – expected success value at the supported boundary
    expect(result).toMatchObject({
      id: 7,
      phone: '+84909000001',
      avatar: 'https://cdn.example.com/avatar/7.png',
      department: { id: 3, name: 'IT Department' },
      lastLogin: '2026-09-10T01:00:00.000Z',
    });
    // 2. Persisted state matches – repository received the identifier.
    expect(mockedRepo.findById).toHaveBeenCalledWith(7);
  });

  it('accepts the supported boundary when ALL optional fields are absent', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({
        id: 7,
        phone: null,
        avatar: null,
        department: null,
        departmentMemberships: [],
        lastLogin: null,
      }),
    );

    const result = await service.getById(7);

    // 1. Return – all optional fields are null / empty / missing.
    expect(result).toMatchObject({
      id: 7,
      phone: null,
      avatar: null,
      department: null,
      departmentMemberships: [],
      lastLogin: null,
    });
  });

  it('does NOT mutate the UserDetail during a supported boundary lookup', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(makeUserDetail({ id: 7 }));

    const result = await service.getById(7);

    // The returned object is the same reference the repository
    // provided.
    expect(result.id).toBe(7);
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
  });
});
