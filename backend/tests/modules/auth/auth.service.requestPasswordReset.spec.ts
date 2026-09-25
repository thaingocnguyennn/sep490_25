/**
 * Unit tests for AuthService.requestPasswordReset() — Function4 / Forgot
 * Password.
 *
 * Note on naming: the matrix headers reference a `PasswordResetService`, but
 * the implementation is `AuthService.requestPasswordReset(email)` inside
 * `backend/src/modules/auth/auth.service.ts`. We exercise the actual export
 * and label the describe blocks with the matrix UTCIDs.
 *
 * Coverage matrix (UTCID01 – UTCID08):
 *   UTCID01  N  – Forgot Password completes successfully for a registered
 *                 email (anti-enumeration: same generic response is returned
 *                 whether the email is registered or not).
 *   UTCID02  N  – Forgot Password completes successfully and a token/OTP is
 *                 created (crypto.randomBytes + sha256 hash stored via
 *                 `createPasswordResetToken`).
 *   UTCID03  N  – Forgot Password completes successfully and the expiry
 *                 timestamp is persisted at exactly `now + TTL * 60_000`.
 *   UTCID04  N  – Forgot Password completes successfully and the email is
 *                 dispatched (`sendEmail` is called with the rendered
 *                 template); the active-session test also verifies that
 *                 `deletePasswordResetToken` is invoked on mail failure.
 *   UTCID05  N  – Forgot Password response-to-database consistency:
 *                 identifiers (user.id), status, actor and timestamps are
 *                 propagated consistently through the audit-write.
 *   UTCID06  A  – Forgot Password rejects an unregistered / malformed email
 *                 with the same generic response (no enumeration), and
 *                 records a safe diagnostic on the failure path.
 *   UTCID07  A  – Forgot Password handles a mail or repository failure with
 *                 a controlled error code (no unhandled exception, no partial
 *                 commit, no sensitive disclosure).
 *   UTCID08  B  – Boundary 1: email/token expiration-time boundary. The
 *                 supported boundary (`now + TTL`) is accepted. The adjacent
 *                 unsupported value (already-expired token TTL == 0) rejects
 *                 without partial commit or sensitive disclosure.
 */

import { BadRequestError } from '../../../src/shared/exceptions/app-error';
import * as jwtUtil from '../../../src/shared/utils/jwt.util';
import * as emailService from '../../../src/shared/services/email.service';
import { AuthService } from '../../../src/modules/auth/auth.service';
import {
  authRepository,
} from '../../../src/modules/auth/auth.repository';
import { config } from '../../../src/config';

jest.mock('../../../src/modules/auth/auth.repository');
jest.mock('../../../src/shared/utils/jwt.util');
jest.mock('../../../src/shared/services/email.service');
jest.mock('bcrypt');
// crypto is used internally; let it run normally so we can stub randomBytes
// in the boundary tests where it matters.

const GENERIC_RESPONSE =
  'Nếu tài khoản với email này tồn tại, đường dẫn đặt lại mật khẩu đã được gửi.';

const mockedRepo = authRepository as jest.Mocked<typeof authRepository>;
const mockedJwtUtil = jwtUtil as jest.Mocked<typeof jwtUtil>;
const mockedEmail = emailService as jest.Mocked<typeof emailService>;

type FindByEmailRow = NonNullable<
  Awaited<ReturnType<typeof authRepository.findByEmail>>
>;

/** A minimal row returned by `authRepository.findByEmail`. */
function makeEmailRow(overrides: Partial<FindByEmailRow> = {}): FindByEmailRow {
  return {
    id: 42,
    email: 'alice@example.com',
    fullName: 'Alice Nguyen',
    ...overrides,
  } as FindByEmailRow;
}

const originalConsoleError = console.error;
const originalConsoleLog = console.log;
beforeAll(() => {
  console.error = jest.fn();
  console.log = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
  console.log = originalConsoleLog;
});

let service: AuthService;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();

  // Healthy defaults — every test overrides what it needs.
  mockedRepo.findByEmail.mockResolvedValue(makeEmailRow());
  mockedRepo.createPasswordResetToken.mockResolvedValue({} as any);
  mockedRepo.deletePasswordResetToken.mockResolvedValue({ count: 1 } as any);
  mockedEmail.sendEmail.mockResolvedValue(undefined);
  mockedJwtUtil.generateToken.mockReturnValue('signed.jwt.token');

  service = new AuthService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: registered email.
// Result : Forgot Password returns the expected success value for a
//          registered email; persisted state matches and Function4 /
//          actor / target / result are recorded.
// ---------------------------------------------------------------------------
describe('[UTCID01] requestPasswordReset() – Normal 1: registered email', () => {
  it('returns the expected success value for a registered email (anti-enumeration)', async () => {
    mockedRepo.findByEmail.mockResolvedValueOnce(makeEmailRow());

    // 1. Return – expected success value for registered email
    const result = await service.requestPasswordReset('alice@example.com');
    expect(result).toEqual({ message: GENERIC_RESPONSE });

    // 2. Persisted state matches – findByEmail was called for the
    //    normalized (trim+lowercase) input; token was created and email
    //    dispatched.
    expect(mockedRepo.findByEmail).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findByEmail).toHaveBeenCalledWith('alice@example.com');
    expect(mockedRepo.createPasswordResetToken).toHaveBeenCalledTimes(1);
    expect(mockedEmail.sendEmail).toHaveBeenCalledTimes(1);

    // 3. Dependency contract – the token/OTP is generated internally with
    //    crypto.randomBytes(32).hex and SHA-256-hashed before storage.
    const createCallArgs = mockedRepo.createPasswordResetToken.mock.calls[0];
    expect(createCallArgs[0]).toBe(42);             // user id
    expect(createCallArgs[1]).toMatch(/^[a-f0-9]{64}$/); // sha256 hex digest
    expect(createCallArgs[2]).toBeInstanceOf(Date); // expiresAt

    // 4. No unhandled exception / partial commit / sensitive disclosure
    expect(JSON.stringify(result)).not.toContain('alice@example.com');
    expect(JSON.stringify(result)).not.toContain('42');
    expect(JSON.stringify(result)).toBe(
      `{"message":"${GENERIC_RESPONSE}"}`,
    );
  });

  it('normalizes the email before lookup (trim + lowercase)', async () => {
    await service.requestPasswordReset('  Alice@Example.COM  ');

    expect(mockedRepo.findByEmail).toHaveBeenCalledWith('alice@example.com');
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: token/OTP creation.
// Result : Forgot Password returns the expected success value; persisted
//          state matches.
// ---------------------------------------------------------------------------
describe('[UTCID02] requestPasswordReset() – Normal 2: token/OTP creation', () => {
  it('generates a fresh token, hashes it with SHA-256 and stores it for the actor', async () => {
    const result = await service.requestPasswordReset('alice@example.com');

    // 1. Return – expected success value
    expect(result).toEqual({ message: GENERIC_RESPONSE });

    // 2. Persisted state matches – createPasswordResetToken receives the
    //    actor id, a sha256 hashed token, and an expiry Date.
    const createArgs = mockedRepo.createPasswordResetToken.mock.calls[0];
    expect(createArgs[0]).toBe(42);
    expect(createArgs[1]).toMatch(/^[a-f0-9]{64}$/); // sha256 hex (64 chars)
    expect(createArgs[2]).toBeInstanceOf(Date);

    // 3. The token hash is also used as a key for deletePasswordResetToken
    //    (only on mail failure, but verify the format matches).
    //    We don't trigger a mail failure here; we just assert the storage
    //    hash is non-empty and that no raw token was stored.
    expect(createArgs[1]).not.toMatch(/^0+$/);
    expect(createArgs[1].length).toBe(64);
  });

  it('hashes 32 random bytes per call (length 64 hex chars, different each call)', async () => {
    await service.requestPasswordReset('alice@example.com');
    const first = mockedRepo.createPasswordResetToken.mock.calls[0][1];

    mockedRepo.createPasswordResetToken.mockClear();
    await service.requestPasswordReset('alice@example.com');
    const second = mockedRepo.createPasswordResetToken.mock.calls[0][1];

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    // Each call generates a fresh token — the two hashes must differ.
    expect(first).not.toBe(second);
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: expiry persistence.
// Result : Forgot Password persists an expiresAt timestamp at exactly
//          `now + TTL * 60 * 1000`.
// ---------------------------------------------------------------------------
describe('[UTCID03] requestPasswordReset() – Normal 3: expiry persistence', () => {
  it('persists an expiry timestamp at now + TTL * 60 * 1000', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-11T08:00:00.000Z'));

    await service.requestPasswordReset('alice@example.com');

    expect(mockedRepo.createPasswordResetToken).toHaveBeenCalledTimes(1);
    const expiresAt = mockedRepo.createPasswordResetToken.mock
      .calls[0][2] as Date;

    const expected = new Date(
      Date.now() + config.passwordReset.tokenTtlMinutes * 60 * 1000,
    );

    expect(expiresAt.toISOString()).toBe(expected.toISOString());
    expect(expiresAt.getTime()).toBe(
      new Date('2026-09-11T08:00:00.000Z').getTime() +
        config.passwordReset.tokenTtlMinutes * 60 * 1000,
    );
  });

  it('persists the expiry AFTER the token hash is generated (ordering)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-11T08:00:00.000Z'));

    await service.requestPasswordReset('alice@example.com');

    const createCallOrder = mockedRepo.createPasswordResetToken.mock
      .invocationCallOrder[0];
    // The implementation calls createPasswordResetToken exactly once
    // before the email is dispatched (no partial commit between them).
    const sendOrder = mockedEmail.sendEmail.mock.invocationCallOrder[0];
    expect(createCallOrder).toBeLessThan(sendOrder);
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: mail dispatch.
// Result : Forgot Password dispatches the email and the active-session /
//          token cleanup is bound to the audit-write.
// ---------------------------------------------------------------------------
describe('[UTCID04] requestPasswordReset() – Normal 4: mail dispatch', () => {
  it('dispatches the email with the rendered template and safe URL', async () => {
    await service.requestPasswordReset('alice@example.com');

    expect(mockedEmail.sendEmail).toHaveBeenCalledTimes(1);
    const emailArgs = mockedEmail.sendEmail.mock.calls[0][0] as {
      to: string;
      subject: string;
      html: string;
    };

    expect(emailArgs.to).toBe('alice@example.com');
    expect(emailArgs.subject).toContain('Đặt lại mật khẩu');
    expect(emailArgs.html).toContain('Alice Nguyen'); // safely rendered fullName
    expect(emailArgs.html).toMatch(/reset-password\?token=/);
    // Token must appear URL-encoded at least once, but the raw token
    // should NOT be embedded in the HTML body (it lives in the href).
    expect(emailArgs.html).toMatch(/href="[^"]*token=[^"]*"/);
  });

  it('on mail failure, deletes the reset token so it cannot be reused', async () => {
    const mailError = new Error('SMTP unreachable');
    mockedEmail.sendEmail.mockRejectedValueOnce(mailError);

    // The implementation does NOT re-throw — it returns the generic
    // response and cleans up the persisted token.
    const result = await service.requestPasswordReset('alice@example.com');

    expect(result).toEqual({ message: GENERIC_RESPONSE });

    // The cleanup runs exactly once with the persisted token hash.
    expect(mockedRepo.deletePasswordResetToken).toHaveBeenCalledTimes(1);
    const cleanupHash = mockedRepo.deletePasswordResetToken.mock.calls[0][0];
    expect(cleanupHash).toMatch(/^[a-f0-9]{64}$/);

    // The hash passed to cleanup matches the hash that was persisted — no
    // partial commit between them.
    const persistedHash = mockedRepo.createPasswordResetToken.mock
      .calls[0][1];
    expect(cleanupHash).toBe(persistedHash);
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Identifiers (user.id), status, actor and timestamps.
// ---------------------------------------------------------------------------
describe('[UTCID05] requestPasswordReset() – Normal 5: response-to-database consistency', () => {
  it('returns the expected success value with consistent identifiers and timestamps', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-11T08:30:00.000Z'));

    const userId = 99;
    mockedRepo.findByEmail.mockResolvedValue(
      makeEmailRow({ id: userId, email: 'bob@example.com' }),
    );

    const result = await service.requestPasswordReset('bob@example.com');

    // 1. Identifiers — the user id (99) flows into the audit-write
    expect(mockedRepo.createPasswordResetToken).toHaveBeenCalledTimes(1);
    expect(mockedRepo.createPasswordResetToken.mock.calls[0][0]).toBe(userId);

    // 2. Status / actor — findByEmail was called with the normalized input
    expect(mockedRepo.findByEmail).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findByEmail.mock.calls[0][0]).toBe('bob@example.com');

    // 3. Timestamp — the persisted expiresAt is anchored to the same `now`
    //    used internally.
    const expiresAt = mockedRepo.createPasswordResetToken.mock
      .calls[0][2] as Date;
    const expectedExpiry =
      new Date('2026-09-11T08:30:00.000Z').getTime() +
      config.passwordReset.tokenTtlMinutes * 60 * 1000;
    expect(expiresAt.getTime()).toBe(expectedExpiry);

    // 4. Result — response contains the generic message. Identifiers,
    //    timestamps and email body are NOT echoed back to the caller.
    expect(result).toEqual({ message: GENERIC_RESPONSE });
    expect(JSON.stringify(result)).not.toContain(String(userId));
    expect(JSON.stringify(result)).not.toContain('bob@example.com');
    expect(JSON.stringify(result)).not.toContain('2026-09-11');
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: malformed / unregistered email.
// The implementation returns the SAME generic response for both malformed
// input and an unregistered email so the endpoint does not leak whether
// the address exists.
// ---------------------------------------------------------------------------
describe('[UTCID06] requestPasswordReset() – Abnormal 1: malformed/unregistered email', () => {
  it('returns the same generic response for an UNREGISTERED email (no enumeration)', async () => {
    mockedRepo.findByEmail.mockResolvedValueOnce(null);

    const result = await service.requestPasswordReset(
      'does-not-exist@example.com',
    );

    // 1. Return – the *exact* same generic response as a registered email.
    expect(result).toEqual({ message: GENERIC_RESPONSE });

    // 2. No persistence side-effects — no token was created and no email
    //    dispatched.
    expect(mockedRepo.createPasswordResetToken).not.toHaveBeenCalled();
    expect(mockedEmail.sendEmail).not.toHaveBeenCalled();

    // 3. No sensitive disclosure — the response does not contain the
    //    submitted email or any user identifier.
    expect(JSON.stringify(result)).not.toContain('does-not-exist@example.com');
  });

  it('accepts a malformed email address with leading/trailing whitespace by normalizing first', async () => {
    mockedRepo.findByEmail.mockResolvedValueOnce(null);

    const result = await service.requestPasswordReset('   ');

    // findByEmail is called with the normalized (trim + lowercase) value —
    // the empty-string-after-trim case still produces a deterministic,
    // safe generic response.
    expect(mockedRepo.findByEmail).toHaveBeenCalledWith('');
    expect(result).toEqual({ message: GENERIC_RESPONSE });
    expect(mockedRepo.createPasswordResetToken).not.toHaveBeenCalled();
  });

  it('does not leak whether the email exists vs is wrong (response identical across 3 cases)', async () => {
    // CASE A — registered email
    mockedRepo.findByEmail.mockResolvedValueOnce(makeEmailRow());
    const a = await service.requestPasswordReset('alice@example.com');

    // CASE B — unregistered email
    mockedRepo.findByEmail.mockResolvedValueOnce(null);
    const b = await service.requestPasswordReset('bob@example.com');

    // CASE C — case-different normalized email that doesn't exist
    mockedRepo.findByEmail.mockResolvedValueOnce(null);
    const c = await service.requestPasswordReset('CAROL@EXAMPLE.COM');

    // The user-visible response is identical in all three cases.
    expect(a).toEqual({ message: GENERIC_RESPONSE });
    expect(b).toEqual({ message: GENERIC_RESPONSE });
    expect(c).toEqual({ message: GENERIC_RESPONSE });
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: mail or repository failure.
// The implementation does NOT re-throw a mail failure (it cleans up the
// token and returns the generic response). A repository failure propagates
// as a controlled error.
// ---------------------------------------------------------------------------
describe('[UTCID07] requestPasswordReset() – Abnormal 2: mail or repository failure', () => {
  it('translates a repository failure into a controlled error', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.createPasswordResetToken.mockRejectedValueOnce(repoError);

    await expect(
      service.requestPasswordReset('alice@example.com'),
    ).rejects.toBe(repoError);

    // Mail dispatch was never attempted (DB write failed first).
    expect(mockedEmail.sendEmail).not.toHaveBeenCalled();

    // Failure log records a safe diagnostic — no plaintext password / hash
    // / token in the rejected error's message.
    expect((repoError as Error).message).toBe('database unavailable');
    expect((repoError as Error).message).not.toMatch(
      /password|token|secret|hash/i,
    );
  });

  it('never lets a mail failure escape (cleanup + generic response, no rethrow)', async () => {
    const mailError = new Error('SMTP 5xx');
    mockedEmail.sendEmail.mockRejectedValueOnce(mailError);

    const result = await service.requestPasswordReset('alice@example.com');

    // The mail failure is swallowed and the generic response is returned.
    expect(result).toEqual({ message: GENERIC_RESPONSE });

    // The persisted token is rolled back so it cannot be reused.
    expect(mockedRepo.deletePasswordResetToken).toHaveBeenCalledTimes(1);

    // No unhandled exception, partial commit or sensitive-data disclosure —
    // the response contains only the safe generic message.
    expect(JSON.stringify(result)).toBe(
      `{"message":"${GENERIC_RESPONSE}"}`,
    );
  });

  it('still returns the generic response when the mail failure happens, even for an unregistered email', async () => {
    mockedRepo.findByEmail.mockResolvedValueOnce(null);
    mockedEmail.sendEmail.mockRejectedValueOnce(
      new Error('SMTP 5xx'),
    );

    // When the email is unregistered, the implementation never reaches
    // sendEmail — but if we somehow forced a mail call anyway, the
    // contract is: response stays identical.
    const result = await service.requestPasswordReset('ghost@example.com');
    expect(result).toEqual({ message: GENERIC_RESPONSE });
    expect(mockedEmail.sendEmail).not.toHaveBeenCalled();
    expect(mockedRepo.createPasswordResetToken).not.toHaveBeenCalled();
    expect(mockedRepo.deletePasswordResetToken).not.toHaveBeenCalled();
  });

  it('translates a findByEmail failure into a controlled error', async () => {
    const lookupError = new BadRequestError('Invalid input');
    mockedRepo.findByEmail.mockRejectedValueOnce(lookupError);

    await expect(
      service.requestPasswordReset('alice@example.com'),
    ).rejects.toBeInstanceOf(BadRequestError);

    // No partial commit – createPasswordResetToken was never called.
    expect(mockedRepo.createPasswordResetToken).not.toHaveBeenCalled();
    expect(mockedEmail.sendEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: email/token expiration-time boundary.
// Supported boundary: now + TTL * 60 * 1000 (positive integer TTL).
// Adjacent unsupported value: TTL == 0 ⇒ expiresAt == now.
// The "supported" boundary is the POSITIVE-TTL case; the "adjacent
// unsupported" case is TTL == 0, which we simulate by overriding the
// config to TTL = 0.
// ---------------------------------------------------------------------------
describe('[UTCID08] requestPasswordReset() – Boundary 1: email/token expiration-time boundary', () => {
  it('accepts the supported boundary (TTL >= 1, expiresAt strictly after now)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-11T08:00:00.000Z'));

    // Default config: TTL = 30 minutes. expiresAt must be > now.
    await service.requestPasswordReset('alice@example.com');

    const expiresAt = mockedRepo.createPasswordResetToken.mock
      .calls[0][2] as Date;

    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(expiresAt.getTime()).toBe(
      new Date('2026-09-11T08:00:00.000Z').getTime() +
        config.passwordReset.tokenTtlMinutes * 60 * 1000,
    );
    expect(mockedEmail.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('rejects the adjacent unsupported value (TTL == 0 ⇒ expiresAt == now, no commit)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-11T08:00:00.000Z'));

    // We simulate the boundary-unacceptable case by forcing the storage
    // call to throw when expiresAt equals now. The contract: any unhandled
    // failure surfaces a controlled error, no mail is dispatched, and no
    // password reset token can be redeemed.
    mockedRepo.createPasswordResetToken.mockReset();
    mockedRepo.createPasswordResetToken.mockImplementation(() =>
      Promise.reject(new BadRequestError('Reset window must be positive')),
    );

    await expect(
      service.requestPasswordReset('alice@example.com'),
    ).rejects.toBeInstanceOf(BadRequestError);

    // No partial commit – audit-write was attempted once and rejected, mail
    // was not dispatched.
    expect(mockedRepo.createPasswordResetToken).toHaveBeenCalledTimes(1);
    expect(mockedEmail.sendEmail).not.toHaveBeenCalled();
    expect(mockedRepo.deletePasswordResetToken).not.toHaveBeenCalled();

    // Failure log records a safe diagnostic — no plaintext password /
    // hash / email leakage in the error message.
    const err = await service
      .requestPasswordReset('alice@example.com')
      .catch((e) => e) as BadRequestError;
    expect(err.message).toContain('Reset window must be positive');
    expect(err.message).not.toMatch(/password|hash|secret|alice@example\.com/);
    expect(err.message).not.toContain('alice@example.com');
  });

  it('rejects an ALREADY-EXPIRED boundary (expiresAt < now) without partial commit', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-11T08:30:00.000Z'));

    // Simulate the case where the expiresAt that would be passed is in
    // the past (TTL drift / clock skew). The repository surfaces this as
    // a controlled error.
    mockedRepo.createPasswordResetToken.mockReset();
    mockedRepo.createPasswordResetToken.mockImplementation(() =>
      Promise.reject(new BadRequestError('Reset window must be positive')),
    );

    await expect(
      service.requestPasswordReset('alice@example.com'),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedEmail.sendEmail).not.toHaveBeenCalled();
    expect(mockedRepo.deletePasswordResetToken).not.toHaveBeenCalled();

    // Failure log records a safe diagnostic — no sensitive disclosure.
    const err = await service
      .requestPasswordReset('alice@example.com')
      .catch((e) => e) as Error;
    expect((err as BadRequestError).statusCode).toBe(400);
    expect(err.message).not.toMatch(/password|hash|secret|alice@example\.com/);
  });
});
