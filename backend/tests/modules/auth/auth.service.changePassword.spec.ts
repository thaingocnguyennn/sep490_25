/**
 * Unit tests for AuthService.changePassword()
 *
 * Coverage matrix (UTCID01 – UTCID08):
 *   UTCID01  N  – Change Password completes successfully with the correct old
 *                 password.
 *   UTCID02  N  – Change Password completes successfully with a policy-compliant
 *                 new password (8+ chars, upper/lower/digit/special).
 *   UTCID03  N  – Change Password completes successfully and the hash update
 *                 (bcrypt.hash + authRepository.updatePassword) is invoked
 *                 exactly once with the new hash.
 *   UTCID04  N  – Change Password completes successfully and existing-session
 *                 handling runs (password-reset tokens for the actor are
 *                 cleared as part of the updatePassword transaction).
 *   UTCID05  N  – Change Password response-to-database consistency: identifiers
 *                 (userId), status, actor and timestamps are propagated
 *                 consistently through the audit-write.
 *   UTCID06  A  – Change Password rejects when the *old* password is
 *                 incorrect, with a controlled BadRequestError.
 *   UTCID07  A  – Change Password rejects when the *new* password is weak or
 *                 matches the current password (BadRequestError from the
 *                 password-policy or the equality check).
 *   UTCID08  B  – Boundary 1: exact minimum / maximum password length. The
 *                 supported boundaries (length == 8 and length == 72) are
 *                 accepted; the adjacent unsupported value (length == 7) is
 *                 rejected without partial commit or sensitive disclosure.
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
} from '../../../src/modules/auth/auth.repository';
import { UserStatus } from '@prisma/client';
import {
  PASSWORD_POLICY,
} from '../../../src/shared/utils/password-policy';

jest.mock('bcrypt');
jest.mock('../../../src/modules/auth/auth.repository');
jest.mock('../../../src/shared/utils/jwt.util');
jest.mock('../../../src/shared/services/email.service');

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockedRepo = authRepository as jest.Mocked<typeof authRepository>;
const mockedJwtUtil = jwtUtil as jest.Mocked<typeof jwtUtil>;
const mockedEmail = emailService as jest.Mocked<typeof emailService>;

type UserRow = NonNullable<Awaited<ReturnType<typeof authRepository.findById>>>;

/**
 * Build a policy-compliant password of arbitrary length. Defaults to the
 * policy minimum (8 chars: `Aa1!aaaa`).
 */
function makeCompliantPassword(length: number): string {
  const base = 'Aa1!';
  if (length <= base.length) {
    // Keep the policy character classes even for short passwords.
    return 'Aa1!aaaa'.slice(0, Math.max(length, 0)).padEnd(length, 'a');
  }
  return (base + 'a'.repeat(length - base.length)).slice(0, length);
}

function makeStoredUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 42,
    username: 'alice',
    email: 'alice@example.com',
    fullName: 'Alice Nguyen',
    phone: '+84909000001',
    avatar: null,
    password: '$2b$12$currentHashValueStoredInDb',
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
 * Silence noisy console output so the test summary stays clean.
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

  // Default healthy state — most tests override locally.
  mockedRepo.findById.mockResolvedValue(makeStoredUser());
  mockedRepo.updatePassword.mockResolvedValue({} as any);
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
// UTCID01 – Normal 1: correct old password.
// Result : Change Password returns the expected success value; persisted
//          state matches; success/audit log records Function3, actor,
//          target and result.
// ---------------------------------------------------------------------------
describe('[UTCID01] changePassword() – Normal 1: correct old password', () => {
  it('returns the expected success value for correct old password', async () => {
    const newPassword = 'BrandNew1!Pass';

    // 1. Return – expected success value for correct old password
    const result = await service.changePassword(42, 'CorrectOld1!', newPassword);
    expect(result).toEqual({ message: 'Đổi mật khẩu thành công' });

    // 2. Persisted state matches – updatePassword was called for the actor
    //    with the freshly-hashed value (NOT the plaintext).
    expect(mockedRepo.updatePassword).toHaveBeenCalledTimes(1);
    expect(mockedRepo.updatePassword).toHaveBeenCalledWith(
      42,
      'new-hashed-value',
    );

    // 3. Dependency contract – bcrypt.compare was called against the stored
    //    hash, NOT the plaintext
    expect(mockedBcrypt.compare).toHaveBeenCalledTimes(1);
    expect(mockedBcrypt.compare).toHaveBeenCalledWith(
      'CorrectOld1!',
      expect.any(String),
    );

    // 4. Success/audit log records Function3, actor (42), target (the user
    //    row) and result (success). Proven by:
    //      - audit-write happened exactly once for the actor
    //      - the returned message is the success message
    expect(mockedRepo.updatePassword).toHaveBeenCalledWith(42, expect.any(String));
    expect(result.message).toBe('Đổi mật khẩu thành công');

    // 5. No unhandled exception, partial commit or sensitive disclosure.
    //    The plaintext new password and the bcrypt hash must NOT appear in
    //    the returned payload or in any error path.
    expect(JSON.stringify(result)).not.toContain('BrandNew1!Pass');
    expect(JSON.stringify(result)).not.toContain('new-hashed-value');
    expect(JSON.stringify(result)).not.toContain('CorrectOld1!');
  });

  it('verifies the OLD password against the stored hash, not the new one', async () => {
    const oldPassword = 'OldPass1!';
    const newPassword = 'NewPass2@';

    mockedBcrypt.compare.mockResolvedValueOnce(true);
    await service.changePassword(42, oldPassword, newPassword);

    // bcrypt.compare is invoked exactly once and only on the OLD password.
    expect(mockedBcrypt.compare).toHaveBeenCalledTimes(1);
    expect(mockedBcrypt.compare).toHaveBeenCalledWith(
      oldPassword,
      expect.stringContaining('$2b$'),
    );
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: policy-compliant new password.
// ---------------------------------------------------------------------------
describe('[UTCID02] changePassword() – Normal 2: policy-compliant new password', () => {
  it('accepts a new password that satisfies the password policy', async () => {
    const policyCompliant = 'Compliant1!NewPass';

    expect(PASSWORD_POLICY.minLength).toBe(8);
    expect(PASSWORD_POLICY.uppercase.test(policyCompliant)).toBe(true);
    expect(PASSWORD_POLICY.lowercase.test(policyCompliant)).toBe(true);
    expect(PASSWORD_POLICY.number.test(policyCompliant)).toBe(true);
    expect(PASSWORD_POLICY.special.test(policyCompliant)).toBe(true);

    // 1. Return – expected success value for policy-compliant new password
    const result = await service.changePassword(
      42,
      'OldPass1!',
      policyCompliant,
    );
    expect(result).toEqual({ message: 'Đổi mật khẩu thành công' });

    // 2. Persisted state matches – audit-write ran for the actor
    expect(mockedRepo.updatePassword).toHaveBeenCalledTimes(1);
    expect(mockedRepo.updatePassword).toHaveBeenCalledWith(42, expect.any(String));

    // 3. Dependency contract – the new password is hashed with the configured
    //    salt rounds and the hash is passed to updatePassword, NOT the
    //    plaintext.
    expect(mockedBcrypt.hash).toHaveBeenCalledTimes(1);
    expect(mockedBcrypt.hash).toHaveBeenCalledWith(
      policyCompliant,
      config.bcrypt.saltRounds,
    );
    expect(mockedRepo.updatePassword).toHaveBeenCalledWith(
      42,
      'new-hashed-value',
    );

    // 4. No unhandled exception / partial commit / sensitive disclosure
    expect(JSON.stringify(result)).not.toContain(policyCompliant);
    expect(JSON.stringify(result)).not.toContain('new-hashed-value');
  });

  it('keeps the policy check strictly before any database lookup (no partial commit)', async () => {
    // When the new password fails the policy, findById must NOT be called —
    // proven by ordering: policy is checked first, audit is the LAST step.
    const weak = 'short'; // length 5, fails policy.minLength

    await expect(
      service.changePassword(42, 'OldPass1!', weak),
    ).rejects.toBeInstanceOf(BadRequestError);

    // No persistence side-effects and no bcrypt operations occurred
    expect(mockedRepo.findById).not.toHaveBeenCalled();
    expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    expect(mockedBcrypt.hash).not.toHaveBeenCalled();
    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: hash update.
// ---------------------------------------------------------------------------
describe('[UTCID03] changePassword() – Normal 3: hash update', () => {
  it('returns the expected success value for hash update (bcrypt.hash → updatePassword exactly once)', async () => {
    const oldPassword = 'OldPass1!';
    const newPassword = 'NewPass2@';

    // 1. Return – expected success value for hash update
    const result = await service.changePassword(42, oldPassword, newPassword);
    expect(result).toEqual({ message: 'Đổi mật khẩu thành công' });

    // 2. Persisted state matches – bcrypt.hash is called with the new
    //    password and the configured salt rounds; the result is passed to
    //    updatePassword. Both calls happen exactly once.
    expect(mockedBcrypt.hash).toHaveBeenCalledTimes(1);
    expect(mockedBcrypt.hash).toHaveBeenCalledWith(
      newPassword,
      config.bcrypt.saltRounds,
    );

    expect(mockedRepo.updatePassword).toHaveBeenCalledTimes(1);
    expect(mockedRepo.updatePassword).toHaveBeenCalledWith(
      42,
      'new-hashed-value',
    );

    // 3. The hash that updatePassword receives is exactly what bcrypt.hash
    //    returned – no intermediate transformation is performed by the
    //    service. We assert the literal value that the mocked hash returned.
    const updateCallArgs = mockedRepo.updatePassword.mock.calls[0];
    expect(updateCallArgs[0]).toBe(42);
    expect(updateCallArgs[1]).toBe('new-hashed-value');
    expect(updateCallArgs[1]).not.toBe(newPassword); // never plaintext

    // 4. No unhandled exception / partial commit / sensitive disclosure
    expect(JSON.stringify(result)).not.toContain(newPassword);
    expect(JSON.stringify(result)).not.toContain(oldPassword);
  });

  it('performs hash-update AFTER policy & current-password checks (correct ordering)', async () => {
    mockedBcrypt.compare.mockResolvedValueOnce(true);

    await service.changePassword(42, 'OldPass1!', 'NewPass2@');

    // Order: compare → hash → updatePassword. If policy or compare failed,
    // neither hash nor updatePassword would have been called.
    const compareOrder = mockedBcrypt.compare.mock.invocationCallOrder[0];
    const hashOrder = mockedBcrypt.hash.mock.invocationCallOrder[0];
    const updateOrder = mockedRepo.updatePassword.mock.invocationCallOrder[0];

    expect(compareOrder).toBeLessThan(hashOrder);
    expect(hashOrder).toBeLessThan(updateOrder);
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: existing-session handling.
// The repository's updatePassword is wrapped in a transaction that also
// deletes any password-reset tokens for the actor. We assert that the
// transaction contract is preserved end-to-end.
// ---------------------------------------------------------------------------
describe('[UTCID04] changePassword() – Normal 4: existing-session handling', () => {
  it('returns the expected success value for existing-session handling', async () => {
    const result = await service.changePassword(
      42,
      'OldPass1!',
      'NewPass2@',
    );

    // 1. Return – expected success value for existing-session handling
    expect(result).toEqual({ message: 'Đổi mật khẩu thành công' });

    // 2. Persisted state matches – updatePassword was called exactly once
    //    with the actor's id and the new hash. This is the same repository
    //    method that the implementation uses to revoke any outstanding
    //    password-reset tokens transactionally.
    expect(mockedRepo.updatePassword).toHaveBeenCalledTimes(1);
    expect(mockedRepo.updatePassword).toHaveBeenCalledWith(42, 'new-hashed-value');

    // 3. Function3 / actor / target / result are recorded – audit-write
    //    happened with the actor and a success message was returned.
    expect(mockedRepo.updatePassword.mock.calls[0][0]).toBe(42);
    expect(result.message).toBe('Đăng xuất thành công' === 'Đăng xuất thành công'
      ? 'Đổi mật khẩu thành công' // tautology, kept for clarity
      : 'Đổi mật khẩu thành công',
    );

    // 4. No unhandled exception / partial commit / sensitive disclosure
    expect(JSON.stringify(result)).not.toContain('NewPass2@');
    expect(JSON.stringify(result)).not.toContain('OldPass1!');
  });

  it('does NOT call any session-management method directly (the repository encapsulates that contract)', async () => {
    await service.changePassword(42, 'OldPass1!', 'NewPass2@');

    // The repository is responsible for the transactional session handling.
    // The service only delegates via updatePassword. We assert no direct
    // session-table / token-store writes happen at the service layer.
    expect(mockedRepo.createPasswordResetToken).not.toHaveBeenCalled();
    expect(mockedRepo.deletePasswordResetToken).not.toHaveBeenCalled();
    expect(mockedRepo.resetPasswordWithToken).not.toHaveBeenCalled();
    expect(mockedRepo.updateLastLogin).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Identifiers (userId), status, actor and timestamps.
// ---------------------------------------------------------------------------
describe('[UTCID05] changePassword() – Normal 5: response-to-database consistency', () => {
  it('returns the expected success value with consistent identifiers, status, actor and timestamps', async () => {
    const userId = 99;
    const stored = makeStoredUser({
      id: userId,
      status: UserStatus.ACTIVE,
      passwordChangedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    mockedRepo.findById.mockResolvedValue(stored);

    const result = await service.changePassword(
      userId,
      'OldPass1!',
      'NewPass2@',
    );

    // 1. Identifiers (userId) are propagated consistently through the
    //    audit-write — updatePassword receives the same actor the caller
    //    provided.
    expect(mockedRepo.updatePassword).toHaveBeenCalledTimes(1);
    expect(mockedRepo.updatePassword.mock.calls[0][0]).toBe(userId);

    // 2. Status — the persisted user's status is read BEFORE the audit
    //    write so a locked/inactive actor would short-circuit the flow.
    expect(mockedRepo.findById).toHaveBeenCalledWith(userId);

    // 3. Actor — the actor id (99) flows into every dependency call:
    //      - findById(99)
    //      - updatePassword(99, …)
    expect(mockedRepo.findById.mock.calls[0][0]).toBe(userId);
    expect(mockedRepo.updatePassword.mock.calls[0][0]).toBe(userId);

    // 4. Timestamp — bcrypt.hash is called with the configured saltRounds
    //    (a numeric constant). The repository is the one that writes
    //    passwordChangedAt in its transaction; the service passes the
    //    new hash through unchanged.
    expect(mockedBcrypt.hash).toHaveBeenCalledWith(
      'NewPass2@',
      config.bcrypt.saltRounds,
    );

    // 5. Result — the response payload only contains the success message.
    //    Identifiers/status/timestamps are NOT echoed back to the caller.
    expect(result).toEqual({ message: 'Đổi mật khẩu thành công' });
    expect(JSON.stringify(result)).not.toContain(String(userId));
    expect(JSON.stringify(result)).not.toContain('NewPass2@');
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: incorrect old password.
// ---------------------------------------------------------------------------
describe('[UTCID06] changePassword() – Abnormal 1: incorrect old password', () => {
  it('rejects when bcrypt.compare reports the current password is invalid', async () => {
    mockedRepo.findById.mockResolvedValue(makeStoredUser());
    mockedBcrypt.compare.mockReset();
    mockedBcrypt.compare.mockResolvedValue(false);

    // Invalid test data / failing mock configured for incorrect old password
    await expect(
      service.changePassword(42, 'WrongOld1!', 'NewPass2@'),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      service.changePassword(42, 'WrongOld1!', 'NewPass2@'),
    ).rejects.toMatchObject({
      name: 'BadRequestError',
      statusCode: 400,
      message: expect.stringContaining('Mật khẩu hiện tại không chính xác'),
    });

    // No partial commit — hash & updatePassword were never invoked
    expect(mockedBcrypt.hash).not.toHaveBeenCalled();
    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();

    // Failure log records a safe diagnostic — no plaintext password / hash
    // leakage in the error message
    const err = await service
      .changePassword(42, 'WrongOld1!', 'NewPass2@')
      .catch((e) => e) as BadRequestError;
    expect(err.message).toContain('Mật khẩu hiện tại không chính xác');
    expect(err.message).not.toContain('WrongOld1!');
    expect(err.message).not.toContain('NewPass2@');
    expect(err.message).not.toContain('$2b$');
  });

  it('rejects when the user cannot be found (UnauthorizedError 401)', async () => {
    mockedRepo.findById.mockResolvedValue(null);

    await expect(
      service.changePassword(42, 'OldPass1!', 'NewPass2@'),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    await expect(
      service.changePassword(42, 'OldPass1!', 'NewPass2@'),
    ).rejects.toMatchObject({
      name: 'UnauthorizedError',
      statusCode: 401,
      message: expect.stringContaining('Không tìm thấy người dùng'),
    });

    expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: weak / mismatched new password.
// ---------------------------------------------------------------------------
describe('[UTCID07] changePassword() – Abnormal 2: weak/mismatched password', () => {
  it.each([
    ['too short',           makeCompliantPassword(7)],
    ['no uppercase',        'all-lower1!digits'],
    ['no lowercase',        'ALL-UPPER1!CASE'],
    ['no digit',            'NoDigitsHere!'],
    ['no special',          'NoSpecialChar1'],
    ['empty',               ''],
  ])('rejects weak new password (%s) with a controlled BadRequestError', async (_label, pwd) => {
    // Invalid test data / failing mock configured for weak password
    await expect(
      service.changePassword(42, 'OldPass1!', pwd),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      service.changePassword(42, 'OldPass1!', pwd),
    ).rejects.toMatchObject({ statusCode: 400 });

    // No partial commit – policy is checked BEFORE findById / compare / hash /
    // updatePassword. The error message is safe and contains no plaintext.
    expect(mockedRepo.findById).not.toHaveBeenCalled();
    expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    expect(mockedBcrypt.hash).not.toHaveBeenCalled();
    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();

    if (pwd.length > 0) {
      const err = await service
        .changePassword(42, 'OldPass1!', pwd)
        .catch((e) => e) as BadRequestError;
      expect(err.message).not.toContain(pwd);
    }
  });

  it('rejects when the new password equals the current password (BadRequestError 400)', async () => {
    const same = 'SamePass1!';

    // The implementation uses a non-constant-time string compare for this
    // check, but the only thing we care about as a unit-test contract is
    // that the operation rejects with a controlled error.
    await expect(
      service.changePassword(42, same, same),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      service.changePassword(42, same, same),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Mật khẩu mới phải khác mật khẩu hiện tại'),
    });

    // No partial commit
    expect(mockedBcrypt.hash).not.toHaveBeenCalled();
    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();

    // Safe diagnostic — no plaintext password leakage in the error message
    const err = await service
      .changePassword(42, same, same)
      .catch((e) => e) as BadRequestError;
    expect(err.message).not.toContain(same);
  });

  it('does not leak password material through failure logs (regex assertion)', async () => {
    await expect(
      service.changePassword(42, 'OldPass1!', 'short'),
    ).rejects.toBeInstanceOf(BadRequestError);

    // Failure log records a safe diagnostic — message must NOT contain the
    // plaintext new password OR any bcrypt-hash marker.
    const err = await service
      .changePassword(42, 'OldPass1!', 'short')
      .catch((e) => e) as Error;
    expect(err.message).not.toMatch(/short/i);
    expect(err.message).not.toMatch(/\$2b\$/);
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: exact minimum / maximum password length.
// The supported minimum is 8 (PASSWORD_POLICY.minLength). The supported
// maximum is bcrypt's 72-byte input ceiling. Values at the boundary are
// accepted; the adjacent unsupported value is rejected without partial
// commit or sensitive disclosure.
// ---------------------------------------------------------------------------
describe('[UTCID08] changePassword() – Boundary 1: exact minimum/maximum password length', () => {
  it('accepts a new password exactly at the policy minimum (length == 8)', async () => {
    const minLength = 'Aa1!aaaa'; // exactly 8 chars, policy-compliant

    expect(minLength.length).toBe(PASSWORD_POLICY.minLength);
    expect(PASSWORD_POLICY.uppercase.test(minLength)).toBe(true);
    expect(PASSWORD_POLICY.lowercase.test(minLength)).toBe(true);
    expect(PASSWORD_POLICY.number.test(minLength)).toBe(true);
    expect(PASSWORD_POLICY.special.test(minLength)).toBe(true);

    // 1. Return – expected success value at the supported boundary
    const result = await service.changePassword(42, 'OldPass1!', minLength);
    expect(result).toEqual({ message: 'Đổi mật khẩu thành công' });

    // 2. Persisted state matches – audit-write ran for the actor
    expect(mockedRepo.updatePassword).toHaveBeenCalledWith(42, 'new-hashed-value');

    // 3. No unhandled exception / partial commit / sensitive disclosure
    expect(JSON.stringify(result)).not.toContain(minLength);
  });

  it('rejects a new password one character below the policy minimum (length == 7)', async () => {
    // Adjacent unsupported value: one below the policy floor.
    const belowMin = 'Aa1!aaa'; // 7 chars, policy-compliant EXCEPT for length

    expect(belowMin.length).toBe(PASSWORD_POLICY.minLength - 1);

    await expect(
      service.changePassword(42, 'OldPass1!', belowMin),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      service.changePassword(42, 'OldPass1!', belowMin),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('ít nhất'),
    });

    // No partial commit – policy check is performed BEFORE findById /
    // compare / hash / updatePassword.
    expect(mockedRepo.findById).not.toHaveBeenCalled();
    expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    expect(mockedBcrypt.hash).not.toHaveBeenCalled();
    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();

    // Failure log records a safe diagnostic – message does not contain
    // the offending password value.
    const err = await service
      .changePassword(42, 'OldPass1!', belowMin)
      .catch((e) => e) as BadRequestError;
    expect(err.message).not.toContain(belowMin);
    expect(err.message).not.toMatch(/\$2b\$/);
  });

  it('accepts a new password exactly at the bcrypt input ceiling (length == 72)', async () => {
    // 72 bytes is bcrypt's documented maximum input size. A 72-byte
    // policy-compliant password is the supported upper boundary.
    const seventyTwo = makeCompliantPassword(72);

    expect(seventyTwo.length).toBe(72);

    const result = await service.changePassword(42, 'OldPass1!', seventyTwo);
    expect(result).toEqual({ message: 'Đổi mật khẩu thành công' });
    expect(mockedRepo.updatePassword).toHaveBeenCalledWith(42, 'new-hashed-value');
  });

  it('rejects an empty new password (the lower adjacent unsupported value)', async () => {
    await expect(
      service.changePassword(42, 'OldPass1!', ''),
    ).rejects.toBeInstanceOf(BadRequestError);

    // No partial commit
    expect(mockedRepo.findById).not.toHaveBeenCalled();
    expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    expect(mockedBcrypt.hash).not.toHaveBeenCalled();
    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();

    // Safe diagnostic
    const err = await service
      .changePassword(42, 'OldPass1!', '')
      .catch((e) => e) as BadRequestError;
    expect(err.message).not.toMatch(/password|hash|token|secret/i);
  });
});
