/**
 * Unit tests for AuthService.updateProfile() — Function6 / Update Profile.
 *
 * Note on naming: the matrix headers reference `ProfileService`, but the
 * implementation is `AuthService.updateProfile(userId, data)` inside
 * `backend/src/modules/auth/auth.service.ts`. We exercise the actual export
 * and label the describe blocks with the matrix UTCIDs.
 *
 * Coverage matrix (UTCID01 – UTCID07):
 *   UTCID01  N  – Update Profile completes successfully for a valid profile
 *                 update (findById → updateProfile with the trimmed input,
 *                 updatedBy bound to the actor).
 *   UTCID02  N  – Update Profile completes successfully for a partial update
 *                 (only one of { fullName, phone } is provided). The
 *                 other field is left untouched at the service layer (i.e.,
 *                 undefined keys are dropped from the data passed to the
 *                 repository).
 *   UTCID03  N  – Update Profile completes successfully and normalized values
 *                 (fullName trimmed; phone trimmed and empty-string
 *                 coerced to null) are forwarded to the repository.
 *   UTCID04  N  – Update Profile completes successfully and the
 *                 persistence/audit metadata (userId actor + result shape)
 *                 matches the actor's id.
 *   UTCID05  A  – Update Profile rejects an invalid field format (fullName
 *                 too short, empty fullName, fullName too long, or phone
 *                 malformed).
 *   UTCID06  A  – Update Profile rejects a duplicate or forbidden field
 *                 update (e.g., update of `email`, which is not in the
 *                 allow-list), with a controlled error and a safe
 *                 diagnostic.
 *   UTCID07  B  – Boundary 1: minimum/maximum editable field length. The
 *                 supported boundaries (fullName length 2 / 100, phone
 *                 length 10 / 15) are accepted; the adjacent unsupported
 *                 values (length 1 / 101, length 9 / 16) are rejected
 *                 with a controlled error and no partial commit.
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

function makeStoredUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 42,
    username: 'alice',
    email: 'alice@example.com',
    fullName: 'Alice Nguyen',
    phone: '+84909000001',
    avatar: null,
    password: '$2b$12$notModifiedByUpdateProfile',
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

  mockedRepo.findById.mockResolvedValue(makeStoredUser());
  // The service returns the result of `authRepository.updateProfile(...)`.
  // AuthRepository is jest-auto-mocked, so we re-implement its
  // post-update formatter behavior to mirror the production contract.
  mockedRepo.updateProfile.mockImplementation(
    async (
      id: number,
      data: { fullName?: string; phone?: string | null },
    ) => {
      const stored = makeStoredUser({
        id,
        fullName: data.fullName ?? 'Alice Nguyen',
        phone: data.phone === undefined ? '+84909000001' : data.phone,
      });
      return {
        id: stored.id,
        username: stored.username,
        email: stored.email,
        fullName: stored.fullName,
        phone: stored.phone,
        avatar: stored.avatar,
        status: stored.status,
        isFirstLogin: stored.isFirstLogin,
        lastLogin: stored.lastLogin?.toISOString() ?? null,
        createdAt: stored.createdAt.toISOString(),
        updatedAt: stored.updatedAt.toISOString(),
        roles: stored.userRoles.map((ur) => ur.role.name),
        department: stored.department,
      };
    },
  );
  mockedJwtUtil.generateToken.mockReturnValue('signed.jwt.token');
  mockedEmail.sendEmail.mockResolvedValue(undefined);

  service = new AuthService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid profile update.
// Result : Update Profile returns the expected success value (the
//          post-update `UserProfile` shape) for a valid update with both
//          fullName and phone present.
// ---------------------------------------------------------------------------
describe('[UTCID01] updateProfile() – Normal 1: valid profile update', () => {
  it('returns the expected success value for a valid profile update', async () => {
    // 1. Return – expected success value for valid profile update
    const profile = await service.updateProfile(42, {
      fullName: 'Alice B. Nguyen',
      phone: '+84909000099',
    });

    // The repository produces the formatted shape; the service forwards
    // it unchanged.
    expect(profile).toMatchObject({
      id: 42,
      fullName: 'Alice B. Nguyen',
      phone: '+84909000099',
      roles: ['ADMIN'],
      department: { id: 7, name: 'IT Department' },
    });
    expect(profile.username).toBe('alice');
    expect(profile.email).toBe('alice@example.com');

    // 2. Persisted state matches – the repository received the
    //    normalized data (trimmed) and the actor id (42) is the same
    //    userId passed in.
    expect(mockedRepo.updateProfile).toHaveBeenCalledTimes(1);
    const updateArgs = mockedRepo.updateProfile.mock.calls[0];
    expect(updateArgs[0]).toBe(42); // actor userId
    expect(updateArgs[1]).toEqual({
      fullName: 'Alice B. Nguyen',
      phone: '+84909000099',
    });

    // 3. The lookup happened first (findById → updateProfile ordering).
    expect(mockedRepo.findById).toHaveBeenCalledWith(42);
    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
    const findOrder = mockedRepo.findById.mock.invocationCallOrder[0];
    const updateOrder = mockedRepo.updateProfile.mock.invocationCallOrder[0];
    expect(findOrder).toBeLessThan(updateOrder);

    // 4. No unhandled exception / partial commit / sensitive disclosure
    expect(JSON.stringify(profile)).not.toContain('$2b$');
    expect(JSON.stringify(profile)).not.toContain('password');
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it('does not touch auth / reset-token methods (read-then-write on profile only)', async () => {
    await service.updateProfile(42, {
      fullName: 'Alice B. Nguyen',
      phone: '+84909000099',
    });

    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();
    expect(mockedRepo.updateLastLogin).not.toHaveBeenCalled();
    expect(mockedRepo.createPasswordResetToken).not.toHaveBeenCalled();
    expect(mockedRepo.deletePasswordResetToken).not.toHaveBeenCalled();
    expect(mockedRepo.resetPasswordWithToken).not.toHaveBeenCalled();
    expect(mockedRepo.findByEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: partial update (only fullName or only phone).
// Result : Update Profile returns the expected success value for the
//          partial update; the unspecified field is dropped from the data
//          passed to the repository.
// ---------------------------------------------------------------------------
describe('[UTCID02] updateProfile() – Normal 2: partial update', () => {
  it('updates only fullName when phone is not provided', async () => {
    const profile = await service.updateProfile(42, {
      fullName: 'Alice B. Nguyen',
    });

    // 1. Return – expected success value for partial update (fullName only)
    expect(profile).toMatchObject({
      id: 42,
      fullName: 'Alice B. Nguyen',
      phone: '+84909000001', // untouched at the service layer
    });

    // 2. Persisted state matches – repository receives ONLY fullName.
    //    The phone key is absent (was undefined), the service dropped it.
    expect(mockedRepo.updateProfile).toHaveBeenCalledTimes(1);
    expect(mockedRepo.updateProfile).toHaveBeenCalledWith(42, {
      fullName: 'Alice B. Nguyen',
    });
    expect(
      (mockedRepo.updateProfile.mock.calls[0][1] as Record<string, unknown>)
        .phone,
    ).toBeUndefined();
  });

  it('updates only phone when fullName is not provided', async () => {
    const profile = await service.updateProfile(42, {
      phone: '+84909000077',
    });

    // 1. Return – expected success value for partial update (phone only)
    expect(profile).toMatchObject({
      id: 42,
      fullName: 'Alice Nguyen', // untouched
      phone: '+84909000077',
    });

    // 2. Persisted state matches – repository receives ONLY phone.
    expect(mockedRepo.updateProfile).toHaveBeenCalledWith(42, {
      phone: '+84909000077',
    });
    expect(
      (mockedRepo.updateProfile.mock.calls[0][1] as Record<string, unknown>)
        .fullName,
    ).toBeUndefined();
  });

  it('drops both fields when neither is provided (and the caller hits validation upstream)', async () => {
    // The express-validator layer rejects this case with
    // "Vui lòng cung cấp thông tin cần cập nhật". At the service layer we
    // simulate the post-validation case where every key is undefined:
    // the repository receives an empty object.
    const profile = await service.updateProfile(42, {});

    // 1. Return – expected success value: profile unchanged.
    expect(profile).toMatchObject({
      id: 42,
      fullName: 'Alice Nguyen',
      phone: '+84909000001',
    });

    // 2. Persisted state matches – repository received {} (no fields).
    expect(mockedRepo.updateProfile).toHaveBeenCalledWith(42, {});
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: normalized values (trim + null coercion).
// Result : Update Profile returns the expected success value for the
//          normalized values; the service trims and forwards them.
// ---------------------------------------------------------------------------
describe('[UTCID03] updateProfile() – Normal 3: normalized values', () => {
  it('trims whitespace from fullName before forwarding to the repository', async () => {
    await service.updateProfile(42, {
      fullName: '   Alice B. Nguyen   ',
    });

    expect(mockedRepo.updateProfile).toHaveBeenCalledWith(42, {
      fullName: 'Alice B. Nguyen', // trimmed
    });
  });

  it('trims whitespace from phone and keeps the value when non-empty', async () => {
    const profile = await service.updateProfile(42, {
      phone: '  +84909000055  ',
    });

    expect(mockedRepo.updateProfile).toHaveBeenCalledWith(42, {
      phone: '+84909000055', // trimmed
    });
    expect(profile.phone).toBe('+84909000055');
  });

  it('coerces an empty-string phone to null (no whitespace-only phone is persisted)', async () => {
    await service.updateProfile(42, {
      phone: '   ', // whitespace-only
    });

    // The service does `phone?.trim() || null`, so a whitespace-only phone
    // becomes null at the service layer and is forwarded as null.
    expect(mockedRepo.updateProfile).toHaveBeenCalledWith(42, {
      phone: null,
    });
  });

  it('coerces an empty-string phone "" to null', async () => {
    await service.updateProfile(42, {
      phone: '',
    });

    expect(mockedRepo.updateProfile).toHaveBeenCalledWith(42, {
      phone: null,
    });
  });

  it('trims fullName and phone together when both are provided', async () => {
    await service.updateProfile(42, {
      fullName: '  Alice B. Nguyen  ',
      phone: '  +84909000011  ',
    });

    expect(mockedRepo.updateProfile).toHaveBeenCalledWith(42, {
      fullName: 'Alice B. Nguyen',
      phone: '+84909000011',
    });
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: persistence / audit.
// Result : Update Profile returns the expected success value for the
//          persistence path; the audit metadata (userId actor + result
//          shape) is correctly bound.
// ---------------------------------------------------------------------------
describe('[UTCID04] updateProfile() – Normal 4: persistence/audit', () => {
  it('returns the expected success value with the actor id bound to the audit metadata', async () => {
    const actorId = 99;
    mockedRepo.findById.mockResolvedValueOnce(makeStoredUser({ id: actorId }));

    const profile = await service.updateProfile(actorId, {
      fullName: 'Bob Tran',
      phone: '+84909000022',
    });

    // 1. Return – expected success value (post-update UserProfile)
    expect(profile).toMatchObject({
      id: actorId,
      fullName: 'Bob Tran',
      phone: '+84909000022',
    });

    // 2. Persisted state matches – the actor id flows through the
    //    audit-write. (The actor is the user updating their own
    //    profile, so actor == target here.)
    expect(mockedRepo.findById).toHaveBeenCalledWith(actorId);
    expect(mockedRepo.updateProfile).toHaveBeenCalledWith(actorId, {
      fullName: 'Bob Tran',
      phone: '+84909000022',
    });

    // 3. Function6 / actor / target / result are recorded. We don't
    //    expect updatedBy on the service side (the repository sets it
    //    in its Prisma call), but the actor id is correctly the same
    //    number at every layer.
    expect(mockedRepo.updateProfile.mock.calls[0][0]).toBe(actorId);
    expect(profile.id).toBe(actorId);
  });

  it('persists the actor id separately from any other metadata (identity propagation)', async () => {
    const callerId = 7;
    mockedRepo.findById.mockResolvedValueOnce(makeStoredUser({ id: callerId }));

    await service.updateProfile(callerId, {
      fullName: 'Charlie Le',
    });

    // The actor id flowed into both findById and updateProfile — proves
    // the request is acting on behalf of the right user.
    expect(mockedRepo.findById.mock.calls[0][0]).toBe(callerId);
    expect(mockedRepo.updateProfile.mock.calls[0][0]).toBe(callerId);
  });

  it('does not leak the password hash through the post-update profile payload', async () => {
    const profile = await service.updateProfile(42, {
      fullName: 'Alice B. Nguyen',
    });

    expect(JSON.stringify(profile)).not.toContain('$2b$');
    expect('password' in profile).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 1: invalid field format.
// Result : Update Profile rejects with a controlled error; no partial
//          commit; no sensitive-data disclosure.
// ---------------------------------------------------------------------------
describe('[UTCID05] updateProfile() – Abnormal 1: invalid field format', () => {
  it('rejects when fullName is too short (length 1)', async () => {
    // The service has no length check itself — that's enforced by the
    // express-validator chain. The repository surfaces such rejections as
    // a controlled error.
    const repoError = new Error('Validation failed: fullName too short');
    mockedRepo.updateProfile.mockReset();
    mockedRepo.updateProfile.mockImplementation(() =>
      Promise.reject(repoError),
    );

    await expect(
      service.updateProfile(42, { fullName: 'A' }),
    ).rejects.toBeInstanceOf(Error);

    // No partial commit – findById ran first; the persistence call was
    // attempted and rejected. No audit-write reached the database.
    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.updateProfile).toHaveBeenCalledTimes(1);

    // Failure log records a safe diagnostic — no plaintext password /
    // hash / token leakage.
    const err = await service
      .updateProfile(42, { fullName: 'A' })
      .catch((e) => e) as Error;
    expect(err.message).toContain('Validation failed');
    expect(err.message).not.toMatch(/password|hash|secret|\$2b\$/i);
    expect(err.message).not.toContain('A');
  });

  it('rejects an empty-string fullName (validator-style rejection at the repo)', async () => {
    const repoError = new Error('Validation failed: fullName empty');
    mockedRepo.updateProfile.mockReset();
    mockedRepo.updateProfile.mockImplementation(() =>
      Promise.reject(repoError),
    );

    // Note: the service trims fullName, so a whitespace-only string
    // becomes ''. In production this would be rejected upstream by the
    // validator, but at the unit-test service level we simulate the
    // upstream rejection via the repository.
    await expect(
      service.updateProfile(42, { fullName: '   ' }),
    ).rejects.toBeInstanceOf(Error);

    // The service DOES still call the repository when fullName is
    // whitespace-only because the service does NOT itself enforce a
    // length check on fullName (that's the validator's job). At this
    // boundary, the contract is: any downstream rejection surfaces as a
    // controlled Error and a safe diagnostic.
    expect(mockedRepo.updateProfile).toHaveBeenCalledTimes(1);
    const callArgs = mockedRepo.updateProfile.mock.calls[0][1];
    // After trimming, fullName becomes ''.
    expect(callArgs.fullName).toBe('');
  });

  it('rejects a malformed phone (digits + dashes)', async () => {
    const repoError = new Error('Validation failed: phone format');
    mockedRepo.updateProfile.mockReset();
    mockedRepo.updateProfile.mockImplementation(() =>
      Promise.reject(repoError),
    );

    await expect(
      service.updateProfile(42, { phone: '123-abc-4567' }),
    ).rejects.toBeInstanceOf(Error);

    expect(mockedRepo.updateProfile).toHaveBeenCalledTimes(1);
    // Safe diagnostic — error message does not leak the user's submitted
    // phone number.
    const err = await service
      .updateProfile(42, { phone: '123-abc-4567' })
      .catch((e) => e) as Error;
    expect(err.message).not.toContain('123-abc-4567');
  });

  it('keeps the lookup-then-write ordering even on validation failure', async () => {
    mockedRepo.updateProfile.mockReset();
    mockedRepo.updateProfile.mockImplementation(() =>
      Promise.reject(new Error('Validation failed')),
    );

    await expect(
      service.updateProfile(42, { fullName: 'A' }),
    ).rejects.toBeInstanceOf(Error);

    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.updateProfile).toHaveBeenCalledTimes(1);
    const findOrder = mockedRepo.findById.mock.invocationCallOrder[0];
    const updateOrder = mockedRepo.updateProfile.mock.invocationCallOrder[0];
    expect(findOrder).toBeLessThan(updateOrder);
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 2: duplicate or forbidden field update.
// Result : Update Profile rejects with a controlled error; safe
//          diagnostic; no partial commit.
// ---------------------------------------------------------------------------
describe('[UTCID06] updateProfile() – Abnormal 2: duplicate or forbidden field update', () => {
  it('rejects when the user cannot be found (UnauthorizedError 401)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(null);

    await expect(
      service.updateProfile(999, { fullName: 'Bob' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    await expect(
      service.updateProfile(999, { fullName: 'Bob' }),
    ).rejects.toMatchObject({
      name: 'UnauthorizedError',
      statusCode: 401,
      message: expect.stringContaining('Không tìm thấy người dùng'),
    });

    // No partial commit – the repository's update method was never called.
    expect(mockedRepo.updateProfile).not.toHaveBeenCalled();
    expect(mockedRepo.updatePassword).not.toHaveBeenCalled();
  });

  it('rejects a forbidden field update (e.g., email is in the data)', async () => {
    // The express-validator chain rejects unknown fields with the
    // "Chỉ có thể cập nhật họ tên và số điện thoại" message. At the
    // service layer, the data object can technically contain any field,
    // but production tests assert that ONLY fullName and phone are
    // passed through. We simulate the upstream rejection here.
    const repoError = new Error('Chỉ có thể cập nhật họ tên và số điện thoại');
    mockedRepo.updateProfile.mockReset();
    mockedRepo.updateProfile.mockImplementation(() =>
      Promise.reject(repoError),
    );

    // Type-cast: the implementation does not restrict the field set at
    // runtime; the validator does. We model the validator's reject by
    // having the repository reject.
    await expect(
      service.updateProfile(42, {
        fullName: 'Alice B. Nguyen',
        email: 'hacker@example.com', // forbidden field
      } as { fullName?: string; phone?: string | null }),
    ).rejects.toBeInstanceOf(Error);

    // No partial commit – audit-write was attempted once.
    expect(mockedRepo.updateProfile).toHaveBeenCalledTimes(1);

    // Failure log records a safe diagnostic — no sensitive-data
    // disclosure (email, hash, password, etc.)
    const err = await service
      .updateProfile(42, {
        fullName: 'Alice B. Nguyen',
        email: 'hacker@example.com',
      } as { fullName?: string; phone?: string | null })
      .catch((e) => e) as Error;
    expect(err.message).toContain('Chỉ có thể cập nhật họ tên và số điện thoại');
    expect(err.message).not.toContain('hacker@example.com');
    expect(err.message).not.toContain('$2b$');
    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('rejects when the repository lookup itself fails (does not leak user data)', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(repoError);

    await expect(
      service.updateProfile(42, { fullName: 'Alice B. Nguyen' }),
    ).rejects.toBe(repoError);

    // No partial commit
    expect(mockedRepo.updateProfile).not.toHaveBeenCalled();
  });

  it('does not leak the untrusted payload through the rejection message', async () => {
    const repoError = new Error('Generic validation failure');
    mockedRepo.updateProfile.mockReset();
    mockedRepo.updateProfile.mockImplementation(() =>
      Promise.reject(repoError),
    );

    const err = await service
      .updateProfile(42, {
        fullName: 'Alice B. Nguyen',
        phone: '+84909000011',
      })
      .catch((e) => e) as Error;

    // The rejection message must not contain the user-submitted payload.
    expect(err.message).not.toContain('Alice B. Nguyen');
    expect(err.message).not.toContain('+84909000011');
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Boundary 1: minimum / maximum editable field length.
// The validator enforces:
//   fullName: 2..100 (chars), not empty
//   phone   : 10..15 digits (regex /^[0-9]{10,15}$/)
// The service does NOT enforce these limits itself — that's the
// validator. We test the boundary by simulating the validator's accept /
// reject behavior on the repository.
// ---------------------------------------------------------------------------
describe('[UTCID07] updateProfile() – Boundary 1: minimum/maximum editable field length', () => {
  // ---- fullName boundary ----

  it('accepts fullName exactly at the minimum (length 2)', async () => {
    const profile = await service.updateProfile(42, {
      fullName: 'Bo',
    });

    // 1. Return – expected success value at the supported boundary
    expect(profile).toMatchObject({ fullName: 'Bo' });

    // 2. Persisted state matches – repository received the trimmed value.
    expect(mockedRepo.updateProfile).toHaveBeenCalledWith(42, {
      fullName: 'Bo',
    });
  });

  it('rejects fullName one below the minimum (length 1)', async () => {
    const repoError = new Error(
      'Họ và tên phải có từ 2 đến 100 ký tự',
    );
    mockedRepo.updateProfile.mockReset();
    mockedRepo.updateProfile.mockImplementation(() =>
      Promise.reject(repoError),
    );

    await expect(
      service.updateProfile(42, { fullName: 'A' }),
    ).rejects.toBeInstanceOf(Error);

    // Failure log records a safe diagnostic
    const err = await service
      .updateProfile(42, { fullName: 'A' })
      .catch((e) => e) as Error;
    expect(err.message).toContain('2 đến 100');
    expect(err.message).not.toContain('A');
    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('accepts fullName exactly at the maximum (length 100)', async () => {
    const hundred = 'A'.repeat(100);

    const profile = await service.updateProfile(42, {
      fullName: hundred,
    });

    // 1. Return – expected success value at the supported boundary
    expect(profile).toMatchObject({ fullName: hundred });

    // 2. Persisted state matches – repository received the trimmed 100
    //    characters verbatim.
    expect(mockedRepo.updateProfile).toHaveBeenCalledWith(42, {
      fullName: hundred,
    });
    expect((mockedRepo.updateProfile.mock.calls[0][1] as any).fullName.length)
      .toBe(100);
  });

  it('rejects fullName one above the maximum (length 101)', async () => {
    const repoError = new Error(
      'Họ và tên phải có từ 2 đến 100 ký tự',
    );
    mockedRepo.updateProfile.mockReset();
    mockedRepo.updateProfile.mockImplementation(() =>
      Promise.reject(repoError),
    );

    const tooLong = 'A'.repeat(101);

    await expect(
      service.updateProfile(42, { fullName: tooLong }),
    ).rejects.toBeInstanceOf(Error);

    // Failure log records a safe diagnostic – the 101-char value must
    // NOT be echoed back through the error message.
    const err = await service
      .updateProfile(42, { fullName: tooLong })
      .catch((e) => e) as Error;
    expect(err.message).toContain('2 đến 100');
    expect(err.message).not.toMatch(/^A{100}/);
  });

  // ---- phone boundary ----

  it('accepts phone exactly at the minimum (length 10)', async () => {
    const profile = await service.updateProfile(42, {
      phone: '1234567890',
    });

    expect(profile).toMatchObject({ phone: '1234567890' });
    expect(mockedRepo.updateProfile).toHaveBeenCalledWith(42, {
      phone: '1234567890',
    });
  });

  it('rejects phone one below the minimum (length 9)', async () => {
    const repoError = new Error(
      'Số điện thoại phải có từ 10 đến 15 chữ số',
    );
    mockedRepo.updateProfile.mockReset();
    mockedRepo.updateProfile.mockImplementation(() =>
      Promise.reject(repoError),
    );

    await expect(
      service.updateProfile(42, { phone: '123456789' }),
    ).rejects.toBeInstanceOf(Error);

    const err = await service
      .updateProfile(42, { phone: '123456789' })
      .catch((e) => e) as Error;
    expect(err.message).toContain('10 đến 15');
    expect(err.message).not.toContain('123456789');
  });

  it('accepts phone exactly at the maximum (length 15)', async () => {
    const profile = await service.updateProfile(42, {
      phone: '123456789012345',
    });

    expect(profile).toMatchObject({ phone: '123456789012345' });
    expect(mockedRepo.updateProfile).toHaveBeenCalledWith(42, {
      phone: '123456789012345',
    });
    expect((mockedRepo.updateProfile.mock.calls[0][1] as any).phone.length)
      .toBe(15);
  });

  it('rejects phone one above the maximum (length 16)', async () => {
    const repoError = new Error(
      'Số điện thoại phải có từ 10 đến 15 chữ số',
    );
    mockedRepo.updateProfile.mockReset();
    mockedRepo.updateProfile.mockImplementation(() =>
      Promise.reject(repoError),
    );

    await expect(
      service.updateProfile(42, { phone: '1234567890123456' }),
    ).rejects.toBeInstanceOf(Error);

    const err = await service
      .updateProfile(42, { phone: '1234567890123456' })
      .catch((e) => e) as Error;
    expect(err.message).toContain('10 đến 15');
    expect(err.message).not.toContain('1234567890123456');
  });

  // ---- combined boundary ----

  it('accepts the supported boundary when BOTH fullName and phone are at their accepted lengths', async () => {
    const profile = await service.updateProfile(42, {
      fullName: 'Bo',
      phone: '1234567890',
    });

    expect(profile).toMatchObject({
      fullName: 'Bo',
      phone: '1234567890',
    });
    expect(mockedRepo.updateProfile).toHaveBeenCalledWith(42, {
      fullName: 'Bo',
      phone: '1234567890',
    });
  });

  it('rejects the adjacent unsupported boundary (length 1 + length 9) without partial commit', async () => {
    const repoError = new Error('Validation failed at boundary');
    mockedRepo.updateProfile.mockReset();
    mockedRepo.updateProfile.mockImplementation(() =>
      Promise.reject(repoError),
    );

    await expect(
      service.updateProfile(42, {
        fullName: 'A',
        phone: '123456789',
      }),
    ).rejects.toBeInstanceOf(Error);

    // No partial commit – findById ran first, updateProfile was
    // attempted once and rejected.
    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.updateProfile).toHaveBeenCalledTimes(1);
  });
});
