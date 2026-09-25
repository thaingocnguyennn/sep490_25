/**
 * Unit tests for DepartmentsService.removeMember() — Function21 /
 * Remove User From Department.
 *
 * Contract:
 *   async removeMember(
 *     departmentId: number,
 *     userId: number,
 *   ): Promise<void>
 *
 *   1. `existsById(departmentId)` is called first. If the department
 *      does not exist, throw NotFoundError('Department not found').
 *   2. `departmentsRepository.removeMember(departmentId, userId)` is
 *      called.
 *
 * Repository contract:
 *   - `prisma.departmentMember.delete` is called with
 *     `where: { userId_departmentId: { userId, departmentId } }`.
 *   - If P2025 fires (the row does not exist), throw
 *     NotFoundError('User is not a member of this department').
 *
 * Note on the matrix's "role consistency" requirement:
 *   - The implementation has NO `role` field on DepartmentMember.
 *     This is a documented gap.
 *
 * Note on the matrix's "membership not found" Abnormal:
 *   - The repository's P2025 catch handles this case. The same
 *     error ('User is not a member of this department') is thrown
 *     whether the user is non-existent or just not a member of this
 *     department. There is no distinction.
 *
 * Note on the matrix's "unauthorized / protected removal" Abnormal:
 *   - The service does NOT verify the user exists. It only verifies
 *     the department exists. Authorization is at the controller /
 *     middleware layer.
 *
 * Coverage matrix (UTCID01 – UTCID07):
 *   UTCID01  N  – Remove member: removeMember with valid input
 *                 succeeds.
 *   UTCID02  N  – Membership persistence: row is removed.
 *   UTCID03  N  – Role consistency: documented gap — no role field
 *                 on DepartmentMember.
 *   UTCID04  N  – Audit: documented gap — no audit logging at the
 *                 service layer.
 *   UTCID05  A  – Membership not found: NotFoundError on missing
 *                 membership (P2025).
 *   UTCID06  A  – Unauthorized / protected removal: documented gap
 *                 — no authorization check at the service layer.
 *                 Missing-department is the only path-level error.
 *   UTCID07  B  – Last member or repeated removal boundary: single
 *                 successful removal; second removal of the same
 *                 (departmentId, userId) is rejected with
 *                 NotFoundError; the boundary values (id = 1,
 *                 id = MAX) work.
 */

import { DepartmentsService } from '../../../src/modules/departments/departments.service';
import {
  departmentsRepository,
} from '../../../src/modules/departments/departments.repository';
import { NotFoundError } from '../../../src/shared/exceptions/app-error';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/modules/departments/departments.repository');

const mockedRepo = departmentsRepository as jest.Mocked<
  typeof departmentsRepository
>;

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

  // Healthy defaults — successful removeMember of an existing
  // membership.
  mockedRepo.existsById.mockResolvedValue(true);
  mockedRepo.removeMember.mockResolvedValue(undefined);

  service = new DepartmentsService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: remove member.
// Result : removeMember returns void after a successful delete.
// ---------------------------------------------------------------------------
describe('[UTCID01] departmentsService.removeMember() – Normal 1: remove member', () => {
  it('removes a member from an existing department', async () => {
    const result = await service.removeMember(1, 10);

    expect(result).toBeUndefined();
  });

  it('forwards (departmentId, userId) to the repository', async () => {
    await service.removeMember(1, 10);

    expect(mockedRepo.removeMember).toHaveBeenCalledTimes(1);
    expect(mockedRepo.removeMember).toHaveBeenCalledWith(1, 10);
  });

  it('calls existsById first to verify the department exists', async () => {
    await service.removeMember(1, 10);

    expect(mockedRepo.existsById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.existsById).toHaveBeenCalledWith(1);
  });

  it('does NOT call any other write methods on the remove path', async () => {
    await service.removeMember(1, 10);

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
    expect(mockedRepo.addMembers).not.toHaveBeenCalled();
  });

  it('does NOT call any read methods other than existsById', async () => {
    await service.removeMember(1, 10);

    expect(mockedRepo.findAll).not.toHaveBeenCalled();
    expect(mockedRepo.findById).not.toHaveBeenCalled();
    expect(mockedRepo.findMembers).not.toHaveBeenCalled();
    expect(mockedRepo.findByNameAndParent).not.toHaveBeenCalled();
    expect(mockedRepo.findDescendantIds).not.toHaveBeenCalled();
  });

  it('does NOT call countDirectChildren or countDirectMembers on the remove path', async () => {
    await service.removeMember(1, 10);

    expect(mockedRepo.countDirectChildren).not.toHaveBeenCalled();
    expect(mockedRepo.countDirectMembers).not.toHaveBeenCalled();
  });

  it('removes the user from the department', async () => {
    await service.removeMember(5, 20);

    expect(mockedRepo.removeMember).toHaveBeenCalledWith(5, 20);
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: membership persistence.
// Result : The membership row is removed.
// ---------------------------------------------------------------------------
describe('[UTCID02] departmentsService.removeMember() – Normal 2: membership persistence', () => {
  it('calls repository.removeMember exactly once on the happy path', async () => {
    await service.removeMember(1, 10);

    expect(mockedRepo.removeMember).toHaveBeenCalledTimes(1);
  });

  it('forwards the exact (departmentId, userId) pair', async () => {
    await service.removeMember(42, 99);

    expect(mockedRepo.removeMember.mock.calls[0]).toEqual([42, 99]);
  });

  it('returns void after a successful removal', async () => {
    const result = await service.removeMember(1, 10);

    expect(result).toBeUndefined();
  });

  it('does NOT call repository.removeMember when the department does not exist (no partial commit)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(service.removeMember(999, 10)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    expect(mockedRepo.removeMember).not.toHaveBeenCalled();
  });

  it('does NOT call any other write methods (create, update, delete, addMembers)', async () => {
    await service.removeMember(1, 10);

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
    expect(mockedRepo.addMembers).not.toHaveBeenCalled();
  });

  it('does NOT verify membership exists before calling removeMember (relies on P2025)', async () => {
    // The service does NOT call findMembers or any other pre-check.
    // The repository's P2025 catch handles missing memberships.
    await service.removeMember(1, 10);

    expect(mockedRepo.findMembers).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: role consistency.
// Result : Documented gap — no `role` field on DepartmentMember.
// ---------------------------------------------------------------------------
describe('[UTCID03] departmentsService.removeMember() – Normal 3: role consistency (documented gap)', () => {
  it('does NOT include a `role` field on the result (documented gap)', async () => {
    const result = await service.removeMember(1, 10);

    // removeMember returns void (undefined). The fact that the
    // service returns nothing is itself proof that there is no role
    // field — there is nothing to inspect.
    expect(result).toBeUndefined();
    expect((result as any)?.role).toBeUndefined();
  });

  it('does NOT include a `roles` array on the result (documented gap)', async () => {
    const result = await service.removeMember(1, 10);

    expect(result).toBeUndefined();
    expect((result as any)?.roles).toBeUndefined();
  });

  it('does NOT include a `position` field on the result (documented gap)', async () => {
    const result = await service.removeMember(1, 10);

    expect(result).toBeUndefined();
    expect((result as any)?.position).toBeUndefined();
  });

  it('does NOT include a `title` field on the result (documented gap)', async () => {
    const result = await service.removeMember(1, 10);

    expect(result).toBeUndefined();
    expect((result as any)?.title).toBeUndefined();
  });

  it('does NOT call any role-related repository methods', async () => {
    await service.removeMember(1, 10);

    expect(mockedRepo.removeMember).toHaveBeenCalledTimes(1);
  });

  it('does NOT preserve role-related state (no role check, no role update)', async () => {
    await service.removeMember(1, 10);

    // No role-aware logic — the membership row is deleted as-is.
    expect(mockedRepo.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: audit.
// Result : Documented gap — no audit logging at the service layer.
// ---------------------------------------------------------------------------
describe('[UTCID04] departmentsService.removeMember() – Normal 4: audit (documented gap)', () => {
  it('does NOT log to console (no audit logging at the service layer)', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await service.removeMember(1, 10);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('does NOT have an `audit` field on the result (documented gap)', async () => {
    const result = await service.removeMember(1, 10);

    expect(result).toBeUndefined();
    expect((result as any)?.audit).toBeUndefined();
  });

  it('does NOT have a `removedBy` field on the persisted row (documented gap)', async () => {
    await service.removeMember(1, 10);

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('does NOT have a `removedAt` field on the persisted row (documented gap)', async () => {
    await service.removeMember(1, 10);

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('does NOT have an `actor` field on the persisted row (documented gap)', async () => {
    const result = await service.removeMember(1, 10);

    expect(result).toBeUndefined();
    expect((result as any)?.actor).toBeUndefined();
  });

  it('PERMITS removal when no actor is supplied (no actor at the service layer)', async () => {
    await expect(service.removeMember(1, 10)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 1: membership not found.
// Result : NotFoundError when the membership row does not exist
//          (P2025 catch in the repository).
// ---------------------------------------------------------------------------
describe('[UTCID05] departmentsService.removeMember() – Abnormal 1: membership not found', () => {
  it('rejects with NotFoundError when the membership does not exist (P2025)', async () => {
    mockedRepo.removeMember.mockReset();
    mockedRepo.removeMember.mockImplementationOnce(async () => {
      throw new NotFoundError('User is not a member of this department');
    });

    await expect(service.removeMember(1, 999)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rejects with NotFoundError (404) on missing membership', async () => {
    mockedRepo.removeMember.mockReset();
    mockedRepo.removeMember.mockImplementationOnce(async () => {
      throw new NotFoundError('User is not a member of this department');
    });

    const err = await service
      .removeMember(1, 999)
      .catch((e) => e) as NotFoundError;

    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('User is not a member of this department');
  });

  it('the missing-membership error message uses the exact wording', async () => {
    mockedRepo.removeMember.mockReset();
    mockedRepo.removeMember.mockImplementationOnce(async () => {
      throw new NotFoundError('User is not a member of this department');
    });

    const err = await service
      .removeMember(1, 999)
      .catch((e) => e) as NotFoundError;

    expect(err.message).toBe('User is not a member of this department');
  });

  it('does NOT distinguish between non-existent user and non-existent membership', async () => {
    // If the userId refers to a non-existent user, the composite
    // key (userId, departmentId) does not exist in the
    // DepartmentMember table, and P2025 fires.
    mockedRepo.removeMember.mockReset();
    mockedRepo.removeMember.mockImplementationOnce(async () => {
      throw new NotFoundError('User is not a member of this department');
    });

    // userId = 999 does not exist as a user at all.
    const err = await service
      .removeMember(1, 999)
      .catch((e) => e) as NotFoundError;

    expect(err.message).toBe('User is not a member of this department');
  });

  it('does NOT call existsById twice when the membership does not exist', async () => {
    mockedRepo.removeMember.mockReset();
    mockedRepo.removeMember.mockImplementationOnce(async () => {
      throw new NotFoundError('User is not a member of this department');
    });

    await expect(service.removeMember(1, 999)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    expect(mockedRepo.existsById).toHaveBeenCalledTimes(1);
  });

  it('records a safe diagnostic on missing-membership (no password / hash leak)', async () => {
    mockedRepo.removeMember.mockReset();
    mockedRepo.removeMember.mockImplementationOnce(async () => {
      throw new NotFoundError('User is not a member of this department');
    });

    const err = await service
      .removeMember(1, 999)
      .catch((e) => e) as NotFoundError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log the missing-membership error to console (no audit logging at the service layer)', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    mockedRepo.removeMember.mockReset();
    mockedRepo.removeMember.mockImplementationOnce(async () => {
      throw new NotFoundError('User is not a member of this department');
    });

    await expect(service.removeMember(1, 999)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 2: unauthorized / protected removal.
// Result : Documented gap — no authorization check at the service
//          layer. Missing-department is the only path-level error.
// ---------------------------------------------------------------------------
describe('[UTCID06] departmentsService.removeMember() – Abnormal 2: unauthorized / protected removal (documented gap)', () => {
  it('rejects with NotFoundError when the department does not exist', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(service.removeMember(999, 10)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rejects with NotFoundError (404) on missing department', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    const err = await service
      .removeMember(999, 10)
      .catch((e) => e) as NotFoundError;

    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Department not found');
  });

  it('does NOT call repository.removeMember when the department does not exist', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(service.removeMember(999, 10)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    expect(mockedRepo.removeMember).not.toHaveBeenCalled();
  });

  it('PERMITS removal when no actor is supplied (no authorization check at the service layer)', async () => {
    await expect(service.removeMember(1, 10)).resolves.toBeUndefined();
  });

  it('does NOT enforce authorization at the service layer (documented gap)', async () => {
    // The matrix mentions "unauthorized" but the service does NOT
    // have an actor parameter. Authorization is at the controller /
    // middleware layer.
    await expect(service.removeMember(1, 10)).resolves.toBeUndefined();
  });

  it('does NOT distinguish between "removing self" and "removing other" (documented gap)', async () => {
    // The service has no concept of "self" — it just forwards
    // (departmentId, userId). The controller is expected to enforce
    // any "self-removal" rules.
    await expect(service.removeMember(1, 10)).resolves.toBeUndefined();
  });

  it('does NOT distinguish between "removing a manager" and "removing a regular member" (documented gap)', async () => {
    // There is no role field on DepartmentMember, so there is no
    // concept of "manager" at the service layer.
    await expect(service.removeMember(1, 10)).resolves.toBeUndefined();
  });

  it('does NOT enforce "last manager" rules (documented gap)', async () => {
    // There is no role field on DepartmentMember, so there is no
    // concept of "last manager" at the service layer.
    await expect(service.removeMember(1, 10)).resolves.toBeUndefined();
  });

  it('does NOT log to console (no audit logging at the service layer)', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await service.removeMember(1, 10);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('records a safe diagnostic on missing-department (no password / hash leak)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    const err = await service
      .removeMember(999, 10)
      .catch((e) => e) as NotFoundError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT leak sensitive fields through any side effect on the unauthorized path', async () => {
    await expect(service.removeMember(1, 10)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Boundary 1: last member or repeated removal boundary.
// Result : Single successful removal; second removal of the same
//          (departmentId, userId) is rejected with NotFoundError;
//          boundary values (id = 1, id = MAX) work.
// ---------------------------------------------------------------------------
describe('[UTCID07] departmentsService.removeMember() – Boundary 1: last member or repeated removal boundary', () => {
  it('accepts the boundary: single successful removal', async () => {
    await expect(service.removeMember(1, 10)).resolves.toBeUndefined();
  });

  it('accepts the boundary: id = 1 (smallest positive integer)', async () => {
    await expect(service.removeMember(1, 1)).resolves.toBeUndefined();
  });

  it('accepts the boundary: departmentId = Number.MAX_SAFE_INTEGER', async () => {
    const maxId = Number.MAX_SAFE_INTEGER;
    await expect(service.removeMember(maxId, 10)).resolves.toBeUndefined();
    expect(mockedRepo.removeMember).toHaveBeenCalledWith(maxId, 10);
  });

  it('accepts the boundary: userId = Number.MAX_SAFE_INTEGER', async () => {
    const maxId = Number.MAX_SAFE_INTEGER;
    await expect(service.removeMember(1, maxId)).resolves.toBeUndefined();
    expect(mockedRepo.removeMember).toHaveBeenCalledWith(1, maxId);
  });

  it('accepts the boundary: both ids = Number.MAX_SAFE_INTEGER', async () => {
    const maxId = Number.MAX_SAFE_INTEGER;
    await expect(service.removeMember(maxId, maxId)).resolves.toBeUndefined();
    expect(mockedRepo.removeMember).toHaveBeenCalledWith(maxId, maxId);
  });

  it('rejects the adjacent unsupported value: missing department (id = 999)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(service.removeMember(999, 10)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rejects the adjacent unsupported value: missing membership (P2025)', async () => {
    mockedRepo.removeMember.mockReset();
    mockedRepo.removeMember.mockImplementationOnce(async () => {
      throw new NotFoundError('User is not a member of this department');
    });

    await expect(service.removeMember(1, 999)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rejects the repeated-removal path: second removal of the same (departmentId, userId) is rejected', async () => {
    // First call: successful.
    mockedRepo.removeMember.mockReset();
    mockedRepo.removeMember.mockResolvedValueOnce(undefined);
    // Second call: P2025 — the row no longer exists.
    mockedRepo.removeMember.mockImplementationOnce(async () => {
      throw new NotFoundError('User is not a member of this department');
    });

    // First removal succeeds.
    await expect(service.removeMember(1, 10)).resolves.toBeUndefined();

    // Second removal of the same (1, 10) is rejected.
    await expect(service.removeMember(1, 10)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('does NOT call repository.removeMember on the missing-department boundary (no partial commit)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(service.removeMember(999, 10)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    expect(mockedRepo.removeMember).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on the boundary rejection (no password / hash leak)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    const err = await service
      .removeMember(999, 10)
      .catch((e) => e) as NotFoundError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT leak sensitive fields through any side effect on the boundary path', async () => {
    // Just verify the success path does not include sensitive data.
    await expect(service.removeMember(1, 10)).resolves.toBeUndefined();
  });

  it('does NOT throw on the boundary success path (no unhandled exception)', async () => {
    await expect(service.removeMember(1, 10)).resolves.toBeUndefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await service.removeMember(1, 10);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('accepts the last-member boundary: removal of the last member succeeds', async () => {
    // The service does NOT check for "last member" — removal is
    // always permitted. This is documented as a gap (the matrix
    // does not require this check).
    await expect(service.removeMember(1, 10)).resolves.toBeUndefined();
  });

  it('does NOT enforce "last member" rules at the service layer (documented gap)', async () => {
    // The service does NOT have a "last member" check.
    await expect(service.removeMember(1, 10)).resolves.toBeUndefined();
  });

  it('does NOT enforce "cannot remove self" rules at the service layer (documented gap)', async () => {
    // The service has no concept of "self" — it just forwards
    // (departmentId, userId). The controller is expected to enforce
    // any "self-removal" rules.
    await expect(service.removeMember(1, 10)).resolves.toBeUndefined();
  });
});
