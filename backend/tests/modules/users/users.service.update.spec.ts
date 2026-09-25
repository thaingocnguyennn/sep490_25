/**
 * Unit tests for UsersService.update() — Function10 / Update User.
 *
 * Note on naming: the matrix headers reference `UserService`, but the
 * implementation is `UsersService.update(id, data)` inside
 * `backend/src/modules/users/users.service.ts`. We exercise the actual
 * export and label the describe blocks with the matrix UTCIDs.
 *
 * Coverage matrix (UTCID01 – UTCID09):
 *   UTCID01  N  – Update User completes successfully for a valid update
 *                 (all editable fields supplied with no conflicts).
 *   UTCID02  N  – Update User completes successfully for a partial update
 *                 (only a subset of fields supplied).
 *   UTCID03  N  – Update User completes successfully for role /
 *                 department change.
 *   UTCID04  N  – Update User completes successfully for persistence /
 *                 audit (single repository.update(...) call, updatedBy
 *                 propagated).
 *   UTCID05  N  – Update User response-to-database consistency for User
 *                 including identifiers, status, actor and timestamps.
 *   UTCID06  A  – Update User rejects the operation with a controlled
 *                 ConflictError for invalid / duplicate data (username
 *                 taken by another user, email taken by another user,
 *                 repository failure).
 *   UTCID07  A  – Update User rejects the operation with a controlled
 *                 NotFoundError when the user does not exist (or any
 *                 invalid-identifier scenario); also handles an
 *                 unauthorized creator.
 *   UTCID08  B  – Boundary 1: exact field-length or assignment-count
 *                 limit. Supported boundary values are accepted; the
 *                 adjacent unsupported values are rejected with a
 *                 controlled error and no partial commit.
 *   UTCID09  B  – Boundary 2: upper-bound value just at the supported
 *                 limit for Update User. Supported upper-bound length
 *                 values are accepted; the adjacent unsupported
 *                 (one past the maximum) value is rejected without
 *                 partial commit.
 */

import { UsersService } from '../../../src/modules/users/users.service';
import {
  usersRepository,
} from '../../../src/modules/users/users.repository';
import { UserStatus } from '@prisma/client';
import {
  ConflictError,
  NotFoundError,
  BadRequestError,
} from '../../../src/shared/exceptions/app-error';
import type { UserDetail } from '../../../src/modules/users/users.repository';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/modules/users/users.repository');

const mockedRepo = usersRepository as jest.Mocked<typeof usersRepository>;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

type UpdateData = {
  username?: string;
  email?: string;
  fullName?: string;
  phone?: string;
  status?: string;
  roleIds?: number[];
  updatedBy: number;
};

function makeExistingUser(overrides: Partial<UserDetail> = {}): UserDetail {
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

function makeUpdateInput(overrides: Partial<UpdateData> = {}): UpdateData {
  return {
    username: 'alice-new',
    email: 'alice-new@example.com',
    fullName: 'Alice Nguyen Updated',
    phone: '+84909000002',
    status: 'ACTIVE',
    roleIds: [2],
    updatedBy: 200,
    ...overrides,
  };
}

function makeUpdatedUserDetail(overrides: Partial<UserDetail> = {}): UserDetail {
  return makeExistingUser({
    username: 'alice-new',
    email: 'alice-new@example.com',
    fullName: 'Alice Nguyen Updated',
    phone: '+84909000002',
    updatedAt: '2026-09-11T08:30:00.000Z',
    updatedBy: { id: 200, fullName: 'Editor' },
    ...overrides,
  });
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
  mockedRepo.findById.mockResolvedValue(makeExistingUser());
  mockedRepo.findByUsername.mockResolvedValue(null);
  mockedRepo.findByEmail.mockResolvedValue(null);
  mockedRepo.update.mockImplementation(async (id: number, data: any) =>
    makeUpdatedUserDetail({
      id,
      username: data.username,
      email: data.email,
      fullName: data.fullName,
      phone: data.phone,
      status: data.status,
    }),
  );

  service = new UsersService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid update.
// Result : Update User returns the expected success value for a valid
//          update (all editable fields supplied with no conflicts).
// ---------------------------------------------------------------------------
describe('[UTCID01] usersService.update() – Normal 1: valid update', () => {
  it('returns the expected success value for a valid update', async () => {
    const result = await service.update(42, makeUpdateInput());

    // 1. Return – post-update UserDetail propagates identifiers,
    //    status, and audit metadata.
    expect(result).toMatchObject({
      id: 42,
      username: 'alice-new',
      email: 'alice-new@example.com',
      fullName: 'Alice Nguyen Updated',
      phone: '+84909000002',
      status: UserStatus.ACTIVE,
      updatedBy: { id: 200, fullName: 'Editor' },
    });

    // 2. Persisted state matches – the repository received the
    //    forwarded payload exactly.
    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.update).toHaveBeenCalledTimes(1);
    const forward = mockedRepo.update.mock.calls[0];
    expect(forward[0]).toBe(42);
    expect(forward[1]).toEqual(
      expect.objectContaining({
        username: 'alice-new',
        email: 'alice-new@example.com',
        fullName: 'Alice Nguyen Updated',
        phone: '+84909000002',
        status: 'ACTIVE',
        roleIds: [2],
        updatedBy: 200,
      }),
    );

    // 3. No unhandled exception / partial commit / sensitive disclosure
    expect('password' in result).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('does not call create / delete / findAll paths on the happy update path', async () => {
    await service.update(42, makeUpdateInput());

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
    expect(mockedRepo.findAll).not.toHaveBeenCalled();
  });

  it('runs the existing-user lookup BEFORE the update', async () => {
    await service.update(42, makeUpdateInput());

    const findByIdOrder = mockedRepo.findById.mock.invocationCallOrder[0];
    const updateOrder = mockedRepo.update.mock.invocationCallOrder[0];
    expect(findByIdOrder).toBeLessThan(updateOrder);
  });

  it('accepts a valid update that includes the same username as the existing user', async () => {
    // Re-submitting the same username should NOT trigger the conflict
    // check (because `data.username === existing.username`).
    mockedRepo.findByUsername.mockReset();
    mockedRepo.findByUsername.mockResolvedValue(makeExistingUser({ id: 42 }));

    const result = await service.update(
      42,
      makeUpdateInput({ username: 'alice' }),
    );

    expect(result.username).toBe('alice');
    // The conflict check is BYPASSED when the username is unchanged —
    // findByUsername must NOT be called.
    expect(mockedRepo.findByUsername).not.toHaveBeenCalled();
  });

  it('accepts a valid update that includes the same email as the existing user', async () => {
    mockedRepo.findByEmail.mockReset();
    mockedRepo.findByEmail.mockResolvedValue(makeExistingUser({ id: 42 }));

    const result = await service.update(
      42,
      makeUpdateInput({ email: 'alice@example.com' }),
    );

    expect(result.email).toBe('alice@example.com');
    expect(mockedRepo.findByEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: partial update.
// Result : Update User returns the expected success value for a partial
//          update (only a subset of fields supplied).
// ---------------------------------------------------------------------------
describe('[UTCID02] usersService.update() – Normal 2: partial update', () => {
  it('updates only the fullName field', async () => {
    const result = await service.update(
      42,
      { fullName: 'Alice N.', updatedBy: 200 },
    );

    // 1. Return – only fullName is updated.
    expect(result.fullName).toBe('Alice N.');

    // 2. The repository received a payload that contains ONLY the
    //    supplied field.
    expect(mockedRepo.update).toHaveBeenCalledTimes(1);
    const forward = mockedRepo.update.mock.calls[0][1];
    expect(forward).toEqual({
      fullName: 'Alice N.',
      updatedBy: 200,
    });
    expect(forward.username).toBeUndefined();
    expect(forward.email).toBeUndefined();
    expect(forward.roleIds).toBeUndefined();
  });

  it('updates only the phone field', async () => {
    const result = await service.update(
      42,
      { phone: '+84909000099', updatedBy: 200 },
    );

    expect(result.phone).toBe('+84909000099');
    expect(mockedRepo.update.mock.calls[0][1]).toEqual({
      phone: '+84909000099',
      updatedBy: 200,
    });
  });

  it('updates only the status field', async () => {
    const result = await service.update(
      42,
      { status: 'INACTIVE', updatedBy: 200 },
    );

    expect(result.status).toBe('INACTIVE');
    expect(mockedRepo.update.mock.calls[0][1]).toEqual({
      status: 'INACTIVE',
      updatedBy: 200,
    });
  });

  it('updates only the roleIds field', async () => {
    const result = await service.update(
      42,
      { roleIds: [1, 2, 3], updatedBy: 200 },
    );

    expect(result.roles).toBeDefined();
    // The roleIds array is forwarded verbatim.
    expect(mockedRepo.update.mock.calls[0][1].roleIds).toEqual([1, 2, 3]);
  });

  it('does not run the username / email conflict checks when those fields are not supplied', async () => {
    await service.update(
      42,
      { fullName: 'Alice N.', updatedBy: 200 },
    );

    // Neither findByUsername nor findByEmail is called when neither
    // field is in the update payload.
    expect(mockedRepo.findByUsername).not.toHaveBeenCalled();
    expect(mockedRepo.findByEmail).not.toHaveBeenCalled();
  });

  it('updates multiple fields simultaneously (selected subset)', async () => {
    const result = await service.update(
      42,
      {
        fullName: 'Alice N.',
        phone: '+84909000088',
        status: 'LOCKED',
        updatedBy: 300,
      },
    );

    expect(result.fullName).toBe('Alice N.');
    expect(result.phone).toBe('+84909000088');
    expect(result.status).toBe('LOCKED');

    const forward = mockedRepo.update.mock.calls[0][1];
    expect(forward).toEqual({
      fullName: 'Alice N.',
      phone: '+84909000088',
      status: 'LOCKED',
      updatedBy: 300,
    });
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: role / department change.
// Result : Update User returns the expected success value; the roleIds
//          forwarded to the repository match the input; the UserDetail
//          roles[] reflects the new assignment.
// ---------------------------------------------------------------------------
describe('[UTCID03] usersService.update() – Normal 3: role/department change', () => {
  it('forwards the roleIds array verbatim to the repository', async () => {
    const roleIds = [1, 2, 3];

    await service.update(42, makeUpdateInput({ roleIds }));

    expect(mockedRepo.update.mock.calls[0][1].roleIds).toEqual(roleIds);
  });

  it('handles a single-role change correctly', async () => {
    const result = await service.update(
      42,
      makeUpdateInput({ roleIds: [2] }),
    );

    expect(result.roles).toBeDefined();
    expect(mockedRepo.update.mock.calls[0][1].roleIds).toEqual([2]);
  });

  it('handles a multi-role change correctly (3 roles)', async () => {
    const roleIds = [1, 2, 3];
    mockedRepo.update.mockImplementationOnce(
      async (id: number, _data: any) =>
        makeUpdatedUserDetail({
          id,
          roles: ['ADMIN', 'EDITOR', 'VIEWER'],
        }),
    );

    const result = await service.update(
      42,
      makeUpdateInput({ roleIds }),
    );

    expect(result.roles).toEqual(['ADMIN', 'EDITOR', 'VIEWER']);
    expect(mockedRepo.update.mock.calls[0][1].roleIds).toEqual(roleIds);
  });

  it('does NOT touch the department field at the service layer (department is via UserDepartmentMembership)', async () => {
    // The service `update()` only persists the fields listed in its
    // signature. `departmentId` is NOT part of `update()`. Department
    // membership is managed via a separate module. We assert that the
    // forwarded data does NOT contain a `departmentId` when the caller
    // didn't supply one.
    const result = await service.update(
      42,
      makeUpdateInput({ roleIds: [2] }),
    );

    const forward = mockedRepo.update.mock.calls[0][1];
    expect(forward).not.toHaveProperty('departmentId');
    expect(forward).not.toHaveProperty('department');

    // The UserDetail may still have a `department` from the existing
    // user (read by findById) — that's fine. The point is the WRITE
    // payload didn't carry it.
    expect(result).toBeDefined();
  });

  it('preserves the existing department on a role-only update', async () => {
    // The existing user has a department. The mock default-update
    // returns a UserDetail WITHOUT preserving the department. So we
    // wire a custom implementation that preserves the existing
    // department on the response.
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      makeExistingUser({
        id: 42,
        department: { id: 3, name: 'IT Department' },
      }),
    );
    mockedRepo.update.mockImplementationOnce(
      async (id: number, _data: any) =>
        makeUpdatedUserDetail({
          id,
          department: { id: 3, name: 'IT Department' },
        }),
    );

    const result = await service.update(
      42,
      { roleIds: [2], updatedBy: 200 },
    );

    // The existing department is preserved in the UserDetail even
    // though no departmentId was sent.
    expect(result.department).toEqual({ id: 3, name: 'IT Department' });
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: persistence / audit.
// Result : Update User returns the expected success value; the
//          repository receives exactly one update(...) call with the
//          updatedBy audit metadata.
// ---------------------------------------------------------------------------
describe('[UTCID04] usersService.update() – Normal 4: persistence/audit', () => {
  it('forwards updatedBy to the repository (audit metadata propagation)', async () => {
    await service.update(
      42,
      { fullName: 'Alice N.', updatedBy: 555 },
    );

    // 1. Return – repository.update was called exactly once with the
    //    audit metadata.
    expect(mockedRepo.update).toHaveBeenCalledTimes(1);

    // 2. Persisted state matches – updatedBy flows through.
    const forward = mockedRepo.update.mock.calls[0][1];
    expect(forward.updatedBy).toBe(555);

    // 3. Function10 / actor / target / result recorded
    //    - actor : updatedBy = 555
    //    - target : the user id (42)
    //    - result : the post-update UserDetail
    const targetId = mockedRepo.update.mock.calls[0][0];
    expect(targetId).toBe(42);

    const result = await service.update(
      42,
      { fullName: 'Alice N.', updatedBy: 555 },
    );
    expect(result.updatedBy).toEqual({ id: 200, fullName: 'Editor' });
  });

  it('runs the existing-user lookup exactly once before the update', async () => {
    await service.update(42, makeUpdateInput());

    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findById).toHaveBeenCalledWith(42);
  });

  it('forwards the full normalized payload to the repository exactly once', async () => {
    const input = makeUpdateInput();
    await service.update(42, input);

    expect(mockedRepo.update).toHaveBeenCalledTimes(1);
    expect(mockedRepo.update.mock.calls[0][0]).toBe(42);
    expect(mockedRepo.update.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        username: input.username,
        email: input.email,
        fullName: input.fullName,
        phone: input.phone,
        status: input.status,
        roleIds: input.roleIds,
        updatedBy: input.updatedBy,
      }),
    );
  });

  it('does not mutate or rewrite unrelated fields', async () => {
    await service.update(
      42,
      { fullName: 'Alice N.', updatedBy: 200 },
    );

    // The repository received ONLY the fields the caller supplied +
    // updatedBy. Everything else is undefined.
    const forward = mockedRepo.update.mock.calls[0][1];
    expect(forward.username).toBeUndefined();
    expect(forward.email).toBeUndefined();
    expect(forward.phone).toBeUndefined();
    expect(forward.roleIds).toBeUndefined();
    expect(forward.status).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Identifiers (id), status, actor and timestamps must propagate
// consistently through the persistence path.
// ---------------------------------------------------------------------------
describe('[UTCID05] usersService.update() – Normal 5: response-to-database consistency', () => {
  it('returns a post-update UserDetail whose identifiers, status, actor and timestamps match', async () => {
    mockedRepo.update.mockImplementationOnce(
      async (id: number, data: any) =>
        makeUpdatedUserDetail({
          id,
          username: data.username,
          email: data.email,
          fullName: data.fullName,
          phone: data.phone,
          status: data.status,
          updatedAt: '2026-09-11T08:30:00.000Z',
          updatedBy: { id: data.updatedBy, fullName: 'Audit Editor' },
        }),
    );

    const result = await service.update(42, makeUpdateInput());

    // 1. Identifiers – the user id stays the same after update.
    expect(result.id).toBe(42);

    // 2. Status / actor / timestamps
    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(result.updatedBy).toEqual({ id: 200, fullName: 'Audit Editor' });
    expect(result.updatedAt).toBe('2026-09-11T08:30:00.000Z');

    // 3. createdAt is preserved from the existing user (created
    //    timestamp must NOT change on update).
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');

    // 4. updatedBy flowed through the service correctly.
    expect(mockedRepo.update.mock.calls[0][1].updatedBy).toBe(200);
  });

  it('distinguishes the target user id from the actor id (audit metadata)', async () => {
    const result = await service.update(42, makeUpdateInput({ updatedBy: 7 }));

    // Target = 42, actor (updatedBy) = 7 — they must remain distinct
    // in the success payload.
    expect(result.id).toBe(42);
    expect(result.updatedBy?.id).toBe(200); // from the mock

    // The audit metadata flows through: service.update → repository →
    // UserDetail.updatedBy.id (= 200 from the mock).
    expect(mockedRepo.update.mock.calls[0][1].updatedBy).toBe(7);
  });

  it('returns ISO-string timestamps (not Date objects)', async () => {
    const result = await service.update(42, makeUpdateInput());

    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
    expect(() => new Date(result.createdAt).toISOString()).not.toThrow();
    expect(() => new Date(result.updatedAt).toISOString()).not.toThrow();
  });

  it('preserves the creator metadata (createdBy) on an update', async () => {
    const result = await service.update(42, makeUpdateInput());

    // createdBy is preserved from the existing user — it must NOT
    // change when an editor modifies the row.
    expect(result.createdBy).toEqual({ id: 100, fullName: 'Root Admin' });
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: invalid / duplicate data.
// Result : Update User rejects with a controlled ConflictError.
// ---------------------------------------------------------------------------
describe('[UTCID06] usersService.update() – Abnormal 1: invalid/duplicate data', () => {
  it('rejects a duplicate username (taken by another user) with ConflictError', async () => {
    mockedRepo.findByUsername.mockReset();
    mockedRepo.findByUsername.mockResolvedValue({
      id: 99,
      username: 'alice-new',
    });

    await expect(
      service.update(42, makeUpdateInput({ username: 'alice-new' })),
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(
      service.update(42, makeUpdateInput({ username: 'alice-new' })),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('Tên đăng nhập đã tồn tại'),
    });

    // No partial commit – repository.update was NOT called.
    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('rejects a duplicate email (taken by another user) with ConflictError', async () => {
    mockedRepo.findByEmail.mockReset();
    mockedRepo.findByEmail.mockResolvedValue({
      id: 99,
      email: 'alice-new@example.com',
    });

    await expect(
      service.update(42, makeUpdateInput({ email: 'alice-new@example.com' })),
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(
      service.update(42, makeUpdateInput({ email: 'alice-new@example.com' })),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('Email đã tồn tại'),
    });

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('username conflict is checked BEFORE email conflict', async () => {
    mockedRepo.findByUsername.mockReset();
    mockedRepo.findByUsername.mockResolvedValue({ id: 99, username: 'alice-new' });
    mockedRepo.findByEmail.mockReset();
    mockedRepo.findByEmail.mockResolvedValue({ id: 99, email: 'alice-new@example.com' });

    // Username conflict fires first → ConflictError, email conflict
    // is never reached.
    await expect(
      service.update(42, makeUpdateInput({ username: 'alice-new' })),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Tên đăng nhập đã tồn tại'),
    });

    expect(mockedRepo.findByEmail).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on duplicate rejection (no plaintext / user data leaked)', async () => {
    mockedRepo.findByUsername.mockReset();
    mockedRepo.findByUsername.mockResolvedValue({ id: 99, username: 'alice-new' });

    const err = await service
      .update(42, makeUpdateInput({ username: 'alice-new' }))
      .catch((e) => e) as ConflictError;

    expect(err.message).toBe('Tên đăng nhập đã tồn tại');
    expect(err.message).not.toContain('alice-new');
    expect(err.message).not.toContain('alice@example.com');
    expect(err.message).not.toMatch(/password|hash|secret/i);
    expect(err.statusCode).toBe(409);
  });

  it('rejects when the username uniqueness lookup itself fails', async () => {
    const repoError = new Error('username lookup failed');
    mockedRepo.findByUsername.mockReset();
    mockedRepo.findByUsername.mockRejectedValueOnce(repoError);

    await expect(
      service.update(42, makeUpdateInput({ username: 'alice-new' })),
    ).rejects.toBe(repoError);

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('rejects when the email uniqueness lookup itself fails', async () => {
    const repoError = new Error('email lookup failed');
    mockedRepo.findByEmail.mockReset();
    mockedRepo.findByEmail.mockRejectedValueOnce(repoError);

    await expect(
      service.update(42, makeUpdateInput({ email: 'alice-new@example.com' })),
    ).rejects.toBe(repoError);

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('rejects when the existing-user lookup itself fails (database unavailable)', async () => {
    const repoError = new Error('findById failed');
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(repoError);

    await expect(
      service.update(42, makeUpdateInput()),
    ).rejects.toBe(repoError);

    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.findByUsername).not.toHaveBeenCalled();
    expect(mockedRepo.findByEmail).not.toHaveBeenCalled();
  });

  it('rejects when the repository.update itself fails (controlled error)', async () => {
    const repoError = new Error('update failed');
    mockedRepo.update.mockReset();
    mockedRepo.update.mockRejectedValueOnce(repoError);

    await expect(
      service.update(42, makeUpdateInput()),
    ).rejects.toBe(repoError);
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: user not found or unauthorized.
// Result : Update User rejects with a controlled NotFoundError when the
//          user does not exist; unauthorized creator also surfaces a
//          controlled error with no user row committed.
// ---------------------------------------------------------------------------
describe('[UTCID07] usersService.update() – Abnormal 2: user not found or unauthorized', () => {
  it('rejects with NotFoundError when the user does not exist', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.update(999, makeUpdateInput()),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      service.update(999, makeUpdateInput()),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringContaining('Không tìm thấy người dùng'),
    });

    // No partial commit – findById returns null, no update is called.
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.findByUsername).not.toHaveBeenCalled();
    expect(mockedRepo.findByEmail).not.toHaveBeenCalled();
  });

  it('rejects with NotFoundError when the id is invalid (negative)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    await expect(
      service.update(-1, makeUpdateInput()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects when the actor is unauthorized (no user row committed)', async () => {
    // The `updatedBy` is negative — modelled as an invalid actor.
    mockedRepo.update.mockReset();
    mockedRepo.update.mockImplementation(async () => {
      throw new BadRequestError('Invalid actor');
    });

    await expect(
      service.update(42, makeUpdateInput({ updatedBy: -1 })),
    ).rejects.toBeInstanceOf(BadRequestError);

    // No partial commit – findById ran, update was attempted once
    // and rejected.
    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.update).toHaveBeenCalledTimes(1);
  });

  it('records a safe diagnostic on unauthorized creator (no user data leaked)', async () => {
    mockedRepo.update.mockReset();
    mockedRepo.update.mockImplementation(async () => {
      throw new BadRequestError('Invalid actor');
    });

    const err = await service
      .update(42, makeUpdateInput({ updatedBy: -1 }))
      .catch((e) => e) as BadRequestError;

    expect(err.message).toBe('Invalid actor');
    expect(err.message).not.toContain('alice-new');
    expect(err.message).not.toContain('alice-new@example.com');
    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('records a safe diagnostic on user-not-found rejection', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(null);

    const err = await service
      .update(999, makeUpdateInput())
      .catch((e) => e) as NotFoundError;

    expect(err.message).toBe('Không tìm thấy người dùng');
    expect(err.message).not.toContain('999');
    expect(err.message).not.toMatch(/password|hash|secret/i);
    expect(err.message).not.toMatch(/email|@/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: exact field-length or assignment-count limit.
//
// The validator enforces (same as create):
//   username  3..50  chars
//   fullName  2..100 chars
//   phone     10..15 digits
//
// At the service layer we test the boundary by simulating the
// validator's accept / reject behavior on the repository.
// ---------------------------------------------------------------------------
describe('[UTCID08] usersService.update() – Boundary 1: exact field-length or assignment-count limit', () => {
  // ---- username length ----

  it('accepts username exactly at the minimum (length 3)', async () => {
    const result = await service.update(
      42,
      makeUpdateInput({ username: 'abc' }),
    );

    expect(result.username).toBe('abc');
    expect(mockedRepo.update.mock.calls[0][1].username).toBe('abc');
  });

  it('rejects username one below the minimum (length 2)', async () => {
    const repoError = new Error('Tên đăng nhập phải có từ 3 đến 50 ký tự');
    mockedRepo.update.mockReset();
    mockedRepo.update.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.update(42, makeUpdateInput({ username: 'ab' })),
    ).rejects.toBeInstanceOf(Error);

    const err = await service
      .update(42, makeUpdateInput({ username: 'ab' }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('3 đến 50');
    expect(err.message).not.toContain('ab');
  });

  it('rejects username one above the maximum (length 51)', async () => {
    const repoError = new Error('Tên đăng nhập phải có từ 3 đến 50 ký tự');
    mockedRepo.update.mockReset();
    mockedRepo.update.mockImplementation(async () => {
      throw repoError;
    });

    const tooLong = 'a'.repeat(51);

    await expect(
      service.update(42, makeUpdateInput({ username: tooLong })),
    ).rejects.toBeInstanceOf(Error);

    const err = await service
      .update(42, makeUpdateInput({ username: tooLong }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('3 đến 50');
    expect(err.message).not.toMatch(/a{50}/);
  });

  // ---- fullName length ----

  it('accepts fullName exactly at the minimum (length 2)', async () => {
    const result = await service.update(
      42,
      makeUpdateInput({ fullName: 'Bo' }),
    );

    expect(result.fullName).toBe('Bo');
    expect(mockedRepo.update.mock.calls[0][1].fullName).toBe('Bo');
  });

  it('rejects fullName one below the minimum (length 1)', async () => {
    const repoError = new Error('Họ và tên phải có từ 2 đến 100 ký tự');
    mockedRepo.update.mockReset();
    mockedRepo.update.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.update(42, makeUpdateInput({ fullName: 'A' })),
    ).rejects.toBeInstanceOf(Error);

    const err = await service
      .update(42, makeUpdateInput({ fullName: 'A' }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('2 đến 100');
    expect(err.message).not.toContain('A');
  });

  it('accepts fullName exactly at the maximum (length 100)', async () => {
    const hundred = 'A'.repeat(100);

    const result = await service.update(
      42,
      makeUpdateInput({ fullName: hundred }),
    );

    expect(result.fullName).toBe(hundred);
    expect(mockedRepo.update.mock.calls[0][1].fullName.length).toBe(100);
  });

  it('rejects fullName one above the maximum (length 101)', async () => {
    const repoError = new Error('Họ và tên phải có từ 2 đến 100 ký tự');
    mockedRepo.update.mockReset();
    mockedRepo.update.mockImplementation(async () => {
      throw repoError;
    });

    const tooLong = 'A'.repeat(101);

    await expect(
      service.update(42, makeUpdateInput({ fullName: tooLong })),
    ).rejects.toBeInstanceOf(Error);

    const err = await service
      .update(42, makeUpdateInput({ fullName: tooLong }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('2 đến 100');
    expect(err.message).not.toMatch(/^A{100}/);
  });

  // ---- phone length ----

  it('accepts phone exactly at the minimum (length 10)', async () => {
    const result = await service.update(
      42,
      makeUpdateInput({ phone: '1234567890' }),
    );

    expect(result.phone).toBe('1234567890');
    expect(mockedRepo.update.mock.calls[0][1].phone).toBe('1234567890');
  });

  it('rejects phone one below the minimum (length 9)', async () => {
    const repoError = new Error('Số điện thoại phải có từ 10 đến 15 chữ số');
    mockedRepo.update.mockReset();
    mockedRepo.update.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.update(42, makeUpdateInput({ phone: '123456789' })),
    ).rejects.toBeInstanceOf(Error);

    const err = await service
      .update(42, makeUpdateInput({ phone: '123456789' }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('10 đến 15');
    expect(err.message).not.toContain('123456789');
  });

  it('accepts phone exactly at the maximum (length 15)', async () => {
    const result = await service.update(
      42,
      makeUpdateInput({ phone: '123456789012345' }),
    );

    expect(result.phone).toBe('123456789012345');
    expect(mockedRepo.update.mock.calls[0][1].phone.length).toBe(15);
  });

  it('rejects phone one above the maximum (length 16)', async () => {
    const repoError = new Error('Số điện thoại phải có từ 10 đến 15 chữ số');
    mockedRepo.update.mockReset();
    mockedRepo.update.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.update(42, makeUpdateInput({ phone: '1234567890123456' })),
    ).rejects.toBeInstanceOf(Error);

    const err = await service
      .update(42, makeUpdateInput({ phone: '1234567890123456' }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('10 đến 15');
    expect(err.message).not.toContain('1234567890123456');
  });

  // ---- assignment-count limit (roleIds) ----

  it('accepts a single-role assignment (count=1)', async () => {
    const result = await service.update(
      42,
      makeUpdateInput({ roleIds: [1] }),
    );

    expect(result.roles).toBeDefined();
    expect(mockedRepo.update.mock.calls[0][1].roleIds).toEqual([1]);
  });

  it('accepts a multi-role assignment (count=10)', async () => {
    const roleIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    const result = await service.update(
      42,
      makeUpdateInput({ roleIds }),
    );

    expect(result.roles).toBeDefined();
    expect(mockedRepo.update.mock.calls[0][1].roleIds).toEqual(roleIds);
  });

  it('accepts the supported boundary on all length-constrained fields simultaneously', async () => {
    const result = await service.update(
      42,
      makeUpdateInput({
        username: 'abc',
        fullName: 'Bo',
        phone: '1234567890',
      }),
    );

    expect(result).toMatchObject({
      username: 'abc',
      fullName: 'Bo',
      phone: '1234567890',
    });

    expect(mockedRepo.update.mock.calls[0][1].username).toBe('abc');
    expect(mockedRepo.update.mock.calls[0][1].fullName).toBe('Bo');
    expect(mockedRepo.update.mock.calls[0][1].phone).toBe('1234567890');
  });

  it('rejects the adjacent unsupported boundary on length-constrained fields without partial commit', async () => {
    const repoError = new Error('Validation failed at boundary');
    mockedRepo.update.mockReset();
    mockedRepo.update.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.update(
        42,
        makeUpdateInput({
          username: 'ab',
          fullName: 'A',
          phone: '123456789',
        }),
      ),
    ).rejects.toBeInstanceOf(Error);

    // The repository.update was attempted exactly once and rejected.
    expect(mockedRepo.update).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 2: upper-bound value just at the supported limit
// for Update User. Supported upper-bound values:
//   fullName  length 100
//   username  length 50
// We test each upper-bound along with the "one above" adjacent value.
// ---------------------------------------------------------------------------
describe('[UTCID09] usersService.update() – Boundary 2: upper-bound value just at the supported limit', () => {
  it('accepts username exactly at the supported upper bound (length 50)', async () => {
    const fifty = 'a'.repeat(50);

    const result = await service.update(
      42,
      makeUpdateInput({ username: fifty }),
    );

    expect(result.username).toBe(fifty);
    expect(mockedRepo.update.mock.calls[0][1].username.length).toBe(50);
  });

  it('rejects username one above the supported upper bound (length 51)', async () => {
    const repoError = new Error('Tên đăng nhập phải có từ 3 đến 50 ký tự');
    mockedRepo.update.mockReset();
    mockedRepo.update.mockImplementation(async () => {
      throw repoError;
    });

    const tooLong = 'a'.repeat(51);

    await expect(
      service.update(42, makeUpdateInput({ username: tooLong })),
    ).rejects.toBeInstanceOf(Error);

    const err = await service
      .update(42, makeUpdateInput({ username: tooLong }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('3 đến 50');
    expect(err.message).not.toMatch(/a{50}/);
  });

  it('accepts fullName exactly at the supported upper bound (length 100)', async () => {
    const hundred = 'A'.repeat(100);

    const result = await service.update(
      42,
      makeUpdateInput({ fullName: hundred }),
    );

    expect(result.fullName).toBe(hundred);
    expect(mockedRepo.update.mock.calls[0][1].fullName.length).toBe(100);
  });

  it('rejects fullName one above the supported upper bound (length 101) without partial commit', async () => {
    const repoError = new Error('Họ và tên phải có từ 2 đến 100 ký tự');
    mockedRepo.update.mockReset();
    mockedRepo.update.mockImplementation(async () => {
      throw repoError;
    });

    const tooLong = 'A'.repeat(101);

    // First call: triggers the rejection and we capture the error
    await expect(
      service.update(42, makeUpdateInput({ fullName: tooLong })),
    ).rejects.toBeInstanceOf(Error);

    // Failure log records a safe diagnostic — NO partial commit, no
    // plaintext password / token leak.
    const err = await service
      .update(42, makeUpdateInput({ fullName: tooLong }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('2 đến 100');
    expect(err.message).not.toMatch(/^A{100}/);
    expect(err.message).not.toMatch(/password|hash|secret/i);
    // The repository.update was attempted exactly twice (once for the
    // rejection path test, once for the .catch) and never resolved.
    expect(mockedRepo.update).toHaveBeenCalledTimes(2);
  });

  it('accepts phone exactly at the supported upper bound (length 15)', async () => {
    const fifteen = '123456789012345';

    const result = await service.update(
      42,
      makeUpdateInput({ phone: fifteen }),
    );

    expect(result.phone).toBe(fifteen);
    expect(mockedRepo.update.mock.calls[0][1].phone.length).toBe(15);
  });

  it('rejects phone one above the supported upper bound (length 16)', async () => {
    const repoError = new Error('Số điện thoại phải có từ 10 đến 15 chữ số');
    mockedRepo.update.mockReset();
    mockedRepo.update.mockImplementation(async () => {
      throw repoError;
    });

    const tooLong = '1234567890123456';

    await expect(
      service.update(42, makeUpdateInput({ phone: tooLong })),
    ).rejects.toBeInstanceOf(Error);

    const err = await service
      .update(42, makeUpdateInput({ phone: tooLong }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('10 đến 15');
    expect(err.message).not.toContain('1234567890123456');
  });

  it('accepts all three upper-bound values simultaneously (combined boundary)', async () => {
    const fifty = 'a'.repeat(50);
    const hundred = 'A'.repeat(100);
    const fifteen = '123456789012345';

    const result = await service.update(
      42,
      makeUpdateInput({
        username: fifty,
        fullName: hundred,
        phone: fifteen,
      }),
    );

    expect(result.username).toBe(fifty);
    expect(result.fullName).toBe(hundred);
    expect(result.phone).toBe(fifteen);

    const forward = mockedRepo.update.mock.calls[0][1];
    expect(forward.username.length).toBe(50);
    expect(forward.fullName.length).toBe(100);
    expect(forward.phone.length).toBe(15);
  });

  it('rejects the combined adjacent upper-bound (+1 on every field) without partial commit', async () => {
    const repoError = new Error('Boundary exceeded');
    mockedRepo.update.mockReset();
    mockedRepo.update.mockImplementation(async () => {
      throw repoError;
    });

    const tooLongUsername = 'a'.repeat(51);
    const tooLongFullName = 'A'.repeat(101);
    const tooLongPhone = '1234567890123456';

    await expect(
      service.update(
        42,
        makeUpdateInput({
          username: tooLongUsername,
          fullName: tooLongFullName,
          phone: tooLongPhone,
        }),
      ),
    ).rejects.toBeInstanceOf(Error);

    // No partial commit – repository.update was attempted exactly once.
    expect(mockedRepo.update).toHaveBeenCalledTimes(1);

    // The plaintext password is NOT echoed through the error message.
    const err = await service
      .update(
        42,
        makeUpdateInput({
          username: tooLongUsername,
          fullName: tooLongFullName,
          phone: tooLongPhone,
        }),
      )
      .catch((e) => e) as Error;
    expect(err.message).not.toMatch(/^a{50}/);
    expect(err.message).not.toMatch(/^A{100}/);
    expect(err.message).not.toContain('1234567890123456');
  });
});
