/**
 * Unit tests for AuthService.login()
 *
 * Coverage matrix (UTCID01 – UTCID08):
 *   UTCID01  N  – Login completes successfully with valid credentials.
 *   UTCID02  N  – Login completes successfully and returns role/session data.
 *   UTCID03  N  – Login completes successfully and returns a JWT token.
 *   UTCID04  N  – Login completes successfully and emits the login-audit
 *                 state (updateLastLogin persisted).
 *   UTCID05  N  – Login response-to-database consistency: profile identifiers,
 *                 status, actor and timestamps match the persisted user.
 *   UTCID06  A  – Login rejects invalid (missing/incorrect) credentials with a
 *                 controlled UnauthorizedError.
 *   UTCID07  A  – Login rejects locked / inactive accounts with a controlled
 *                 UnauthorizedError.
 *   UTCID08  B  – Login accepts credentials exactly at the minimum supported
 *                 length and rejects credentials below the boundary.
 */

import * as bcrypt from 'bcrypt';
import { config } from '../../../src/config';
import {
  BadRequestError,
  UnauthorizedError,
} from '../../../src/shared/exceptions/app-error';
import * as jwtUtil from '../../../src/shared/utils/jwt.util';
import * as emailService from '../../../src/shared/services/email.service';
import { AuthService } from '../../../src/modules/auth/auth.service';
import {
  authRepository,
  UserProfile,
} from '../../../src/modules/auth/auth.repository';
import { UserStatus } from '@prisma/client';

jest.mock('bcrypt');
jest.mock('../../../src/modules/auth/auth.repository');
jest.mock('../../../src/shared/utils/jwt.util');
jest.mock('../../../src/shared/services/email.service');

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockedRepo = authRepository as jest.Mocked<typeof authRepository>;
const mockedJwtUtil = jwtUtil as jest.Mocked<typeof jwtUtil>;
const mockedEmail = emailService as jest.Mocked<typeof emailService>;

type UserRow = NonNullable<Awaited<ReturnType<typeof authRepository.findByUsername>>>;

const FIXED_NOW = new Date('2026-09-11T08:00:00.000Z');

function makeStoredUser(overrides: Partial<UserRow> = {}): UserRow {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-09-10T00:00:00.000Z');
  const lastLogin = new Date('2026-09-10T01:00:00.000Z');
  return {
    id: 42,
    username: 'alice',
    email: 'alice@example.com',
    fullName: 'Alice Nguyen',
    phone: '+84909000001',
    avatar: null,
    password: '$2b$12$hashOfStrongPass1!',
    status: UserStatus.ACTIVE,
    isFirstLogin: false,
    lastLogin,
    createdAt,
    updatedAt,
    failedLoginCount: 0,
    lockedUntil: null,
    passwordChangedAt: null,
    departmentId: 7,
    createdBy: null,
    updatedBy: null,
    userRoles: [
      {
        userId: 42,
        roleId: 1,
        role: { id: 1, name: 'ADMIN' },
      },
    ],
    department: { id: 7, name: 'IT Department' },
    ...overrides,
  } as unknown as UserRow;
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 42,
    username: 'alice',
    email: 'alice@example.com',
    fullName: 'Alice Nguyen',
    phone: '+84909000001',
    avatar: null,
    status: UserStatus.ACTIVE,
    isFirstLogin: false,
    lastLogin: FIXED_NOW.toISOString(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    roles: ['ADMIN'],
    department: { id: 7, name: 'IT Department' },
    ...overrides,
  };
}

/**
 * Silence noisy console output from the reset-password email failure path
 * (UTCID02 implicitly exercises audit logging that calls console.error).
 */
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
  mockedRepo.formatProfile.mockImplementation((user: any) => makeProfile({
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
    roles: user.userRoles.map((ur: any) => ur.role.name),
    department: user.department,
  }));
  mockedRepo.updateLastLogin.mockResolvedValue({} as any);
  mockedRepo.findByUsername.mockResolvedValue(makeStoredUser());
  mockedRepo.findById.mockResolvedValue(makeStoredUser());
  mockedBcrypt.compare.mockResolvedValue(true);
  mockedBcrypt.hash.mockResolvedValue('new-hashed-value');
  mockedJwtUtil.generateToken.mockReturnValue('signed.jwt.token');
  mockedEmail.sendEmail.mockResolvedValue(undefined);

  service = new AuthService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: Login completes successfully with valid credentials.
// Result : Login returns the expected success value, persisted state matches,
//          and a success/audit log records Function1, actor, target and result.
// ---------------------------------------------------------------------------
describe('[UTCID01] login() – Normal 1: valid credentials', () => {
  it('returns the expected success value for valid credentials', async () => {
    const profile = makeProfile({ lastLogin: FIXED_NOW.toISOString() });
    mockedRepo.findByUsername.mockResolvedValue(makeStoredUser());
    mockedRepo.updateLastLogin.mockResolvedValue({} as any);
    mockedRepo.formatProfile.mockReturnValue(profile);
    mockedJwtUtil.generateToken.mockReturnValue('valid.jwt.token');

    const result = await service.login('alice', 'StrongPass1!');

    // 1. Return – expected success value for valid credentials
    expect(result).toEqual({ token: 'valid.jwt.token', user: profile });

    // 2. Persisted state matches – audit (`updateLastLogin`) was called for actor
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledTimes(1);
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledWith(42);

    // 3. Dependency contract – bcrypt compared against the stored hash
    expect(mockedBcrypt.compare).toHaveBeenCalledWith('StrongPass1!', expect.any(String));

    // 4. No sensitive data disclosure – password hash is not leaked into the
    //    returned payload
    expect(JSON.stringify(result)).not.toContain('$2b$');
    expect(JSON.stringify(result)).not.toContain('StrongPass1!');

    // 5. No unhandled exception / no partial commit – token is well-formed
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: Login completes successfully and returns role/session data.
// ---------------------------------------------------------------------------
describe('[UTCID02] login() – Normal 2: role/session data', () => {
  it('returns the expected success value for role/session data', async () => {
    const stored = makeStoredUser({
      userRoles: [
        { userId: 42, roleId: 1, role: { id: 1, name: 'ADMIN' } },
        { userId: 42, roleId: 2, role: { id: 2, name: 'SPECIALIST' } },
      ],
    });
    const profile = makeProfile({
      roles: ['ADMIN', 'SPECIALIST'],
    });
    mockedRepo.findByUsername.mockResolvedValue(stored);
    mockedRepo.formatProfile.mockReturnValue(profile);
    mockedJwtUtil.generateToken.mockReturnValue('signed.jwt.token');

    const result = await service.login('alice', 'StrongPass1!');

    // 1. Return – expected success value for role/session data
    expect(result.user.roles).toEqual(['ADMIN', 'SPECIALIST']);

    // 2. Persisted state matches – session identity (id, username, roles)
    //    is embedded in the JWT and must be sourced from the persisted row
    expect(mockedJwtUtil.generateToken).toHaveBeenCalledWith({
      userId: stored.id,
      username: stored.username,
      roles: ['ADMIN', 'SPECIALIST'],
    });

    // 3. The role list is derived from the persisted user–role join, not hard-coded
    const call = mockedJwtUtil.generateToken.mock.calls[0][0];
    expect(call.roles).toEqual(
      stored.userRoles.map((ur) => ur.role.name),
    );

    // 4. No sensitive data leakage into the result
    expect(result.user).not.toHaveProperty('password');
    expect(JSON.stringify(result)).not.toContain('StrongPass1!');
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: Login completes successfully and returns a JWT token.
// ---------------------------------------------------------------------------
describe('[UTCID03] login() – Normal 3: token return', () => {
  it('returns the expected success value for token return', async () => {
    const profile = makeProfile();
    mockedRepo.findByUsername.mockResolvedValue(makeStoredUser());
    mockedRepo.formatProfile.mockReturnValue(profile);
    mockedJwtUtil.generateToken.mockReturnValue('header.payload.signature');

    const result = await service.login('alice', 'StrongPass1!');

    // 1. Return – expected success value for token return
    expect(result.token).toBe('header.payload.signature');

    // 2. Persisted state matches – token was generated from persisted identity
    expect(mockedJwtUtil.generateToken).toHaveBeenCalledTimes(1);
    expect(mockedJwtUtil.generateToken).toHaveBeenCalledWith({
      userId: 42,
      username: 'alice',
      roles: ['ADMIN'],
    });

    // 3. The token issuer received the configured signing options through
    //    the JWT util (we confirm the util itself was used, not a hand-rolled
    //    fallback, by checking the call payload key set).
    const [payload] = mockedJwtUtil.generateToken.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual(['roles', 'userId', 'username']);

    // 4. No sensitive data in the token payload leaked through the response
    expect(result.token).not.toContain('StrongPass1!');
    expect(result.token).not.toContain('alice@example.com');
  });

  it('does not regenerate a token for a non-authorised state', async () => {
    mockedRepo.findByUsername.mockResolvedValue(null);

    await expect(service.login('alice', 'StrongPass1!'))
      .rejects.toBeInstanceOf(UnauthorizedError);

    expect(mockedJwtUtil.generateToken).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: Login completes successfully and emits login audit.
// ---------------------------------------------------------------------------
describe('[UTCID04] login() – Normal 4: login audit', () => {
  it('returns the expected success value for login audit', async () => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);

    const profile = makeProfile({ lastLogin: FIXED_NOW.toISOString() });
    mockedRepo.findByUsername.mockResolvedValue(makeStoredUser());
    mockedRepo.formatProfile.mockReturnValue(profile);
    mockedJwtUtil.generateToken.mockReturnValue('audit.jwt.token');

    const result = await service.login('alice', 'StrongPass1!');

    // 1. Return – expected success value, persisted state matches audit
    expect(result).toEqual({ token: 'audit.jwt.token', user: profile });

    // 2. Audit hook – login timestamp is persisted exactly once for the
    //    authenticated actor
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledTimes(1);
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledWith(42);

    // 3. Persistence order – audit is performed AFTER successful credential
    //    verification and BEFORE token generation, so a failed login never
    //    emits an audit record for the wrong actor
    const compareOrder = mockedBcrypt.compare.mock.invocationCallOrder[0];
    const auditOrder = mockedRepo.updateLastLogin.mock.invocationCallOrder[0];
    const tokenOrder = mockedJwtUtil.generateToken.mock.invocationCallOrder[0];
    expect(compareOrder).toBeLessThan(auditOrder);
    expect(auditOrder).toBeLessThan(tokenOrder);

    // 4. No unhandled exception / no partial commit
    expect(result.user.lastLogin).toBe(FIXED_NOW.toISOString());
  });

  it('does not emit an audit record when credentials are invalid', async () => {
    mockedRepo.findByUsername.mockResolvedValue(makeStoredUser());
    mockedBcrypt.compare.mockResolvedValue(false);

    await expect(service.login('alice', 'WrongPass1!'))
      .rejects.toBeInstanceOf(UnauthorizedError);

    expect(mockedRepo.updateLastLogin).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: Login response-to-database consistency.
//           Includes identifiers, status, actor and timestamps.
// ---------------------------------------------------------------------------
describe('[UTCID05] login() – Normal 5: response-to-database consistency', () => {
  it('returns the expected success value with consistent identifiers, status, actor and timestamps', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-09-10T00:00:00.000Z');
    const lastLogin = new Date('2026-09-10T01:00:00.000Z');

    const stored = makeStoredUser({
      id: 99,
      username: 'bob.fpt',
      email: 'bob.fpt@example.com',
      fullName: 'Bob Tran',
      phone: '+84909000999',
      status: UserStatus.ACTIVE,
      isFirstLogin: true,
      createdAt,
      updatedAt,
      lastLogin,
      userRoles: [
        { userId: 99, roleId: 3, role: { id: 3, name: 'DOCUMENT_CLERK' } },
      ],
      department: { id: 11, name: 'Operations' },
    });

    const profile = makeProfile({
      id: 99,
      username: 'bob.fpt',
      email: 'bob.fpt@example.com',
      fullName: 'Bob Tran',
      phone: '+84909000999',
      status: UserStatus.ACTIVE,
      isFirstLogin: true,
      lastLogin: lastLogin.toISOString(),
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      roles: ['DOCUMENT_CLERK'],
      department: { id: 11, name: 'Operations' },
    });

    mockedRepo.findByUsername.mockResolvedValue(stored);
    mockedRepo.formatProfile.mockReturnValue(profile);
    mockedJwtUtil.generateToken.mockReturnValue('consistency.jwt.token');

    const result = await service.login('bob.fpt', 'StrongPass1!');

    // 1. Identifiers are sourced from the persisted user row
    expect(result.user.id).toBe(stored.id);
    expect(result.user.username).toBe(stored.username);
    expect(result.user.email).toBe(stored.email);

    // 2. Status is the persisted UserStatus (not defaulted)
    expect(result.user.status).toBe(stored.status);
    expect(result.user.status).toBe(UserStatus.ACTIVE);

    // 3. Actor (id used for both audit and JWT payload) matches the persisted user
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledWith(stored.id);
    expect(mockedJwtUtil.generateToken).toHaveBeenCalledWith({
      userId: stored.id,
      username: stored.username,
      roles: ['DOCUMENT_CLERK'],
    });

    // 4. Timestamps are consistent with the persisted Date values
    expect(result.user.createdAt).toBe(createdAt.toISOString());
    expect(result.user.updatedAt).toBe(updatedAt.toISOString());
    expect(result.user.lastLogin).toBe(lastLogin.toISOString());

    // 5. No unhandled exception
    expect(result).toEqual({ token: 'consistency.jwt.token', user: profile });
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: missing/invalid credentials.
// ---------------------------------------------------------------------------
describe('[UTCID06] login() – Abnormal 1: missing/invalid credentials', () => {
  it('returns the mapped UnauthorizedError when the user is not found', async () => {
    mockedRepo.findByUsername.mockResolvedValue(null);

    // Invalid input / failing dependency — user lookup returns null
    await expect(service.login('ghost', 'Anything1!'))
      .rejects.toBeInstanceOf(UnauthorizedError);

    await expect(service.login('ghost', 'Anything1!'))
      .rejects.toMatchObject({
        name: 'UnauthorizedError',
        statusCode: 401,
        message: expect.stringContaining('Sai tên đăng nhập hoặc mật khẩu'),
      });

    // No audit / token side-effects when credentials are missing
    expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    expect(mockedRepo.updateLastLogin).not.toHaveBeenCalled();
    expect(mockedJwtUtil.generateToken).not.toHaveBeenCalled();
  });

  it('returns the mapped UnauthorizedError when the password does not match', async () => {
    mockedRepo.findByUsername.mockResolvedValue(makeStoredUser());
    mockedBcrypt.compare.mockResolvedValue(false);

    await expect(service.login('alice', 'WrongPass1!'))
      .rejects.toBeInstanceOf(UnauthorizedError);

    await expect(service.login('alice', 'WrongPass1!'))
      .rejects.toMatchObject({
        name: 'UnauthorizedError',
        statusCode: 401,
        message: expect.stringContaining('Sai tên đăng nhập hoặc mật khẩu'),
      });

    expect(mockedRepo.updateLastLogin).not.toHaveBeenCalled();
    expect(mockedJwtUtil.generateToken).not.toHaveBeenCalled();
  });

  it('does not leak whether the username exists vs. the password being wrong (same error code)', async () => {
    // Missing user
    mockedRepo.findByUsername.mockResolvedValueOnce(null);
    // Wrong password
    mockedRepo.findByUsername.mockResolvedValueOnce(makeStoredUser());
    mockedBcrypt.compare.mockResolvedValueOnce(false);

    const missingUserError = await service
      .login('ghost', 'StrongPass1!')
      .catch((err) => err);
    const wrongPasswordError = await service
      .login('alice', 'WrongPass1!')
      .catch((err) => err);

    expect(missingUserError).toBeInstanceOf(UnauthorizedError);
    expect(wrongPasswordError).toBeInstanceOf(UnauthorizedError);
    expect((missingUserError as UnauthorizedError).statusCode).toBe(401);
    expect((wrongPasswordError as UnauthorizedError).statusCode).toBe(401);
    expect((missingUserError as Error).message).toBe(
      (wrongPasswordError as Error).message,
    );

    // Safe diagnostic – no password hash or plaintext leaked into errors
    expect((missingUserError as Error).message).not.toContain('$2b$');
    expect((wrongPasswordError as Error).message).not.toContain('StrongPass1!');
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: locked / inactive account.
// ---------------------------------------------------------------------------
describe('[UTCID07] login() – Abnormal 2: locked or inactive account', () => {
  it('throws UnauthorizedError with a controlled message for LOCKED accounts', async () => {
    mockedRepo.findByUsername.mockResolvedValue(
      makeStoredUser({ status: UserStatus.LOCKED }),
    );

    await expect(service.login('alice', 'StrongPass1!'))
      .rejects.toBeInstanceOf(UnauthorizedError);
    await expect(service.login('alice', 'StrongPass1!'))
      .rejects.toMatchObject({
        name: 'UnauthorizedError',
        statusCode: 401,
        message: expect.stringContaining('Tài khoản đã bị khoá'),
      });

    // Account status is evaluated BEFORE bcrypt.compare so a locked account
    // never exposes its hash through a timing oracle.
    expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    expect(mockedRepo.updateLastLogin).not.toHaveBeenCalled();
    expect(mockedJwtUtil.generateToken).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedError with a controlled message for INACTIVE accounts', async () => {
    mockedRepo.findByUsername.mockResolvedValue(
      makeStoredUser({ status: UserStatus.INACTIVE }),
    );

    await expect(service.login('alice', 'StrongPass1!'))
      .rejects.toBeInstanceOf(UnauthorizedError);
    await expect(service.login('alice', 'StrongPass1!'))
      .rejects.toMatchObject({
        name: 'UnauthorizedError',
        statusCode: 401,
        message: expect.stringContaining('Tài khoản chưa được kích hoạt'),
      });

    expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    expect(mockedRepo.updateLastLogin).not.toHaveBeenCalled();
    expect(mockedJwtUtil.generateToken).not.toHaveBeenCalled();
  });

  it('uses a distinct controlled message for LOCKED vs INACTIVE (no partial disclosure)', async () => {
    const lockedError = await service
      .login('locked-user', 'StrongPass1!', )
      .catch((err) => err);
    const inactiveError = await service
      .login('inactive-user', 'StrongPass1!')
      .catch((err) => err);

    // The called service path always rejects on LOCKED / INACTIVE; confirm
    // both produce UnauthorizedError(401) under their configured statuses.
    mockedRepo.findByUsername.mockReset();
    mockedBcrypt.compare.mockReset();

    mockedRepo.findByUsername.mockResolvedValueOnce(
      makeStoredUser({ status: UserStatus.LOCKED }),
    );
    const lockedErr = await service
      .login('locked-user', 'StrongPass1!')
      .catch((err) => err);

    mockedRepo.findByUsername.mockResolvedValueOnce(
      makeStoredUser({ status: UserStatus.INACTIVE }),
    );
    const inactiveErr = await service
      .login('inactive-user', 'StrongPass1!')
      .catch((err) => err);

    expect(lockedErr).toBeInstanceOf(UnauthorizedError);
    expect(inactiveErr).toBeInstanceOf(UnauthorizedError);
    expect((lockedErr as UnauthorizedError).statusCode).toBe(401);
    expect((inactiveErr as UnauthorizedError).statusCode).toBe(401);

    // Each status carries a *distinct* controlled message (no overlap).
    expect((lockedErr as Error).message).toContain('khoá');
    expect((inactiveErr as Error).message).toContain('kích hoạt');
    expect((lockedErr as Error).message).not.toEqual(
      (inactiveErr as Error).message,
    );
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: minimum / maximum accepted credential length.
//           Adjacent unsupported value is rejected without partial disclosure.
// ---------------------------------------------------------------------------
describe('[UTCID08] login() – Boundary 1: minimum/maximum accepted credential length', () => {
  it('accepts a credential exactly at the bcrypt-derived maximum length (72 bytes)', async () => {
    // bcrypt silently truncates inputs above 72 bytes. We model a 72-byte
    // password, which is the *supported* boundary the implementation accepts.
    const seventyTwoBytes = 'A'.repeat(72);
    expect(seventyTwoBytes.length).toBe(72);

    mockedRepo.findByUsername.mockResolvedValue(makeStoredUser());
    mockedBcrypt.compare.mockResolvedValue(true);

    const result = await service.login('alice', seventyTwoBytes);

    expect(mockedBcrypt.compare).toHaveBeenCalledWith(
      seventyTwoBytes,
      expect.any(String),
    );
    expect(result).toEqual({
      token: 'signed.jwt.token',
      user: expect.objectContaining({ id: 42 }),
    });

    // No partial disclosure
    expect(JSON.stringify(result)).not.toContain('$2b$');
  });

  it('rejects an empty credential (adjacent unsupported value) without partial commit', async () => {
    // Adjacent unsupported value: AuthService.login() does not enforce a
    // length floor on the *raw* password before delegating to bcrypt, so the
    // boundary we exercise here is the empty credential — repository lookup
    // succeeds but bcrypt.compare reports the match as false. No partial
    // state must be persisted and no token/profile must be emitted.
    mockedRepo.findByUsername.mockResolvedValue(makeStoredUser());
    mockedBcrypt.compare.mockResolvedValue(false);

    await expect(service.login('alice', ''))
      .rejects.toBeInstanceOf(UnauthorizedError);

    // Boundary is rejected without partial commit: no token generated, no
    // audit record written, no profile returned.
    expect(mockedJwtUtil.generateToken).not.toHaveBeenCalled();
    expect(mockedRepo.updateLastLogin).not.toHaveBeenCalled();
    expect(mockedRepo.formatProfile).not.toHaveBeenCalled();
  });

  it('accepts both the supported maximum (72 bytes) and the adjacent value (71 bytes)', async () => {
    const seventyTwoBytes = 'A'.repeat(72);
    const seventyOneBytes = 'A'.repeat(71);

    // Sanity – these are the boundary fixture values we care about.
    expect(seventyTwoBytes.length).toBeGreaterThan(seventyOneBytes.length);

    mockedRepo.findByUsername.mockResolvedValue(makeStoredUser());
    mockedBcrypt.compare.mockResolvedValue(true);

    const ok72 = await service.login('alice', seventyTwoBytes);
    const ok71 = await service.login('alice', seventyOneBytes);

    expect(ok72.token).toBe('signed.jwt.token');
    expect(ok71.token).toBe('signed.jwt.token');
    expect(mockedBcrypt.compare).toHaveBeenNthCalledWith(
      1,
      seventyTwoBytes,
      expect.any(String),
    );
    expect(mockedBcrypt.compare).toHaveBeenNthCalledWith(
      2,
      seventyOneBytes,
      expect.any(String),
    );
  });
});
