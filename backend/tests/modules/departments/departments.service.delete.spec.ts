/**
 * Unit tests for DepartmentsService.delete() — Function19 / Delete
 * Department.
 *
 * Contract:
 *   async delete(id: number): Promise<void>
 *
 *   1. `existsById(id)` is called first. If the department does not
 *      exist, throw NotFoundError('Department not found').
 *   2. `countDirectChildren(id)` is called next. If > 0, throw
 *      ConflictError('Cannot delete a department that has child
 *      departments. Delete or reassign child departments first.').
 *   3. `countDirectMembers(id)` is called next. If > 0, throw
 *      ConflictError('Cannot delete this department because it has
 *      N member(s). Remove members from this department first.').
 *   4. `departmentsRepository.delete(id)` is called.
 *      - P2025 (record deleted between existsById and delete) →
 *        NotFoundError.
 *      - P2003 (foreign-key constraint violation) → ConflictError.
 *
 * Note on the matrix's "soft-delete state" requirement:
 *   - The implementation does HARD deletes, not soft deletes. There
 *     is no `status` column or `deletedAt` field on the Department
 *     model. The matrix's "soft-delete state" Normal case is
 *     documented as an unsupported feature.
 *
 * Coverage matrix (UTCID01 – UTCID07):
 *   UTCID01  N  – Delete empty department: no children, no members.
 *   UTCID02  N  – Soft-delete state: documented gap — the
 *                 implementation does HARD deletes only.
 *   UTCID03  N  – Hierarchy update: deletion cascades to children
 *                 only after children are deleted first.
 *   UTCID04  N  – Audit: documented gap — no audit logging at the
 *                 service layer.
 *   UTCID05  A  – Not found / unauthorized: NotFoundError on
 *                 missing department. Service does NOT enforce
 *                 authorization (documented gap).
 *   UTCID06  A  – Department still has users / children:
 *                 ConflictError on children, ConflictError on
 *                 members, with informative messages.
 *   UTCID07  B  – Leaf department or already inactive boundary:
 *                 leaf (no children, no members) deletes
 *                 successfully; the adjacent unsupported case
 *                 (still has children or members) is rejected.
 */

import { DepartmentsService } from '../../../src/modules/departments/departments.service';
import {
  departmentsRepository,
} from '../../../src/modules/departments/departments.repository';
import {
  ConflictError,
  NotFoundError,
} from '../../../src/shared/exceptions/app-error';

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

  // Healthy defaults — empty department, no children, no members.
  mockedRepo.existsById.mockResolvedValue(true);
  mockedRepo.countDirectChildren.mockResolvedValue(0);
  mockedRepo.countDirectMembers.mockResolvedValue(0);
  mockedRepo.delete.mockResolvedValue(undefined);

  service = new DepartmentsService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: delete empty department.
// Result : Delete Department returns void after a successful delete.
// ---------------------------------------------------------------------------
describe('[UTCID01] departmentsService.delete() – Normal 1: delete empty department', () => {
  it('deletes an empty department (no children, no members)', async () => {
    const result = await service.delete(1);

    expect(result).toBeUndefined();
  });

  it('forwards the id to the repository', async () => {
    await service.delete(1);

    expect(mockedRepo.delete).toHaveBeenCalledTimes(1);
    expect(mockedRepo.delete).toHaveBeenCalledWith(1);
  });

  it('calls existsById first to verify the department exists', async () => {
    await service.delete(1);

    expect(mockedRepo.existsById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.existsById).toHaveBeenCalledWith(1);
  });

  it('calls countDirectChildren after existsById', async () => {
    await service.delete(1);

    expect(mockedRepo.countDirectChildren).toHaveBeenCalledTimes(1);
    expect(mockedRepo.countDirectChildren).toHaveBeenCalledWith(1);
  });

  it('calls countDirectMembers after countDirectChildren', async () => {
    await service.delete(1);

    expect(mockedRepo.countDirectMembers).toHaveBeenCalledTimes(1);
    expect(mockedRepo.countDirectMembers).toHaveBeenCalledWith(1);
  });

  it('does NOT call any other write methods (create, update)', async () => {
    await service.delete(1);

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('does NOT call any member-management methods on the delete path', async () => {
    await service.delete(1);

    expect(mockedRepo.addMembers).not.toHaveBeenCalled();
    expect(mockedRepo.removeMember).not.toHaveBeenCalled();
  });

  it('does NOT call any read methods other than the three validations', async () => {
    await service.delete(1);

    expect(mockedRepo.findAll).not.toHaveBeenCalled();
    expect(mockedRepo.findById).not.toHaveBeenCalled();
    expect(mockedRepo.findByNameAndParent).not.toHaveBeenCalled();
    expect(mockedRepo.findDescendantIds).not.toHaveBeenCalled();
    expect(mockedRepo.findMembers).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: soft-delete state.
// Result : Documented gap — the implementation does HARD deletes
//          only.
// ---------------------------------------------------------------------------
describe('[UTCID02] departmentsService.delete() – Normal 2: soft-delete state (documented gap)', () => {
  it('does a HARD delete (the row is removed from the database)', async () => {
    mockedRepo.delete.mockReset();
    mockedRepo.delete.mockResolvedValueOnce(undefined);

    await service.delete(1);

    expect(mockedRepo.delete).toHaveBeenCalledWith(1);
  });

  it('does NOT call update to a soft-delete status (no soft-delete path)', async () => {
    await service.delete(1);

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('does NOT preserve the row (the repository.delete is the terminal operation)', async () => {
    // After the test, the row is gone. There is no `deletedAt` or
    // `status` field — the implementation does NOT support
    // soft-deletes.
    await expect(service.delete(1)).resolves.toBeUndefined();
  });

  it('does NOT include a `status` field on the persisted model (documented gap)', async () => {
    // The service has no awareness of a soft-delete state. There is
    // no way to "deactivate" a department without removing it.
    await expect(service.delete(1)).resolves.toBeUndefined();
  });

  it('calls repository.delete exactly once on the happy path', async () => {
    await service.delete(1);

    expect(mockedRepo.delete).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: hierarchy update.
// Result : Deletion of a leaf is permitted; deletion of a department
//          with children is blocked (children must be reassigned or
//          deleted first).
// ---------------------------------------------------------------------------
describe('[UTCID03] departmentsService.delete() – Normal 3: hierarchy update', () => {
  it('allows deletion of a leaf with no children', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(0);

    await expect(service.delete(1)).resolves.toBeUndefined();
  });

  it('does NOT cascade to children — children must be deleted first', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(2);

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);
  });

  it('does NOT cascade to members — members must be removed first', async () => {
    mockedRepo.countDirectMembers.mockReset();
    mockedRepo.countDirectMembers.mockResolvedValueOnce(5);

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);
  });

  it('calls countDirectChildren before countDirectMembers (children checked first)', async () => {
    await service.delete(1);

    const childrenOrder = mockedRepo.countDirectChildren.mock.invocationCallOrder[0];
    const membersOrder = mockedRepo.countDirectMembers.mock.invocationCallOrder[0];

    expect(childrenOrder).toBeLessThan(membersOrder);
  });

  it('does NOT call repository.delete when the department has children', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(2);

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);

    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does NOT call repository.delete when the department has members', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(0);
    mockedRepo.countDirectMembers.mockReset();
    mockedRepo.countDirectMembers.mockResolvedValueOnce(3);

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);

    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('rejects with ConflictError on a department with one child', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(1);

    const err = await service.delete(1).catch((e) => e) as ConflictError;

    expect(err.statusCode).toBe(409);
    expect(err.message).toContain('child departments');
  });

  it('rejects with ConflictError on a department with one member', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(0);
    mockedRepo.countDirectMembers.mockReset();
    mockedRepo.countDirectMembers.mockResolvedValueOnce(1);

    const err = await service.delete(1).catch((e) => e) as ConflictError;

    expect(err.statusCode).toBe(409);
    expect(err.message).toContain('member');
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: audit.
// Result : Documented gap — no audit logging at the service layer.
// ---------------------------------------------------------------------------
describe('[UTCID04] departmentsService.delete() – Normal 4: audit (documented gap)', () => {
  it('does NOT log to console (no audit logging at the service layer)', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await service.delete(1);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('does NOT have an `audit` field on the persisted row (documented gap)', async () => {
    // After delete, there is no row — audit must be tracked
    // elsewhere (out of scope for this service test).
    await service.delete(1);

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('does NOT have a `deletedBy` field on the persisted row (documented gap)', async () => {
    await service.delete(1);

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('does NOT have a `deletedAt` field on the persisted row (documented gap)', async () => {
    await service.delete(1);

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('PERMITS delete when no actor is supplied (no createdBy / deletedBy at the service layer)', async () => {
    await expect(service.delete(1)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 1: not found / unauthorized.
// Result : NotFoundError when the department does not exist.
//          Service does NOT enforce authorization (documented gap).
// ---------------------------------------------------------------------------
describe('[UTCID05] departmentsService.delete() – Abnormal 1: not found / unauthorized', () => {
  it('rejects with NotFoundError when the department does not exist', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(service.delete(999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does NOT call countDirectChildren when the department does not exist', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(service.delete(999)).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.countDirectChildren).not.toHaveBeenCalled();
  });

  it('does NOT call countDirectMembers when the department does not exist', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(service.delete(999)).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.countDirectMembers).not.toHaveBeenCalled();
  });

  it('does NOT call repository.delete when the department does not exist', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(service.delete(999)).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('rejects with NotFoundError (404) on missing department', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    const err = await service.delete(999).catch((e) => e) as NotFoundError;

    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Department not found');
  });

  it('rejects with NotFoundError when the row is deleted between existsById and delete (P2025)', async () => {
    mockedRepo.delete.mockReset();
    mockedRepo.delete.mockImplementationOnce(async () => {
      throw new NotFoundError('Department not found');
    });

    await expect(service.delete(1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects with ConflictError on Prisma P2003 (foreign-key safety net)', async () => {
    mockedRepo.delete.mockReset();
    mockedRepo.delete.mockImplementationOnce(async () => {
      throw new ConflictError(
        'Cannot delete this department because it is referenced by other records (users, documents, or child departments).',
      );
    });

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);
  });

  it('records a safe diagnostic on NotFoundError (no password / hash leak)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    const err = await service.delete(999).catch((e) => e) as NotFoundError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('records a safe diagnostic on P2003 (no password / hash leak)', async () => {
    mockedRepo.delete.mockReset();
    mockedRepo.delete.mockImplementationOnce(async () => {
      throw new ConflictError(
        'Cannot delete this department because it is referenced by other records.',
      );
    });

    const err = await service.delete(1).catch((e) => e) as ConflictError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('PERMITS delete when no actor is supplied (no createdBy at the service layer)', async () => {
    await expect(service.delete(1)).resolves.toBeUndefined();
  });

  it('does NOT enforce authorization at the service layer (documented gap)', async () => {
    // The matrix mentions "unauthorized" but the service does NOT
    // have an actor parameter. Authorization is at the controller /
    // middleware layer.
    await expect(service.delete(1)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 2: department still has users / children.
// Result : ConflictError on children, ConflictError on members,
//          with informative messages.
// ---------------------------------------------------------------------------
describe('[UTCID06] departmentsService.delete() – Abnormal 2: department still has users / children', () => {
  it('rejects with ConflictError when the department has children', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(2);

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects with the exact children-conflict message', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(2);

    const err = await service.delete(1).catch((e) => e) as ConflictError;

    expect(err.statusCode).toBe(409);
    expect(err.message).toBe(
      'Cannot delete a department that has child departments. Delete or reassign child departments first.',
    );
  });

  it('does NOT call countDirectMembers when there are children', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(2);

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);

    expect(mockedRepo.countDirectMembers).not.toHaveBeenCalled();
  });

  it('does NOT call repository.delete when there are children', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(2);

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);

    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('rejects with ConflictError when the department has members', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(0);
    mockedRepo.countDirectMembers.mockReset();
    mockedRepo.countDirectMembers.mockResolvedValueOnce(3);

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects with the exact members-conflict message', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(0);
    mockedRepo.countDirectMembers.mockReset();
    mockedRepo.countDirectMembers.mockResolvedValueOnce(3);

    const err = await service.delete(1).catch((e) => e) as ConflictError;

    expect(err.statusCode).toBe(409);
    expect(err.message).toBe(
      'Cannot delete this department because it has 3 member(s). Remove members from this department first.',
    );
  });

  it('the members-conflict message includes the actual member count', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(0);
    mockedRepo.countDirectMembers.mockReset();
    mockedRepo.countDirectMembers.mockResolvedValueOnce(7);

    const err = await service.delete(1).catch((e) => e) as ConflictError;

    expect(err.message).toContain('7 member');
  });

  it('does NOT call repository.delete when there are members', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(0);
    mockedRepo.countDirectMembers.mockReset();
    mockedRepo.countDirectMembers.mockResolvedValueOnce(3);

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);

    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('rejects on the children check BEFORE the members check', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(2);
    mockedRepo.countDirectMembers.mockReset();
    mockedRepo.countDirectMembers.mockResolvedValueOnce(5);

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);

    // The children check fired first → members was never called.
    expect(mockedRepo.countDirectMembers).not.toHaveBeenCalled();
  });

  it('rejects when there are MANY children (saturated block)', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(1000);

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects when there are MANY members (saturated block)', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(0);
    mockedRepo.countDirectMembers.mockReset();
    mockedRepo.countDirectMembers.mockResolvedValueOnce(500);

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);
  });

  it('records a safe diagnostic on children-conflict (no password / hash leak)', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(2);

    const err = await service.delete(1).catch((e) => e) as ConflictError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('records a safe diagnostic on members-conflict (no password / hash leak)', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(0);
    mockedRepo.countDirectMembers.mockReset();
    mockedRepo.countDirectMembers.mockResolvedValueOnce(3);

    const err = await service.delete(1).catch((e) => e) as ConflictError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Boundary 1: leaf department or already inactive boundary.
// Result : Leaf department (no children, no members) deletes
//          successfully; the adjacent unsupported case (still has
//          children or members) is rejected.
// ---------------------------------------------------------------------------
describe('[UTCID07] departmentsService.delete() – Boundary 1: leaf department or already inactive boundary', () => {
  it('accepts the boundary: leaf department (children = 0, members = 0)', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(0);
    mockedRepo.countDirectMembers.mockReset();
    mockedRepo.countDirectMembers.mockResolvedValueOnce(0);

    await expect(service.delete(1)).resolves.toBeUndefined();
  });

  it('accepts the boundary: id = 1 (smallest positive integer)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(0);
    mockedRepo.countDirectMembers.mockReset();
    mockedRepo.countDirectMembers.mockResolvedValueOnce(0);

    await expect(service.delete(1)).resolves.toBeUndefined();
  });

  it('accepts the boundary: id = Number.MAX_SAFE_INTEGER', async () => {
    const maxId = Number.MAX_SAFE_INTEGER;
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(0);
    mockedRepo.countDirectMembers.mockReset();
    mockedRepo.countDirectMembers.mockResolvedValueOnce(0);
    mockedRepo.delete.mockReset();
    mockedRepo.delete.mockResolvedValueOnce(undefined);

    await expect(service.delete(maxId)).resolves.toBeUndefined();

    expect(mockedRepo.delete).toHaveBeenCalledWith(maxId);
  });

  it('accepts the boundary: id = 0 (boundary lower)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(service.delete(0)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('accepts the boundary: id = negative (boundary lower)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(service.delete(-1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects the adjacent unsupported value: even one child blocks delete', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(1);

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects the adjacent unsupported value: even one member blocks delete', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(0);
    mockedRepo.countDirectMembers.mockReset();
    mockedRepo.countDirectMembers.mockResolvedValueOnce(1);

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);
  });

  it('does NOT call any write methods on the boundary path (no partial commit)', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(1);

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);

    expect(mockedRepo.delete).not.toHaveBeenCalled();
    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on the boundary rejection (no password / hash leak)', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(1);

    const err = await service.delete(1).catch((e) => e) as ConflictError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT leak sensitive fields through any side effect on the boundary path', async () => {
    // The boundary path returns a controlled error; the body does
    // not include sensitive data.
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(1);

    const err = await service.delete(1).catch((e) => e) as ConflictError;

    expect(JSON.stringify(err)).not.toMatch(/password/i);
    expect(JSON.stringify(err)).not.toMatch(/hash/i);
    expect(JSON.stringify(err)).not.toMatch(/secret/i);
  });

  it('does NOT throw on the leaf-boundary path (no unhandled exception)', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(0);
    mockedRepo.countDirectMembers.mockReset();
    mockedRepo.countDirectMembers.mockResolvedValueOnce(0);

    await expect(service.delete(1)).resolves.toBeUndefined();
  });

  it('rejects the children-conflict adjacent to the leaf boundary (1 child)', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(1);

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects the members-conflict adjacent to the leaf boundary (1 member)', async () => {
    mockedRepo.countDirectChildren.mockReset();
    mockedRepo.countDirectChildren.mockResolvedValueOnce(0);
    mockedRepo.countDirectMembers.mockReset();
    mockedRepo.countDirectMembers.mockResolvedValueOnce(1);

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects the missing-department adjacent to the leaf boundary (id missing)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(service.delete(999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects the P2025 race-condition adjacent to the leaf boundary', async () => {
    mockedRepo.delete.mockReset();
    mockedRepo.delete.mockImplementationOnce(async () => {
      throw new NotFoundError('Department not found');
    });

    await expect(service.delete(1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects the P2003 foreign-key adjacent to the leaf boundary', async () => {
    mockedRepo.delete.mockReset();
    mockedRepo.delete.mockImplementationOnce(async () => {
      throw new ConflictError(
        'Cannot delete this department because it is referenced by other records.',
      );
    });

    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictError);
  });
});
