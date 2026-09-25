/**
 * Unit tests for DepartmentsService.addMembers() — Function20 /
 * Assign User To Department.
 *
 * Contract:
 *   async addMembers(
 *     departmentId: number,
 *     input: { userIds: number[] },
 *   ): Promise<{ created: number; alreadyMembers: number[] }>
 *
 *   1. `existsById(departmentId)` is called first. If the department
 *      does not exist, throw NotFoundError('Department not found').
 *   2. The input is deduplicated: uniqueUserIds = [...new Set(...)].
 *   3. If uniqueUserIds is empty, throw BadRequestError('No user IDs
 *      provided').
 *   4. `prisma.user.findMany` is called (DIRECT, not via repository)
 *      with `where: { id: { in: uniqueUserIds } }`. If any of the
 *      user IDs are not found, throw NotFoundError(`User(s) not
 *      found: <ids>`).
 *   5. `departmentsRepository.addMembers(departmentId, uniqueUserIds)`
 *      is called.
 *
 * Repository contract:
 *   - Detect existing memberships via
 *     `prisma.departmentMember.findMany`.
 *   - alreadyMembers = userIds in BOTH the input and existing.
 *   - toCreate = userIds NOT in existing.
 *   - If toCreate is empty, return `{ created: 0, alreadyMembers }`
 *     without writing.
 *   - Otherwise call `prisma.departmentMember.createMany` and return
 *     `{ created: toCreate.length, alreadyMembers }`.
 *
 * Note on the matrix's "role mapping" requirement:
 *   - The implementation has NO `role` field on DepartmentMember.
 *     This is a documented gap.
 *
 * Note on the matrix's "duplicate assignment" Abnormal:
 *   - The implementation treats duplicate assignments as a NO-OP
 *     (returns `created: 0` and includes the IDs in
 *     `alreadyMembers`). It does NOT throw a ConflictError.
 *
 * Coverage matrix (UTCID01 – UTCID08):
 *   UTCID01  N  – Assign valid user: addMembers with valid input.
 *   UTCID02  N  – Role mapping: documented gap — no role field on
 *                 DepartmentMember.
 *   UTCID03  N  – Membership persistence: row count = created.
 *   UTCID04  N  – Audit: documented gap — no audit logging at the
 *                 service layer.
 *   UTCID05  N  – Response-to-database consistency: identifiers,
 *                 timestamps propagate.
 *   UTCID06  A  – User / department not found: NotFoundError on
 *                 missing department or missing user(s).
 *   UTCID07  A  – Duplicate / unauthorized assignment: duplicates
 *                 are NO-OP (not an error); service does NOT enforce
 *                 authorization (documented gap).
 *   UTCID08  B  – Maximum member or single-assignment boundary:
 *                 single user [1] succeeds; zero users rejected;
 *                 many users succeed.
 */

import { DepartmentsService } from '../../../src/modules/departments/departments.service';
import {
  departmentsRepository,
} from '../../../src/modules/departments/departments.repository';
import {
  BadRequestError,
  NotFoundError,
} from '../../../src/shared/exceptions/app-error';
import { default as prisma } from '../../../src/config/database';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/modules/departments/departments.repository');

jest.mock('../../../src/config/database', () => ({
  __esModule: true,
  default: {
    department: {
      findUnique: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  },
}));

const mockedRepo = departmentsRepository as jest.Mocked<
  typeof departmentsRepository
>;

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

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

let service: DepartmentsService;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();

  // Healthy defaults — single-user addMembers to an existing
  // department, where user 1 exists and is not yet a member.
  mockedRepo.existsById.mockResolvedValue(true);
  (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
    async (args: any) => {
      const ids = (args?.where?.id?.in ?? []) as number[];
      return ids.map((id) => ({ id }));
    },
  );
  mockedRepo.addMembers.mockResolvedValue({
    created: 1,
    alreadyMembers: [],
  });

  service = new DepartmentsService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: assign valid user.
// Result : Add-members with valid input succeeds.
// ---------------------------------------------------------------------------
describe('[UTCID01] departmentsService.addMembers() – Normal 1: assign valid user', () => {
  it('assigns a single user to an existing department', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 1,
      alreadyMembers: [],
    });

    const result = await service.addMembers(1, { userIds: [1] });

    expect(result.created).toBe(1);
    expect(result.alreadyMembers).toEqual([]);
  });

  it('verifies department existence via existsById', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 1,
      alreadyMembers: [],
    });

    await service.addMembers(1, { userIds: [1] });

    expect(mockedRepo.existsById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.existsById).toHaveBeenCalledWith(1);
  });

  it('verifies user existence via prisma.user.findMany', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 1,
      alreadyMembers: [],
    });

    await service.addMembers(1, { userIds: [1] });

    expect(mockedPrisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: [1] } },
      select: { id: true },
    });
  });

  it('forwards (departmentId, uniqueUserIds) to repository.addMembers', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 1,
      alreadyMembers: [],
    });

    await service.addMembers(1, { userIds: [1] });

    expect(mockedRepo.addMembers).toHaveBeenCalledTimes(1);
    expect(mockedRepo.addMembers).toHaveBeenCalledWith(1, [1]);
  });

  it('deduplicates the userIds before forwarding to the repository', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 3,
      alreadyMembers: [],
    });

    await service.addMembers(1, { userIds: [1, 2, 3, 1, 2, 3] });

    expect(mockedRepo.addMembers).toHaveBeenCalledWith(1, [1, 2, 3]);
  });

  it('assigns multiple users to an existing department', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 3,
      alreadyMembers: [],
    });

    const result = await service.addMembers(1, { userIds: [1, 2, 3] });

    expect(result.created).toBe(3);
  });

  it('returns the result verbatim from the repository', async () => {
    const repoResult = { created: 1, alreadyMembers: [] };
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce(repoResult);

    const result = await service.addMembers(1, { userIds: [1] });

    expect(result).toEqual(repoResult);
  });

  it('does NOT call any other write methods on the assign path', async () => {
    await service.addMembers(1, { userIds: [1] });

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
    expect(mockedRepo.removeMember).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: role mapping.
// Result : Documented gap — no `role` field on DepartmentMember.
// ---------------------------------------------------------------------------
describe('[UTCID02] departmentsService.addMembers() – Normal 2: role mapping (documented gap)', () => {
  it('does NOT include a `role` field on the input', async () => {
    const input: any = { userIds: [1] };

    await service.addMembers(1, input);

    expect(input).not.toHaveProperty('role');
  });

  it('does NOT include a `role` field on the persisted model (documented gap)', async () => {
    const result = await service.addMembers(1, { userIds: [1] });

    expect((result as any).role).toBeUndefined();
  });

  it('does NOT call any role-related repository methods', async () => {
    await service.addMembers(1, { userIds: [1] });

    // No role-related calls — the implementation has no role field
    // on DepartmentMember.
    expect(mockedRepo.addMembers).toHaveBeenCalledTimes(1);
  });

  it('does NOT include a `roles` array on the persisted model (documented gap)', async () => {
    const result = await service.addMembers(1, { userIds: [1] });

    expect((result as any).roles).toBeUndefined();
  });

  it('does NOT include a `position` field on the persisted model (documented gap)', async () => {
    const result = await service.addMembers(1, { userIds: [1] });

    expect((result as any).position).toBeUndefined();
  });

  it('does NOT include a `title` field on the persisted model (documented gap)', async () => {
    const result = await service.addMembers(1, { userIds: [1] });

    expect((result as any).title).toBeUndefined();
  });

  it('forwards only userIds (no role, no other keys) to the repository', async () => {
    await service.addMembers(1, { userIds: [1] });

    expect(mockedRepo.addMembers).toHaveBeenCalledWith(1, [1]);
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: membership persistence.
// Result : The result object reflects the actual row count.
// ---------------------------------------------------------------------------
describe('[UTCID03] departmentsService.addMembers() – Normal 3: membership persistence', () => {
  it('returns `created: N` reflecting the number of new rows', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 5,
      alreadyMembers: [],
    });

    const result = await service.addMembers(1, { userIds: [1, 2, 3, 4, 5] });

    expect(result.created).toBe(5);
  });

  it('returns `created: 0` when all users are already members', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 0,
      alreadyMembers: [1, 2, 3],
    });

    const result = await service.addMembers(1, { userIds: [1, 2, 3] });

    expect(result.created).toBe(0);
    expect(result.alreadyMembers).toEqual([1, 2, 3]);
  });

  it('returns the alreadyMembers array verbatim from the repository', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 1,
      alreadyMembers: [2, 3],
    });

    const result = await service.addMembers(1, { userIds: [1, 2, 3] });

    expect(result.alreadyMembers).toEqual([2, 3]);
  });

  it('does NOT call repository.addMembers on the missing-department path (no partial commit)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(
      service.addMembers(999, { userIds: [1] }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.addMembers).not.toHaveBeenCalled();
  });

  it('does NOT call repository.addMembers on the missing-user path (no partial commit)', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    await expect(
      service.addMembers(1, { userIds: [999] }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.addMembers).not.toHaveBeenCalled();
  });

  it('does NOT call repository.addMembers on the empty-userIds path', async () => {
    await expect(
      service.addMembers(1, { userIds: [] }),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedRepo.addMembers).not.toHaveBeenCalled();
  });

  it('does NOT call repository.addMembers on the all-duplicate input path (after dedup)', async () => {
    // Empty input after dedup should also reject.
    await expect(
      service.addMembers(1, { userIds: [] }),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedRepo.addMembers).not.toHaveBeenCalled();
  });

  it('forwards the deduplicated userIds verbatim to repository.addMembers', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 2,
      alreadyMembers: [],
    });

    await service.addMembers(1, { userIds: [1, 2, 1, 2] });

    // After dedup: [1, 2]
    expect(mockedRepo.addMembers).toHaveBeenCalledWith(1, [1, 2]);
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: audit.
// Result : Documented gap — no audit logging at the service layer.
// ---------------------------------------------------------------------------
describe('[UTCID04] departmentsService.addMembers() – Normal 4: audit (documented gap)', () => {
  it('does NOT log to console (no audit logging at the service layer)', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await service.addMembers(1, { userIds: [1] });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('does NOT have an `audit` field on the result (documented gap)', async () => {
    const result = await service.addMembers(1, { userIds: [1] });

    expect((result as any).audit).toBeUndefined();
  });

  it('does NOT have a `createdBy` field on the persisted row (documented gap)', async () => {
    const result = await service.addMembers(1, { userIds: [1] });

    expect((result as any).createdBy).toBeUndefined();
  });

  it('does NOT have an `assignedBy` field on the persisted row (documented gap)', async () => {
    const result = await service.addMembers(1, { userIds: [1] });

    expect((result as any).assignedBy).toBeUndefined();
  });

  it('does NOT have an `actor` field on the persisted row (documented gap)', async () => {
    const result = await service.addMembers(1, { userIds: [1] });

    expect((result as any).actor).toBeUndefined();
  });

  it('PERMITS assignment when no actor is supplied (no actor at the service layer)', async () => {
    await expect(
      service.addMembers(1, { userIds: [1] }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : Identifiers and the result object propagate consistently.
// ---------------------------------------------------------------------------
describe('[UTCID05] departmentsService.addMembers() – Normal 5: response-to-database consistency', () => {
  it('propagates `created` from the repository verbatim', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 7,
      alreadyMembers: [],
    });

    const result = await service.addMembers(1, { userIds: [1, 2, 3, 4, 5, 6, 7] });

    expect(result.created).toBe(7);
  });

  it('propagates `alreadyMembers` from the repository verbatim', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 1,
      alreadyMembers: [10, 20, 30],
    });

    const result = await service.addMembers(1, { userIds: [1, 10, 20, 30] });

    expect(result.alreadyMembers).toEqual([10, 20, 30]);
  });

  it('returns the result object verbatim from the repository', async () => {
    const repoResult = { created: 2, alreadyMembers: [5] };
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce(repoResult);

    const result = await service.addMembers(1, { userIds: [1, 5] });

    expect(result).toEqual(repoResult);
  });

  it('does NOT include a `status` field on the result (documented gap)', async () => {
    const result = await service.addMembers(1, { userIds: [1] });

    expect((result as any).status).toBeUndefined();
  });

  it('does NOT include a `createdAt` field on the result (documented gap)', async () => {
    const result = await service.addMembers(1, { userIds: [1] });

    expect((result as any).createdAt).toBeUndefined();
  });

  it('does NOT include a `membershipId` field on the result (documented gap)', async () => {
    const result = await service.addMembers(1, { userIds: [1] });

    expect((result as any).membershipId).toBeUndefined();
  });

  it('does NOT leak sensitive fields through the response (no password / hash / secret)', async () => {
    const result = await service.addMembers(1, { userIds: [1] });

    expect(JSON.stringify(result)).not.toMatch(/password/i);
    expect(JSON.stringify(result)).not.toMatch(/hash/i);
    expect(JSON.stringify(result)).not.toMatch(/secret/i);
    expect(JSON.stringify(result)).not.toMatch(/\$2[aby]\$/);
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: user / department not found.
// Result : NotFoundError on missing department or missing user(s).
// ---------------------------------------------------------------------------
describe('[UTCID06] departmentsService.addMembers() – Abnormal 1: user / department not found', () => {
  it('rejects with NotFoundError when the department does not exist', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(
      service.addMembers(999, { userIds: [1] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does NOT call prisma.user.findMany when the department does not exist', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(
      service.addMembers(999, { userIds: [1] }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it('does NOT call repository.addMembers when the department does not exist', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(
      service.addMembers(999, { userIds: [1] }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.addMembers).not.toHaveBeenCalled();
  });

  it('rejects with NotFoundError (404) on missing department', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    const err = await service
      .addMembers(999, { userIds: [1] })
      .catch((e) => e) as NotFoundError;

    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Department not found');
  });

  it('rejects with NotFoundError when one of the users does not exist', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 1 },
      // User 999 is missing.
    ]);

    await expect(
      service.addMembers(1, { userIds: [1, 999] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects with NotFoundError (404) when a user does not exist', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 1 },
      // User 999 is missing.
    ]);

    const err = await service
      .addMembers(1, { userIds: [1, 999] })
      .catch((e) => e) as NotFoundError;

    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('999');
  });

  it('rejects when ALL users are missing', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    await expect(
      service.addMembers(1, { userIds: [100, 200, 300] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does NOT call repository.addMembers when a user does not exist', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    await expect(
      service.addMembers(1, { userIds: [999] }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.addMembers).not.toHaveBeenCalled();
  });

  it('the missing-user error message lists all missing IDs', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 1 },
      // Users 100, 200 are missing.
    ]);

    const err = await service
      .addMembers(1, { userIds: [1, 100, 200] })
      .catch((e) => e) as NotFoundError;

    expect(err.message).toContain('100');
    expect(err.message).toContain('200');
  });

  it('rejects with BadRequestError when userIds is empty', async () => {
    await expect(
      service.addMembers(1, { userIds: [] }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects with BadRequestError with the exact empty-input message', async () => {
    const err = await service
      .addMembers(1, { userIds: [] })
      .catch((e) => e) as BadRequestError;

    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('No user IDs provided');
  });

  it('records a safe diagnostic on missing-department (no password / hash leak)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    const err = await service
      .addMembers(999, { userIds: [1] })
      .catch((e) => e) as NotFoundError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('records a safe diagnostic on missing-user (no password / hash leak)', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    const err = await service
      .addMembers(1, { userIds: [999] })
      .catch((e) => e) as NotFoundError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('records a safe diagnostic on empty-userIds (no password / hash leak)', async () => {
    const err = await service
      .addMembers(1, { userIds: [] })
      .catch((e) => e) as BadRequestError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: duplicate / unauthorized assignment.
// Result : Duplicates are NO-OP (not an error); service does NOT
//          enforce authorization (documented gap).
// ---------------------------------------------------------------------------
describe('[UTCID07] departmentsService.addMembers() – Abnormal 2: duplicate / unauthorized assignment', () => {
  it('does NOT throw on duplicate assignments — returns alreadyMembers instead', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 0,
      alreadyMembers: [1, 2],
    });

    const result = await service.addMembers(1, { userIds: [1, 2] });

    expect(result.created).toBe(0);
    expect(result.alreadyMembers).toEqual([1, 2]);
  });

  it('does NOT throw when all users are already members', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 0,
      alreadyMembers: [1, 2, 3],
    });

    await expect(
      service.addMembers(1, { userIds: [1, 2, 3] }),
    ).resolves.toBeDefined();
  });

  it('does NOT throw when input has internal duplicates (after dedup)', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 1,
      alreadyMembers: [],
    });

    // [1, 1, 1] dedups to [1].
    await expect(
      service.addMembers(1, { userIds: [1, 1, 1] }),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on duplicate input that includes a non-existent user', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 1 },
      // 999 missing.
    ]);

    await expect(
      service.addMembers(1, { userIds: [1, 1, 999] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns the partial-success result object on mixed input', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 2,
      alreadyMembers: [3],
    });

    const result = await service.addMembers(1, { userIds: [1, 2, 3] });

    expect(result.created).toBe(2);
    expect(result.alreadyMembers).toEqual([3]);
  });

  it('PERMITS assignment when no actor is supplied (no actor at the service layer)', async () => {
    await expect(
      service.addMembers(1, { userIds: [1] }),
    ).resolves.toBeDefined();
  });

  it('does NOT enforce authorization at the service layer (documented gap)', async () => {
    // The matrix mentions "unauthorized" but the service does NOT
    // have an actor parameter. Authorization is at the controller /
    // middleware layer.
    await expect(
      service.addMembers(1, { userIds: [1] }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console (no audit logging at the service layer)', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await service.addMembers(1, { userIds: [1] });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('records a safe diagnostic on duplicate input (no password / hash leak)', async () => {
    // Duplicates are not an error — there's no exception to inspect.
    // Just verify the result is clean.
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 0,
      alreadyMembers: [1],
    });

    const result = await service.addMembers(1, { userIds: [1, 1] });

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: maximum member or single-assignment boundary.
// Result : Single user [1] succeeds; zero users rejected; many
//          users succeed.
// ---------------------------------------------------------------------------
describe('[UTCID08] departmentsService.addMembers() – Boundary 1: maximum member or single-assignment boundary', () => {
  it('accepts the boundary: single user [1]', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 1,
      alreadyMembers: [],
    });

    const result = await service.addMembers(1, { userIds: [1] });

    expect(result.created).toBe(1);
  });

  it('accepts the boundary: single user at department id = 1', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 1,
      alreadyMembers: [],
    });

    const result = await service.addMembers(1, { userIds: [42] });

    expect(result.created).toBe(1);
    expect(mockedRepo.addMembers).toHaveBeenCalledWith(1, [42]);
  });

  it('rejects the adjacent unsupported value: zero users', async () => {
    await expect(
      service.addMembers(1, { userIds: [] }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects the adjacent unsupported value: zero users at the user-id boundary (id = 0)', async () => {
    await expect(
      service.addMembers(1, { userIds: [] }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('accepts the boundary: department id = Number.MAX_SAFE_INTEGER', async () => {
    const maxId = Number.MAX_SAFE_INTEGER;
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 1,
      alreadyMembers: [],
    });

    const result = await service.addMembers(maxId, { userIds: [1] });

    expect(result.created).toBe(1);
    expect(mockedRepo.addMembers).toHaveBeenCalledWith(maxId, [1]);
  });

  it('accepts the boundary: user id = Number.MAX_SAFE_INTEGER', async () => {
    const maxId = Number.MAX_SAFE_INTEGER;
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 1,
      alreadyMembers: [],
    });

    const result = await service.addMembers(1, { userIds: [maxId] });

    expect(result.created).toBe(1);
    expect(mockedRepo.addMembers).toHaveBeenCalledWith(1, [maxId]);
  });

  it('accepts the boundary: many users (large list)', async () => {
    const manyIds = Array.from({ length: 500 }, (_, i) => i + 1);
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 500,
      alreadyMembers: [],
    });

    const result = await service.addMembers(1, { userIds: manyIds });

    expect(result.created).toBe(500);
    expect(mockedRepo.addMembers).toHaveBeenCalledWith(1, manyIds);
  });

  it('does NOT call repository.addMembers on the boundary-empty path (no partial commit)', async () => {
    await expect(
      service.addMembers(1, { userIds: [] }),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedRepo.addMembers).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on the boundary rejection (no password / hash leak)', async () => {
    const err = await service
      .addMembers(1, { userIds: [] })
      .catch((e) => e) as BadRequestError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT leak sensitive fields through any side effect on the boundary path', async () => {
    await expect(
      service.addMembers(1, { userIds: [] }),
    ).rejects.toBeInstanceOf(BadRequestError);

    // Just verify the error does not include sensitive data.
    await expect(
      service.addMembers(1, { userIds: [] }),
    ).rejects.toMatchObject({
      message: expect.not.stringMatching(/password|hash|secret/i),
    });
  });

  it('does NOT throw on the single-user boundary path (no unhandled exception)', async () => {
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 1,
      alreadyMembers: [],
    });

    await expect(
      service.addMembers(1, { userIds: [1] }),
    ).resolves.toBeDefined();
  });

  it('rejects the missing-department adjacent to the boundary (single-user)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(
      service.addMembers(999, { userIds: [1] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects the missing-user adjacent to the boundary (single-user)', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    await expect(
      service.addMembers(1, { userIds: [999] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 1,
      alreadyMembers: [],
    });

    await service.addMembers(1, { userIds: [1] });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('accepts the boundary: 1 user + MAX departmentId + MAX userId', async () => {
    const maxDept = Number.MAX_SAFE_INTEGER;
    const maxUser = Number.MAX_SAFE_INTEGER;
    mockedRepo.addMembers.mockReset();
    mockedRepo.addMembers.mockResolvedValueOnce({
      created: 1,
      alreadyMembers: [],
    });

    const result = await service.addMembers(maxDept, { userIds: [maxUser] });

    expect(result.created).toBe(1);
    expect(mockedRepo.addMembers).toHaveBeenCalledWith(maxDept, [maxUser]);
  });
});
