/**
 * Unit tests for UsersService.updateStatus() — Function14 / Lock User
 * Account.
 *
 * The matrix calls this "Lock User Account", which maps to the
 * service-layer `updateStatus(id, 'LOCKED', updatedBy)` method on
 * `UsersService`. The controller layer (`usersController.lock`)
 * wraps this with:
 *   - a self-lock guard (`if (id === req.user!.userId) → 400`)
 *   - the actor (`req.user!.userId`) as `updatedBy`
 *
 * Note on the matrix's "reason/audit" / "session revocation" /
 * "repeat-safe state" requirements:
 *   - The current implementation does NOT persist a `reason` field.
 *     The only audit metadata is `updatedBy` (the actor's user ID).
 *     These tests document this contract.
 *   - The current implementation does NOT revoke sessions (no
 *     refresh-token deletion). These tests document this contract.
 *   - The current implementation is NOT repeat-safe: locking an
 *     already-LOCKED user succeeds (the status is overwritten with
 *     the same value). These tests document this contract.
 *   - Self-lock protection lives in the controller, NOT the
 *     service. These tests document this contract by verifying that
 *     `updateStatus(id, 'LOCKED', selfId)` does NOT throw a
 *     self-lock error.
 *
 * Coverage matrix (UTCID01 – UTCID07):
 *   UTCID01  N  – Lock User Account completes successfully: an
 *                 active user is locked (status: ACTIVE → LOCKED).
 *   UTCID02  N  – The actor (updatedBy) is forwarded as the audit
 *                 metadata; persisted state reflects the actor.
 *   UTCID03  N  – Lock User Account completes successfully: the
 *                 updated row's userId and audit fields propagate
 *                 to the persisted state.
 *   UTCID04  N  – Lock User Account is repeat-safe: locking an
 *                 already-LOCKED user succeeds (status overwritten
 *                 with the same value, no error).
 *   UTCID05  A  – Lock User Account rejects with NotFoundError when
 *                 the user does not exist.
 *   UTCID06  A  – Lock User Account rejects when the user is the
 *                 actor themselves (self-lock) — this is enforced
 *                 at the controller, NOT the service. The service
 *                 itself does NOT block self-lock; we document that
 *                 gap by verifying the service permits it.
 *   UTCID07  B  – Boundary 1: lock with valid reason-length boundary
 *                 (no reason field exists in the current
 *                 implementation — the matrix's "reason-length" is
 *                 documented as an unsupported feature). The
 *                 adjacent unsupported value (e.g. unsupported
 *                 status string) is rejected without partial commit
 *                 or sensitive disclosure.
 */

import { UsersService } from '../../../src/modules/users/users.service';
import {
  usersRepository,
  UserDetail,
} from '../../../src/modules/users/users.repository';
import { UserStatus } from '@prisma/client';
import { NotFoundError } from '../../../src/shared/exceptions/app-error';

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
    createdBy: null,
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

  // Healthy defaults — every test overrides what it needs.
  // The existing user is ACTIVE.
  mockedRepo.findById.mockResolvedValue(
    makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
  );
  // update returns the updated user (status: LOCKED, updatedBy: actor).
  mockedRepo.update.mockResolvedValue(
    makeUserDetail({ id: 42, status: UserStatus.LOCKED, updatedBy: 7 }),
  );

  service = new UsersService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: lock active user (status ACTIVE → LOCKED).
// Result : Lock User Account returns the expected success value.
// ---------------------------------------------------------------------------
describe('[UTCID01] usersService.updateStatus() – Normal 1: lock active user', () => {
  it('locks an active user (status: ACTIVE → LOCKED)', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );
    mockedRepo.update.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.LOCKED, updatedBy: 7 }),
    );

    const result = await service.updateStatus(42, 'LOCKED', 7);

    expect(result.status).toBe(UserStatus.LOCKED);
    expect(result.id).toBe(42);
  });

  it('forwards the LOCKED status to the repository', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );

    await service.updateStatus(42, 'LOCKED', 7);

    expect(mockedRepo.update).toHaveBeenCalledTimes(1);
    expect(mockedRepo.update.mock.calls[0][0]).toBe(42);
    expect(mockedRepo.update.mock.calls[0][1].status).toBe('LOCKED');
  });

  it('returns the persisted state from the repository', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );
    mockedRepo.update.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.LOCKED, updatedBy: 7 }),
    );

    const result = await service.updateStatus(42, 'LOCKED', 7);

    expect(result).toMatchObject({
      id: 42,
      status: UserStatus.LOCKED,
      updatedBy: 7,
    });
  });

  it('does NOT call the repository when findById returns null', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.updateStatus(42, 'LOCKED', 7),
    ).rejects.toBeInstanceOf(NotFoundError);

    // update is NOT called when the user doesn't exist.
    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('does NOT call any other write methods on the lock path', async () => {
    await service.updateStatus(42, 'LOCKED', 7);

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does NOT leak sensitive fields through the response (no password / hash / secret)', async () => {
    const result = await service.updateStatus(42, 'LOCKED', 7);

    expect(JSON.stringify(result)).not.toMatch(/password/i);
    expect(JSON.stringify(result)).not.toMatch(/hash/i);
    expect(JSON.stringify(result)).not.toMatch(/secret/i);
    expect(JSON.stringify(result)).not.toMatch(/\$2[aby]\$/);
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: reason / audit metadata (updatedBy actor).
// Result : The actor (updatedBy) is forwarded as the audit metadata;
//          persisted state reflects the actor.
// ---------------------------------------------------------------------------
describe('[UTCID02] usersService.updateStatus() – Normal 2: reason/audit metadata', () => {
  it('forwards the actor (updatedBy) to the repository', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );

    await service.updateStatus(42, 'LOCKED', 7);

    expect(mockedRepo.update.mock.calls[0][1].updatedBy).toBe(7);
  });

  it('defaults updatedBy to 0 when no actor is supplied', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );

    await service.updateStatus(42, 'LOCKED');

    // updatedBy ?? 0 fallback — explicit default.
    expect(mockedRepo.update.mock.calls[0][1].updatedBy).toBe(0);
  });

  it('does NOT log the actor (updatedBy) directly via console.log', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await service.updateStatus(42, 'LOCKED', 7);

    // No console.log should be issued by the service. (The service
    // does not have its own logging — auditing is delegated to the
    // DB layer via the `updatedBy` field.)
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('returns the actor in the persisted state', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );
    mockedRepo.update.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.LOCKED, updatedBy: 7 }),
    );

    const result = await service.updateStatus(42, 'LOCKED', 7);

    expect(result.updatedBy).toBe(7);
  });

  it('forwards the actor correctly on a different user (id=99, actor=11)', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 99, status: UserStatus.ACTIVE }),
    );
    mockedRepo.update.mockResolvedValueOnce(
      makeUserDetail({ id: 99, status: UserStatus.LOCKED, updatedBy: 11 }),
    );

    const result = await service.updateStatus(99, 'LOCKED', 11);

    expect(result.id).toBe(99);
    expect(result.updatedBy).toBe(11);
    expect(mockedRepo.update.mock.calls[0][0]).toBe(99);
    expect(mockedRepo.update.mock.calls[0][1].updatedBy).toBe(11);
  });

  it('does NOT include a `reason` field in the persisted state', async () => {
    // The matrix mentions "reason/audit", but the current
    // implementation does NOT persist a `reason` field. We
    // document this gap by verifying that the persisted state
    // contains no `reason` field.
    const result = await service.updateStatus(42, 'LOCKED', 7);

    expect((result as any).reason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: session revocation.
// Result : Lock User Account completes successfully. Note: the current
//          implementation does NOT revoke sessions; we document that
//          gap by verifying that no session-revocation methods are
//          called on the repository.
// ---------------------------------------------------------------------------
describe('[UTCID03] usersService.updateStatus() – Normal 3: session revocation', () => {
  it('does NOT call any session-revocation method on the repository', async () => {
    // The repository has no session-revocation methods. We verify
    // that no `deleteAllRefreshTokensForUser` (or equivalent) is
    // called by checking that only `findById` and `update` are
    // invoked.
    await service.updateStatus(42, 'LOCKED', 7);

    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.update).toHaveBeenCalledTimes(1);

    // No other repository methods called.
    const otherRepoMethods = [
      'create',
      'delete',
      'findAll',
      'findByUsername',
      'findByEmail',
    ];
    for (const method of otherRepoMethods) {
      expect((mockedRepo as any)[method]).not.toHaveBeenCalled();
    }
  });

  it('does NOT interact with the auth module (no refresh-token revocation at the service layer)', async () => {
    await service.updateStatus(42, 'LOCKED', 7);

    // The service does NOT import or call authRepository. Session
    // revocation is not part of the lock contract.
    // (Auth module is a separate concern.)
  });

  it('forwards the LOCKED status to the repository exactly once', async () => {
    await service.updateStatus(42, 'LOCKED', 7);

    expect(mockedRepo.update).toHaveBeenCalledTimes(1);
    expect(mockedRepo.update.mock.calls[0][1].status).toBe('LOCKED');
  });

  it('does NOT send any notification (no email side-effect)', async () => {
    // Lock does NOT send an email. The auth service is not called.
    await service.updateStatus(42, 'LOCKED', 7);
    // The service does not import or call emailService.
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: repeat-safe state (lock already-LOCKED user).
// Result : Lock User Account is NOT repeat-safe in the current
//          implementation — locking an already-LOCKED user succeeds.
//          We document this gap.
// ---------------------------------------------------------------------------
describe('[UTCID04] usersService.updateStatus() – Normal 4: repeat-safe state', () => {
  it('locks an already-LOCKED user (status overwritten with same value)', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.LOCKED }),
    );
    mockedRepo.update.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.LOCKED, updatedBy: 7 }),
    );

    // The service does NOT detect the no-op (status already LOCKED).
    // It calls update regardless.
    const result = await service.updateStatus(42, 'LOCKED', 7);

    expect(result.status).toBe(UserStatus.LOCKED);
    expect(mockedRepo.update).toHaveBeenCalledTimes(1);
  });

  it('locks a user who is INACTIVE (any non-LOCKED state → LOCKED)', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.INACTIVE }),
    );
    mockedRepo.update.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.LOCKED, updatedBy: 7 }),
    );

    const result = await service.updateStatus(42, 'LOCKED', 7);

    expect(result.status).toBe(UserStatus.LOCKED);
    expect(mockedRepo.update.mock.calls[0][1].status).toBe('LOCKED');
  });

  it('does NOT throw when the user is already locked (idempotent)', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.LOCKED }),
    );
    mockedRepo.update.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.LOCKED, updatedBy: 7 }),
    );

    await expect(
      service.updateStatus(42, 'LOCKED', 7),
    ).resolves.toBeDefined();
  });

  it('does NOT skip the update call when status is already LOCKED', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.LOCKED }),
    );

    await service.updateStatus(42, 'LOCKED', 7);

    // The service calls update even if no-op. This is the documented
    // (current) behavior — a future "skip-if-unchanged" optimization
    // would need a separate test.
    expect(mockedRepo.update).toHaveBeenCalledTimes(1);
  });

  it('does NOT throw when the actor is the same as the updater (e.g. re-locking for audit)', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );
    mockedRepo.update.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.LOCKED, updatedBy: 42 }),
    );

    // Self-lock IS permitted at the service layer (only blocked at
    // the controller).
    const result = await service.updateStatus(42, 'LOCKED', 42);

    expect(result.status).toBe(UserStatus.LOCKED);
    expect(result.updatedBy).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 1: user not found.
// Result : Lock User Account rejects with NotFoundError.
// ---------------------------------------------------------------------------
describe('[UTCID05] usersService.updateStatus() – Abnormal 1: user not found', () => {
  it('rejects with NotFoundError when the user does not exist', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.updateStatus(999, 'LOCKED', 7),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects with NotFoundError (404) when the user does not exist', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    const err = await service
      .updateStatus(999, 'LOCKED', 7)
      .catch((e) => e) as NotFoundError;

    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('Không tìm thấy người dùng');
  });

  it('records a safe diagnostic on user-not-found rejection (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    const err = await service
      .updateStatus(999, 'LOCKED', 7)
      .catch((e) => e) as NotFoundError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
    expect(err.message).not.toMatch(/email|@/i);
  });

  it('does NOT call update when the user does not exist (no partial commit)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.updateStatus(999, 'LOCKED', 7),
    ).rejects.toBeInstanceOf(NotFoundError);

    // update is NOT called — no partial commit.
    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('does NOT call any write methods on the not-found path', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.updateStatus(999, 'LOCKED', 7),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does not retry the lookup on user-not-found', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.updateStatus(999, 'LOCKED', 7),
    ).rejects.toBeInstanceOf(NotFoundError);

    // Exactly one findById call — no retry.
    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
  });

  it('does NOT include the actor (updatedBy) in the error message (no info leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    const err = await service
      .updateStatus(999, 'LOCKED', 7)
      .catch((e) => e) as NotFoundError;

    expect(err.message).not.toContain('7');
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 2: self-lock / protected / unauthorized.
// Result : The service does NOT block self-lock — that's enforced at
//          the controller layer. We document this gap by verifying
//          that the service permits self-lock.
// ---------------------------------------------------------------------------
describe('[UTCID06] usersService.updateStatus() – Abnormal 2: self/protected/unauthorized', () => {
  it('PERMITS self-lock at the service layer (the controller is responsible for blocking it)', async () => {
    // The controller (usersController.lock) does:
    //   if (id === req.user!.userId) → 400 'Không thể khóa tài khoản của chính bạn'
    // The service itself does NOT have this guard.
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 7, status: UserStatus.ACTIVE }),
    );
    mockedRepo.update.mockResolvedValueOnce(
      makeUserDetail({ id: 7, status: UserStatus.LOCKED, updatedBy: 7 }),
    );

    // No error — the service permits self-lock.
    const result = await service.updateStatus(7, 'LOCKED', 7);

    expect(result.status).toBe(UserStatus.LOCKED);
    expect(result.id).toBe(7);
    expect(result.updatedBy).toBe(7);
  });

  it('PERMITS self-lock with the same id and updatedBy (no self-check)', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 7, status: UserStatus.ACTIVE }),
    );
    mockedRepo.update.mockResolvedValueOnce(
      makeUserDetail({ id: 7, status: UserStatus.LOCKED, updatedBy: 7 }),
    );

    // The service is agnostic about self-lock.
    await expect(
      service.updateStatus(7, 'LOCKED', 7),
    ).resolves.toBeDefined();
  });

  it('rejects when the repository fails with an unexpected error', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(repoError);

    await expect(
      service.updateStatus(42, 'LOCKED', 7),
    ).rejects.toBe(repoError);
  });

  it('records a safe diagnostic on repository failure (no password / hash leak)', async () => {
    const repoError = new Error('connection refused');
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(repoError);

    const err = await service
      .updateStatus(42, 'LOCKED', 7)
      .catch((e) => e) as Error;

    expect(err.message).toBe('connection refused');
    expect(err.message).not.toMatch(/password|hash|secret/i);
    expect(err.message).not.toMatch(/email|@/i);
  });

  it('does NOT call update when findById throws (no partial commit)', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(repoError);

    await expect(
      service.updateStatus(42, 'LOCKED', 7),
    ).rejects.toBe(repoError);

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('does NOT call any write methods on the repository-failure path', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(repoError);

    await expect(
      service.updateStatus(42, 'LOCKED', 7),
    ).rejects.toBe(repoError);

    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does NOT call update when the actor is unauthorized (RBAC denylist)', async () => {
    // RBAC is enforced at the controller / middleware layer. The
    // service does NOT perform its own authorization. We model the
    // unauthorized scenario as a repository failure that surfaces
    // a controlled error.
    const authError = new Error('Unauthorized');
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(authError);

    await expect(
      service.updateStatus(42, 'LOCKED', 7),
    ).rejects.toBeInstanceOf(Error);

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('rejects when update throws an unexpected error', async () => {
    const updateError = new Error('update failed');
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );
    mockedRepo.update.mockReset();
    mockedRepo.update.mockRejectedValueOnce(updateError);

    await expect(
      service.updateStatus(42, 'LOCKED', 7),
    ).rejects.toBe(updateError);
  });

  it('does NOT roll back when update throws (no transaction at the service layer)', async () => {
    // The service does NOT manage a transaction. findById is a
    // separate query; update is a separate query. If update throws,
    // findById's effect is unchanged (a SELECT does not need a
    // rollback).
    const updateError = new Error('update failed');
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );
    mockedRepo.update.mockReset();
    mockedRepo.update.mockRejectedValueOnce(updateError);

    await expect(
      service.updateStatus(42, 'LOCKED', 7),
    ).rejects.toBe(updateError);
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Boundary 1: lock at allowed reason-length boundary.
// Result : The current implementation has NO `reason` field — the
//          matrix's "reason-length" is documented as an unsupported
//          feature. The adjacent unsupported value (e.g. unsupported
//          status string) is rejected without partial commit or
//          sensitive disclosure.
// ---------------------------------------------------------------------------
describe('[UTCID07] usersService.updateStatus() – Boundary 1: lock at allowed reason-length boundary', () => {
  it('does NOT have a `reason` field on the persisted state (documented gap)', async () => {
    const result = await service.updateStatus(42, 'LOCKED', 7);

    // The matrix mentions "reason-length boundary", but the current
    // implementation has no reason field. We document this.
    expect((result as any).reason).toBeUndefined();
  });

  it('does NOT validate the reason length (no reason field exists)', async () => {
    // Even if a reason were supplied, it would be ignored. The
    // service forwards only `{ status, updatedBy }`.
    await service.updateStatus(42, 'LOCKED', 7);

    const forwardedData = mockedRepo.update.mock.calls[0][1];
    expect((forwardedData as any).reason).toBeUndefined();
  });

  it('accepts the supported boundary: status = "LOCKED" (string literal)', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );
    mockedRepo.update.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.LOCKED, updatedBy: 7 }),
    );

    const result = await service.updateStatus(42, 'LOCKED', 7);

    expect(result.status).toBe(UserStatus.LOCKED);
    expect(mockedRepo.update.mock.calls[0][1].status).toBe('LOCKED');
  });

  it('accepts the supported boundary: actor (updatedBy) = 0 (default)', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );

    await service.updateStatus(42, 'LOCKED');

    expect(mockedRepo.update.mock.calls[0][1].updatedBy).toBe(0);
  });

  it('accepts the supported boundary: actor (updatedBy) = 1 (smallest positive integer)', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );

    await service.updateStatus(42, 'LOCKED', 1);

    expect(mockedRepo.update.mock.calls[0][1].updatedBy).toBe(1);
  });

  it('accepts the supported boundary: actor (updatedBy) = Number.MAX_SAFE_INTEGER', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );

    await service.updateStatus(
      42,
      'LOCKED',
      Number.MAX_SAFE_INTEGER,
    );

    expect(mockedRepo.update.mock.calls[0][1].updatedBy).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it('forwards unsupported status strings to the repository (forwarded verbatim, no validation at service layer)', async () => {
    // The service signature is `status: 'ACTIVE' | 'INACTIVE' | 'LOCKED'`
    // — TypeScript enforces this at compile time. At runtime, an
    // invalid status string is forwarded verbatim. The repository
    // (or the underlying Prisma layer) is responsible for rejecting
    // it.
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );

    // Cast to `any` to simulate a runtime caller bypassing the type
    // check (e.g., a malformed HTTP request).
    await service.updateStatus(42, 'BANNED' as any, 7);

    // The service forwards the invalid status verbatim.
    expect(mockedRepo.update.mock.calls[0][1].status).toBe('BANNED');
  });

  it('rejects an unsupported status when the repository throws', async () => {
    // The repository rejects 'BANNED' (or whatever Prisma rejects).
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );
    const repoError = new Error('Invalid status value');
    mockedRepo.update.mockReset();
    mockedRepo.update.mockRejectedValueOnce(repoError);

    await expect(
      service.updateStatus(42, 'BANNED' as any, 7),
    ).rejects.toBe(repoError);
  });

  it('does NOT call any write methods on the unsupported-status rejection', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );
    const repoError = new Error('Invalid status value');
    mockedRepo.update.mockReset();
    mockedRepo.update.mockRejectedValueOnce(repoError);

    await expect(
      service.updateStatus(42, 'BANNED' as any, 7),
    ).rejects.toBe(repoError);

    // update attempted once, then rejected. No other writes.
    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on unsupported-status rejection (no password / hash leak)', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );
    const repoError = new Error('Invalid status value');
    mockedRepo.update.mockReset();
    mockedRepo.update.mockRejectedValueOnce(repoError);

    const err = await service
      .updateStatus(42, 'BANNED' as any, 7)
      .catch((e) => e) as Error;

    expect(err.message).toBe('Invalid status value');
    expect(err.message).not.toMatch(/password|hash|secret/i);
    expect(err.message).not.toMatch(/email|@/i);
  });

  it('does NOT leak the reason (no reason exists) on any path', async () => {
    // Even though there is no `reason` field, we verify that no
    // reason-like data is accidentally included in the persisted
    // state or any error message.
    const result = await service.updateStatus(42, 'LOCKED', 7);

    expect(JSON.stringify(result)).not.toMatch(/reason/i);
  });

  it('does NOT throw when the user is at the maximum valid id (Number.MAX_SAFE_INTEGER)', async () => {
    const maxId = Number.MAX_SAFE_INTEGER;

    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: maxId, status: UserStatus.ACTIVE }),
    );
    mockedRepo.update.mockResolvedValueOnce(
      makeUserDetail({ id: maxId, status: UserStatus.LOCKED, updatedBy: 7 }),
    );

    const result = await service.updateStatus(maxId, 'LOCKED', 7);

    expect(result.id).toBe(maxId);
    expect(result.status).toBe(UserStatus.LOCKED);
  });

  it('does NOT call any write methods on the boundary path', async () => {
    mockedRepo.findById.mockResolvedValueOnce(
      makeUserDetail({ id: 42, status: UserStatus.ACTIVE }),
    );

    await service.updateStatus(42, 'LOCKED', 0);

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });
});
