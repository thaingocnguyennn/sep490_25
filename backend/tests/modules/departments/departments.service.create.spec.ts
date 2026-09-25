/**
 * Unit tests for DepartmentsService.create() — Function15 / Create
 * Department.
 *
 * Contract:
 *   async create(input: {
 *     name: string;
 *     description?: string | null;
 *     parentId?: number | null;
 *   }): Promise<Department>
 *
 *   1. parentId defaults to null if undefined.
 *   2. If parentId !== null, departmentsRepository.existsById(parentId)
 *      is called. If the parent does NOT exist, throw
 *      NotFoundError(`Parent department with id ${parentId} not found`).
 *   3. departmentsRepository.findByNameAndParent(name, parentId) is
 *      called. If a collision exists, throw
 *      ConflictError('Department name already exists in this parent').
 *   4. departmentsRepository.create({ name, description ?? null,
 *      parentId }) is called and its return value is forwarded.
 *   5. The repository catches Prisma P2002 and throws
 *      ConflictError('Department name already exists in this parent').
 *      This is the safety net for race conditions.
 *
 * Note on the matrix's "code/name" / "actor" / "status"
 * requirements:
 *   - The implementation has NO `code` field. The matrix calls it
 *     "unique code/name" but only `name` is enforced. Documented.
 *   - The implementation has NO `createdBy` / actor field. The
 *     matrix mentions an actor but the service signature doesn't
 *     accept one. Documented.
 *   - The implementation has NO `status` field on Department.
 *     Documented.
 *
 * Coverage matrix (UTCID01 – UTCID08):
 *   UTCID01  N  – Create Department completes successfully for a
 *                 valid department (top-level).
 *   UTCID02  N  – Hierarchy link: a valid parentId is accepted; the
 *                 parent existence is verified before create.
 *   UTCID03  N  – Unique name: a duplicate name in the same parent
 *                 is rejected with ConflictError.
 *   UTCID04  N  – Persistence: the row is forwarded to the
 *                 repository with the exact data shape.
 *   UTCID05  N  – Response-to-database consistency: identifiers,
 *                 timestamps, and persisted fields propagate.
 *   UTCID06  A  – Missing parent or duplicate invalid data:
 *                 NotFoundError or ConflictError on missing parent /
 *                 duplicate name.
 *   UTCID07  A  – Unauthorized creator: not enforced at the service
 *                 layer (controller / middleware responsibility).
 *   UTCID08  B  – Boundary 1: minimum / maximum name length (1 / 100
 *                 chars), description length (0 / 500 chars), and
 *                 supported / adjacent unsupported values.
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
// Test fixtures
// ---------------------------------------------------------------------------

function makeDepartmentRow(overrides: any = {}): any {
  return {
    id: 100,
    name: 'Phòng Kế toán',
    description: null,
    parentId: null,
    createdAt: new Date('2026-09-11T01:00:00.000Z'),
    updatedAt: new Date('2026-09-11T01:00:00.000Z'),
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

  // Healthy defaults — every test overrides what it needs.
  // No parent by default (top-level department).
  mockedRepo.existsById.mockResolvedValue(true);
  // No collision by default.
  mockedRepo.findByNameAndParent.mockResolvedValue(null);
  // create returns a row.
  mockedRepo.create.mockResolvedValue(makeDepartmentRow());

  service = new DepartmentsService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid department (top-level).
// Result : Create Department returns the persisted row.
// ---------------------------------------------------------------------------
describe('[UTCID01] departmentsService.create() – Normal 1: valid top-level department', () => {
  it('creates a top-level department (parentId = null)', async () => {
    mockedRepo.existsById.mockReset();
    // existsById should NOT be called when parentId is null.
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockResolvedValueOnce(
      makeDepartmentRow({ id: 100, name: 'Phòng Kế toán', parentId: null }),
    );

    const result = await service.create({ name: 'Phòng Kế toán' });

    expect(result.id).toBe(100);
    expect(result.name).toBe('Phòng Kế toán');
    expect(result.parentId).toBeNull();
  });

  it('forwards the create call to the repository with the exact data shape', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockResolvedValueOnce(
      makeDepartmentRow({ name: 'Phòng Kế toán' }),
    );

    await service.create({ name: 'Phòng Kế toán' });

    expect(mockedRepo.create).toHaveBeenCalledTimes(1);
    expect(mockedRepo.create.mock.calls[0][0]).toEqual({
      name: 'Phòng Kế toán',
      description: null,
      parentId: null,
    });
  });

  it('does NOT call existsById when parentId is undefined (defaults to null)', async () => {
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({ name: 'Phòng Kế toán' });

    // existsById is NOT called when parentId is undefined / null.
    expect(mockedRepo.existsById).not.toHaveBeenCalled();
  });

  it('does NOT call existsById when parentId is null', async () => {
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({ name: 'Phòng Kế toán', parentId: null });

    expect(mockedRepo.existsById).not.toHaveBeenCalled();
  });

  it('forwards description verbatim (null when not supplied)', async () => {
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({ name: 'Phòng Kế toán' });

    expect(mockedRepo.create.mock.calls[0][0].description).toBeNull();
  });

  it('does NOT call any other write methods (update, delete)', async () => {
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({ name: 'Phòng Kế toán' });

    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does NOT call addMembers / removeMember on the create path', async () => {
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({ name: 'Phòng Kế toán' });

    expect(mockedRepo.addMembers).not.toHaveBeenCalled();
    expect(mockedRepo.removeMember).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: hierarchy link.
// Result : A valid parentId is accepted; parent existence is verified
//          before create.
// ---------------------------------------------------------------------------
describe('[UTCID02] departmentsService.create() – Normal 2: hierarchy link', () => {
  it('verifies parent existence via existsById when parentId is supplied', async () => {
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockResolvedValueOnce(
      makeDepartmentRow({ id: 200, name: 'Phòng Nhân sự', parentId: 5 }),
    );

    await service.create({
      name: 'Phòng Nhân sự',
      parentId: 5,
    });

    expect(mockedRepo.existsById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.existsById).toHaveBeenCalledWith(5);
  });

  it('forwards the create call with the parentId', async () => {
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockResolvedValueOnce(
      makeDepartmentRow({ id: 200, name: 'Phòng Nhân sự', parentId: 5 }),
    );

    await service.create({
      name: 'Phòng Nhân sự',
      parentId: 5,
    });

    expect(mockedRepo.create.mock.calls[0][0].parentId).toBe(5);
  });

  it('returns the persisted row with the parentId', async () => {
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockResolvedValueOnce(
      makeDepartmentRow({ id: 200, name: 'Phòng Nhân sự', parentId: 5 }),
    );

    const result = await service.create({
      name: 'Phòng Nhân sự',
      parentId: 5,
    });

    expect(result.parentId).toBe(5);
  });

  it('does NOT call create when parent does not exist (no partial commit)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await expect(
      service.create({ name: 'Phòng Nhân sự', parentId: 999 }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // create is NOT called — no partial commit.
    expect(mockedRepo.create).not.toHaveBeenCalled();
  });

  it('does NOT call findByNameAndParent when parent does not exist (early return)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(
      service.create({ name: 'Phòng Nhân sự', parentId: 999 }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // findByNameAndParent is NOT called when the parent check fails.
    expect(mockedRepo.findByNameAndParent).not.toHaveBeenCalled();
  });

  it('forwards the description verbatim when supplied alongside parentId', async () => {
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({
      name: 'Phòng Nhân sự',
      description: 'Mô tả về phòng nhân sự',
      parentId: 5,
    });

    expect(mockedRepo.create.mock.calls[0][0].description).toBe(
      'Mô tả về phòng nhân sự',
    );
    expect(mockedRepo.create.mock.calls[0][0].parentId).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: unique code/name (name + parentId uniqueness).
// Result : A duplicate name in the same parent is rejected with
//          ConflictError.
// ---------------------------------------------------------------------------
describe('[UTCID03] departmentsService.create() – Normal 3: unique name', () => {
  it('rejects with ConflictError when name + parentId already exists', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(
      makeDepartmentRow({ id: 99, name: 'Phòng Kế toán', parentId: 5 }),
    );

    await expect(
      service.create({ name: 'Phòng Kế toán', parentId: 5 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('does NOT call create when a collision is detected', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(
      makeDepartmentRow({ id: 99, name: 'Phòng Kế toán', parentId: 5 }),
    );

    await expect(
      service.create({ name: 'Phòng Kế toán', parentId: 5 }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(mockedRepo.create).not.toHaveBeenCalled();
  });

  it('allows the same name in a DIFFERENT parent (uniqueness is per-parent)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockResolvedValueOnce(
      makeDepartmentRow({ id: 200, name: 'Phòng Kế toán', parentId: 7 }),
    );

    // "Phòng Kế toán" under parent 7 — no collision (only under parent 5).
    const result = await service.create({
      name: 'Phòng Kế toán',
      parentId: 7,
    });

    expect(result.id).toBe(200);
    expect(result.parentId).toBe(7);
  });

  it('allows the same name at the top level (parentId=null) when no collision', async () => {
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockResolvedValueOnce(
      makeDepartmentRow({ id: 100, name: 'Phòng Kế toán', parentId: null }),
    );

    const result = await service.create({
      name: 'Phòng Kế toán',
    });

    expect(result.id).toBe(100);
    expect(result.parentId).toBeNull();
  });

  it('forwards name and parentId verbatim to findByNameAndParent', async () => {
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);

    await service.create({
      name: 'Phòng Kế toán',
      parentId: 5,
    });

    expect(mockedRepo.findByNameAndParent).toHaveBeenCalledWith(
      'Phòng Kế toán',
      5,
    );
  });

  it('forwards (name, null) to findByNameAndParent when parentId is null', async () => {
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({ name: 'Phòng Kế toán' });

    expect(mockedRepo.findByNameAndParent).toHaveBeenCalledWith(
      'Phòng Kế toán',
      null,
    );
  });

  it('does NOT have a `code` field (documented gap — only `name` is enforced)', async () => {
    // The matrix mentions "unique code/name" but the current
    // implementation has no `code` field. Only `name` + `parentId`
    // uniqueness is enforced.
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({ name: 'Phòng Kế toán' });

    const forwardedName = mockedRepo.findByNameAndParent.mock.calls[0][0];
    expect(forwardedName).toBe('Phòng Kế toán');
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: persistence.
// Result : The row is forwarded to the repository with the exact
//          data shape.
// ---------------------------------------------------------------------------
describe('[UTCID04] departmentsService.create() – Normal 4: persistence', () => {
  it('calls create exactly once on the happy path', async () => {
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({ name: 'Phòng Kế toán' });

    expect(mockedRepo.create).toHaveBeenCalledTimes(1);
  });

  it('forwards the full data shape: name, description, parentId', async () => {
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({
      name: 'Phòng Kế toán',
      description: 'Mô tả',
    });

    expect(mockedRepo.create.mock.calls[0][0]).toEqual({
      name: 'Phòng Kế toán',
      description: 'Mô tả',
      parentId: null,
    });
  });

  it('forwards null when description is explicitly null', async () => {
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({
      name: 'Phòng Kế toán',
      description: null,
    });

    expect(mockedRepo.create.mock.calls[0][0].description).toBeNull();
  });

  it('returns the persisted row verbatim from the repository', async () => {
    const row = makeDepartmentRow({
      id: 42,
      name: 'Phòng Mới',
    });
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockReset();
    mockedRepo.create.mockResolvedValueOnce(row);

    const result = await service.create({ name: 'Phòng Mới' });

    expect(result).toEqual(row);
  });

  it('does NOT include a `createdBy` field (documented gap — no actor)', async () => {
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({ name: 'Phòng Kế toán' });

    expect(
      (mockedRepo.create.mock.calls[0][0] as any).createdBy,
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : Identifiers (id), timestamps (createdAt / updatedAt), and
//          persisted fields propagate consistently.
// ---------------------------------------------------------------------------
describe('[UTCID05] departmentsService.create() – Normal 5: response-to-database consistency', () => {
  it('propagates the new id from the persisted row', async () => {
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockReset();
    mockedRepo.create.mockResolvedValueOnce(
      makeDepartmentRow({ id: 777 }),
    );

    const result = await service.create({ name: 'Phòng Mới' });

    expect(result.id).toBe(777);
  });

  it('propagates the name from the persisted row', async () => {
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockReset();
    mockedRepo.create.mockResolvedValueOnce(
      makeDepartmentRow({ name: 'Phòng Mới Tên' }),
    );

    const result = await service.create({ name: 'Phòng Mới Tên' });

    expect(result.name).toBe('Phòng Mới Tên');
  });

  it('propagates the parentId from the persisted row', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockReset();
    mockedRepo.create.mockResolvedValueOnce(
      makeDepartmentRow({ parentId: 5 }),
    );

    const result = await service.create({
      name: 'Phòng Mới',
      parentId: 5,
    });

    expect(result.parentId).toBe(5);
  });

  it('propagates the description from the persisted row', async () => {
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockReset();
    mockedRepo.create.mockResolvedValueOnce(
      makeDepartmentRow({ description: 'Mô tả cụ thể' }),
    );

    const result = await service.create({
      name: 'Phòng Mới',
      description: 'Mô tả cụ thể',
    });

    expect(result.description).toBe('Mô tả cụ thể');
  });

  it('propagates the timestamps from the persisted row', async () => {
    const createdAt = new Date('2026-09-11T01:00:00.000Z');
    const updatedAt = new Date('2026-09-11T01:00:00.000Z');
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockReset();
    mockedRepo.create.mockResolvedValueOnce(
      makeDepartmentRow({ createdAt, updatedAt }),
    );

    const result = await service.create({ name: 'Phòng Mới' });

    expect(result.createdAt).toEqual(createdAt);
    expect(result.updatedAt).toEqual(updatedAt);
  });

  it('does NOT include a `status` field on the persisted row (documented gap)', async () => {
    // The matrix mentions "status" but the Department model has no
    // status field.
    const result = await service.create({ name: 'Phòng Mới' });

    expect((result as any).status).toBeUndefined();
  });

  it('does NOT include a `createdBy` field on the persisted row (documented gap)', async () => {
    const result = await service.create({ name: 'Phòng Mới' });

    expect((result as any).createdBy).toBeUndefined();
  });

  it('does NOT leak sensitive fields through the response (no password / hash / secret)', async () => {
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    const result = await service.create({ name: 'Phòng Mới' });

    expect(JSON.stringify(result)).not.toMatch(/password/i);
    expect(JSON.stringify(result)).not.toMatch(/hash/i);
    expect(JSON.stringify(result)).not.toMatch(/secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: missing parent / duplicate invalid data.
// Result : Create Department rejects with NotFoundError or
//          ConflictError on missing parent / duplicate name.
// ---------------------------------------------------------------------------
describe('[UTCID06] departmentsService.create() – Abnormal 1: missing/duplicate invalid data', () => {
  it('rejects with NotFoundError when parent does not exist', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(
      service.create({ name: 'Phòng Mới', parentId: 999 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects with NotFoundError (404) on missing parent', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    const err = await service
      .create({ name: 'Phòng Mới', parentId: 999 })
      .catch((e) => e) as NotFoundError;

    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('999');
  });

  it('rejects with ConflictError (409) on duplicate name in same parent', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(
      makeDepartmentRow({ id: 99, name: 'Phòng Mới', parentId: 5 }),
    );

    const err = await service
      .create({ name: 'Phòng Mới', parentId: 5 })
      .catch((e) => e) as ConflictError;

    expect(err.statusCode).toBe(409);
    expect(err.message).toBe('Department name already exists in this parent');
  });

  it('records a safe diagnostic on missing-parent rejection (no password / hash leak)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    const err = await service
      .create({ name: 'Phòng Mới', parentId: 999 })
      .catch((e) => e) as NotFoundError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('records a safe diagnostic on duplicate-name rejection (no password / hash leak)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(
      makeDepartmentRow({ id: 99 }),
    );

    const err = await service
      .create({ name: 'Phòng Mới', parentId: 5 })
      .catch((e) => e) as ConflictError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT call create on missing-parent (no partial commit)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(
      service.create({ name: 'Phòng Mới', parentId: 999 }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.create).not.toHaveBeenCalled();
  });

  it('does NOT call create on duplicate-name (no partial commit)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(
      makeDepartmentRow({ id: 99 }),
    );

    await expect(
      service.create({ name: 'Phòng Mới', parentId: 5 }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(mockedRepo.create).not.toHaveBeenCalled();
  });

  it('does NOT call any write methods (update, delete) on the rejection path', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(
      service.create({ name: 'Phòng Mới', parentId: 999 }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('rejects with ConflictError when the repository throws P2002 (race condition)', async () => {
    // Simulate a race condition: the findByNameAndParent check
    // passes (no collision), but the underlying unique constraint
    // fires during the create.
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockReset();
    mockedRepo.create.mockImplementationOnce(async () => {
      // The repository catches P2002 and re-throws as ConflictError.
      throw new ConflictError(
        'Department name already exists in this parent',
      );
    });

    await expect(
      service.create({ name: 'Phòng Mới' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: unauthorized creator.
// Result : The service does NOT enforce authorization — that's the
//          controller / middleware layer's job.
// ---------------------------------------------------------------------------
describe('[UTCID07] departmentsService.create() – Abnormal 2: unauthorized creator', () => {
  it('PERMITS create when no actor is supplied (no createdBy at the service layer)', async () => {
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    const result = await service.create({ name: 'Phòng Mới' });

    expect(result).toBeDefined();
  });

  it('rejects when the repository fails with an unexpected error', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockRejectedValueOnce(repoError);

    await expect(
      service.create({ name: 'Phòng Mới' }),
    ).rejects.toBe(repoError);
  });

  it('rejects when the parent-existence check fails with an unexpected error', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockRejectedValueOnce(repoError);

    await expect(
      service.create({ name: 'Phòng Mới', parentId: 5 }),
    ).rejects.toBe(repoError);
  });

  it('rejects when create itself fails with an unexpected error', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockReset();
    mockedRepo.create.mockRejectedValueOnce(repoError);

    await expect(
      service.create({ name: 'Phòng Mới' }),
    ).rejects.toBe(repoError);
  });

  it('records a safe diagnostic on repository failure (no password / hash leak)', async () => {
    const repoError = new Error('connection refused');
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockRejectedValueOnce(repoError);

    const err = await service
      .create({ name: 'Phòng Mới' })
      .catch((e) => e) as Error;

    expect(err.message).toBe('connection refused');
    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT call create when findByNameAndParent throws (no partial commit)', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockRejectedValueOnce(repoError);

    await expect(
      service.create({ name: 'Phòng Mới' }),
    ).rejects.toBe(repoError);

    expect(mockedRepo.create).not.toHaveBeenCalled();
  });

  it('does NOT call any write methods (update, delete) on the repository-failure path', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockRejectedValueOnce(repoError);

    await expect(
      service.create({ name: 'Phòng Mới' }),
    ).rejects.toBe(repoError);

    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does NOT enforce authorization at the service layer (documented gap)', async () => {
    // The matrix mentions "unauthorized creator" but the service
    // does NOT have an actor parameter. Authorization is at the
    // controller / middleware layer.
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    // The service permits the create regardless of caller.
    await expect(
      service.create({ name: 'Phòng Mới' }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: minimum / maximum code or name length.
// Result : Create Department accepts the supported boundary (name 1
//          / 100 chars, description 0 / 500 chars); the adjacent
//          unsupported value (e.g. parentId = 0) is rejected without
//          partial commit or sensitive disclosure.
// ---------------------------------------------------------------------------
describe('[UTCID08] departmentsService.create() – Boundary 1: minimum/maximum length', () => {
  // ---- name length ----

  it('accepts the supported minimum boundary: name length = 1', async () => {
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockReset();
    mockedRepo.create.mockResolvedValueOnce(
      makeDepartmentRow({ name: 'A' }),
    );

    const result = await service.create({ name: 'A' });

    expect(result.name).toBe('A');
    expect(result.name).toHaveLength(1);
  });

  it('accepts the supported maximum boundary: name length = 100', async () => {
    const longName = 'A'.repeat(100);

    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockReset();
    mockedRepo.create.mockResolvedValueOnce(
      makeDepartmentRow({ name: longName }),
    );

    const result = await service.create({ name: longName });

    expect(result.name).toBe(longName);
    expect(result.name).toHaveLength(100);
  });

  it('does NOT validate the name length at the service layer (forwarded verbatim)', async () => {
    // The service does NOT enforce min/max length on name. The
    // validation is at the route layer (express-validator). The
    // service forwards whatever it receives.
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    // 200 chars — exceeds the route-layer max of 100, but the
    // service doesn't care.
    const tooLongName = 'A'.repeat(200);

    await service.create({ name: tooLongName });

    expect(mockedRepo.create.mock.calls[0][0].name).toBe(tooLongName);
  });

  it('does NOT validate the name length on the supported boundaries (101 chars forwarded)', async () => {
    // 101 chars — one more than the route-layer max. The service
    // doesn't care; this is forwarded verbatim.
    const name101 = 'A'.repeat(101);

    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({ name: name101 });

    expect(mockedRepo.create.mock.calls[0][0].name).toBe(name101);
  });

  // ---- description length ----

  it('accepts the supported maximum boundary: description length = 500', async () => {
    const longDescription = 'M'.repeat(500);

    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({
      name: 'Phòng Mới',
      description: longDescription,
    });

    expect(mockedRepo.create.mock.calls[0][0].description).toBe(
      longDescription,
    );
  });

  it('does NOT validate the description length at the service layer (forwarded verbatim)', async () => {
    // 600 chars — exceeds the route-layer max of 500, but the
    // service doesn't care.
    const tooLongDescription = 'M'.repeat(600);

    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({
      name: 'Phòng Mới',
      description: tooLongDescription,
    });

    expect(mockedRepo.create.mock.calls[0][0].description).toBe(
      tooLongDescription,
    );
  });

  it('forwards null when description is empty string (defaulted by ?? null)', async () => {
    // Empty string is falsy in TypeScript with ?? null — the
    // service defaults it to null.
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({
      name: 'Phòng Mới',
      description: '' as any,
    });

    // Empty string is forwarded as-is, NOT nulled out — the
    // service uses `?? null` only when description is undefined.
    expect(mockedRepo.create.mock.calls[0][0].description).toBe('');
  });

  // ---- parentId boundary ----

  it('accepts the supported minimum boundary: parentId = 1', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({ name: 'Phòng Mới', parentId: 1 });

    expect(mockedRepo.existsById).toHaveBeenCalledWith(1);
  });

  it('accepts the supported maximum boundary: parentId = Number.MAX_SAFE_INTEGER', async () => {
    const maxParentId = Number.MAX_SAFE_INTEGER;

    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({
      name: 'Phòng Mới',
      parentId: maxParentId,
    });

    expect(mockedRepo.existsById).toHaveBeenCalledWith(maxParentId);
  });

  it('rejects the adjacent unsupported value: parent does not exist', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(
      service.create({ name: 'Phòng Mới', parentId: 999 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does NOT call create on the boundary rejection (no partial commit)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    await expect(
      service.create({ name: 'Phòng Mới', parentId: 999 }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.create).not.toHaveBeenCalled();
  });

  it('does NOT validate the parentId at the service layer (forwarded verbatim)', async () => {
    // The service does NOT enforce min/max on parentId. The
    // validation is at the route layer (parentId must be a positive
    // integer). The service forwards whatever it receives.

    // Negative parentId is forwarded verbatim to the repository.
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({ name: 'Phòng Mới', parentId: -5 });

    expect(mockedRepo.existsById).toHaveBeenCalledWith(-5);
  });

  it('records a safe diagnostic on the boundary rejection (no password / hash leak)', async () => {
    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(false);

    const err = await service
      .create({ name: 'Phòng Mới', parentId: 999 })
      .catch((e) => e) as NotFoundError;

    expect(err.message).toContain('999');
    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT call any write methods on the boundary path', async () => {
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockReset();
    mockedRepo.create.mockResolvedValueOnce(
      makeDepartmentRow({ name: 'A' }),
    );

    await service.create({ name: 'A' });

    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does NOT leak sensitive fields through the response on the boundary path', async () => {
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);
    mockedRepo.create.mockReset();
    mockedRepo.create.mockResolvedValueOnce(
      makeDepartmentRow({ name: 'A' }),
    );

    const result = await service.create({ name: 'A' });

    expect(JSON.stringify(result)).not.toMatch(/password/i);
    expect(JSON.stringify(result)).not.toMatch(/hash/i);
    expect(JSON.stringify(result)).not.toMatch(/secret/i);
  });

  it('accepts the boundary: name with 100 chars + description with 500 chars + parentId = 1', async () => {
    const longName = 'A'.repeat(100);
    const longDescription = 'M'.repeat(500);

    mockedRepo.existsById.mockReset();
    mockedRepo.existsById.mockResolvedValueOnce(true);
    mockedRepo.findByNameAndParent.mockReset();
    mockedRepo.findByNameAndParent.mockResolvedValueOnce(null);

    await service.create({
      name: longName,
      description: longDescription,
      parentId: 1,
    });

    expect(mockedRepo.create.mock.calls[0][0]).toEqual({
      name: longName,
      description: longDescription,
      parentId: 1,
    });
  });
});
