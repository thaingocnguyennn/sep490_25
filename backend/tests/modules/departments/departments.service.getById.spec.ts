/**
 * Unit tests for DepartmentsService.getById() — Function17 / View
 * Department Detail.
 *
 * Contract:
 *   async getById(id: number): Promise<DepartmentDetail>
 *
 *   1. Service forwards the id to
 *      `departmentsRepository.findById(id)`.
 *   2. The repository throws NotFoundError('Department not found')
 *      if the department does not exist.
 *   3. The persisted row is wrapped into a `DepartmentDetail`:
 *      { ...DepartmentListItem, children: { id, name }[] }.
 *   4. `children` is sorted by name ASC.
 *   5. No `members` field is part of the detail — the matrix says
 *      "members" but the current implementation has a separate
 *      `getMembers` endpoint. We document this gap.
 *
 * Note on the matrix's "members" requirement:
 *   - The current implementation does NOT include `members` in the
 *     detail response. The matrix's "members" Normal case is
 *     documented as a separate endpoint (`getMembers`).
 *
 * Coverage matrix (UTCID01 – UTCID05):
 *   UTCID01  N  – Department data: returns the detail with all
 *                 fields (id, name, description, parent, createdAt,
 *                 updatedAt).
 *   UTCID02  N  – Parent / children: returns the parent (if any)
 *                 and the children list (sorted by name).
 *   UTCID03  N  – Members: documented gap — `members` is not
 *                 part of the detail response.
 *   UTCID04  A  – Invalid identifier: NotFoundError on missing
 *                 department.
 *   UTCID05  B  – Boundary 1: department with no parent or no
 *                 members (top-level, leaf).
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
// Test fixtures
// ---------------------------------------------------------------------------

function makeDepartmentDetail(overrides: any = {}): any {
  return {
    id: 1,
    name: 'Phòng Kế toán',
    description: 'Mô tả phòng kế toán',
    parentId: null,
    parent: null,
    createdAt: new Date('2026-09-11T01:00:00.000Z'),
    updatedAt: new Date('2026-09-11T01:00:00.000Z'),
    userCount: 5,
    childCount: 2,
    children: [
      { id: 2, name: 'Phòng Kế toán Nhân sự' },
      { id: 3, name: 'Phòng Kế toán Lương' },
    ],
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
  mockedRepo.findById.mockResolvedValue(makeDepartmentDetail());

  service = new DepartmentsService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: department data.
// Result : View Department Detail returns the detail with all
//          fields.
// ---------------------------------------------------------------------------
describe('[UTCID01] departmentsService.getById() – Normal 1: department data', () => {
  it('returns the detail when the department exists', async () => {
    const detail = makeDepartmentDetail({ id: 1, name: 'Phòng Kế toán' });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(result.id).toBe(1);
    expect(result.name).toBe('Phòng Kế toán');
  });

  it('forwards the id to the repository', async () => {
    await service.getById(42);

    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findById).toHaveBeenCalledWith(42);
  });

  it('returns the detail verbatim from the repository', async () => {
    const detail = makeDepartmentDetail({ id: 99, name: 'Phòng Mới' });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(99);

    expect(result).toEqual(detail);
  });

  it('does NOT call any write methods (create, update, delete)', async () => {
    await service.getById(1);

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does NOT call any member-management methods on the getById path', async () => {
    await service.getById(1);

    expect(mockedRepo.addMembers).not.toHaveBeenCalled();
    expect(mockedRepo.removeMember).not.toHaveBeenCalled();
  });

  it('returns the detail with id, name, description, parentId, parent', async () => {
    const detail = makeDepartmentDetail({
      id: 5,
      name: 'Phòng IT',
      description: 'Phòng IT',
      parentId: null,
      parent: null,
    });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(5);

    expect(result.id).toBe(5);
    expect(result.name).toBe('Phòng IT');
    expect(result.description).toBe('Phòng IT');
    expect(result.parentId).toBeNull();
    expect(result.parent).toBeNull();
  });

  it('returns the detail with createdAt / updatedAt timestamps', async () => {
    const createdAt = new Date('2026-09-11T01:00:00.000Z');
    const updatedAt = new Date('2026-09-11T02:00:00.000Z');
    const detail = makeDepartmentDetail({ createdAt, updatedAt });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(result.createdAt).toEqual(createdAt);
    expect(result.updatedAt).toEqual(updatedAt);
  });

  it('returns the detail with userCount and childCount', async () => {
    const detail = makeDepartmentDetail({ userCount: 10, childCount: 3 });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(result.userCount).toBe(10);
    expect(result.childCount).toBe(3);
  });

  it('does NOT leak sensitive fields through the response (no password / hash / secret)', async () => {
    const result = await service.getById(1);

    expect(JSON.stringify(result)).not.toMatch(/password/i);
    expect(JSON.stringify(result)).not.toMatch(/hash/i);
    expect(JSON.stringify(result)).not.toMatch(/secret/i);
    expect(JSON.stringify(result)).not.toMatch(/\$2[aby]\$/);
  });

  it('does NOT log the id via console.log (no audit logging at the service layer)', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await service.getById(1);

    // No console.log should be issued by the service. (The service
    // does not have its own logging.)
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: parent / children.
// Result : Returns the parent (if any) and the children list.
// ---------------------------------------------------------------------------
describe('[UTCID02] departmentsService.getById() – Normal 2: parent / children', () => {
  it('returns the parent when the department has a parent', async () => {
    const detail = makeDepartmentDetail({
      id: 2,
      name: 'Phòng Nhân sự',
      parentId: 1,
      parent: { id: 1, name: 'Phòng Kế toán' },
    });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(2);

    expect(result.parentId).toBe(1);
    expect(result.parent).toEqual({ id: 1, name: 'Phòng Kế toán' });
  });

  it('returns parent = null when the department is top-level', async () => {
    const detail = makeDepartmentDetail({
      id: 1,
      name: 'Phòng Kế toán',
      parentId: null,
      parent: null,
    });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(result.parent).toBeNull();
    expect(result.parentId).toBeNull();
  });

  it('returns children when the department has children', async () => {
    const detail = makeDepartmentDetail({
      id: 1,
      name: 'Phòng Kế toán',
      children: [
        { id: 2, name: 'Phòng Kế toán Nhân sự' },
        { id: 3, name: 'Phòng Kế toán Lương' },
      ],
    });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(result.children).toEqual([
      { id: 2, name: 'Phòng Kế toán Nhân sự' },
      { id: 3, name: 'Phòng Kế toán Lương' },
    ]);
  });

  it('returns children = [] when the department has no children (leaf)', async () => {
    const detail = makeDepartmentDetail({
      id: 1,
      name: 'Phòng Kế toán',
      children: [],
    });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(result.children).toEqual([]);
  });

  it('preserves children sorted by name ASC', async () => {
    const detail = makeDepartmentDetail({
      id: 1,
      children: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 3, name: 'C' },
      ],
    });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(result.children.map((c: any) => c.name)).toEqual(['A', 'B', 'C']);
  });

  it('preserves childCount from the persisted row', async () => {
    const detail = makeDepartmentDetail({ childCount: 5 });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(result.childCount).toBe(5);
  });

  it('returns detail with both parent and children (full hierarchy)', async () => {
    const detail = makeDepartmentDetail({
      id: 5,
      name: 'Phòng C',
      parentId: 2,
      parent: { id: 2, name: 'Phòng B' },
      children: [
        { id: 7, name: 'Phòng C1' },
        { id: 8, name: 'Phòng C2' },
      ],
    });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(5);

    expect(result.parent).toEqual({ id: 2, name: 'Phòng B' });
    expect(result.children).toEqual([
      { id: 7, name: 'Phòng C1' },
      { id: 8, name: 'Phòng C2' },
    ]);
  });

  it('does NOT call any other repository methods on the getById path', async () => {
    await service.getById(1);

    expect(mockedRepo.findAll).not.toHaveBeenCalled();
    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
    expect(mockedRepo.existsById).not.toHaveBeenCalled();
    expect(mockedRepo.findByNameAndParent).not.toHaveBeenCalled();
    expect(mockedRepo.findMembers).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: members.
// Result : Documented gap — `members` is NOT in the detail response.
// ---------------------------------------------------------------------------
describe('[UTCID03] departmentsService.getById() – Normal 3: members (documented gap)', () => {
  it('does NOT include `members` in the detail response', async () => {
    const result = await service.getById(1);

    expect((result as any).members).toBeUndefined();
  });

  it('does NOT call findMembers on the getById path', async () => {
    await service.getById(1);

    expect(mockedRepo.findMembers).not.toHaveBeenCalled();
  });

  it('returns the userCount (count of members), not the members themselves', async () => {
    const detail = makeDepartmentDetail({ userCount: 7 });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(result.userCount).toBe(7);
    expect((result as any).members).toBeUndefined();
  });

  it('does NOT call addMembers / removeMember on the getById path', async () => {
    await service.getById(1);

    expect(mockedRepo.addMembers).not.toHaveBeenCalled();
    expect(mockedRepo.removeMember).not.toHaveBeenCalled();
  });

  it('does NOT include a `createdBy` field (documented gap — no actor)', async () => {
    const result = await service.getById(1);

    expect((result as any).createdBy).toBeUndefined();
  });

  it('does NOT include a `status` field (documented gap — no status on Department)', async () => {
    const result = await service.getById(1);

    expect((result as any).status).toBeUndefined();
  });

  it('forwards the id to the repository exactly once', async () => {
    await service.getById(1);

    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findById).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: invalid identifier.
// Result : View Department Detail rejects with NotFoundError on
//          missing department.
// ---------------------------------------------------------------------------
describe('[UTCID04] departmentsService.getById() – Abnormal 1: invalid identifier', () => {
  it('rejects with NotFoundError when the department does not exist', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Department not found'),
    );

    await expect(service.getById(999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects with NotFoundError (404) on a non-existent id', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Department not found'),
    );

    const err = await service.getById(999).catch((e) => e) as NotFoundError;

    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Department not found');
  });

  it('rejects when the id is a positive integer that does not exist', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Department not found'),
    );

    await expect(service.getById(12345)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects when the repository throws an unexpected Error', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(repoError);

    await expect(service.getById(1)).rejects.toBe(repoError);
  });

  it('rejects when the repository throws a TypeError', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementationOnce(async () => {
      throw new TypeError('Unexpected');
    });

    await expect(service.getById(1)).rejects.toBeInstanceOf(TypeError);
  });

  it('records a safe diagnostic on NotFoundError (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Department not found'),
    );

    const err = await service.getById(999).catch((e) => e) as NotFoundError;

    expect(err.message).toBe('Department not found');
    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('records a safe diagnostic on repository failure (no password / hash leak)', async () => {
    const repoError = new Error('connection refused');
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(repoError);

    const err = await service.getById(1).catch((e) => e) as Error;

    expect(err.message).toBe('connection refused');
    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT call any write methods on the rejection path', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Department not found'),
    );

    await expect(service.getById(999)).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does NOT retry the lookup on NotFoundError', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Department not found'),
    );

    await expect(service.getById(999)).rejects.toBeInstanceOf(NotFoundError);

    // Exactly one findById call — no retry.
    expect(mockedRepo.findById).toHaveBeenCalledTimes(1);
  });

  it('does NOT call any other repository methods on the rejection path', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Department not found'),
    );

    await expect(service.getById(999)).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedRepo.findAll).not.toHaveBeenCalled();
    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Boundary 1: department with no parent or no members.
// Result : Accepts the supported boundary (top-level, leaf, empty
//          children); the adjacent unsupported value (e.g. unexpected
//          repository error) is rejected without partial commit or
//          sensitive disclosure.
// ---------------------------------------------------------------------------
describe('[UTCID05] departmentsService.getById() – Boundary 1: department with no parent or members', () => {
  it('accepts the boundary: top-level department with parent = null', async () => {
    const detail = makeDepartmentDetail({
      id: 1,
      name: 'Phòng Kế toán',
      parentId: null,
      parent: null,
      children: [],
    });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(result.parent).toBeNull();
    expect(result.parentId).toBeNull();
    expect(result.children).toEqual([]);
  });

  it('accepts the boundary: leaf department with children = []', async () => {
    const detail = makeDepartmentDetail({
      id: 1,
      name: 'Phòng Kế toán',
      parentId: 0,
      parent: { id: 0, name: 'Top' },
      children: [],
      childCount: 0,
    });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(result.children).toEqual([]);
    expect(result.childCount).toBe(0);
  });

  it('accepts the boundary: department with userCount = 0 (no members)', async () => {
    const detail = makeDepartmentDetail({ userCount: 0 });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(result.userCount).toBe(0);
  });

  it('accepts the boundary: department with description = null', async () => {
    const detail = makeDepartmentDetail({ description: null });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(result.description).toBeNull();
  });

  it('accepts the boundary: id = 1 (smallest positive integer)', async () => {
    const detail = makeDepartmentDetail({ id: 1 });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(result.id).toBe(1);
  });

  it('accepts the boundary: id = Number.MAX_SAFE_INTEGER', async () => {
    const maxId = Number.MAX_SAFE_INTEGER;
    const detail = makeDepartmentDetail({ id: maxId });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(maxId);

    expect(result.id).toBe(maxId);
  });

  it('rejects the adjacent unsupported value: repository failure on the boundary', async () => {
    const repoError = new Error('boundary failure');
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(repoError);

    await expect(service.getById(1)).rejects.toBeInstanceOf(Error);
  });

  it('does NOT call any write methods on the boundary path', async () => {
    const detail = makeDepartmentDetail({
      id: 1,
      parentId: null,
      parent: null,
      children: [],
    });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    await service.getById(1);

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on the boundary rejection (no password / hash leak)', async () => {
    const repoError = new Error('boundary failure');
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(repoError);

    const err = await service.getById(1).catch((e) => e) as Error;

    expect(err.message).toBe('boundary failure');
    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT leak sensitive fields through the response on the boundary path', async () => {
    const detail = makeDepartmentDetail({
      id: 1,
      parentId: null,
      parent: null,
      children: [],
    });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(JSON.stringify(result)).not.toMatch(/password/i);
    expect(JSON.stringify(result)).not.toMatch(/hash/i);
    expect(JSON.stringify(result)).not.toMatch(/secret/i);
  });

  it('accepts the boundary: department with many children (large list)', async () => {
    const manyChildren = Array.from({ length: 100 }, (_, i) => ({
      id: i + 100,
      name: `Child ${String.fromCharCode(65 + (i % 26))} ${i}`,
    }));
    const detail = makeDepartmentDetail({
      id: 1,
      children: manyChildren,
      childCount: 100,
    });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(result.children).toHaveLength(100);
    expect(result.childCount).toBe(100);
  });

  it('accepts the boundary: department with description at max length (500 chars)', async () => {
    const longDescription = 'M'.repeat(500);
    const detail = makeDepartmentDetail({ description: longDescription });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(result.description).toBe(longDescription);
    expect(result.description).toHaveLength(500);
  });

  it('accepts the boundary: department with description longer than 500 chars (forwarded verbatim)', async () => {
    // The service does NOT validate description length. The
    // repository returns the value as-is.
    const tooLongDescription = 'M'.repeat(600);
    const detail = makeDepartmentDetail({ description: tooLongDescription });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    const result = await service.getById(1);

    expect(result.description).toBe(tooLongDescription);
  });

  it('does NOT throw on the boundary path (no unhandled exception)', async () => {
    const detail = makeDepartmentDetail({
      id: 1,
      parentId: null,
      parent: null,
      children: [],
    });
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(detail);

    await expect(service.getById(1)).resolves.toBeDefined();
  });
});
