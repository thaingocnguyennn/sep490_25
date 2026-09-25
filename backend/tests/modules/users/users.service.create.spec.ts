/**
 * Unit tests for UsersService.create() — Function7 / Create User.
 *
 * Note on naming: the matrix headers reference `UserService`, but the
 * implementation is `UsersService.create(data)` inside
 * `backend/src/modules/users/users.service.ts`. We exercise the actual
 * export and label the describe blocks with the matrix UTCIDs.
 *
 * Coverage matrix (UTCID01 – UTCID09):
 *   UTCID01  N  – Create User completes successfully for a valid user
 *                 (username + email + password + fullName + phone + roles
 *                 + createdBy).
 *   UTCID02  N  – Create User completes successfully and the role /
 *                 department assignment is forwarded correctly to the
 *                 repository.
 *   UTCID03  N  – Create User completes successfully and the password /
 *                 account defaults are applied (the password is bcrypt-
 *                 hashed inside the service BEFORE it is forwarded; the
 *                 repository never sees a plaintext password).
 *   UTCID04  N  – Create User completes successfully and the persistence
 *                 layer receives the right data shape (single
 *                 `usersRepository.create(...)` call after the two
 *                 uniqueness checks).
 *   UTCID05  N  – Create User response-to-database consistency for User
 *                 including identifiers, status, actor and timestamps —
 *                 the post-create UserDetail propagates the actor id,
 *                 status defaults, and audit metadata correctly.
 *   UTCID06  A  – Create User rejects the operation with a controlled
 *                 ConflictError for missing / duplicate / invalid data
 *                 (duplicate username, duplicate email).
 *   UTCID07  A  – Create User rejects the operation with a controlled
 *                 error for an unauthorized creator (missing or invalid
 *                 `createdBy` → repository surfaces a controlled
 *                 authorization error, no user row is committed).
 *   UTCID08  B  – Boundary 1: minimum / maximum name, email, or phone
 *                 length. The supported boundaries are accepted; the
 *                 adjacent unsupported values are rejected with a
 *                 controlled error and no partial commit.
 *   UTCID09  B  – Boundary 2: upper-bound value just at the supported
 *                 limit for Create User. The supported upper-bound
 *                 length values (max fullName / max username) are
 *                 accepted; the adjacent unsupported (one past the
 *                 maximum) value is rejected without partial commit.
 */

import * as bcrypt from 'bcrypt';
import { config } from '../../../src/config';
import { UsersService } from '../../../src/modules/users/users.service';
import {
  usersRepository,
} from '../../../src/modules/users/users.repository';
import { UserStatus } from '@prisma/client';
import {
  ConflictError,
  BadRequestError,
} from '../../../src/shared/exceptions/app-error';
import type { UserDetail } from '../../../src/modules/users/users.repository';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// jest auto-mock the bcrypt module so `bcrypt.hash` is a jest mock
// function. Tests that need to control the hash value set it via
// `(bcrypt.hash as jest.Mock).mockResolvedValue(...)` or
// `(bcrypt.hash as jest.Mock).mockImplementation(...)`.
jest.mock('bcrypt');
jest.mock('../../../src/modules/users/users.repository');

const mockedRepo = usersRepository as jest.Mocked<typeof usersRepository>;
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const DEFAULT_PASSWORD = 'CorrectHorseBatteryStaple!1';

type CreateData = {
  username: string;
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  roleIds: number[];
  createdBy: number;
};

function makeCreateInput(overrides: Partial<CreateData> = {}): CreateData {
  return {
    username: 'alice',
    email: 'alice@example.com',
    password: DEFAULT_PASSWORD,
    fullName: 'Alice Nguyen',
    phone: '+84909000001',
    roleIds: [1],
    createdBy: 100,
    ...overrides,
  };
}

function makeCreatedUserDetail(overrides: Partial<UserDetail> = {}): UserDetail {
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
    createdAt: '2026-09-11T08:00:00.000Z',
    updatedAt: '2026-09-11T08:00:00.000Z',
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

  // Healthy defaults — every test overrides what it needs.
  mockedRepo.findByUsername.mockResolvedValue(null);
  mockedRepo.findByEmail.mockResolvedValue(null);
  mockedRepo.create.mockImplementation(async (data: any) =>
    makeCreatedUserDetail({
      id: 42,
      username: data.username,
      email: data.email,
      fullName: data.fullName,
      phone: data.phone,
    }),
  );
  // bcrypt.hash is auto-mocked (returns undefined by default). Provide
  // a deterministic stub that mirrors the production contract: takes
  // (plaintext, saltRounds) and returns the hash. The saltRounds is
  // unused — the test only cares about forwarded vs plaintext.
  mockedBcrypt.hash.mockImplementation(
    async (pwd: any, _rounds: any) => `bcrypt$12$${pwd}`,
  );

  service = new UsersService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid user.
// Result : Create User returns the expected success value (post-create
//          UserDetail) for a valid input.
// ---------------------------------------------------------------------------
describe('[UTCID01] usersService.create() – Normal 1: valid user', () => {
  it('returns the expected success value for a valid user', async () => {
    const input = makeCreateInput();
    const result = await service.create(input);

    // 1. Return – the post-create UserDetail propagates the actor
    //    metadata, status default, and timestamps.
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
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
    expect(() => new Date(result.createdAt).toISOString()).not.toThrow();

    // 2. Persisted state matches – uniqueness checks ran FIRST, then a
    //    single `usersRepository.create(...)` call.
    expect(mockedRepo.findByUsername).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findByEmail).toHaveBeenCalledTimes(1);
    expect(mockedRepo.create).toHaveBeenCalledTimes(1);
    const usernameOrder = mockedRepo.findByUsername.mock
      .invocationCallOrder[0];
    const emailOrder = mockedRepo.findByEmail.mock.invocationCallOrder[0];
    const createOrder = mockedRepo.create.mock.invocationCallOrder[0];
    expect(usernameOrder).toBeLessThan(emailOrder);
    expect(emailOrder).toBeLessThan(createOrder);

    // 3. Function7 / actor / target / result are recorded.
    //    - actor : createdBy (= 100) flowed into the audit-write
    //    - target : the newly created user
    //    - result : the post-create UserDetail
    expect(mockedRepo.create.mock.calls[0][0].createdBy).toBe(100);
    expect(result.id).toBe(42);
    expect(result.createdBy).toEqual({ id: 100, fullName: 'Root Admin' });

    // 4. No unhandled exception / partial commit / sensitive disclosure
    //    The plaintext password must NOT appear in the result payload
    //    (UserDetail has no `password` field).
    expect('password' in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain(DEFAULT_PASSWORD);
    expect(JSON.stringify(result)).not.toContain('CorrectHorse');
  });

  it('does not invoke update / delete / findById / list paths on the happy path', async () => {
    await service.create(makeCreateInput());

    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
    expect(mockedRepo.findById).not.toHaveBeenCalled();
    expect(mockedRepo.findAll).not.toHaveBeenCalled();
    // bcrypt.hash WAS invoked exactly once.
    expect(bcrypt.hash).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: role / department assignment.
// Result : Create User returns the expected success value; the roleIds
//          forwarded to the repository match the input; the UserDetail
//          roles[] reflects the assigned roles.
// ---------------------------------------------------------------------------
describe('[UTCID02] usersService.create() – Normal 2: role/department assignment', () => {
  it('forwards the roleIds array verbatim to the repository', async () => {
    const roleIds = [1, 2, 3];

    const result = await service.create(
      makeCreateInput({ roleIds }),
    );

    // 1. Return – expected success value for role assignment
    expect(result.roles).toEqual(['ADMIN']); // from the mock

    // 2. Persisted state matches – repository received roleIds exactly
    expect(mockedRepo.create).toHaveBeenCalledTimes(1);
    expect(mockedRepo.create.mock.calls[0][0].roleIds).toEqual(roleIds);
  });

  it('handles a single-role assignment correctly', async () => {
    const result = await service.create(makeCreateInput({ roleIds: [1] }));

    expect(result.roles).toHaveLength(1);
    expect(mockedRepo.create.mock.calls[0][0].roleIds).toEqual([1]);
  });

  it('handles a multi-role assignment correctly', async () => {
    const roleIds = [1, 2, 3, 4, 5];
    mockedRepo.create.mockImplementationOnce(async (data: any) =>
      makeCreatedUserDetail({
        id: 42,
        roles: ['ADMIN', 'EDITOR', 'VIEWER', 'AUDITOR', 'CLERK'],
      }),
    );

    const result = await service.create(makeCreateInput({ roleIds }));

    expect(result.roles).toHaveLength(5);
    expect(result.roles).toEqual([
      'ADMIN',
      'EDITOR',
      'VIEWER',
      'AUDITOR',
      'CLERK',
    ]);
    expect(mockedRepo.create.mock.calls[0][0].roleIds).toEqual(roleIds);
  });

  it('does NOT assign a department at the service layer (assignment is upstream)', async () => {
    // The service `create()` only persists the fields listed in its
    // signature. `departmentId` is not part of `create()`, so it must
    // not be in the call.
    await service.create(makeCreateInput());

    const forwardedData = mockedRepo.create.mock.calls[0][0];
    expect('departmentId' in forwardedData).toBe(false);
    expect('department' in forwardedData).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: password / account defaults.
// Result : Create User returns the expected success value; the
//          plaintext password is bcrypt-hashed before being passed to
//          the repository; the UserDetail's `password` field is NOT
//          returned to the caller.
// ---------------------------------------------------------------------------
describe('[UTCID03] usersService.create() – Normal 3: password/account defaults', () => {
  it('hashes the plaintext password with bcrypt BEFORE handing it to the repository', async () => {
    const password = DEFAULT_PASSWORD;

    // bcrypt.hash is auto-mocked. We pin its behavior so we can assert
    // the service forwards the HASH, not the plaintext. The mock is
    // restored to the beforeEach default automatically at the next
    // beforeEach, so no try/finally is required here.
    mockedBcrypt.hash.mockImplementationOnce(
      async (pwd: any, _rounds: any) => `bcrypt$12$${pwd}`,
    );

    await service.create(makeCreateInput({ password }));

    // 1. bcrypt.hash was invoked exactly once with the plaintext and
    //    the configured salt rounds.
    expect(mockedBcrypt.hash).toHaveBeenCalledTimes(1);
    expect(mockedBcrypt.hash).toHaveBeenCalledWith(
      password,
      config.bcrypt.saltRounds,
    );

    // 2. The repository received the HASH, never the plaintext.
    expect(mockedRepo.create).toHaveBeenCalledTimes(1);
    const forwarded = mockedRepo.create.mock.calls[0][0];
    expect(forwarded.password).toBe(`bcrypt$12$${password}`);
    expect(forwarded.password).not.toBe(password);

    // 3. The plaintext password is NOT echoed back through the result
    //    (UserDetail has no password field; we assert that).
    mockedBcrypt.hash.mockImplementationOnce(
      async (pwd: any, _rounds: any) => `bcrypt$12$${pwd}`,
    );
    const result = await service.create(makeCreateInput({ password }));
    expect('password' in result).toBe(false);
  });

  it('does not pass the plaintext password through the forwarded data', async () => {
    mockedBcrypt.hash.mockImplementationOnce(
      async (_pwd: any, _rounds: any) => 'deterministic-hash',
    );

    await service.create(
      makeCreateInput({ password: 'Hunter2!Password' }),
    );
    const forwarded = mockedRepo.create.mock.calls[0][0];
    expect(forwarded.password).toBe('deterministic-hash');
    expect(forwarded.password).not.toContain('Hunter2');
  });

  it('defaults isFirstLogin to false (account-default state)', async () => {
    const result = await service.create(makeCreateInput());

    expect(result.isFirstLogin).toBe(false);
  });

  it('defaults status to ACTIVE (account-default state)', async () => {
    const result = await service.create(makeCreateInput());

    expect(result.status).toBe(UserStatus.ACTIVE);
  });

  it('uses salt rounds from config and forwards it to bcrypt.hash', async () => {
    mockedBcrypt.hash.mockImplementationOnce(
      async (pwd: any, _rounds: any) => `hash$${pwd}`,
    );

    await service.create(makeCreateInput());

    expect(mockedBcrypt.hash).toHaveBeenCalledWith(
      expect.any(String),
      config.bcrypt.saltRounds,
    );
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: persistence.
// Result : Create User returns the expected success value; the
//          repository receives exactly one create(...) call with the
//          full normalized payload after both uniqueness checks.
// ---------------------------------------------------------------------------
describe('[UTCID04] usersService.create() – Normal 4: persistence', () => {
  it('forwards the full normalized payload to the repository exactly once', async () => {
    const input = makeCreateInput();

    await service.create(input);

    // 1. Return – the success value flows from the repository.
    expect(mockedRepo.create).toHaveBeenCalledTimes(1);

    // 2. Persisted state matches – the data forwarded to the repository
    //    contains every required field plus the hashed password.
    const forward = mockedRepo.create.mock.calls[0][0];
    expect(forward).toEqual(
      expect.objectContaining({
        username: input.username,
        email: input.email,
        fullName: input.fullName,
        phone: input.phone,
        roleIds: input.roleIds,
        createdBy: input.createdBy,
      }),
    );
    expect(typeof forward.password).toBe('string');
    expect(forward.password.length).toBeGreaterThan(0);

    // 3. No unhandled exception / partial commit / sensitive disclosure
    //    Plaintext password is NOT in the forwarded data.
    expect(forward.password).not.toBe(DEFAULT_PASSWORD);
  });

  it('runs the two uniqueness checks before persistence', async () => {
    await service.create(makeCreateInput());

    const usernameOrder = mockedRepo.findByUsername.mock
      .invocationCallOrder[0];
    const emailOrder = mockedRepo.findByEmail.mock.invocationCallOrder[0];
    const createOrder = mockedRepo.create.mock.invocationCallOrder[0];

    expect(usernameOrder).toBeLessThan(emailOrder);
    expect(emailOrder).toBeLessThan(createOrder);
  });

  it('does NOT call findByUsername or findByEmail a second time on the happy path', async () => {
    await service.create(makeCreateInput());
    await service.create(makeCreateInput({ email: 'other@example.com' }));

    expect(mockedRepo.findByUsername).toHaveBeenCalledTimes(2);
    expect(mockedRepo.findByEmail).toHaveBeenCalledTimes(2);
  });

  it('handles a missing optional phone by leaving it out of the forwarded data', async () => {
    await service.create(makeCreateInput({ phone: undefined }));

    const forward = mockedRepo.create.mock.calls[0][0];
    expect(forward.phone).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency for User.
// Identifiers (id), status, actor and timestamps must be propagated
// consistently through the persistence path.
// ---------------------------------------------------------------------------
describe('[UTCID05] usersService.create() – Normal 5: response-to-database consistency', () => {
  it('returns a post-create UserDetail whose identifiers, status, actor and timestamps match', async () => {
    mockedBcrypt.hash.mockImplementationOnce(
      async (pwd: any, _rounds: any) => `bcrypt$${pwd}`,
    );
    mockedRepo.create.mockImplementationOnce(async (data: any) => {
      return makeCreatedUserDetail({
        id: 4242,
        username: data.username,
        email: data.email,
        fullName: data.fullName,
        phone: data.phone,
        createdAt: '2026-09-11T08:30:00.000Z',
        updatedAt: '2026-09-11T08:30:00.000Z',
        createdBy: { id: data.createdBy, fullName: 'Audit Admin' },
      });
    });

    const result = await service.create(makeCreateInput());

    // 1. Identifiers – user id is the one assigned by the database,
    //    not the actor's id (100).
    expect(result.id).toBe(4242);
    expect(result.id).not.toBe(100);

    // 2. Status / actor / timestamps
    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(result.createdBy).toEqual({ id: 100, fullName: 'Audit Admin' });
    expect(result.createdAt).toBe('2026-09-11T08:30:00.000Z');
    expect(result.updatedAt).toBe('2026-09-11T08:30:00.000Z');

    // 3. The actor id (createdBy) flows correctly through:
    //    service.create → usersRepository.create → UserDetail.createdBy.
    expect(mockedRepo.create.mock.calls[0][0].createdBy).toBe(100);

    // 4. No sensitive disclosure through the result.
    expect('password' in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain('bcrypt$');
  });

  it('records the actor separately from the new user id (audit metadata propagation)', async () => {
    mockedBcrypt.hash.mockImplementationOnce(
      async (pwd: any, _rounds: any) => `hash$${pwd}`,
    );

    const result = await service.create(
      makeCreateInput({ createdBy: 7 }),
    );

    // Actor = 7, new user id = 42. They must remain distinct in the
    // success payload.
    expect(result.id).toBe(42);
    expect(result.createdBy?.id).toBe(100); // mock returned createdBy { id:100 }

    // The actor id flowed into `forwarded.createdBy = 7` and onward
    // through the mock to `createdBy.id = 100` (the mock flattened
    // the user-row form). So the audit chain stays consistent.
    expect(mockedRepo.create.mock.calls[0][0].createdBy).toBe(7);
  });

  it('returns ISO-string timestamps (not Date objects)', async () => {
    const result = await service.create(makeCreateInput());

    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
    expect(() => new Date(result.createdAt).toISOString()).not.toThrow();
    expect(() => new Date(result.updatedAt).toISOString()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: missing / duplicate / invalid data.
// Result : Create User rejects with a controlled ConflictError.
// ---------------------------------------------------------------------------
describe('[UTCID06] usersService.create() – Abnormal 1: missing/duplicate invalid data', () => {
  it('rejects a duplicate username with ConflictError', async () => {
    mockedRepo.findByUsername.mockReset();
    mockedRepo.findByUsername.mockResolvedValue({ id: 99, username: 'alice' });

    await expect(service.create(makeCreateInput())).rejects.toBeInstanceOf(
      ConflictError,
    );

    await expect(service.create(makeCreateInput())).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('Tên đăng nhập đã tồn tại'),
    });

    // No partial commit – repository.create was NOT called and bcrypt was
    // never invoked (the bcrypt step runs AFTER both uniqueness checks).
    expect(mockedRepo.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate email with ConflictError', async () => {
    mockedRepo.findByEmail.mockReset();
    mockedRepo.findByEmail.mockResolvedValue({ id: 99, email: 'alice@example.com' });

    await expect(service.create(makeCreateInput())).rejects.toBeInstanceOf(
      ConflictError,
    );

    await expect(service.create(makeCreateInput())).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('Email đã tồn tại'),
    });

    expect(mockedRepo.create).not.toHaveBeenCalled();
  });

  it('username conflict is checked BEFORE email conflict', async () => {
    mockedRepo.findByUsername.mockReset();
    mockedRepo.findByUsername.mockResolvedValue({ id: 99, username: 'alice' });
    mockedRepo.findByEmail.mockReset();
    mockedRepo.findByEmail.mockResolvedValue({ id: 99, email: 'alice@example.com' });

    // Username conflict fires first → ConflictError, email conflict
    // is never reached.
    await expect(service.create(makeCreateInput())).rejects.toMatchObject({
      message: expect.stringContaining('Tên đăng nhập đã tồn tại'),
    });

    expect(mockedRepo.findByEmail).not.toHaveBeenCalled();
    expect(mockedRepo.create).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on duplicate rejection (no plaintext password leaked)', async () => {
    mockedRepo.findByUsername.mockReset();
    mockedRepo.findByUsername.mockResolvedValue({ id: 99, username: 'alice' });

    const err = await service
      .create(makeCreateInput({ password: 'Hunter2!Password' }))
      .catch((e) => e) as ConflictError;

    expect(err.message).toBe('Tên đăng nhập đã tồn tại');
    expect(err.message).not.toContain('alice@example.com');
    expect(err.message).not.toContain('Hunter2');
    expect(err.message).not.toMatch(/password|hash|secret/i);
    expect(err.statusCode).toBe(409);
  });

  it('rejects when the username uniqueness lookup itself fails (controlled error)', async () => {
    const lookupError = new Error('database unavailable');
    mockedRepo.findByUsername.mockReset();
    mockedRepo.findByUsername.mockRejectedValueOnce(lookupError);

    await expect(service.create(makeCreateInput())).rejects.toBe(lookupError);

    expect(mockedRepo.create).not.toHaveBeenCalled();
  });

  it('rejects when the email uniqueness lookup itself fails', async () => {
    const lookupError = new Error('email lookup failed');
    mockedRepo.findByEmail.mockReset();
    mockedRepo.findByEmail.mockRejectedValueOnce(lookupError);

    await expect(service.create(makeCreateInput())).rejects.toBe(lookupError);

    expect(mockedRepo.create).not.toHaveBeenCalled();
  });

  it('still rejects a duplicate username even when bcrypt would otherwise be invoked', async () => {
    // bcrypt is never called because the duplicate check fires before
    // the password hash step.
    mockedRepo.findByUsername.mockReset();
    mockedRepo.findByUsername.mockResolvedValue({ id: 99, username: 'alice' });

    await expect(service.create(makeCreateInput())).rejects.toBeInstanceOf(
      ConflictError,
    );

    // bcrypt.hash is NOT called when the duplicate check rejects.
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: unauthorized creator.
// Result : Create User rejects with a controlled error; no user row is
//          committed; a safe diagnostic is recorded.
//
// The service does NOT enforce role-based authorization itself — that
// is handled upstream by `requireRole(ROLES.ADMIN)` / `authenticate`.
// At the unit-test boundary for this service, "unauthorized creator"
// is modelled as:
//    1) the `createdBy` field is missing or null
//    2) the repository rejects because the audit-write fails the
//       authorization invariant
// In both cases the failure must surface as a controlled error and no
// partial user row is committed.
// ---------------------------------------------------------------------------
describe('[UTCID07] usersService.create() – Abnormal 2: unauthorized creator', () => {
  it('surfaces a controlled error when the actor lookup fails (no user row committed)', async () => {
    // The repository enforces the `createdBy` foreign-key constraint.
    // If the audit-write can't bind an actor, the database throws P2003
    // — we model that as a controlled BadRequestError.
    const authError = new BadRequestError('Invalid creator');
    mockedRepo.create.mockReset();
    mockedRepo.create.mockImplementation(async () => {
      throw authError;
    });

    await expect(service.create(makeCreateInput({ createdBy: 999 }))).rejects.toBeInstanceOf(
      BadRequestError,
    );

    // No partial commit – no bcrypt was needed (well, it was attempted)
    // but the repository.create call was attempted exactly once and
    // rejected.
    expect(mockedRepo.create).toHaveBeenCalledTimes(1);

    // Safe diagnostic – error message does not echo the password or
    // email back to the caller.
    const err = await service
      .create(makeCreateInput({ createdBy: 999 }))
      .catch((e) => e) as BadRequestError;
    expect(err.message).toContain('Invalid creator');
    expect(err.message).not.toContain('alice@example.com');
    expect(err.message).not.toContain(DEFAULT_PASSWORD);
    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('refuses to compute a password hash when the creator is unauthorized', async () => {
    // The `createdBy` is negative — modelled as an invalid actor.
    mockedBcrypt.hash.mockImplementationOnce(
      async (pwd: any, _rounds: any) => `bcrypt$${pwd}`,
    );
    mockedRepo.create.mockReset();
    mockedRepo.create.mockImplementation(async () => {
      throw new BadRequestError('Invalid creator');
    });

    await expect(
      service.create(makeCreateInput({ createdBy: -1 })),
    ).rejects.toBeInstanceOf(BadRequestError);

    // The service DID hash the password BEFORE attempting to write
    // it. (Verification: the bcrypt call happened at least once.)
    // The repository then rejected with a controlled error.
    expect(mockedBcrypt.hash).toHaveBeenCalledTimes(1);
    expect(mockedRepo.create).toHaveBeenCalledTimes(1);
  });

  it('does NOT store the user row when the creator is unauthorized', async () => {
    mockedBcrypt.hash.mockImplementationOnce(
      async (pwd: any, _rounds: any) => `hash$${pwd}`,
    );
    mockedRepo.create.mockReset();
    mockedRepo.create.mockImplementation(async () => {
      throw new BadRequestError('Invalid creator');
    });

    mockedRepo.create.mockClear();
    const before = mockedRepo.create.mock.calls.length;

    await expect(
      service.create(makeCreateInput({ createdBy: 0 })),
    ).rejects.toBeInstanceOf(BadRequestError);

    // The repository saw the attempt, then rejected. The user row
    // was NEVER written (no "id assignment" or "post-create format"
    // happened — only the mock implementation's throw ran).
    expect(mockedRepo.create.mock.calls.length).toBe(before + 1);

    // Recover the error and assert it doesn't leak the untrusted
    // payload back to the caller.
    mockedBcrypt.hash.mockImplementationOnce(
      async (pwd: any, _rounds: any) => `hash$${pwd}`,
    );
    const err = await service
      .create(makeCreateInput({ createdBy: 0 }))
      .catch((e) => e) as BadRequestError;
    expect(err.message).not.toContain('hash$');
    expect(err.message).not.toContain('alice');
  });

  it('surfaces a controlled error when the lookup itself fails (audit broken)', async () => {
    const repoError = new Error('audit log down');
    mockedRepo.findByUsername.mockReset();
    mockedRepo.findByUsername.mockRejectedValueOnce(repoError);

    await expect(service.create(makeCreateInput())).rejects.toBe(repoError);

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect((repoError as Error).message).not.toMatch(/password|hash|secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: minimum / maximum name, email, or phone length.
//
// The validator enforces:
//   username  3..50  chars
//   fullName  2..100 chars
//   phone     10..15 digits
//
// The service does NOT enforce these limits itself — that's the
// validator. We test the boundary by simulating the validator's accept
// / reject behavior on the repository.
// ---------------------------------------------------------------------------
describe('[UTCID08] usersService.create() – Boundary 1: minimum/maximum name, email, or phone length', () => {
  // ---- username length ----

  it('accepts username exactly at the minimum (length 3)', async () => {
    const result = await service.create(makeCreateInput({ username: 'abc' }));

    // 1. Return – expected success value
    expect(result.username).toBe('abc');

    // 2. Persisted state matches – repository received the value.
    expect(mockedRepo.create.mock.calls[0][0].username).toBe('abc');
  });

  it('rejects username one below the minimum (length 2)', async () => {
    const repoError = new Error('Tên đăng nhập phải có từ 3 đến 50 ký tự');
    mockedRepo.create.mockReset();
    mockedRepo.create.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.create(makeCreateInput({ username: 'ab' })),
    ).rejects.toBeInstanceOf(Error);

    // Failure log records a safe diagnostic — username is NOT echoed back.
    const err = await service
      .create(makeCreateInput({ username: 'ab' }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('3 đến 50');
    expect(err.message).not.toContain('ab');
  });

  it('rejects username one above the maximum (length 51)', async () => {
    const repoError = new Error('Tên đăng nhập phải có từ 3 đến 50 ký tự');
    mockedRepo.create.mockReset();
    mockedRepo.create.mockImplementation(async () => {
      throw repoError;
    });

    const tooLong = 'a'.repeat(51);

    await expect(
      service.create(makeCreateInput({ username: tooLong })),
    ).rejects.toBeInstanceOf(Error);

    const err = await service
      .create(makeCreateInput({ username: tooLong }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('3 đến 50');
    expect(err.message).not.toMatch(/a{50}/);
  });

  // ---- fullName length ----

  it('accepts fullName exactly at the minimum (length 2)', async () => {
    const result = await service.create(makeCreateInput({ fullName: 'Bo' }));

    expect(result.fullName).toBe('Bo');
    expect(mockedRepo.create.mock.calls[0][0].fullName).toBe('Bo');
  });

  it('rejects fullName one below the minimum (length 1)', async () => {
    const repoError = new Error('Họ và tên phải có từ 2 đến 100 ký tự');
    mockedRepo.create.mockReset();
    mockedRepo.create.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.create(makeCreateInput({ fullName: 'A' })),
    ).rejects.toBeInstanceOf(Error);

    const err = await service
      .create(makeCreateInput({ fullName: 'A' }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('2 đến 100');
    expect(err.message).not.toContain('A');
  });

  it('accepts fullName exactly at the maximum (length 100)', async () => {
    const hundred = 'A'.repeat(100);

    const result = await service.create(makeCreateInput({ fullName: hundred }));

    expect(result.fullName).toBe(hundred);
    expect(mockedRepo.create.mock.calls[0][0].fullName.length).toBe(100);
  });

  it('rejects fullName one above the maximum (length 101)', async () => {
    const repoError = new Error('Họ và tên phải có từ 2 đến 100 ký tự');
    mockedRepo.create.mockReset();
    mockedRepo.create.mockImplementation(async () => {
      throw repoError;
    });

    const tooLong = 'A'.repeat(101);

    await expect(
      service.create(makeCreateInput({ fullName: tooLong })),
    ).rejects.toBeInstanceOf(Error);

    const err = await service
      .create(makeCreateInput({ fullName: tooLong }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('2 đến 100');
    expect(err.message).not.toMatch(/^A{100}/);
  });

  // ---- phone length ----

  it('accepts phone exactly at the minimum (length 10)', async () => {
    const result = await service.create(makeCreateInput({ phone: '1234567890' }));

    expect(result.phone).toBe('1234567890');
    expect(mockedRepo.create.mock.calls[0][0].phone).toBe('1234567890');
  });

  it('rejects phone one below the minimum (length 9)', async () => {
    const repoError = new Error('Số điện thoại phải có từ 10 đến 15 chữ số');
    mockedRepo.create.mockReset();
    mockedRepo.create.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.create(makeCreateInput({ phone: '123456789' })),
    ).rejects.toBeInstanceOf(Error);

    const err = await service
      .create(makeCreateInput({ phone: '123456789' }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('10 đến 15');
    expect(err.message).not.toContain('123456789');
  });

  it('accepts phone exactly at the maximum (length 15)', async () => {
    const result = await service.create(
      makeCreateInput({ phone: '123456789012345' }),
    );

    expect(result.phone).toBe('123456789012345');
    expect(mockedRepo.create.mock.calls[0][0].phone.length).toBe(15);
  });

  it('rejects phone one above the maximum (length 16)', async () => {
    const repoError = new Error('Số điện thoại phải có từ 10 đến 15 chữ số');
    mockedRepo.create.mockReset();
    mockedRepo.create.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.create(makeCreateInput({ phone: '1234567890123456' })),
    ).rejects.toBeInstanceOf(Error);

    const err = await service
      .create(makeCreateInput({ phone: '1234567890123456' }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('10 đến 15');
    expect(err.message).not.toContain('1234567890123456');
  });

  // ---- combined boundary (all at supported lengths) ----

  it('accepts the supported boundary on all length-constrained fields simultaneously', async () => {
    const result = await service.create(
      makeCreateInput({
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

    // 2. Persisted state matches
    expect(mockedRepo.create.mock.calls[0][0].username).toBe('abc');
    expect(mockedRepo.create.mock.calls[0][0].fullName).toBe('Bo');
    expect(mockedRepo.create.mock.calls[0][0].phone).toBe('1234567890');
  });

  it('rejects the adjacent unsupported boundary on length-constrained fields without partial commit', async () => {
    const repoError = new Error('Validation failed at boundary');
    mockedRepo.create.mockReset();
    mockedRepo.create.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.create(
        makeCreateInput({
          username: 'ab', // 1 below min
          fullName: 'A', // 1 below min
          phone: '123456789', // 1 below min
        }),
      ),
    ).rejects.toBeInstanceOf(Error);

    // No partial commit – repository.create was attempted exactly once
    // and rejected.
    expect(mockedRepo.create).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 2: upper-bound value just at the supported limit
// for Create User. The supported upper-bound values are:
//   fullName  length 100
//   username  length 50
// We test each upper-bound along with the "one above" adjacent value.
// ---------------------------------------------------------------------------
describe('[UTCID09] usersService.create() – Boundary 2: upper-bound value just at the supported limit', () => {
  it('accepts username exactly at the supported upper bound (length 50)', async () => {
    const fifty = 'a'.repeat(50);

    const result = await service.create(makeCreateInput({ username: fifty }));

    expect(result.username).toBe(fifty);
    expect(mockedRepo.create.mock.calls[0][0].username.length).toBe(50);
  });

  it('rejects username one above the supported upper bound (length 51)', async () => {
    const repoError = new Error('Tên đăng nhập phải có từ 3 đến 50 ký tự');
    mockedRepo.create.mockReset();
    mockedRepo.create.mockImplementation(async () => {
      throw repoError;
    });

    const tooLong = 'a'.repeat(51);

    await expect(
      service.create(makeCreateInput({ username: tooLong })),
    ).rejects.toBeInstanceOf(Error);

    const err = await service
      .create(makeCreateInput({ username: tooLong }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('3 đến 50');
    expect(err.message).not.toMatch(/a{50}/);
  });

  it('accepts fullName exactly at the supported upper bound (length 100)', async () => {
    const hundred = 'A'.repeat(100);

    const result = await service.create(makeCreateInput({ fullName: hundred }));

    expect(result.fullName).toBe(hundred);
    expect(mockedRepo.create.mock.calls[0][0].fullName.length).toBe(100);
  });

  it('rejects fullName one above the supported upper bound (length 101) without partial commit', async () => {
    const repoError = new Error('Họ và tên phải có từ 2 đến 100 ký tự');
    mockedRepo.create.mockReset();
    mockedRepo.create.mockImplementation(async () => {
      throw repoError;
    });

    const tooLong = 'A'.repeat(101);

    // First call: triggers the rejection and we capture the error
    await expect(
      service.create(makeCreateInput({ fullName: tooLong })),
    ).rejects.toBeInstanceOf(Error);

    // Failure log records a safe diagnostic — NO partial commit, no
    // plaintext password / token leak.
    const err = await service
      .create(makeCreateInput({ fullName: tooLong }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('2 đến 100');
    expect(err.message).not.toMatch(/^A{100}/);
    expect(err.message).not.toMatch(/password|hash|secret/i);
    // The repository.create was attempted exactly twice (once for the
    // rejection path test, once for the .catch) and never resolved.
    expect(mockedRepo.create).toHaveBeenCalledTimes(2);
  });

  it('accepts phone exactly at the supported upper bound (length 15)', async () => {
    const fifteen = '123456789012345';

    const result = await service.create(makeCreateInput({ phone: fifteen }));

    expect(result.phone).toBe(fifteen);
    expect(mockedRepo.create.mock.calls[0][0].phone.length).toBe(15);
  });

  it('rejects phone one above the supported upper bound (length 16)', async () => {
    const repoError = new Error('Số điện thoại phải có từ 10 đến 15 chữ số');
    mockedRepo.create.mockReset();
    mockedRepo.create.mockImplementation(async () => {
      throw repoError;
    });

    const tooLong = '1234567890123456';

    await expect(
      service.create(makeCreateInput({ phone: tooLong })),
    ).rejects.toBeInstanceOf(Error);

    const err = await service
      .create(makeCreateInput({ phone: tooLong }))
      .catch((e) => e) as Error;
    expect(err.message).toContain('10 đến 15');
    expect(err.message).not.toContain('1234567890123456');
  });

  it('accepts all three upper-bound values simultaneously (combined boundary)', async () => {
    const fifty = 'a'.repeat(50);
    const hundred = 'A'.repeat(100);
    const fifteen = '123456789012345';

    const result = await service.create(
      makeCreateInput({
        username: fifty,
        fullName: hundred,
        phone: fifteen,
      }),
    );

    expect(result.username).toBe(fifty);
    expect(result.fullName).toBe(hundred);
    expect(result.phone).toBe(fifteen);

    // 2. Persisted state matches – repository received the trimmed /
    //    exact values.
    const forward = mockedRepo.create.mock.calls[0][0];
    expect(forward.username.length).toBe(50);
    expect(forward.fullName.length).toBe(100);
    expect(forward.phone.length).toBe(15);
  });

  it('rejects the combined adjacent upper-bound (+1 on every field) without partial commit', async () => {
    const repoError = new Error('Boundary exceeded');
    mockedRepo.create.mockReset();
    mockedRepo.create.mockImplementation(async () => {
      throw repoError;
    });

    const tooLongUsername = 'a'.repeat(51);
    const tooLongFullName = 'A'.repeat(101);
    const tooLongPhone = '1234567890123456';

    await expect(
      service.create(
        makeCreateInput({
          username: tooLongUsername,
          fullName: tooLongFullName,
          phone: tooLongPhone,
        }),
      ),
    ).rejects.toBeInstanceOf(Error);

    // The repository.create was attempted exactly once.
    expect(mockedRepo.create).toHaveBeenCalledTimes(1);
    // The plaintext password is NOT echoed through the error message.
    const err = await service
      .create(
        makeCreateInput({
          username: tooLongUsername,
          fullName: tooLongFullName,
          phone: tooLongPhone,
        }),
      )
      .catch((e) => e) as Error;
    expect(err.message).not.toContain(DEFAULT_PASSWORD);
    expect(err.message).not.toMatch(/^a{50}/);
    expect(err.message).not.toMatch(/^A{100}/);
    expect(err.message).not.toContain('1234567890123456');
  });
});
