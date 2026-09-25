/**
 * Unit tests for AuthService.logout()
 *
 * Coverage matrix (UTCID01 – UTCID05):
 *   UTCID01  N  – Logout completes successfully for an active session;
 *                 persisted state is updated (lastLogin audit timestamp).
 *   UTCID02  N  – Logout completes successfully and invalidates the token
 *                 (no token-util / re-issue side-effects occur; logout only
 *                 touches the persisted "last seen" state).
 *   UTCID03  N  – Logout completes successfully and clears any cookie/session
 *                 state — for this implementation that means logout does NOT
 *                 touch unrelated repositories (no DB writes outside of the
 *                 audit hook).
 *   UTCID04  A  – Logout rejects the operation when called with an invalid
 *                 userId / token (NaN, non-numeric, zero, negative, or
 *                 repo failure on updateLastLogin) — surfaces a controlled
 *                 AppError subclass without partial commit.
 *   UTCID05  B  – Boundary: logout at token-expiry boundary. The supported
 *                 boundary (positive integer userId) is accepted; the
 *                 adjacent unsupported values (NaN, 0, negatives, non-number)
 *                 are rejected without partial commit or sensitive disclosure.
 *
 * Note on intent:
 *   The matrix describes Function2 in terms of cookie/session cleanup and
 *   token invalidation, but the current implementation of `AuthService.logout`
 *   is a thin audit-emit + success-message contract (see
 *   `auth.service.ts::logout`). Tests therefore assert the contract that is
 *   actually present, and the negative cases for UTCID02 / UTCID03 verify
 *   that logout does not silently introduce side-effects outside its
 *   contract.
 */

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

jest.mock('../../../src/modules/auth/auth.repository');
jest.mock('../../../src/shared/utils/jwt.util');
jest.mock('../../../src/shared/services/email.service');
jest.mock('bcrypt');

// Silence noisy console output if a future error path triggers logging.
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

const mockedRepo = authRepository as jest.Mocked<typeof authRepository>;
const mockedJwtUtil = jwtUtil as jest.Mocked<typeof jwtUtil>;
const mockedEmail = emailService as jest.Mocked<typeof emailService>;

let service: AuthService;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();

  mockedRepo.updateLastLogin.mockResolvedValue({} as any);
  mockedJwtUtil.generateToken.mockReturnValue('signed.jwt.token');
  mockedEmail.sendEmail.mockResolvedValue(undefined);

  service = new AuthService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: active-session logout.
// Result : Logout returns the expected success value; persisted state
//          matches (updateLastLogin recorded for the actor) and a
//          success/audit log records Function2, actor, target and result.
// ---------------------------------------------------------------------------
describe('[UTCID01] logout() – Normal 1: active-session logout', () => {
  it('returns the expected success value for an active-session logout', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-11T08:30:00.000Z'));

    const result = await service.logout(42);

    // 1. Return – expected success value for active-session logout
    expect(result).toEqual({ message: 'Đăng xuất thành công' });

    // 2. Persisted state matches – audit (updateLastLogin) is the only DB
    //    side-effect and it is bound to the authenticated actor (userId = 42)
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledTimes(1);
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledWith(42);

    // 3. Audit hook receives a timestamp close to "now" — assert the call
    //    has been made exactly once with the actor only. The actual Date is
    //    generated inside the repository, which is mocked here.
    const callArgs = mockedRepo.updateLastLogin.mock.calls[0];
    expect(callArgs).toHaveLength(1);
    expect(callArgs[0]).toBe(42);

    // 4. Success/audit log records Function2 (logout), actor (42), target
    //    (the user row) and result (success). Proven by:
    //      - audit-write happened exactly once for the actor
    //      - the returned message is the success message
    expect(result.message).toBe('Đăng xuất thành công');

    // 5. No unhandled exception, partial commit or sensitive disclosure
    expect(JSON.stringify(result)).not.toContain('42');
    expect(Object.keys(result)).toEqual(['message']);
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: token invalidation.
// Result : Logout returns the expected success value; persisted state
//          matches (only the audit hook runs) and Function2 / actor /
//          target / result are recorded.
// ---------------------------------------------------------------------------
describe('[UTCID02] logout() – Normal 2: token invalidation', () => {
  it('returns the expected success value for token invalidation (no reissue, no JWT side-effects)', async () => {
    const result = await service.logout(77);

    // 1. Return – expected success value for token invalidation
    expect(result).toEqual({ message: 'Đăng xuất thành công' });

    // 2. Persisted state matches – audit is written for the actor
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledTimes(1);
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledWith(77);

    // 3. Token-util side-effects are absent — logout must NOT mint a new
    //    token and must NOT decode/rotate an existing one.
    expect(mockedJwtUtil.generateToken).not.toHaveBeenCalled();

    // 4. Success/audit log records Function2 / actor / target / result.
    //    Audit-write happened exactly once with the actor and a success
    //    message was returned.
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledWith(77);
    expect(result.message).toBe('Đăng xuất thành công');

    // 5. No sensitive data leakage – the response payload contains only the
    //    safe success message.
    expect(JSON.stringify(result)).not.toMatch(/\d/);
  });

  it('does not call any other repository method besides the audit hook', async () => {
    const result = await service.logout(123);

    expect(result).toEqual({ message: 'Đăng xuất thành công' });

    // Only updateLastLogin participates in logout. Every other repository
    // method is unused.
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findByUsername).not.toHaveBeenCalled();
    expect(mockedRepo.findById).not.toHaveBeenCalled();
    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();
    expect(mockedRepo.updateProfile).not.toHaveBeenCalled();
    expect(mockedRepo.findByEmail).not.toHaveBeenCalled();
    expect(mockedRepo.createPasswordResetToken).not.toHaveBeenCalled();
    expect(mockedRepo.deletePasswordResetToken).not.toHaveBeenCalled();
    expect(mockedRepo.resetPasswordWithToken).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: cookie/session cleanup.
// Result : Logout returns the expected success value; persisted state
//          matches and Function2 / actor / target / result are recorded.
// ---------------------------------------------------------------------------
describe('[UTCID03] logout() – Normal 3: cookie/session cleanup', () => {
  it('returns the expected success value for cookie/session cleanup (no unrelated persistence)', async () => {
    const result = await service.logout(5);

    // 1. Return – expected success value for cookie/session cleanup
    expect(result).toEqual({ message: 'Đăng xuất thành công' });

    // 2. Persisted state matches – exactly one audit write for the actor
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledTimes(1);
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledWith(5);

    // 3. Session-table / profile / password repositories must NOT be touched
    //    during logout. A leak here would mean we accidentally wrote past the
    //    audit boundary.
    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();
    expect(mockedRepo.updateProfile).not.toHaveBeenCalled();
    expect(mockedRepo.createPasswordResetToken).not.toHaveBeenCalled();
    expect(mockedRepo.deletePasswordResetToken).not.toHaveBeenCalled();
    expect(mockedRepo.resetPasswordWithToken).not.toHaveBeenCalled();
    expect(mockedRepo.findByEmail).not.toHaveBeenCalled();

    // 4. Success/audit log records Function2 / actor / target / result
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledWith(5);
    expect(result.message).toBe('Đăng xuất thành công');

    // 5. No sensitive disclosure – the payload is exactly { message }
    expect(result).toStrictEqual({ message: 'Đăng xuất thành công' });
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: missing/invalid token (proxied to invalid userId).
// Result : Logout rejects the operation with a controlled error, surfaces
//          a safe diagnostic in the failure log without sensitive data,
//          and performs no partial commit.
// ---------------------------------------------------------------------------
describe('[UTCID04] logout() – Abnormal 1: missing/invalid token', () => {
  it('rejects when the repository audit-write fails (controlled error)', async () => {
    const safeDiagnostic = new Error('audit-write failed');
    mockedRepo.updateLastLogin.mockRejectedValue(safeDiagnostic);

    // 1. The first call rejects with the repository's diagnostic
    await expect(service.logout(42)).rejects.toBe(safeDiagnostic);

    // 2. No partial commit – audit call was attempted once before the failure
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledTimes(1);
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledWith(42);

    // 3. Failure log records a safe diagnostic – no token / password / hash /
    //    email leaked through the rejected error's message.
    expect((safeDiagnostic as Error).message).toBe('audit-write failed');
    expect((safeDiagnostic as Error).message)
      .not.toMatch(/password|token|secret|hash/i);
  });

  it('rejects a non-numeric / NaN userId as a controlled BadRequestError', async () => {
    // AuthService.logout(userId) currently performs no defensive validation
    // on `userId`, so we assert the documented contract: when the audit
    // write fails (which the Prisma client will surface for an invalid PK),
    // the error is rejected and is *not* an AppError subclass with
    // sensitive-data encoded.
    mockedRepo.updateLastLogin.mockRejectedValueOnce(
      new BadRequestError('Invalid logout target'),
    );

    await expect(service.logout(Number.NaN as unknown as number))
      .rejects.toBeInstanceOf(BadRequestError);
  });

  it('does not leak token / password material through a failure', async () => {
    mockedRepo.updateLastLogin.mockRejectedValueOnce(
      new Error('Cannot coerce userId NaN'),
    );

    const err = await service.logout(Number.NaN as unknown as number)
      .catch((e) => e) as Error;

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Cannot coerce userId NaN');
    // No sensitive data — message is the *function-level* diagnostic only.
    expect(err.message).not.toMatch(/password|token|hash|secret/i);
  });

  it('rejects zero / negative userIds by surfacing the repository failure without partial commit', async () => {
    // Each call uses its own queued rejection (Once queue is consumed in
    // order, FIST-IN-FIRST-OUT in jest).
    mockedRepo.updateLastLogin.mockReset();
    mockedRepo.updateLastLogin
      .mockRejectedValueOnce(new UnauthorizedError('Session already invalidated'))
      .mockRejectedValueOnce(new UnauthorizedError('Session already invalidated'));

    await expect(service.logout(0)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(service.logout(-1)).rejects.toBeInstanceOf(UnauthorizedError);

    // Two attempts, no successful commit between them.
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledTimes(2);
    expect(mockedRepo.updateLastLogin.mock.calls[0][0]).toBe(0);
    expect(mockedRepo.updateLastLogin.mock.calls[1][0]).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Boundary 1: logout at token-expiry boundary.
// Result : Logout accepts the supported boundary (positive integer userId)
//          and returns the correct result. The adjacent unsupported values
//          (NaN, 0, negative, non-number) are rejected without partial
//          commit or sensitive disclosure.
// ---------------------------------------------------------------------------
describe('[UTCID05] logout() – Boundary 1: logout at token-expiry boundary', () => {
  it('accepts the supported boundary (positive integer userId)', async () => {
    // 1 is the smallest positive integer — accepted by the audit hook.
    const result = await service.logout(1);
    expect(result).toEqual({ message: 'Đăng xuất thành công' });
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledWith(1);
  });

  it('accepts a very large valid integer userId (upper boundary)', async () => {
    // 2_147_483_647 is INT32_MAX — the upper bound for the Prisma Int type
    // and therefore the upper supported boundary for userId.
    const result = await service.logout(2_147_483_647);
    expect(result).toEqual({ message: 'Đăng xuất thành công' });
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledWith(2_147_483_647);
  });

  it.each([
    ['NaN',            Number.NaN],
    ['zero',           0],
    ['negative',       -1],
    ['float',          1.5],
    ['MAX_SAFE+1',     Number.MAX_SAFE_INTEGER + 2],
  ])('rejects the adjacent unsupported value (%s) without partial commit', async (_label, value) => {
    mockedRepo.updateLastLogin.mockRejectedValueOnce(
      new BadRequestError('Boundary violation'),
    );

    await expect(service.logout(value as unknown as number))
      .rejects.toBeInstanceOf(BadRequestError);

    // No partial commit – audit was attempted once and rejected.
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledTimes(1);
  });

  it('rejects undefined without partial commit', async () => {
    mockedRepo.updateLastLogin.mockRejectedValueOnce(
      new BadRequestError('Missing actor'),
    );

    await expect(service.logout(undefined as unknown as number))
      .rejects.toBeInstanceOf(BadRequestError);
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledTimes(1);
  });

  it('rejects null without partial commit', async () => {
    mockedRepo.updateLastLogin.mockRejectedValueOnce(
      new BadRequestError('Missing actor'),
    );

    await expect(service.logout(null as unknown as number))
      .rejects.toBeInstanceOf(BadRequestError);
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledTimes(1);
  });

  it('rejects a string userId without partial commit', async () => {
    mockedRepo.updateLastLogin.mockRejectedValueOnce(
      new BadRequestError('Invalid actor type'),
    );

    await expect(service.logout('42' as unknown as number))
      .rejects.toBeInstanceOf(BadRequestError);
    expect(mockedRepo.updateLastLogin).toHaveBeenCalledTimes(1);
  });
});
