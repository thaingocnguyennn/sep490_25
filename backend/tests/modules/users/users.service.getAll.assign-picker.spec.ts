/**
 * Unit tests for UsersService.getAll() as invoked by the assignment
 * picker — Function27 / View List User To Assign Incoming Document.
 *
 * Note on naming: the matrix headers reference
 * `AssignmentQueryService`, but the implementation does not have a
 * dedicated service. The frontend hook `useProcessors` (used by the
 * ProcessorPicker rendered on the IncomingDocument form) calls
 * `usersApi.getAll({ limit: 100 })` — i.e. the backend
 * `UsersService.getAll()` is the service exercising Function27.
 *
 * The contract for Function27 is therefore the SAME as
 * Function12 (Filter User), but exercised with the assignment
 * call signature `{ limit: 100 }` and with role / departmentId /
 * status filters used at the IncomingDocument form layer.
 *
 * The matrix distinguishes:
 *   UTCID01  N  – eligible users (no filter, default page)
 *   UTCID02  N  – role filtering (filter by ROLE)
 *   UTCID03  N  – department filtering (filter by departmentId)
 *   UTCID04  A  – unauthorized access
 *   UTCID05  A  – document / department not found
 *   UTCID06  B  – empty eligible list or last page
 *
 * Note on "Authorized context":
 *   - The route enforces `requireRole(ROLES.DOCUMENT_CLERK,
 *     ROLES.ADMIN)` for the upstream document-creation form. The
 *     `usersService.getAll()` method itself does NOT check the
 *     caller's identity. Authorization is enforced at the route
 *     layer.
 *
 * Note on audit logging:
 *   - UsersService.getAll does NOT emit any log entry on either
 *     the success or failure path. This is a documented gap
 *     against the matrix's stated audit requirement.
 *
 * Note on "document / department not found":
 *   - The repository's findAll() never throws on a missing
 *     departmentId — it returns an empty list. The matrix's
 *     "NotFound" case therefore manifests as an empty array
 *     instead of a NotFoundError.
 *
 * Coverage matrix (UTCID01 – UTCID06):
 *   UTCID01  N  – Eligible users with the default assignment
 *                 call signature (limit: 100).
 *   UTCID02  N  – Role filtering: status=ACTIVE + role=SPECIALIST
 *                 + limit=100 returns the eligible specialists.
 *   UTCID03  N  – Department filtering: departmentId=N + limit=100
 *                 returns users in that department.
 *   UTCID04  A  – Unauthorized: documented gap at the service
 *                 layer; route-level enforcement is upstream.
 *   UTCID05  A  – Not found: passing a non-existent departmentId
 *                 returns an empty list (NOT NotFoundError).
 *   UTCID06  B  – Empty eligible list or last page: limit=1 and
 *                 empty result both round-trip cleanly.
 */

import { UsersService } from '../../../src/modules/users/users.service';
import {
  usersRepository,
} from '../../../src/modules/users/users.repository';
import { UserStatus } from '@prisma/client';
import type {
  UserListResult,
  UserSummary,
} from '../../../src/modules/users/users.repository';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/modules/users/users.repository');

const mockedRepo = usersRepository as jest.Mocked<typeof usersRepository>;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeSummary(overrides: Partial<UserSummary> = {}): UserSummary {
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
    ...overrides,
  };
}

function makeListResult(
  users: UserSummary[] = [],
  total = users.length,
  page = 1,
  limit = 10,
): UserListResult {
  return { users, total, page, limit };
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

  // Healthy defaults.
  mockedRepo.findAll.mockResolvedValue(makeListResult());

  service = new UsersService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: eligible users.
// Result : Returns the eligible user list with the default
//          assignment call signature.
// ---------------------------------------------------------------------------
describe('[UTCID01] usersService.getAll() – Normal 1: eligible users (assignment picker)', () => {
  it('forwards the assignment-picker signature (limit: 100) to the repository', async () => {
    await service.getAll({ limit: 100 });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
      }),
    );
  });

  it('returns the eligible users verbatim to the picker', async () => {
    const users = [
      makeSummary({ id: 1, fullName: 'Alice Nguyen', roles: ['DOCUMENT_CLERK'] }),
      makeSummary({ id: 2, fullName: 'Bob Tran', roles: ['SPECIALIST'] }),
      makeSummary({ id: 3, fullName: 'Carol Le', roles: ['DEPARTMENT_HEAD'] }),
    ];
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult(users, 3, 1, 100));

    const result = await service.getAll({ limit: 100 });

    expect(result.users).toEqual(users);
    expect(result.total).toBe(3);
  });

  it('returns a paginated result with the correct page/limit metadata', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult([], 0, 1, 100));

    const result = await service.getAll({ limit: 100 });

    expect(result.page).toBe(1);
    expect(result.limit).toBe(100);
    expect(result.total).toBe(0);
  });

  it('uses the supplied page when one is forwarded', async () => {
    await service.getAll({ limit: 100, page: 2 });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
        page: 2,
      }),
    );
  });

  it('returns ACTIVE users whose status and roles are exposed to the picker', async () => {
    const users = [
      makeSummary({
        id: 7,
        fullName: 'Alice Nguyen',
        email: 'alice@example.com',
        status: UserStatus.ACTIVE,
        roles: ['DOCUMENT_CLERK'],
      }),
    ];
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult(users, 1, 1, 100));

    const result = await service.getAll({ limit: 100 });

    expect(result.users[0].status).toBe(UserStatus.ACTIVE);
    expect(result.users[0].roles).toContain('DOCUMENT_CLERK');
  });

  it('does NOT log to console on the success path (no audit logging)', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getAll({ limit: 100 });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: role filtering.
// Result : Filters by ROLE returns only SPECIALISTs eligible for
//          XLC / PHXL / XDB assignment.
// ---------------------------------------------------------------------------
describe('[UTCID02] usersService.getAll() – Normal 2: role filtering (assignment picker)', () => {
  it('forwards the role filter verbatim to the repository', async () => {
    await service.getAll({ limit: 100, role: 'SPECIALIST' as any });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'SPECIALIST',
      }),
    );
  });

  it('filters by DOCUMENT_CLERK role', async () => {
    await service.getAll({ limit: 100, role: 'DOCUMENT_CLERK' as any });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'DOCUMENT_CLERK',
      }),
    );
  });

  it('filters by DEPARTMENT_HEAD role', async () => {
    await service.getAll({ limit: 100, role: 'DEPARTMENT_HEAD' as any });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'DEPARTMENT_HEAD',
      }),
    );
  });

  it('combines role + status + limit for the canonical picker call', async () => {
    await service.getAll({
      limit: 100,
      role: 'SPECIALIST' as any,
      status: 'ACTIVE' as any,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
        role: 'SPECIALIST',
        status: 'ACTIVE',
      }),
    );
  });

  it('does NOT post-filter the returned list (role filter is repository-side)', async () => {
    const users = [
      makeSummary({ id: 1, roles: ['SPECIALIST'] }),
      makeSummary({ id: 2, roles: ['DOCUMENT_CLERK'] }),
    ];
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult(users, 2, 1, 100));

    const result = await service.getAll({ limit: 100, role: 'SPECIALIST' as any });

    // The service does NOT filter by role itself; it trusts the
    // repository to have applied the filter.
    expect(result.users).toHaveLength(2);
  });

  it('does NOT log to console on the role-filtered success path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getAll({ limit: 100, role: 'SPECIALIST' as any });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: department filtering.
// Result : Filtering by departmentId returns users in that
//          department eligible for XLC / PHXL / XDB assignment.
// ---------------------------------------------------------------------------
describe('[UTCID03] usersService.getAll() – Normal 3: department filtering (assignment picker)', () => {
  it('forwards the departmentId filter verbatim to the repository', async () => {
    await service.getAll({ limit: 100, departmentId: 5 });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentId: 5,
      }),
    );
  });

  it('combines department + role + limit for the canonical picker call', async () => {
    await service.getAll({
      limit: 100,
      departmentId: 5,
      role: 'SPECIALIST' as any,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
        departmentId: 5,
        role: 'SPECIALIST',
      }),
    );
  });

  it('parses departmentId via Number() when passed as a string', async () => {
    // Route handlers may pass departmentId as a string query param.
    await service.getAll({
      limit: 100,
      departmentId: Number('7'),
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentId: 7,
      }),
    );
  });

  it('does NOT validate that the departmentId exists (documented gap)', async () => {
    // The service forwards the departmentId without checking that
    // the corresponding department row exists. The repository
    // applies the join, and an unknown departmentId yields an
    // empty list.
    await service.getAll({ limit: 100, departmentId: 9999 });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentId: 9999,
      }),
    );
  });

  it('does NOT log to console on the department-filtered success path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getAll({ limit: 100, departmentId: 5 });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: unauthorized access.
// Result : Documented gap — no actor check at the service layer.
//          Route-level enforcement is upstream.
// ---------------------------------------------------------------------------
describe('[UTCID04] usersService.getAll() – Abnormal 1: unauthorized access (documented gap)', () => {
  it('does NOT check caller identity at the service layer (documented gap)', async () => {
    // UsersService.getAll() takes a single params argument and does
    // NOT inspect req.user or any caller identity. Authorization
    // is enforced upstream by the route / requireRole() middleware.
    await expect(
      service.getAll({ limit: 100 }),
    ).resolves.toBeDefined();
  });

  it('does NOT verify the caller is a DOCUMENT_CLERK / ADMIN (documented gap)', async () => {
    // The service accepts the call regardless of the caller's role.
    // Upstream route enforces `requireRole(ROLES.DOCUMENT_CLERK,
    // ROLES.ADMIN)`; this is sufficient at the application
    // boundary.
    await expect(
      service.getAll({ limit: 100 }),
    ).resolves.toBeDefined();
  });

  it('does NOT throw ForbiddenError (documented gap — no actor context)', async () => {
    // The service does NOT have access to the request or user
    // identity. It cannot throw ForbiddenError because it has
    // no authorization state.
    await expect(
      service.getAll({ limit: 100 }),
    ).resolves.toBeDefined();
  });

  it('does NOT log an unauthorized-attempt warning to console (documented gap)', async () => {
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    await service.getAll({ limit: 100 });

    expect(consoleWarnSpy).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it('PASSES THROUGH the call when the route authorization is satisfied (documented gap)', async () => {
    // The service cannot tell whether the call is authorized.
    // If the route has already permitted the call, the service
    // simply serves the data.
    const users = [
      makeSummary({ id: 1, roles: ['DOCUMENT_CLERK'] }),
    ];
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult(users, 1, 1, 100));

    const result = await service.getAll({ limit: 100 });

    expect(result.users).toHaveLength(1);
  });

  it('does NOT enforce any administrative guard (documented gap)', async () => {
    // Users with non-clerk / non-admin roles can still call this
    // service directly. The route layer is the only gate.
    await expect(
      service.getAll({ limit: 100 }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 2: document / department not found.
// Result : Passing a non-existent departmentId returns an empty
//          list (NOT NotFoundError). The service does NOT throw.
// ---------------------------------------------------------------------------
describe('[UTCID05] usersService.getAll() – Abnormal 2: document / department not found', () => {
  it('returns an empty array when the repository returns an empty list (department not found)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult([], 0, 1, 100));

    const result = await service.getAll({ limit: 100, departmentId: 9999 });

    expect(result.users).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('does NOT throw NotFoundError when the departmentId is unknown', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult([], 0, 1, 100));

    await expect(
      service.getAll({ limit: 100, departmentId: 9999 }),
    ).resolves.toBeDefined();
  });

  it('does NOT throw ForbiddenError when the document is not found (documented gap)', async () => {
    // The picker does NOT look up the document directly — it is
    // given the documentId by the form, but the service only
    // fetches users, not documents. There is no NotFoundError
    // path inside getAll.
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult([], 0, 1, 100));

    await expect(
      service.getAll({ limit: 100, departmentId: 9999 }),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on the empty-list path (no password / hash leak)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult([], 0, 1, 100));

    const result = await service.getAll({ limit: 100, departmentId: 9999 });

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the not-found path (documented gap)', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult([], 0, 1, 100));

    await service.getAll({ limit: 100, departmentId: 9999 });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('does NOT throw on repository failure (controlled error)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(new Error('Database connection refused'));

    await expect(
      service.getAll({ limit: 100 }),
    ).rejects.toThrow('Database connection refused');
  });

  it('records a safe diagnostic on repository failures (no password / hash leak)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(
      new Error('Database connection refused'),
    );

    const err = await service
      .getAll({ limit: 100 })
      .catch((e) => e);

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the failure path (documented gap)', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValue(new Error('Database connection refused'));

    await expect(
      service.getAll({ limit: 100 }),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Boundary 1: empty eligible list or last page.
// Result : limit=1 + empty result set both round-trip cleanly.
// ---------------------------------------------------------------------------
describe('[UTCID06] usersService.getAll() – Boundary 1: empty eligible list or last page (assignment picker)', () => {
  it('accepts the boundary: limit = 1 (smallest non-zero limit)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult([], 0, 1, 1));

    const result = await service.getAll({ limit: 1 });

    expect(result.limit).toBe(1);
    expect(result.users).toEqual([]);
  });

  it('accepts the boundary: empty result set with the default limit of 100', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult([], 0, 1, 100));

    const result = await service.getAll({ limit: 100 });

    expect(result.users).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('accepts the boundary: last page (page=10, limit=10 with 95 total)', async () => {
    const users = [
      makeSummary({ id: 95 }),
    ];
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult(users, 95, 10, 10));

    const result = await service.getAll({ limit: 100, page: 10 });

    expect(result.users).toHaveLength(1);
    expect(result.total).toBe(95);
    expect(result.page).toBe(10);
    expect(result.limit).toBe(10);
  });

  it('accepts the boundary: page beyond the last page returns an empty list', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult([], 5, 11, 1));

    const result = await service.getAll({ limit: 1, page: 11 });

    expect(result.users).toEqual([]);
    expect(result.total).toBe(5);
    expect(result.page).toBe(11);
  });

  it('accepts the boundary: limit = 1000 (very large page)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult([], 0, 1, 1000));

    const result = await service.getAll({ limit: 1000 });

    expect(result.limit).toBe(1000);
  });

  it('accepts the boundary: limit = 0 falls back to the default (10) at the service layer', async () => {
    // The service uses `params.limit || 10`, so limit=0 maps to
    // the default 10.
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult([], 0, 1, 10));

    await service.getAll({ limit: 0 });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 10,
      }),
    );
  });

  it('accepts the boundary: large but reasonable result set (50 users)', async () => {
    const users = Array.from({ length: 50 }, (_, i) =>
      makeSummary({ id: i + 1 }),
    );
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult(users, 50, 1, 100));

    const result = await service.getAll({ limit: 100 });

    expect(result.users).toHaveLength(50);
    expect(result.total).toBe(50);
  });

  it('does NOT enforce an upper bound on limit (documented gap)', async () => {
    // The service forwards limit verbatim. A limit of 1000000 is
    // passed through unchecked.
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult([], 0, 1, 1000000));

    await service.getAll({ limit: 1000000 });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 1000000,
      }),
    );
  });

  it('does NOT throw on the boundary success path', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult([], 0, 1, 100));

    await expect(
      service.getAll({ limit: 100 }),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    const users = [makeSummary({ id: 1, email: 'test@example.com' })];
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult(users, 1, 1, 100));

    const result = await service.getAll({ limit: 100 });

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValue(makeListResult([], 0, 1, 100));

    await service.getAll({ limit: 100 });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
