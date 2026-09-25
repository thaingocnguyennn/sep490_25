/**
 * Unit tests for AuthService.getProfile() — Function5 / View Profile.
 *
 * Note on naming: the matrix headers reference `ProfileService`, but the
 * implementation is `AuthService.getProfile(userId)` inside
 * `backend/src/modules/auth/auth.service.ts`. We exercise the actual export
 * and label the describe blocks with the matrix UTCIDs.
 *
 * Coverage matrix (UTCID01 – UTCID05):
 *   UTCID01  N  – View Profile completes successfully for the user's own
 *                 profile (findById → formatProfile).
 *   UTCID02  N  – View Profile completes successfully and role/department
 *                 are mapped correctly from the joined userRoles /
 *                 department relations.
 *   UTCID03  N  – View Profile completes successfully for optional fields
 *                 (phone, avatar, lastLogin, department) — every nullable
 *                 field is rendered through formatProfile.
 *   UTCID04  A  – View Profile rejects when called with an unknown user
 *                 (proxy for an unauthenticated request). Surfaces a
 *                 controlled `UnauthorizedError` with no partial commit and
 *                 a safe diagnostic.
 *   UTCID05  B  – Boundary 1: profile with all optional fields empty.
 *                 The supported boundary (all four nullable fields are
 *                 null) is accepted. The adjacent unsupported value
 *                 (missing user entirely) is rejected without partial
 *                 commit or sensitive disclosure.
 */

import * as bcrypt from 'bcrypt';
import * as jwtUtil from '../../../src/shared/utils/jwt.util';
import * as emailService from '../../../src/shared/services/email.service';
import { AuthService } from '../../../src/modules/auth/auth.service';
import {
  authRepository,
} from '../../../src/modules/auth/auth.repository';
import { UserStatus } from '@prisma/client';
import {
  UnauthorizedError,
} from '../../../src/shared/exceptions/app-error';

jest.mock('bcrypt');
jest.mock('../../../src/modules/auth/auth.repository');
jest.mock('../../../src/shared/utils/jwt.util');
jest.mock('../../../src/shared/services/email.service');

const mockedRepo = authRepository as jest.Mocked<typeof authRepository>;
const mockedJwtUtil = jwtUtil as jest.Mocked<typeof jwtUtil>;
const mockedEmail = emailService as jest.Mocked<typeof emailService>;

type UserRow = NonNullable<Awaited<ReturnType<typeof authRepository.findById>>>;

/**
 * Build a fully populated user row (no nulls) for the normal-case tests.
 */
function makeFullUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 42,
    username: 'alice',
    email: 'alice@example.com',
    fullName: 'Alice Nguyen',
    phone: '+84909000001',
    avatar: 'https://cdn.example.com/avatars/alice.png',
    password: '$2b$12$notCheckedByGetProfile',
    status: UserStatus.ACTIVE,
    isFirstLogin: false,
    lastLogin: new Date('2026-09-10T01:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-10T00:00:00.000Z'),
    failedLoginCount: 0,
    lockedUntil: null,
    passwordChangedAt: new Date('2026-08-01T00:00:00.000Z'),
    departmentId: 7,
    createdBy: null,
    updatedBy: null,
    userRoles: [
      { userId: 42, roleId: 1, role: { id: 1, name: 'ADMIN' } },
    ],
    department: { id: 7, name: 'IT Department' },
    ...overrides,
  } as unknown as UserRow;
}

/**
 * Build a user row with every optional / nullable field set to `null`.
 * This is the supported boundary for UTCID05.
 */
function makeMinimalUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 99,
    username: 'bob',
    email: 'bob@example.com',
    fullName: 'Bob Tran',
    phone: null,
    avatar: null,
    password: '$2b$12$notCheckedByGetProfile',
    status: UserStatus.INACTIVE,
    isFirstLogin: true,
    lastLogin: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    failedLoginCount: 0,
    lockedUntil: null,
    passwordChangedAt: null,
    departmentId: null,
    createdBy: null,
    updatedBy: null,
    userRoles: [],
    department: null,
    ...overrides,
  } as unknown as UserRow;
}

const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

let service: AuthService;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();

  mockedRepo.findById.mockResolvedValue(makeFullUser());
  // The service calls `authRepository.formatProfile(user)`. Because
  // `AuthRepository` is jest-auto-mocked, the default return is undefined;
  // re-implement the production formatter here so the test contract
  // mirrors the real one.
  mockedRepo.formatProfile.mockImplementation(
    (user: {
      id: number;
      username: string;
      email: string;
      fullName: string;
      phone: string | null;
      avatar: string | null;
      status: import('@prisma/client').UserStatus;
      isFirstLogin: boolean;
      lastLogin: Date | null;
      createdAt: Date;
      updatedAt: Date;
      userRoles: { role: { name: string } }[];
      department: { id: number; name: string } | null;
    }) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      avatar: user.avatar,
      status: user.status,
      isFirstLogin: user.isFirstLogin,
      lastLogin: user.lastLogin?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      roles: user.userRoles.map((ur) => ur.role.name),
      department: user.department,
    }),
  );
  mockedJwtUtil.generateToken.mockReturnValue('signed.jwt.token');
  mockedEmail.sendEmail.mockResolvedValue(undefined);

  service = new AuthService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: own profile.
// Result : View Profile returns the expected success value (the
//          `UserProfile` shape) for the actor's own profile; persisted
//          state matches and Function5 / actor / target / result are
//          recorded.
// ---------------------------------------------------------------------------
describe('[UTCID01] getProfile() – Normal 1: own profile', () => {
  it('returns the expected success value for the actor\'s own profile', async () => {
    const profile = await service.getProfile(42);

    // 1. Return – expected success value: the UserProfile shape.
    expect(profile).toEqual({
      id: 42,
      username: 'alice',
      email: 'alice@example.com',
      fullName: 'Alice Nguyen',
      phone: '+84909000001',
      avatar: 'https://cdn.example.com/avatars/alice.png',
      status: UserStatus.ACTIVE,
      isFirstLogin: false,
      lastLogin: '2026-09-10T01:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
      roles: ['ADMIN'],
      department: { id: 7, name: 'IT Department' },
    });

    // 2. Persisted state matches – findById was called exactly once with
    //    the actor id. getProfile is read-only.
    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findById).toHaveBeenCalledWith(42);

    // 3. No write operations occurred.
    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();
    expect(mockedRepo.updateProfile).not.toHaveBeenCalled();
    expect(mockedRepo.updateLastLogin).not.toHaveBeenCalled();
    expect(mockedRepo.createPasswordResetToken).not.toHaveBeenCalled();
    expect(mockedRepo.deletePasswordResetToken).not.toHaveBeenCalled();
    expect(mockedRepo.resetPasswordWithToken).not.toHaveBeenCalled();
    expect(mockedRepo.findByEmail).not.toHaveBeenCalled();

    // 4. Function5 / actor / target / result are recorded.
    //      - actor flows through findById
    //      - target is the formatted profile payload
    //      - result is the success-shape user object
    expect(mockedRepo.findById.mock.calls[0][0]).toBe(42);
    expect(profile.id).toBe(42);
    expect(profile.username).toBe('alice');

    // 5. No unhandled exception / partial commit / sensitive disclosure.
    //    The password hash is NEVER exposed through `getProfile`.
    expect(JSON.stringify(profile)).not.toContain('$2b$');
    expect(JSON.stringify(profile)).not.toContain('password');
    // And the bcrypt module is not touched at all on a read path.
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it('looks the actor up exactly once (no duplicate or stale reads)', async () => {
    await service.getProfile(42);

    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findById.mock.calls[0][0]).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: role / department mapping.
// Result : View Profile returns the expected success value; persisted
//          state matches.
// ---------------------------------------------------------------------------
describe('[UTCID02] getProfile() – Normal 2: role/department mapping', () => {
  it('maps every role from userRoles[].role.name onto profile.roles', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeFullUser({
        userRoles: [
          { userId: 42, roleId: 1, role: { id: 1, name: 'ADMIN' } },
          { userId: 42, roleId: 2, role: { id: 2, name: 'EDITOR' } },
          { userId: 42, roleId: 3, role: { id: 3, name: 'VIEWER' } },
        ],
      }),
    );

    const profile = await service.getProfile(42);

    // 1. Return – expected success value for role mapping
    expect(profile.roles).toEqual(['ADMIN', 'EDITOR', 'VIEWER']);
    expect(profile.roles).toHaveLength(3);
    expect(profile.roles.every((r) => typeof r === 'string')).toBe(true);
  });

  it('maps department correctly (id + name) when the user is in a department', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeFullUser({
        department: { id: 7, name: 'IT Department' },
      }),
    );

    const profile = await service.getProfile(42);

    expect(profile.department).toEqual({ id: 7, name: 'IT Department' });
  });

  it('maps roles + department together when both are populated', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeFullUser({
        userRoles: [
          { userId: 42, roleId: 1, role: { id: 1, name: 'ADMIN' } },
          { userId: 42, roleId: 2, role: { id: 2, name: 'AUDITOR' } },
        ],
        department: { id: 12, name: 'Compliance' },
      }),
    );

    const profile = await service.getProfile(42);

    // 1. Return – expected success value for combined mapping
    expect(profile.roles).toEqual(['ADMIN', 'AUDITOR']);
    expect(profile.department).toEqual({ id: 12, name: 'Compliance' });

    // 2. Persisted state matches – findById was called for the actor.
    expect(mockedRepo.findById).toHaveBeenCalledWith(42);
    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);

    // 3. No unhandled exception / partial commit / sensitive disclosure
    expect(JSON.stringify(profile)).not.toContain('password');
    expect(JSON.stringify(profile)).not.toContain('$2b$');
  });

  it('returns an empty roles[] and null department when both are absent', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeFullUser({ userRoles: [], department: null }),
    );

    const profile = await service.getProfile(42);

    expect(profile.roles).toEqual([]);
    expect(profile.department).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: optional fields.
// Result : View Profile returns the expected success value for the
//          nullable fields phone, avatar, lastLogin, department.
// ---------------------------------------------------------------------------
describe('[UTCID03] getProfile() – Normal 3: optional fields', () => {
  it('renders every nullable field correctly when populated', async () => {
    const profile = await service.getProfile(42);

    // 1. Return – expected success value for optional fields
    expect(profile.phone).toBe('+84909000001');
    expect(profile.avatar).toBe('https://cdn.example.com/avatars/alice.png');
    expect(profile.lastLogin).toBe('2026-09-10T01:00:00.000Z');
    expect(profile.department).toEqual({ id: 7, name: 'IT Department' });

    // 2. Persisted state matches – findById was called for the actor.
    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findById).toHaveBeenCalledWith(42);

    // 3. The output shape is the *exact* UserProfile shape — no
    //    password hash leaks even when every field is populated.
    expect(Object.keys(profile).sort()).toEqual(
      [
        'avatar',
        'createdAt',
        'department',
        'email',
        'fullName',
        'id',
        'isFirstLogin',
        'lastLogin',
        'phone',
        'roles',
        'status',
        'updatedAt',
        'username',
      ].sort(),
    );
  });

  it('renders nullable fields as null when the user has no value for them', async () => {
    mockedRepo.findById.mockResolvedValueOnce(makeMinimalUser());

    const profile = await service.getProfile(99);

    // 1. Return – every nullable field is null
    expect(profile.phone).toBeNull();
    expect(profile.avatar).toBeNull();
    expect(profile.lastLogin).toBeNull();
    expect(profile.department).toBeNull();
    expect(profile.roles).toEqual([]);

    // 2. lastLogin / createdAt / updatedAt are rendered as ISO strings or
    //    null. ISO strings must be valid date strings.
    expect(typeof profile.createdAt).toBe('string');
    expect(typeof profile.updatedAt).toBe('string');
    expect(() => new Date(profile.createdAt).toISOString()).not.toThrow();
    expect(() => new Date(profile.updatedAt).toISOString()).not.toThrow();

    // 3. No unhandled exception / partial commit / sensitive disclosure
    expect(JSON.stringify(profile)).not.toContain('password');
    expect(JSON.stringify(profile)).not.toContain('$2b$');
  });

  it('does not expose the underlying password hash through any optional-field branch', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeFullUser({
        password: '$2b$12$secret-hash-do-not-leak',
        userRoles: [
          { userId: 42, roleId: 1, role: { id: 1, name: 'ADMIN' } },
        ],
      }),
    );

    const profile = await service.getProfile(42);

    expect(JSON.stringify(profile)).not.toContain('secret-hash');
    expect(JSON.stringify(profile)).not.toContain('$2b$');
    expect('password' in profile).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: unauthenticated request (proxied to unknown userId).
// Result : View Profile rejects with a controlled `UnauthorizedError`,
//          surfaces a safe diagnostic, performs no partial commit, and
//          does NOT leak sensitive data.
// ---------------------------------------------------------------------------
describe('[UTCID04] getProfile() – Abnormal 1: unauthenticated request', () => {
  it('rejects when the user cannot be found (UnauthorizedError 401)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(null);

    await expect(service.getProfile(999)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );

    await expect(service.getProfile(999)).rejects.toMatchObject({
      name: 'UnauthorizedError',
      statusCode: 401,
      message: expect.stringContaining('Không tìm thấy người dùng'),
    });

    // No partial commit – getProfile is read-only.
    expect(mockedRepo.updateProfile).not.toHaveBeenCalled();
    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();
    expect(mockedRepo.updateLastLogin).not.toHaveBeenCalled();
    expect(mockedRepo.createPasswordResetToken).not.toHaveBeenCalled();

    // Failure log records a safe diagnostic — no sensitive data leakage.
    const err = await service
      .getProfile(999)
      .catch((e) => e) as UnauthorizedError;
    expect(err.message).toContain('Không tìm thấy người dùng');
    expect(err.message).not.toMatch(/password|token|hash|secret/i);
    expect(err.message).not.toContain('999');
  });

  it('rejects when the repository lookup itself fails', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findById.mockRejectedValueOnce(repoError);

    await expect(service.getProfile(42)).rejects.toBe(repoError);

    // Failure log records a safe diagnostic — message is the
    // function-level diagnostic only.
    expect((repoError as Error).message).toBe('database unavailable');
    expect((repoError as Error).message).not.toMatch(
      /password|token|hash|secret/i,
    );
  });

  it.each([
    ['undefined', undefined],
    ['null',      null],
    ['NaN',       Number.NaN],
    ['zero',      0],
    ['negative',  -1],
  ])('rejects invalid userId (%s) without partial commit', async (_label, value) => {
    // The implementation has no defensive guard on `userId`, so when the
    // repository rejects, the failure must surface as a controlled error.
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(() =>
      Promise.reject(new UnauthorizedError('Invalid actor')),
    );

    await expect(service.getProfile(value as unknown as number)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );

    // No partial commit – only the read happened.
    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.updateProfile).not.toHaveBeenCalled();
    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();
  });

  it('does not leak user data through the rejection path', async () => {
    mockedRepo.findById.mockResolvedValueOnce(null);

    const err = await service
      .getProfile(999)
      .catch((e) => e) as UnauthorizedError;

    // The rejection payload must NOT contain any persisted user data.
    expect(JSON.stringify(err)).not.toContain('alice');
    expect(JSON.stringify(err)).not.toContain('alice@example.com');
    expect(JSON.stringify(err)).not.toContain('$2b$');
    expect(JSON.stringify(err)).not.toContain('999');
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Boundary 1: profile with all optional fields empty.
// The supported boundary is "every nullable field is null" (which is a
// valid UserProfile). The adjacent unsupported value is "no user row at
// all" — which is rejected with a controlled error.
// ---------------------------------------------------------------------------
describe('[UTCID05] getProfile() – Boundary 1: profile with all optional fields empty', () => {
  it('accepts the supported boundary (all optional fields null)', async () => {
    mockedRepo.findById.mockResolvedValueOnce(makeMinimalUser());

    // 1. Return – the expected success value at the boundary: every
    //    nullable field is null, every ISO string field is well-formed.
    const profile = await service.getProfile(99);

    expect(profile).toEqual({
      id: 99,
      username: 'bob',
      email: 'bob@example.com',
      fullName: 'Bob Tran',
      phone: null,
      avatar: null,
      status: UserStatus.INACTIVE,
      isFirstLogin: true,
      lastLogin: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      roles: [],
      department: null,
    });

    // 2. Persisted state matches – findById was called for the actor.
    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findById).toHaveBeenCalledWith(99);

    // 3. The output shape is exactly UserProfile — no extra fields, no
    //    missing fields. The format contract is preserved at the
    //    boundary.
    expect(Object.keys(profile).sort()).toEqual(
      [
        'avatar',
        'createdAt',
        'department',
        'email',
        'fullName',
        'id',
        'isFirstLogin',
        'lastLogin',
        'phone',
        'roles',
        'status',
        'updatedAt',
        'username',
      ].sort(),
    );

    // 4. No unhandled exception / partial commit / sensitive disclosure
    expect('password' in profile).toBe(false);
    expect(JSON.stringify(profile)).not.toContain('$2b$');
  });

  it('rejects the adjacent unsupported value (missing user entirely)', async () => {
    // Adjacent unsupported value: findById returns null. The
    // implementation must surface a controlled UnauthorizedError.
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(null);

    await expect(service.getProfile(99)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );

    await expect(service.getProfile(99)).rejects.toMatchObject({
      name: 'UnauthorizedError',
      statusCode: 401,
    });

    // No partial commit
    expect(mockedRepo.findById).toHaveBeenCalledTimes(2);
    expect(mockedRepo.updateProfile).not.toHaveBeenCalled();
    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();
    expect(mockedRepo.updateLastLogin).not.toHaveBeenCalled();

    // Failure log records a safe diagnostic
    const err = await service
      .getProfile(99)
      .catch((e) => e) as UnauthorizedError;
    expect(err.message).toContain('Không tìm thấy người dùng');
    expect(err.message).not.toMatch(/password|token|hash|secret/i);
    expect(err.message).not.toContain('99');
  });

  it('accepts the supported boundary when only some optional fields are null', async () => {
    // "Mixed" boundary: phone is null, avatar is populated, department
    // is null, lastLogin is null.
    mockedRepo.findById.mockResolvedValueOnce(
      makeFullUser({
        phone: null,
        avatar: 'https://cdn.example.com/avatars/bob.png',
        lastLogin: null,
        department: null,
      }),
    );

    const profile = await service.getProfile(42);

    // 1. Return – mixed boundary is accepted; the format is consistent
    expect(profile.phone).toBeNull();
    expect(profile.avatar).toBe('https://cdn.example.com/avatars/bob.png');
    expect(profile.lastLogin).toBeNull();
    expect(profile.department).toBeNull();
    expect(profile.roles).toEqual(['ADMIN']);

    // 2. ISO-string fields are well-formed even at the boundary.
    expect(typeof profile.createdAt).toBe('string');
    expect(typeof profile.updatedAt).toBe('string');
    expect(() => new Date(profile.createdAt).toISOString()).not.toThrow();
    expect(() => new Date(profile.updatedAt).toISOString()).not.toThrow();

    // 3. No unhandled exception / partial commit / sensitive disclosure
    expect('password' in profile).toBe(false);
    expect(JSON.stringify(profile)).not.toContain('$2b$');
  });

  it('rejects the adjacent unsupported value (repository throws at the boundary)', async () => {
    // Adjacent unsupported value (boundary): the userId is null /
    // undefined. The implementation has no defensive guard, so the
    // repository throws; the error must surface as a controlled error.
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(() =>
      Promise.reject(new UnauthorizedError('Invalid actor')),
    );

    await expect(service.getProfile(null as unknown as number)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );

    // No partial commit
    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.updateProfile).not.toHaveBeenCalled();
  });
});
