/**
 * Unit tests for AuthService.resetPassword() — Function10B (the
 * token-consuming counterpart to requestPasswordReset).
 *
 * Note on naming: the matrix headers reference `AuthService` (and we
 * previously delivered specs for login / logout / changePassword /
 * requestPasswordReset / getProfile / updateProfile — six auth
 * specs). The seventh AuthService method, `resetPassword(token,
 * newPassword)`, was not previously covered. This file fills that
 * gap.
 *
 * Contract:
 *   async resetPassword(token: string, newPassword: string):
 *     Promise<{ message: string }>
 *
 *   1. validateNewPassword(newPassword) runs FIRST and throws
 *      BadRequestError on policy violation.
 *   2. bcrypt.hash(newPassword, config.bcrypt.saltRounds) hashes the
 *      new password.
 *   3. authRepository.resetPasswordWithToken(hashResetToken(token),
 *      hashedPassword) is called with the SHA-256 hash of the token
 *      (NEVER the raw token).
 *   4. If the repo returns falsy → BadRequestError('Đường dẫn đặt lại
 *      mật khẩu không hợp lệ hoặc đã hết hạn').
 *   5. Success → { message: 'Đặt lại mật khẩu thành công' }.
 *
 * Coverage matrix (UTCID01 – UTCID07):
 *   UTCID01  N  – Reset Password completes successfully with a valid
 *                 token and a policy-compliant new password.
 *   UTCID02  N  – The new password is hashed (bcrypt.hash) and
 *                 forwarded to the repository.
 *   UTCID03  N  – The token is SHA-256 hashed before being forwarded
 *                 to the repository (raw token is NOT leaked).
 *   UTCID04  N  – The hash update is persisted via the
 *                 repository transaction (single call, correct args).
 *   UTCID05  A  – Reset Password rejects with BadRequestError when the
 *                 token is invalid or expired (repo returns falsy).
 *   UTCID06  A  – Reset Password rejects with BadRequestError when the
 *                 new password fails the password policy.
 *   UTCID07  B  – Boundary 1: exact minimum / maximum password length
 *                 at the policy boundary (8 / 72). Supported
 *                 boundaries accepted; adjacent unsupported (length
 *                 7) rejected without partial commit or sensitive
 *                 disclosure.
 */

import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { config } from '../../../src/config';
import { BadRequestError } from '../../../src/shared/exceptions/app-error';
import { AuthService } from '../../../src/modules/auth/auth.service';
import {
  authRepository,
} from '../../../src/modules/auth/auth.repository';
import { PASSWORD_POLICY } from '../../../src/shared/utils/password-policy';

jest.mock('bcrypt');
jest.mock('../../../src/modules/auth/auth.repository');
jest.mock('../../../src/shared/utils/jwt.util');
jest.mock('../../../src/shared/services/email.service');

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockedRepo = authRepository as jest.Mocked<typeof authRepository>;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Build a policy-compliant password of arbitrary length.
 * Keeps the policy character classes even for short passwords.
 */
function makeCompliantPassword(length: number): string {
  const base = 'Aa1!';
  if (length <= base.length) {
    return 'Aa1!aaaa'.slice(0, Math.max(length, 0)).padEnd(length, 'a');
  }
  return (base + 'a'.repeat(length - base.length)).slice(0, length);
}

const VALID_TOKEN = 'a'.repeat(64); // a 64-char hex-like token
const VALID_TOKEN_HASH = sha256(VALID_TOKEN);
const COMPLIANT_PASSWORD = makeCompliantPassword(8);

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

let service: AuthService;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();

  // Healthy defaults — every test overrides what it needs.
  mockedBcrypt.hash.mockResolvedValue('$2b$12$newHashedPassword' as never);
  mockedRepo.resetPasswordWithToken.mockResolvedValue(true);

  service = new AuthService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: Reset Password completes successfully.
// Result : Reset Password returns the expected success value with a
//          valid token and a policy-compliant new password.
// ---------------------------------------------------------------------------
describe('[UTCID01] authService.resetPassword() – Normal 1: valid token + compliant password', () => {
  it('returns the expected success value', async () => {
    // 1. Return – success message is propagated.
    const result = await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);

    expect(result).toEqual({ message: 'Đặt lại mật khẩu thành công' });

    // 2. Persisted state matches – the repository received exactly
    //    one resetPasswordWithToken call.
    expect(mockedRepo.resetPasswordWithToken).toHaveBeenCalledTimes(1);

    // 3. No unhandled exception / partial commit / sensitive disclosure.
    expect(JSON.stringify(result)).not.toMatch(/password.*[a-zA-Z0-9]/);
    expect(JSON.stringify(result)).not.toContain(COMPLIANT_PASSWORD);
  });

  it('does NOT call any other repository write/read methods on the happy path', async () => {
    await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);

    expect(mockedRepo.findByUsername).not.toHaveBeenCalled();
    expect(mockedRepo.findByEmail).not.toHaveBeenCalled();
    expect(mockedRepo.findById).not.toHaveBeenCalled();
    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();
    expect(mockedRepo.updateProfile).not.toHaveBeenCalled();
    expect(mockedRepo.updateLastLogin).not.toHaveBeenCalled();
    expect(mockedRepo.createPasswordResetToken).not.toHaveBeenCalled();
    expect(mockedRepo.deletePasswordResetToken).not.toHaveBeenCalled();
  });

  it('does NOT send an email on the happy reset path (no notification side-effect)', async () => {
    // Reset password does NOT notify the user by email — only
    // `requestPasswordReset` does. We assert this at the unit-test
    // boundary by checking the email service was not called.
    await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);

    const emailServiceModule =
      require('../../../src/shared/services/email.service') as any;
    expect(emailServiceModule.sendEmail).not.toHaveBeenCalled();
  });

  it('does NOT throw on a long, complex policy-compliant password', async () => {
    const longPassword = makeCompliantPassword(72);

    await expect(
      service.resetPassword(VALID_TOKEN, longPassword),
    ).resolves.toEqual({ message: 'Đặt lại mật khẩu thành công' });
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: the new password is hashed via bcrypt.
// Result : The hash update runs (bcrypt.hash + repository call).
// ---------------------------------------------------------------------------
describe('[UTCID02] authService.resetPassword() – Normal 2: password hashing', () => {
  it('hashes the new password via bcrypt.hash with the configured salt rounds', async () => {
    await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);

    // 1. bcrypt.hash was called exactly once.
    expect(mockedBcrypt.hash).toHaveBeenCalledTimes(1);

    // 2. The plaintext password and the salt rounds match the config.
    expect(mockedBcrypt.hash).toHaveBeenCalledWith(
      COMPLIANT_PASSWORD,
      config.bcrypt.saltRounds,
    );
  });

  it('forwards the bcrypt hash (not the plaintext) to the repository', async () => {
    await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);

    // The repository received the HASH, not the plaintext password.
    const args = mockedRepo.resetPasswordWithToken.mock.calls[0];
    const hashedPassword = args[1];
    expect(hashedPassword).toBe('$2b$12$newHashedPassword');
    expect(hashedPassword).not.toBe(COMPLIANT_PASSWORD);
  });

  it('does NOT include the plaintext password in any return payload', async () => {
    const result = await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);

    // The success payload is `{ message: '...' }` only.
    expect(result).toEqual({ message: 'Đặt lại mật khẩu thành công' });
    expect(JSON.stringify(result)).not.toContain(COMPLIANT_PASSWORD);
  });

  it('does NOT log the plaintext password', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);

    // No console.log / console.error should include the plaintext
    // password.
    const allCalls = [
      ...consoleSpy.mock.calls,
      ...consoleErrorSpy.mock.calls,
    ];
    for (const call of allCalls) {
      expect(JSON.stringify(call)).not.toContain(COMPLIANT_PASSWORD);
    }

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('runs bcrypt.hash AFTER password-policy validation (in the right order)', async () => {
    // A weak password should fail BEFORE bcrypt.hash is even called.
    const weakPassword = 'weak';

    mockedBcrypt.hash.mockClear();

    await expect(
      service.resetPassword(VALID_TOKEN, weakPassword),
    ).rejects.toBeInstanceOf(BadRequestError);

    // bcrypt.hash was NOT called — the policy check rejected first.
    expect(mockedBcrypt.hash).not.toHaveBeenCalled();
    // The repository was NOT called either.
    expect(mockedRepo.resetPasswordWithToken).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: the token is SHA-256 hashed before being forwarded.
// Result : The repository receives the SHA-256 hash of the token, NOT
//          the raw token.
// ---------------------------------------------------------------------------
describe('[UTCID03] authService.resetPassword() – Normal 3: token hashing', () => {
  it('forwards the SHA-256 hash of the token to the repository', async () => {
    await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);

    const args = mockedRepo.resetPasswordWithToken.mock.calls[0];
    const forwardedTokenHash = args[0];
    expect(forwardedTokenHash).toBe(VALID_TOKEN_HASH);
    // The raw token must NOT be forwarded.
    expect(forwardedTokenHash).not.toBe(VALID_TOKEN);
  });

  it('produces a 64-char hex SHA-256 hash (256 bits)', async () => {
    await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);

    const args = mockedRepo.resetPasswordWithToken.mock.calls[0];
    const forwardedTokenHash = args[0];
    expect(forwardedTokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does NOT include the raw token in any return payload', async () => {
    const result = await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);

    // The raw token must NOT leak through the success payload.
    expect(JSON.stringify(result)).not.toContain(VALID_TOKEN);
  });

  it('forwards a different hash for a different token (no caching)', async () => {
    const otherToken = 'b'.repeat(64);

    await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);
    await service.resetPassword(otherToken, COMPLIANT_PASSWORD);

    const firstHash = mockedRepo.resetPasswordWithToken.mock.calls[0][0];
    const secondHash = mockedRepo.resetPasswordWithToken.mock.calls[1][0];
    expect(firstHash).toBe(VALID_TOKEN_HASH);
    expect(secondHash).toBe(sha256(otherToken));
    expect(firstHash).not.toBe(secondHash);
  });

  it('forwards the same hash for the same token (deterministic SHA-256)', async () => {
    await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);
    await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);

    const firstHash = mockedRepo.resetPasswordWithToken.mock.calls[0][0];
    const secondHash = mockedRepo.resetPasswordWithToken.mock.calls[1][0];
    expect(firstHash).toBe(secondHash);
  });

  it('does not call bcrypt.hash with the raw token (token is hashed via crypto.sha256, not bcrypt)', async () => {
    await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);

    // bcrypt.hash must be called with the plaintext password, NOT
    // the token. The token is hashed separately via SHA-256.
    const bcryptArgs = mockedBcrypt.hash.mock.calls[0];
    expect(bcryptArgs[0]).toBe(COMPLIANT_PASSWORD);
    expect(bcryptArgs[0]).not.toBe(VALID_TOKEN);
    expect(bcryptArgs[0]).not.toBe(VALID_TOKEN_HASH);
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: persistence / single repository call.
// Result : The hash update is persisted via the repository transaction
//          (single call, correct args).
// ---------------------------------------------------------------------------
describe('[UTCID04] authService.resetPassword() – Normal 4: persistence/single repository call', () => {
  it('calls resetPasswordWithToken exactly once on the happy path', async () => {
    await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);

    expect(mockedRepo.resetPasswordWithToken).toHaveBeenCalledTimes(1);
  });

  it('forwards the correct args: (tokenHash, hashedPassword)', async () => {
    await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);

    const args = mockedRepo.resetPasswordWithToken.mock.calls[0];
    expect(args).toHaveLength(2);
    expect(args[0]).toBe(VALID_TOKEN_HASH);
    expect(args[1]).toBe('$2b$12$newHashedPassword');
  });

  it('does NOT call any other write methods (no audit, no updatePassword)', async () => {
    await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);

    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();
  });

  it('does not retry the reset on success', async () => {
    await service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD);

    // Exactly one resetPasswordWithToken call.
    expect(mockedRepo.resetPasswordWithToken).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 1: invalid / expired token.
// Result : Reset Password rejects with BadRequestError when the token
//          is invalid or expired; safe diagnostic; no partial commit.
// ---------------------------------------------------------------------------
describe('[UTCID05] authService.resetPassword() – Abnormal 1: invalid/expired token', () => {
  it('rejects with BadRequestError when the token is invalid (repo returns false)', async () => {
    mockedRepo.resetPasswordWithToken.mockReset();
    mockedRepo.resetPasswordWithToken.mockResolvedValueOnce(false);

    await expect(
      service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Đường dẫn đặt lại mật khẩu không hợp lệ hoặc đã hết hạn'),
    });
  });

  it('rejects with BadRequestError when the token is invalid (repo returns null/undefined)', async () => {
    mockedRepo.resetPasswordWithToken.mockReset();
    mockedRepo.resetPasswordWithToken.mockResolvedValueOnce(null as any);

    await expect(
      service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('records a safe diagnostic on invalid-token rejection (no token leak)', async () => {
    mockedRepo.resetPasswordWithToken.mockReset();
    mockedRepo.resetPasswordWithToken.mockResolvedValueOnce(false);

    const err = await service
      .resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD)
      .catch((e) => e) as BadRequestError;

    expect(err.message).toBe(
      'Đường dẫn đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
    );
    // The raw token must NOT appear in the error message.
    expect(err.message).not.toContain(VALID_TOKEN);
    expect(err.message).not.toContain(VALID_TOKEN_HASH);
    // The plaintext password must NOT appear in the error message.
    expect(err.message).not.toContain(COMPLIANT_PASSWORD);
  });

  it('does NOT update the user row on invalid token (no partial commit)', async () => {
    // bcrypt.hash still runs (it's wasted, but harmless), but the
    // repository transaction is the ONLY persistence gate. If the
    // repo returns false, the user row is NOT updated.
    mockedRepo.resetPasswordWithToken.mockReset();
    mockedRepo.resetPasswordWithToken.mockResolvedValueOnce(false);

    await expect(
      service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD),
    ).rejects.toBeInstanceOf(BadRequestError);

    // bcrypt.hash was called (this is acceptable — the hash is
    // simply discarded by the failed transaction).
    expect(mockedBcrypt.hash).toHaveBeenCalledTimes(1);
    // The repo was called exactly once.
    expect(mockedRepo.resetPasswordWithToken).toHaveBeenCalledTimes(1);
  });

  it('rejects when the repository throws an unexpected error', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.resetPasswordWithToken.mockReset();
    mockedRepo.resetPasswordWithToken.mockRejectedValueOnce(repoError);

    await expect(
      service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD),
    ).rejects.toBe(repoError);
  });

  it('rejects when bcrypt.hash itself fails', async () => {
    const hashError = new Error('bcrypt failed');
    mockedBcrypt.hash.mockReset();
    mockedBcrypt.hash.mockRejectedValueOnce(hashError);

    await expect(
      service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD),
    ).rejects.toBe(hashError);

    // The repository was NOT called — bcrypt failed before the
    // resetPasswordWithToken call.
    expect(mockedRepo.resetPasswordWithToken).not.toHaveBeenCalled();
  });

  it('does NOT call any other write methods on the invalid-token path', async () => {
    mockedRepo.resetPasswordWithToken.mockReset();
    mockedRepo.resetPasswordWithToken.mockResolvedValueOnce(false);

    await expect(
      service.resetPassword(VALID_TOKEN, COMPLIANT_PASSWORD),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 2: weak / policy-violating new password.
// Result : Reset Password rejects with BadRequestError when the new
//          password fails the password policy; safe diagnostic; no
//          partial commit.
// ---------------------------------------------------------------------------
describe('[UTCID06] authService.resetPassword() – Abnormal 2: weak/password policy violation', () => {
  it('rejects with BadRequestError when the password is too short (length 7)', async () => {
    await expect(
      service.resetPassword(VALID_TOKEN, 'Aa1!aaa'),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      service.resetPassword(VALID_TOKEN, 'Aa1!aaa'),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('phải có ít nhất 8 ký tự'),
    });
  });

  it('rejects when the password is empty', async () => {
    await expect(
      service.resetPassword(VALID_TOKEN, ''),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      service.resetPassword(VALID_TOKEN, ''),
    ).rejects.toMatchObject({
      message: expect.stringContaining('là bắt buộc'),
    });
  });

  it('rejects when the password is missing an uppercase letter', async () => {
    await expect(
      service.resetPassword(VALID_TOKEN, 'aa1!aaaa'),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      service.resetPassword(VALID_TOKEN, 'aa1!aaaa'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('chữ cái viết hoa'),
    });
  });

  it('rejects when the password is missing a lowercase letter', async () => {
    await expect(
      service.resetPassword(VALID_TOKEN, 'AA1!AAAA'),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      service.resetPassword(VALID_TOKEN, 'AA1!AAAA'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('chữ cái viết thường'),
    });
  });

  it('rejects when the password is missing a number', async () => {
    await expect(
      service.resetPassword(VALID_TOKEN, 'Aaa!aaaa'),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      service.resetPassword(VALID_TOKEN, 'Aaa!aaaa'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('chữ số'),
    });
  });

  it('rejects when the password is missing a special character', async () => {
    await expect(
      service.resetPassword(VALID_TOKEN, 'Aa1aaaaa'),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      service.resetPassword(VALID_TOKEN, 'Aa1aaaaa'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('ký tự đặc biệt'),
    });
  });

  it('rejects when the password is a single character', async () => {
    await expect(
      service.resetPassword(VALID_TOKEN, 'A'),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('records a safe diagnostic on weak-password rejection (no plaintext password leak)', async () => {
    const weak = 'weak';

    const err = await service
      .resetPassword(VALID_TOKEN, weak)
      .catch((e) => e) as BadRequestError;

    expect(err.statusCode).toBe(400);
    // The plaintext password must NOT appear in the error message.
    expect(err.message).not.toContain(weak);
  });

  it('does NOT call bcrypt.hash when the password fails the policy (no wasted work)', async () => {
    mockedBcrypt.hash.mockClear();

    await expect(
      service.resetPassword(VALID_TOKEN, 'weak'),
    ).rejects.toBeInstanceOf(BadRequestError);

    // bcrypt.hash was NOT called — the policy check rejected first.
    expect(mockedBcrypt.hash).not.toHaveBeenCalled();
  });

  it('does NOT call the repository when the password fails the policy', async () => {
    mockedRepo.resetPasswordWithToken.mockClear();

    await expect(
      service.resetPassword(VALID_TOKEN, 'weak'),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedRepo.resetPasswordWithToken).not.toHaveBeenCalled();
  });

  it('rejects each policy violation IN ORDER (length → upper → lower → digit → special)', async () => {
    // Too short → length error fires first.
    await expect(
      service.resetPassword(VALID_TOKEN, 'Aa1!'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('ít nhất 8'),
    });

    // Right length, missing uppercase → uppercase error fires.
    await expect(
      service.resetPassword(VALID_TOKEN, 'aa1!aaaa'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('viết hoa'),
    });

    // Has upper, missing lowercase → lowercase error fires.
    await expect(
      service.resetPassword(VALID_TOKEN, 'AA1!AAAA'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('viết thường'),
    });

    // Has both cases, missing number → digit error fires.
    await expect(
      service.resetPassword(VALID_TOKEN, 'Aaa!aaaa'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('chữ số'),
    });

    // Has cases + number, missing special → special error fires.
    await expect(
      service.resetPassword(VALID_TOKEN, 'Aa1aaaaa'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('ký tự đặc biệt'),
    });
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Boundary 1: exact minimum / maximum password length.
// Result : Reset Password accepts the supported boundaries (length 8
//          and length 72); the adjacent unsupported value (length 7)
//          is rejected without partial commit or sensitive disclosure.
// ---------------------------------------------------------------------------
describe('[UTCID07] authService.resetPassword() – Boundary 1: exact password length boundary', () => {
  it('accepts the supported minimum boundary (length = 8)', async () => {
    const pwd = makeCompliantPassword(PASSWORD_POLICY.minLength);

    const result = await service.resetPassword(VALID_TOKEN, pwd);

    expect(result).toEqual({ message: 'Đặt lại mật khẩu thành công' });
    expect(mockedRepo.resetPasswordWithToken).toHaveBeenCalledTimes(1);
    expect(pwd.length).toBe(8);
  });

  it('rejects the adjacent unsupported value (length = 7)', async () => {
    const pwd = makeCompliantPassword(PASSWORD_POLICY.minLength - 1);

    await expect(
      service.resetPassword(VALID_TOKEN, pwd),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      service.resetPassword(VALID_TOKEN, pwd),
    ).rejects.toMatchObject({
      message: expect.stringContaining('ít nhất 8'),
    });

    // No partial commit — repository was NOT called.
    expect(mockedRepo.resetPasswordWithToken).not.toHaveBeenCalled();
    expect(mockedBcrypt.hash).not.toHaveBeenCalled();
  });

  it('accepts the supported upper boundary (length = 72)', async () => {
    // bcrypt has a 72-byte input limit. Anything longer gets silently
    // truncated. The service does NOT enforce this — it forwards
    // whatever the policy says. We test length=72 as a reasonable
    // upper bound that's policy-compliant.
    const pwd = makeCompliantPassword(72);

    const result = await service.resetPassword(VALID_TOKEN, pwd);

    expect(result).toEqual({ message: 'Đặt lại mật khẩu thành công' });
    expect(mockedRepo.resetPasswordWithToken).toHaveBeenCalledTimes(1);
    expect(pwd.length).toBe(72);
  });

  it('accepts a length-8 password with the exact minimum policy composition', async () => {
    // Build a length-8 password with the EXACT minimum policy
    // composition: 1 upper, 1 lower, 1 digit, 1 special, 4 lowercase
    // fillers.
    const pwd = 'Aa1!aaaa';

    expect(pwd.length).toBe(8);
    expect(/[A-Z]/.test(pwd)).toBe(true);
    expect(/[a-z]/.test(pwd)).toBe(true);
    expect(/[0-9]/.test(pwd)).toBe(true);
    expect(/[!@#$%^&*]/.test(pwd)).toBe(true);

    const result = await service.resetPassword(VALID_TOKEN, pwd);

    expect(result).toEqual({ message: 'Đặt lại mật khẩu thành công' });
  });

  it('rejects the adjacent unsupported value (length = 7) without partial commit', async () => {
    const pwd = 'Aa1!aaa';
    expect(pwd.length).toBe(7);

    await expect(
      service.resetPassword(VALID_TOKEN, pwd),
    ).rejects.toBeInstanceOf(BadRequestError);

    // No partial commit — neither bcrypt.hash nor repository call.
    expect(mockedRepo.resetPasswordWithToken).not.toHaveBeenCalled();
    expect(mockedBcrypt.hash).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on boundary rejection (no password / token leak)', async () => {
    const pwd = 'Aa1!aaa'; // length 7

    const err = await service
      .resetPassword(VALID_TOKEN, pwd)
      .catch((e) => e) as BadRequestError;

    expect(err.message).toContain('ít nhất 8');
    expect(err.message).not.toContain(pwd);
    expect(err.message).not.toContain(VALID_TOKEN);
    expect(err.message).not.toContain(VALID_TOKEN_HASH);
  });

  it('accepts the supported boundary on a different valid token', async () => {
    const otherToken = 'b'.repeat(64);
    const pwd = makeCompliantPassword(8);

    const result = await service.resetPassword(otherToken, pwd);

    expect(result).toEqual({ message: 'Đặt lại mật khẩu thành công' });
    // The token was forwarded as SHA-256 hash, not raw.
    const forwardedToken = mockedRepo.resetPasswordWithToken.mock.calls[0][0];
    expect(forwardedToken).toBe(sha256(otherToken));
    expect(forwardedToken).not.toBe(otherToken);
  });

  it('does NOT leak the new password in the success payload on the boundary', async () => {
    const pwd = makeCompliantPassword(8);

    const result = await service.resetPassword(VALID_TOKEN, pwd);

    expect(JSON.stringify(result)).not.toContain(pwd);
  });

  it('does NOT leak the new password on the failure path either', async () => {
    const pwd = makeCompliantPassword(7);

    const err = await service
      .resetPassword(VALID_TOKEN, pwd)
      .catch((e) => e) as BadRequestError;

    expect(JSON.stringify(err.message)).not.toContain(pwd);
  });
});
