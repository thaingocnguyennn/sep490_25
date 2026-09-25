/**
 * Unit tests for DepartmentsService.update() — Function18 / Update
 * Department.
 *
 * Contract:
 *   async update(id: number, input: UpdateDepartmentInput): Promise<Department>
 *
 *   1. `prisma.department.findUnique({ where: { id } })` is called to
 *      load the current row. If it does not exist, throw
 *      NotFoundError('Department not found').
 *   2. If `input.parentId !== undefined`:
 *        - newParentId === id  → BadRequestError('A department cannot be its own parent').
 *        - newParentId !== null:
 *            - existsById(newParentId) is called. If the parent does
 *              NOT exist, throw NotFoundError.
 *            - findDescendantIds(id) is called. If newParentId is in
 *              the descendant set (which includes id itself), throw
 *              BadRequestError('Cannot set parent to a descendant
 *              department (circular reference)').
 *   3. effectiveParentId = input.parentId !== undefined ? input.parentId : current.parentId
 *      effectiveName    = input.name !== undefined ? input.name : current.name
 *   4. If `input.name !== undefined || input.parentId !== undefined`:
 *        - findByNameAndParent(effectiveName, effectiveParentId, id)
 *          is called. If a collision exists (excluding self), throw
 *          ConflictError('Department name already exists in this parent').
 *   5. repository.update(id, partial) is called with only the keys
 *      that were supplied in `input`. The repository catches P2025
 *      (record deleted between findUnique and update) → NotFoundError
 *      and P2002 (unique constraint violation) → ConflictError.
 *
 * Note on the matrix's "code/name" / "status" / "actor" / "audit"
 * requirements:
 *   - The implementation has NO `code` field. Only `name` is
 *     enforced.
 *   - The implementation has NO `status` field on Department.
 *   - The implementation has NO `createdBy` / actor.
 *   - The implementation does NOT emit explicit audit logs at the
 *     service layer. Authorization is at the controller / middleware
 *     layer.
 *
 * Coverage matrix (UTCID01 – UTCID09):
 *   UTCID01  N  – Valid update: name + description forwarded.
 *   UTCID02  N  – Parent change: parentId forwarded with full
 *                 validation chain.
 *   UTCID03  N  – Partial update: only supplied fields are forwarded.
 *   UTCID04  N  – Persistence / audit: the row is forwarded verbatim.
 *   UTCID05  N  – Response-to-database consistency: identifiers,
 *                 timestamps propagate.
 *   UTCID06  A  – Duplicate / cyclic invalid data: ConflictError on
 *                 collision, BadRequestError on self-parent or cycle.
 *   UTCID07  A  – Not found / unauthorized: NotFoundError on missing
 *                 department or missing parent. Service does NOT
 *                 enforce authorization (documented gap).
 *   UTCID08  B  – Maximum hierarchy depth or field length: cycles
 *                 across many levels rejected; long strings forwarded.
 *   UTCID09  B  – Upper-bound value: id = Number.MAX_SAFE_INTEGER,
 *                 description / name at max length.
 */

import { DepartmentsService } from '../../../src/modules/departments/departments.service';
import {
  departmentsRepository,
} from '../../../src/modules/departments/departments.repository';
import {
  BadRequestError,
  ConflictError,
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
  },
}));

const mockedRepo = departmentsRepository as jest.Mocked<
  typeof departmentsRepository
>;

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeCurrentRow(overrides: any = {}): any {
  return {
    id: 1,
    name: 'Phòng Kế toán',
    parentId: null,
    ...overrides,
  };
}

function makeUpdatedRow(overrides: any = {}): any {
  return {
    id: 1,
    name: 'Phòng Kế toán',
    description: 'Mô tả mới',
    parentId: null,
    createdAt: new Date('2026-09-11T01:00:00.000Z'),
    updatedAt: new Date('2026-09-11T02:00:00.000Z'),
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

let service: DepartmentsService;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();

  // Healthy defaults.
  (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValue(
    makeCurrentRow(),
  );
  mockedRepo.existsById.mockResolvedValue(true);
  mockedRepo.findDescendantIds.mockResolvedValue(new Set([1]));
  mockedRepo.findByNameAndParent.mockResolvedValue(null);
  mockedRepo.update.mockResolvedValue(makeUpdatedRow());

  service = new DepartmentsService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid update.
// Result : Update Department returns the persisted row.
// ---------------------------------------------------------------------------
describe('[UTCID01] departmentsService.update() – Normal 1: valid update', () => {
  it('updates name and description successfully', async () => {
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(
      makeUpdatedRow({ name: 'Phòng Kế toán Mới', description: 'Mô tả mới' }),
    );

    const result = await service.update(1, {
      name: 'Phòng Kế toán Mới',
      description: 'Mô tả mới',
    });

    expect(result.name).toBe('Phòng Kế toán Mới');
    expect(result.description).toBe('Mô tả mới');
  });

  it('loads the current row via prisma.department.findUnique', async () => {
    await service.update(1, { name: 'New Name' });

    expect(mockedPrisma.department.findUnique).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.department.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { id: true, parentId: true, name: true },
    });
  });

  it('forwards only the supplied keys to repository.update', async () => {
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(
      makeUpdatedRow({ name: 'New Name' }),
    );

    await service.update(1, { name: 'New Name' });

    expect(mockedRepo.update).toHaveBeenCalledWith(1, { name: 'New Name' });
  });

  it('does NOT include keys that were not supplied in input', async () => {
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow());

    await service.update(1, { name: 'New Name' });

    const forwardedData = mockedRepo.update.mock.calls[0][1] as any;
    expect(forwardedData).not.toHaveProperty('description');
    expect(forwardedData).not.toHaveProperty('parentId');
  });

  it('does NOT call existsById when parentId is undefined', async () => {
    await service.update(1, { name: 'New Name' });

    expect(mockedRepo.existsById).not.toHaveBeenCalled();
  });

  it('does NOT call findDescendantIds when parentId is undefined', async () => {
    await service.update(1, { name: 'New Name' });

    expect(mockedRepo.findDescendantIds).not.toHaveBeenCalled();
  });

  it('returns the persisted row verbatim from the repository', async () => {
    const row = makeUpdatedRow({ id: 42, name: 'New Name' });
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(row);

    const result = await service.update(1, { name: 'New Name' });

    expect(result).toEqual(row);
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: parent change.
// Result : Parent change with full validation chain (existsById +
//          findDescendantIds + uniqueness check).
// ---------------------------------------------------------------------------
describe('[UTCID02] departmentsService.update() – Normal 2: parent change', () => {
  it('updates parentId successfully when the parent exists', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5, parentId: null }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findDescendantIds.mockReset();
    mockedRepo.findDescendantIds.mockResolvedValueOnce(new Set([5]));
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(
      makeUpdatedRow({ id: 5, parentId: 10 }),
    );

    const result = await service.update(5, { parentId: 10 });

    expect(result.parentId).toBe(10);
  });

  it('verifies parent existence via existsById when parentId is supplied', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findDescendantIds.mockReset();
    mockedRepo.findDescendantIds.mockResolvedValueOnce(new Set([5]));
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.update(5, { parentId: 10 });

    expect(mockedRepo.existsById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.existsById).toHaveBeenCalledWith(10);
  });

  it('calls findDescendantIds when parentId is supplied', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findDescendantIds.mockReset();
    mockedRepo.findDescendantIds.mockResolvedValueOnce(new Set([5]));
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.update(5, { parentId: 10 });

    expect(mockedRepo.findDescendantIds).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findDescendantIds).toHaveBeenCalledWith(5);
  });

  it('allows parent change to null (top-level)', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5, parentId: 7 }),
    );
    // When newParentId is null, existsById is NOT called.
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(
      makeUpdatedRow({ id: 5, parentId: null }),
    );

    const result = await service.update(5, { parentId: null });

    expect(result.parentId).toBeNull();
    expect(mockedRepo.existsById).not.toHaveBeenCalled();
    expect(mockedRepo.findDescendantIds).not.toHaveBeenCalled();
  });

  it('forwards parentId verbatim to repository.update', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findDescendantIds.mockReset();
    mockedRepo.findDescendantIds.mockResolvedValueOnce(new Set([5]));
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.update(5, { parentId: 10 });

    expect(mockedRepo.update).toHaveBeenCalledWith(5, { parentId: 10 });
  });

  it('does NOT call existsById when newParentId is null', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5, parentId: 7 }),
    );
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.update(5, { parentId: null });

    // existsById is NOT called when parentId is null.
    expect(mockedRepo.existsById).not.toHaveBeenCalled();
  });

  it('checks uniqueness against the new parent (not the old one)', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5, name: 'Phòng A', parentId: 7 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findDescendantIds.mockReset();
    mockedRepo.findDescendantIds.mockResolvedValueOnce(new Set([5]));
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.update(5, { parentId: 10 });

    // The new parentId is forwarded to the uniqueness check.
    expect(mockedRepo.findByNameAndParent).toHaveBeenCalledWith(
      'Phòng A',
      10,
      5,
    );
  });

  it('uses the CURRENT parentId when only name is updated', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5, name: 'Phòng A', parentId: 7 }),
    );
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.update(5, { name: 'Phòng A Mới' });

    // effectiveParentId = current.parentId = 7.
    expect(mockedRepo.findByNameAndParent).toHaveBeenCalledWith(
      'Phòng A Mới',
      7,
      5,
    );
  });

  it('uses the NEW name when only parentId is updated', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5, name: 'Phòng A', parentId: 7 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findDescendantIds.mockReset();
    mockedRepo.findDescendantIds.mockResolvedValueOnce(new Set([5]));
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.update(5, { parentId: 10 });

    // effectiveName = current.name = 'Phòng A'.
    expect(mockedRepo.findByNameAndParent).toHaveBeenCalledWith(
      'Phòng A',
      10,
      5,
    );
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: partial update.
// Result : Only supplied fields are forwarded to the repository.
// ---------------------------------------------------------------------------
describe('[UTCID03] departmentsService.update() – Normal 3: partial update', () => {
  it('forwards only `name` when only name is supplied', async () => {
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(
      makeUpdatedRow({ name: 'New Name' }),
    );

    await service.update(1, { name: 'New Name' });

    expect(mockedRepo.update).toHaveBeenCalledWith(1, { name: 'New Name' });
  });

  it('forwards only `description` when only description is supplied', async () => {
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(
      makeUpdatedRow({ description: 'New Description' }),
    );

    await service.update(1, { description: 'New Description' });

    expect(mockedRepo.update).toHaveBeenCalledWith(1, {
      description: 'New Description',
    });
  });

  it('forwards only `parentId` when only parentId is supplied', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findDescendantIds.mockReset();
    mockedRepo.findDescendantIds.mockResolvedValueOnce(new Set([5]));
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(
      makeUpdatedRow({ id: 5, parentId: 10 }),
    );

    await service.update(5, { parentId: 10 });

    expect(mockedRepo.update).toHaveBeenCalledWith(5, { parentId: 10 });
  });

  it('forwards `name` and `description` when both are supplied', async () => {
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow());

    await service.update(1, {
      name: 'New Name',
      description: 'New Description',
    });

    expect(mockedRepo.update).toHaveBeenCalledWith(1, {
      name: 'New Name',
      description: 'New Description',
    });
  });

  it('does NOT call findByNameAndParent when neither name nor parentId is supplied', async () => {
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow());

    await service.update(1, { description: 'Just Description' });

    expect(mockedRepo.findByNameAndParent).not.toHaveBeenCalled();
  });

  it('does NOT call existsById when only description is supplied', async () => {
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow());

    await service.update(1, { description: 'Just Description' });

    expect(mockedRepo.existsById).not.toHaveBeenCalled();
  });

  it('does NOT call findDescendantIds when only description is supplied', async () => {
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow());

    await service.update(1, { description: 'Just Description' });

    expect(mockedRepo.findDescendantIds).not.toHaveBeenCalled();
  });

  it('allows explicit `null` for description (forwarded verbatim)', async () => {
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow({ description: null }));

    await service.update(1, { description: null });

    // explicit null is forwarded (not undefined, not stripped).
    expect(mockedRepo.update).toHaveBeenCalledWith(1, { description: null });
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: persistence / audit.
// Result : The row is forwarded to the repository with the exact
//          data shape.
// ---------------------------------------------------------------------------
describe('[UTCID04] departmentsService.update() – Normal 4: persistence / audit', () => {
  it('calls update exactly once on the happy path', async () => {
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow());

    await service.update(1, { name: 'New Name' });

    expect(mockedRepo.update).toHaveBeenCalledTimes(1);
  });

  it('forwards the id to repository.update', async () => {
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow());

    await service.update(42, { name: 'New Name' });

    expect(mockedRepo.update.mock.calls[0][0]).toBe(42);
  });

  it('returns the persisted row verbatim from the repository', async () => {
    const row = makeUpdatedRow({ id: 1, name: 'Persisted' });
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(row);

    const result = await service.update(1, { name: 'Persisted' });

    expect(result).toEqual(row);
  });

  it('does NOT have a `createdBy` field on the persisted row (documented gap)', async () => {
    const result = await service.update(1, { name: 'New Name' });

    expect((result as any).createdBy).toBeUndefined();
  });

  it('does NOT have a `status` field on the persisted row (documented gap)', async () => {
    const result = await service.update(1, { name: 'New Name' });

    expect((result as any).status).toBeUndefined();
  });

  it('does NOT have an `audit` field on the persisted row (documented gap)', async () => {
    const result = await service.update(1, { name: 'New Name' });

    expect((result as any).audit).toBeUndefined();
  });

  it('does NOT have a `code` field on the persisted row (documented gap)', async () => {
    const result = await service.update(1, { name: 'New Name' });

    expect((result as any).code).toBeUndefined();
  });

  it('does NOT log to console (no audit logging at the service layer)', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow());

    await service.update(1, { name: 'New Name' });

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : Identifiers, timestamps, and persisted fields propagate
//          consistently.
// ---------------------------------------------------------------------------
describe('[UTCID05] departmentsService.update() – Normal 5: response-to-database consistency', () => {
  it('propagates the id from the persisted row', async () => {
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow({ id: 999 }));

    const result = await service.update(1, { name: 'New Name' });

    expect(result.id).toBe(999);
  });

  it('propagates the name from the persisted row', async () => {
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow({ name: 'Persisted Name' }));

    const result = await service.update(1, { name: 'Persisted Name' });

    expect(result.name).toBe('Persisted Name');
  });

  it('propagates the description from the persisted row', async () => {
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(
      makeUpdatedRow({ description: 'Persisted Description' }),
    );

    const result = await service.update(1, {
      description: 'Persisted Description',
    });

    expect(result.description).toBe('Persisted Description');
  });

  it('propagates the parentId from the persisted row', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findDescendantIds.mockReset();
    mockedRepo.findDescendantIds.mockResolvedValueOnce(new Set([5]));
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow({ id: 5, parentId: 10 }));

    const result = await service.update(5, { parentId: 10 });

    expect(result.parentId).toBe(10);
  });

  it('propagates the timestamps from the persisted row', async () => {
    const createdAt = new Date('2026-09-11T01:00:00.000Z');
    const updatedAt = new Date('2026-09-11T02:00:00.000Z');
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(
      makeUpdatedRow({ createdAt, updatedAt }),
    );

    const result = await service.update(1, { name: 'New Name' });

    expect(result.createdAt).toEqual(createdAt);
    expect(result.updatedAt).toEqual(updatedAt);
  });

  it('does NOT include a `status` field on the persisted row', async () => {
    const result = await service.update(1, { name: 'New Name' });

    expect((result as any).status).toBeUndefined();
  });

  it('does NOT include a `createdBy` field on the persisted row', async () => {
    const result = await service.update(1, { name: 'New Name' });

    expect((result as any).createdBy).toBeUndefined();
  });

  it('does NOT leak sensitive fields through the response (no password / hash / secret)', async () => {
    const result = await service.update(1, { name: 'New Name' });

    expect(JSON.stringify(result)).not.toMatch(/password/i);
    expect(JSON.stringify(result)).not.toMatch(/hash/i);
    expect(JSON.stringify(result)).not.toMatch(/secret/i);
    expect(JSON.stringify(result)).not.toMatch(/\$2[aby]\$/);
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: duplicate / cyclic invalid data.
// Result : ConflictError on duplicate, BadRequestError on
//          self-parent or cycle.
// ---------------------------------------------------------------------------
describe('[UTCID06] departmentsService.update() – Abnormal 1: duplicate / cyclic invalid data', () => {
  it('rejects with ConflictError when name collides with another department in same parent', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 1, name: 'Old Name', parentId: 5 }),
    );
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce({
      id: 2,
      name: 'Existing Name',
      parentId: 5,
    });

    await expect(
      service.update(1, { name: 'Existing Name' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('does NOT call repository.update on duplicate name (no partial commit)', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 1, name: 'Old Name' }),
    );
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce({
      id: 2,
      name: 'Existing Name',
    });

    await expect(
      service.update(1, { name: 'Existing Name' }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('rejects with ConflictError (409) on duplicate name', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 1 }),
    );
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce({ id: 2 });

    const err = await service
      .update(1, { name: 'Duplicate' })
      .catch((e) => e) as ConflictError;

    expect(err.statusCode).toBe(409);
    expect(err.message).toBe('Department name already exists in this parent');
  });

  it('rejects with BadRequestError on self-parent', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5, name: 'A', parentId: 7 }),
    );

    await expect(service.update(5, { parentId: 5 })).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('does NOT call existsById or findDescendantIds when self-parent is detected', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5, name: 'A', parentId: 7 }),
    );

    await expect(service.update(5, { parentId: 5 })).rejects.toBeInstanceOf(
      BadRequestError,
    );

    expect(mockedRepo.existsById).not.toHaveBeenCalled();
    expect(mockedRepo.findDescendantIds).not.toHaveBeenCalled();
  });

  it('does NOT call repository.update on self-parent (no partial commit)', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5, name: 'A', parentId: 7 }),
    );

    await expect(service.update(5, { parentId: 5 })).rejects.toBeInstanceOf(
      BadRequestError,
    );

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('rejects with BadRequestError on circular reference', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5, name: 'A', parentId: 7 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findDescendantIds.mockReset();
    mockedRepo.findDescendantIds.mockResolvedValueOnce(new Set([5, 6, 7]));

    await expect(service.update(5, { parentId: 7 })).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('rejects with the exact circular-reference message', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5, name: 'A', parentId: 7 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findDescendantIds.mockReset();
    mockedRepo.findDescendantIds.mockResolvedValueOnce(new Set([5, 6, 7]));

    const err = await service
      .update(5, { parentId: 7 })
      .catch((e) => e) as BadRequestError;

    expect(err.statusCode).toBe(400);
    expect(err.message).toBe(
      'Cannot set parent to a descendant department (circular reference)',
    );
  });

  it('does NOT call repository.update on circular reference (no partial commit)', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5, name: 'A', parentId: 7 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findDescendantIds.mockReset();
    mockedRepo.findDescendantIds.mockResolvedValueOnce(new Set([5, 6, 7]));

    await expect(service.update(5, { parentId: 7 })).rejects.toBeInstanceOf(
      BadRequestError,
    );

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on duplicate-name (no password / hash leak)', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 1 }),
    );
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce({ id: 2 });

    const err = await service
      .update(1, { name: 'Duplicate' })
      .catch((e) => e) as ConflictError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('records a safe diagnostic on self-parent (no password / hash leak)', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5 }),
    );

    const err = await service
      .update(5, { parentId: 5 })
      .catch((e) => e) as BadRequestError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('records a safe diagnostic on circular reference (no password / hash leak)', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5, parentId: 7 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findDescendantIds.mockReset();
    mockedRepo.findDescendantIds.mockResolvedValueOnce(new Set([5, 6, 7]));

    const err = await service
      .update(5, { parentId: 7 })
      .catch((e) => e) as BadRequestError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: not found / unauthorized.
// Result : NotFoundError on missing department or missing parent.
//          Service does NOT enforce authorization (documented gap).
// ---------------------------------------------------------------------------
describe('[UTCID07] departmentsService.update() – Abnormal 2: not found / unauthorized', () => {
  it('rejects with NotFoundError when the department does not exist', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      service.update(999, { name: 'New Name' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does NOT call repository.update when the department does not exist', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      service.update(999, { name: 'New Name' }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('does NOT call any other repository methods when the department does not exist', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      service.update(999, { name: 'New Name' }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.existsById).not.toHaveBeenCalled();
    expect(mockedRepo.findDescendantIds).not.toHaveBeenCalled();
    expect(mockedRepo.findByNameAndParent).not.toHaveBeenCalled();
  });

  it('rejects with NotFoundError when the new parent does not exist', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(
      service.update(5, { parentId: 999 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does NOT call repository.update when the new parent does not exist', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(
      service.update(5, { parentId: 999 }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('does NOT call findDescendantIds when the new parent does not exist', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(
      service.update(5, { parentId: 999 }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.findDescendantIds).not.toHaveBeenCalled();
  });

  it('rejects with NotFoundError (404) on missing department', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const err = await service
      .update(999, { name: 'New Name' })
      .catch((e) => e) as NotFoundError;

    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Department not found');
  });

  it('rejects with NotFoundError (404) on missing parent', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    const err = await service
      .update(5, { parentId: 999 })
      .catch((e) => e) as NotFoundError;

    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('999');
  });

  it('rejects with NotFoundError when the row is deleted between findUnique and update (P2025)', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 1 }),
    );
    mockedRepo.update.mockReset();
    mockedRepo.update.mockImplementationOnce(async () => {
      throw new NotFoundError('Department not found');
    });

    await expect(
      service.update(1, { name: 'New Name' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects with ConflictError on Prisma P2002 (race condition safety net)', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 1, name: 'A', parentId: 5 }),
    );
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.update.mockReset();
    mockedRepo.update.mockImplementationOnce(async () => {
      throw new ConflictError(
        'Department name already exists in this parent',
      );
    });

    await expect(
      service.update(1, { name: 'New Name' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('records a safe diagnostic on missing-department (no password / hash leak)', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const err = await service
      .update(999, { name: 'New Name' })
      .catch((e) => e) as NotFoundError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('records a safe diagnostic on missing-parent (no password / hash leak)', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    const err = await service
      .update(5, { parentId: 999 })
      .catch((e) => e) as NotFoundError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('PERMITS update when no actor is supplied (no createdBy at the service layer)', async () => {
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow());

    const result = await service.update(1, { name: 'New Name' });

    expect(result).toBeDefined();
  });

  it('does NOT enforce authorization at the service layer (documented gap)', async () => {
    // The matrix mentions "unauthorized" but the service does NOT
    // have an actor parameter. Authorization is at the controller /
    // middleware layer.
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow());

    await expect(
      service.update(1, { name: 'New Name' }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: maximum hierarchy depth or field length.
// Result : Cycles across many levels rejected; long strings forwarded.
// ---------------------------------------------------------------------------
describe('[UTCID08] departmentsService.update() – Boundary 1: maximum hierarchy depth / field length', () => {
  it('rejects circular reference across many hierarchy levels', async () => {
    // A chain of 5 levels: 5 → 6 → 7 → 8 → 9 → 10 (where 5 is the
    // current id). Trying to set 5's parent to 10 should fail
    // because 10 is a descendant of 5.
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5, name: 'A', parentId: null }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findDescendantIds.mockReset();
    mockedRepo.findDescendantIds.mockResolvedValueOnce(
      new Set([5, 6, 7, 8, 9, 10]),
    );

    await expect(service.update(5, { parentId: 10 })).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('does NOT call repository.update on multi-level cycle (no partial commit)', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findDescendantIds.mockReset();
    mockedRepo.findDescendantIds.mockResolvedValueOnce(
      new Set([5, 6, 7, 8, 9, 10]),
    );

    await expect(service.update(5, { parentId: 10 })).rejects.toBeInstanceOf(
      BadRequestError,
    );

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('accepts name at max length (100 chars)', async () => {
    const longName = 'A'.repeat(100);
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow({ name: longName }));

    await service.update(1, { name: longName });

    expect(mockedRepo.update.mock.calls[0][1]).toEqual({ name: longName });
  });

  it('forwards name longer than 100 chars verbatim (no validation at service layer)', async () => {
    const tooLongName = 'A'.repeat(200);
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow({ name: tooLongName }));

    await service.update(1, { name: tooLongName });

    // Forwarded verbatim — no length check at the service layer.
    expect(mockedRepo.update.mock.calls[0][1]).toEqual({ name: tooLongName });
  });

  it('accepts description at max length (500 chars)', async () => {
    const longDescription = 'M'.repeat(500);
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(
      makeUpdatedRow({ description: longDescription }),
    );

    await service.update(1, { description: longDescription });

    expect(mockedRepo.update.mock.calls[0][1]).toEqual({
      description: longDescription,
    });
  });

  it('forwards description longer than 500 chars verbatim (no validation at service layer)', async () => {
    const tooLongDescription = 'M'.repeat(600);
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(
      makeUpdatedRow({ description: tooLongDescription }),
    );

    await service.update(1, { description: tooLongDescription });

    expect(mockedRepo.update.mock.calls[0][1]).toEqual({
      description: tooLongDescription,
    });
  });

  it('does NOT call any write methods on the boundary path', async () => {
    // The cycle path
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5, parentId: 7 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findDescendantIds.mockReset();
    mockedRepo.findDescendantIds.mockResolvedValueOnce(new Set([5, 7]));

    await expect(service.update(5, { parentId: 7 })).rejects.toBeInstanceOf(
      BadRequestError,
    );

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on the boundary rejection (no password / hash leak)', async () => {
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 5, parentId: 7 }),
    );
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findDescendantIds.mockReset();
    mockedRepo.findDescendantIds.mockResolvedValueOnce(new Set([5, 7]));

    const err = await service
      .update(5, { parentId: 7 })
      .catch((e) => e) as BadRequestError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 2: upper-bound value just at the supported limit.
// Result : id = Number.MAX_SAFE_INTEGER, description / name at max
//          length.
// ---------------------------------------------------------------------------
describe('[UTCID09] departmentsService.update() – Boundary 2: upper-bound value', () => {
  it('accepts id = Number.MAX_SAFE_INTEGER', async () => {
    const maxId = Number.MAX_SAFE_INTEGER;
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: maxId }),
    );
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow({ id: maxId }));

    const result = await service.update(maxId, { name: 'New Name' });

    expect(result.id).toBe(maxId);
  });

  it('forwards id = Number.MAX_SAFE_INTEGER to prisma.findUnique', async () => {
    const maxId = Number.MAX_SAFE_INTEGER;
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: maxId }),
    );
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow({ id: maxId }));

    await service.update(maxId, { name: 'New Name' });

    expect(mockedPrisma.department.findUnique).toHaveBeenCalledWith({
      where: { id: maxId },
      select: { id: true, parentId: true, name: true },
    });
  });

  it('forwards id = Number.MAX_SAFE_INTEGER to repository.update', async () => {
    const maxId = Number.MAX_SAFE_INTEGER;
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: maxId }),
    );
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow({ id: maxId }));

    await service.update(maxId, { name: 'New Name' });

    expect(mockedRepo.update.mock.calls[0][0]).toBe(maxId);
  });

  it('accepts name at exactly 100 chars', async () => {
    const longName = 'A'.repeat(100);
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 1, name: 'Old' }),
    );
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow({ name: longName }));

    const result = await service.update(1, { name: longName });

    expect(result.name).toBe(longName);
    expect(result.name).toHaveLength(100);
  });

  it('accepts description at exactly 500 chars', async () => {
    const longDescription = 'M'.repeat(500);
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: 1 }),
    );
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(
      makeUpdatedRow({ description: longDescription }),
    );

    const result = await service.update(1, { description: longDescription });

    expect(result.description).toBe(longDescription);
    expect(result.description).toHaveLength(500);
  });

  it('rejects the adjacent unsupported value: missing department on the upper boundary', async () => {
    const maxId = Number.MAX_SAFE_INTEGER;
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      service.update(maxId, { name: 'New Name' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does NOT call repository.update on the upper-boundary rejection (no partial commit)', async () => {
    const maxId = Number.MAX_SAFE_INTEGER;
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      service.update(maxId, { name: 'New Name' }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.update).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on the upper-boundary rejection (no password / hash leak)', async () => {
    const maxId = Number.MAX_SAFE_INTEGER;
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const err = await service
      .update(maxId, { name: 'New Name' })
      .catch((e) => e) as NotFoundError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT leak sensitive fields through the response on the upper boundary', async () => {
    const maxId = Number.MAX_SAFE_INTEGER;
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: maxId }),
    );
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow({ id: maxId }));

    const result = await service.update(maxId, { name: 'New Name' });

    expect(JSON.stringify(result)).not.toMatch(/password/i);
    expect(JSON.stringify(result)).not.toMatch(/hash/i);
    expect(JSON.stringify(result)).not.toMatch(/secret/i);
  });

  it('does NOT throw on the upper-boundary path (no unhandled exception)', async () => {
    const maxId = Number.MAX_SAFE_INTEGER;
    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: maxId }),
    );
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(makeUpdatedRow({ id: maxId }));

    await expect(
      service.update(maxId, { name: 'New Name' }),
    ).resolves.toBeDefined();
  });

  it('accepts the boundary: id = MAX + name = 100 chars + description = 500 chars', async () => {
    const maxId = Number.MAX_SAFE_INTEGER;
    const longName = 'A'.repeat(100);
    const longDescription = 'M'.repeat(500);

    (mockedPrisma.department.findUnique as jest.Mock).mockReset();
    (mockedPrisma.department.findUnique as jest.Mock).mockResolvedValueOnce(
      makeCurrentRow({ id: maxId, name: 'Old' }),
    );
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.update.mockReset();
    mockedRepo.update.mockResolvedValueOnce(
      makeUpdatedRow({
        id: maxId,
        name: longName,
        description: longDescription,
      }),
    );

    const result = await service.update(maxId, {
      name: longName,
      description: longDescription,
    });

    expect(result.id).toBe(maxId);
    expect(result.name).toHaveLength(100);
    expect(result.description).toHaveLength(500);
  });
});
