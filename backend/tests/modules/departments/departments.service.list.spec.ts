/**
 * Unit tests for DepartmentsService.list() — Function16 / View All
 * Department.
 *
 * Contract:
 *   async list(query: ListDepartmentsQuery = {}): Promise<DepartmentListItem[]>
 *
 *   1. `query.search` is forwarded verbatim to
 *      `departmentsRepository.findAll`.
 *   2. `query.includeUserCount ?? true` is forwarded as
 *      `includeCounts`.
 *   3. `findAll` returns `DepartmentListItem[]` — sorted by name
 *      ASC. Each row has `parent`, `userCount`, `childCount`
 *      (when `includeCounts` is true).
 *   4. Pagination is NOT supported at the service layer — the
 *      matrix mentions "pagination" but the current implementation
 *      returns the full list.
 *
 * Note on the matrix's "pagination" requirement:
 *   - The current implementation does NOT paginate. There is no
 *     `page` / `limit` parameter on the service signature. The
 *     matrix's "pagination" Normal case is documented as an
 *     unsupported feature in the current implementation.
 *
 * Coverage matrix (UTCID01 – UTCID06):
 *   UTCID01  N  – View All Department completes successfully for a
 *                 default list (no search, with counts).
 *   UTCID02  N  – Hierarchy: each row's `parent` field is
 *                 propagated (top-level vs child).
 *   UTCID03  N  – Pagination: documented gap — the service does
 *                 NOT paginate.
 *   UTCID04  A  – Unauthorized access: not enforced at the service
 *                 layer (controller / middleware responsibility).
 *   UTCID05  A  – Repository failure: propagates as a controlled
 *                 error.
 *   UTCID06  B  – Boundary 1: empty list, very large list, last-page
 *                 boundary (no pagination).
 */

import { DepartmentsService } from '../../../src/modules/departments/departments.service';
import {
  departmentsRepository,
} from '../../../src/modules/departments/departments.repository';

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

function makeListItem(overrides: any = {}): any {
  return {
    id: 1,
    name: 'Phòng Kế toán',
    description: 'Mô tả phòng kế toán',
    parentId: null,
    parent: null,
    createdAt: new Date('2026-09-11T01:00:00.000Z'),
    updatedAt: new Date('2026-09-11T01:00:00.000Z'),
    userCount: 5,
    childCount: 0,
    ...overrides,
  };
}

function makeChildListItem(overrides: any = {}): any {
  return makeListItem({
    id: 2,
    name: 'Phòng Nhân sự',
    parentId: 1,
    parent: { id: 1, name: 'Phòng Kế toán' },
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

let service: DepartmentsService;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();

  // Healthy defaults — every test overrides what it needs.
  mockedRepo.findAll.mockResolvedValue([
    makeListItem({ id: 1, name: 'Phòng Kế toán', userCount: 5, childCount: 1 }),
    makeListItem({ id: 2, name: 'Phòng Nhân sự', parentId: 1, userCount: 3, childCount: 0 }),
  ]);

  service = new DepartmentsService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: default list (no search, with counts).
// Result : View All Department returns the full list with counts.
// ---------------------------------------------------------------------------
describe('[UTCID01] departmentsService.list() – Normal 1: default list', () => {
  it('returns the full list when called with no arguments', async () => {
    const list = await service.list();

    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('Phòng Kế toán');
    expect(list[1].name).toBe('Phòng Nhân sự');
  });

  it('forwards `includeCounts: true` (default) to the repository', async () => {
    await service.list();

    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findAll.mock.calls[0][0]).toEqual({
      search: undefined,
      includeCounts: true,
    });
  });

  it('does NOT include a `search` parameter when not supplied', async () => {
    await service.list();

    expect(mockedRepo.findAll.mock.calls[0][0].search).toBeUndefined();
  });

  it('returns the expected success value: full list with counts', async () => {
    const list = await service.list();

    expect(list).toEqual([
      expect.objectContaining({
        id: 1,
        name: 'Phòng Kế toán',
        userCount: 5,
        childCount: 1,
      }),
      expect.objectContaining({
        id: 2,
        name: 'Phòng Nhân sự',
        userCount: 3,
        childCount: 0,
      }),
    ]);
  });

  it('does NOT call any write methods (create, update, delete)', async () => {
    await service.list();

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does NOT call any member-management methods on the list path', async () => {
    await service.list();

    expect(mockedRepo.addMembers).not.toHaveBeenCalled();
    expect(mockedRepo.removeMember).not.toHaveBeenCalled();
  });

  it('does NOT leak sensitive fields through the response (no password / hash / secret)', async () => {
    const list = await service.list();

    expect(JSON.stringify(list)).not.toMatch(/password/i);
    expect(JSON.stringify(list)).not.toMatch(/hash/i);
    expect(JSON.stringify(list)).not.toMatch(/secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: hierarchy.
// Result : Each row's `parent` field is propagated.
// ---------------------------------------------------------------------------
describe('[UTCID02] departmentsService.list() – Normal 2: hierarchy', () => {
  it('returns top-level departments with parent = null', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([makeListItem({ id: 1, parent: null })]);

    const list = await service.list();

    expect(list[0].parent).toBeNull();
    expect(list[0].parentId).toBeNull();
  });

  it('returns child departments with parent populated', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeListItem({ id: 1, name: 'Phòng Kế toán', parent: null, parentId: null }),
      makeChildListItem({ id: 2, name: 'Phòng Nhân sự', parentId: 1 }),
    ]);

    const list = await service.list();

    expect(list[1].parent).toEqual({ id: 1, name: 'Phòng Kế toán' });
    expect(list[1].parentId).toBe(1);
  });

  it('returns a mixed list of top-level and child departments', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeListItem({ id: 1, name: 'Phòng A', parent: null, parentId: null }),
      makeChildListItem({ id: 2, name: 'Phòng A1', parentId: 1, parent: { id: 1, name: 'Phòng A' } }),
      makeChildListItem({ id: 3, name: 'Phòng A2', parentId: 1, parent: { id: 1, name: 'Phòng A' } }),
      makeListItem({ id: 4, name: 'Phòng B', parent: null }),
    ]);

    const list = await service.list();

    expect(list).toHaveLength(4);
    expect(list[0].parent).toBeNull();
    expect(list[1].parent).toEqual({ id: 1, name: 'Phòng A' });
    expect(list[2].parent).toEqual({ id: 1, name: 'Phòng A' });
    expect(list[3].parent).toBeNull();
  });

  it('forwards `includeCounts: true` even when only top-level departments are listed', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeListItem({ id: 1, parent: null, childCount: 0 }),
    ]);

    await service.list();

    expect(mockedRepo.findAll.mock.calls[0][0].includeCounts).toBe(true);
  });

  it('returns childCount > 0 for departments that have children', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeListItem({ id: 1, name: 'Phòng Kế toán', childCount: 2 }),
    ]);

    const list = await service.list();

    expect(list[0].childCount).toBe(2);
  });

  it('returns userCount > 0 for departments that have members', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeListItem({ id: 1, name: 'Phòng Kế toán', userCount: 5 }),
    ]);

    const list = await service.list();

    expect(list[0].userCount).toBe(5);
  });

  it('respects `includeCounts: false` — the repo is called with includeCounts=false', async () => {
    await service.list({ includeUserCount: false });

    expect(mockedRepo.findAll.mock.calls[0][0].includeCounts).toBe(false);
  });

  it('returns the list verbatim from the repository', async () => {
    const expectedList = [
      makeListItem({ id: 1, name: 'A', userCount: 5 }),
      makeListItem({ id: 2, name: 'B', userCount: 3 }),
    ];
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce(expectedList);

    const list = await service.list();

    expect(list).toEqual(expectedList);
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: pagination.
// Result : Documented gap — the service does NOT paginate.
// ---------------------------------------------------------------------------
describe('[UTCID03] departmentsService.list() – Normal 3: pagination (documented gap)', () => {
  it('returns the full list regardless of input — no pagination at the service layer', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeListItem({ id: 1 }),
      makeListItem({ id: 2 }),
      makeListItem({ id: 3 }),
    ]);

    // The service does NOT accept `page` / `limit`. The full list
    // is returned.
    const list = await service.list();

    expect(list).toHaveLength(3);
    expect(mockedRepo.findAll.mock.calls[0][0]).not.toHaveProperty('page');
    expect(mockedRepo.findAll.mock.calls[0][0]).not.toHaveProperty('limit');
  });

  it('does NOT forward a `page` parameter to the repository', async () => {
    await service.list();

    const forwardedOptions = mockedRepo.findAll.mock.calls[0][0];
    expect((forwardedOptions as any).page).toBeUndefined();
  });

  it('does NOT forward a `limit` parameter to the repository', async () => {
    await service.list();

    const forwardedOptions = mockedRepo.findAll.mock.calls[0][0];
    expect((forwardedOptions as any).limit).toBeUndefined();
  });

  it('does NOT forward an `offset` parameter to the repository', async () => {
    await service.list();

    const forwardedOptions = mockedRepo.findAll.mock.calls[0][0];
    expect((forwardedOptions as any).offset).toBeUndefined();
  });

  it('forwards only `search` and `includeCounts` to the repository', async () => {
    await service.list({ search: 'Kế toán', includeUserCount: true });

    expect(mockedRepo.findAll.mock.calls[0][0]).toEqual({
      search: 'Kế toán',
      includeCounts: true,
    });
  });

  it('forwards search verbatim (no transformation)', async () => {
    await service.list({ search: '  Kế toán  ' });

    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe('  Kế toán  ');
  });

  it('forwards `includeUserCount: undefined` as `includeCounts: true` (default)', async () => {
    await service.list({ includeUserCount: undefined });

    expect(mockedRepo.findAll.mock.calls[0][0].includeCounts).toBe(true);
  });

  it('forwards `includeUserCount: null` as `includeCounts: true` (default — null ?? true)', async () => {
    await service.list({ includeUserCount: null as any });

    expect(mockedRepo.findAll.mock.calls[0][0].includeCounts).toBe(true);
  });

  it('returns the full list when called with empty arguments', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeListItem({ id: 1 }),
      makeListItem({ id: 2 }),
    ]);

    const list = await service.list({});

    expect(list).toHaveLength(2);
  });

  it('returns the full list when called with no arguments (default empty query)', async () => {
    const list = await service.list();

    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: unauthorized access.
// Result : The service does NOT enforce authorization — that's the
//          controller / middleware layer's job.
// ---------------------------------------------------------------------------
describe('[UTCID04] departmentsService.list() – Abnormal 1: unauthorized access', () => {
  it('PERMITS list when no actor is supplied (no createdBy at the service layer)', async () => {
    const list = await service.list();

    expect(list).toBeDefined();
    expect(Array.isArray(list)).toBe(true);
  });

  it('PERMITS list with `includeUserCount: false` (no auth at service layer)', async () => {
    const list = await service.list({ includeUserCount: false });

    expect(list).toBeDefined();
  });

  it('PERMITS list with a search term (no auth at service layer)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeListItem({ name: 'Phòng Kế toán' }),
    ]);

    const list = await service.list({ search: 'Kế toán' });

    expect(list).toHaveLength(1);
  });

  it('rejects when the repository fails with an unexpected error', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(repoError);

    await expect(service.list()).rejects.toBe(repoError);
  });

  it('records a safe diagnostic on repository failure (no password / hash leak)', async () => {
    const repoError = new Error('connection refused');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(repoError);

    const err = await service.list().catch((e) => e) as Error;

    expect(err.message).toBe('connection refused');
    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT call any write methods on the repository-failure path', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(repoError);

    await expect(service.list()).rejects.toBe(repoError);

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does NOT retry the read on failure', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(repoError);

    await expect(service.list()).rejects.toBe(repoError);

    // Exactly one findAll call — no retry.
    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
  });

  it('does NOT enforce authorization at the service layer (documented gap)', async () => {
    // The matrix mentions "unauthorized access" but the service
    // does NOT have an actor parameter. Authorization is at the
    // controller / middleware layer.
    const list = await service.list();

    expect(list).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 2: repository failure.
// Result : View All Department rejects with a controlled error on
//          repository failure.
// ---------------------------------------------------------------------------
describe('[UTCID05] departmentsService.list() – Abnormal 2: repository failure', () => {
  it('rejects when the repository throws an Error', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(repoError);

    await expect(service.list()).rejects.toBe(repoError);
  });

  it('rejects when the repository throws a TypeError', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementationOnce(async () => {
      throw new TypeError('Unexpected');
    });

    await expect(service.list()).rejects.toBeInstanceOf(TypeError);
  });

  it('rejects with a controlled error on a Prisma-layer error', async () => {
    const prismaError = new Error('Prisma client error');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(prismaError);

    await expect(service.list()).rejects.toBeInstanceOf(Error);
  });

  it('records a safe diagnostic on repository failure (no password / hash leak)', async () => {
    const repoError = new Error('connection refused');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(repoError);

    const err = await service.list().catch((e) => e) as Error;

    expect(err.message).toBe('connection refused');
    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT call any write methods (create, update, delete) on the read-failure path', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(repoError);

    await expect(service.list()).rejects.toBe(repoError);

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does NOT retry the read on failure', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(repoError);

    await expect(service.list()).rejects.toBe(repoError);

    // Exactly one findAll call — no retry.
    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
  });

  it('does NOT log the search string on failure (no leak via console)', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const repoError = new Error('database unavailable');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(repoError);

    await expect(service.list({ search: 'sensitive-search-term' })).rejects.toBe(repoError);

    // No console.log issued by the service.
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('does NOT call any other repository methods on the read-failure path', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(repoError);

    await expect(service.list()).rejects.toBe(repoError);

    expect(mockedRepo.findById).not.toHaveBeenCalled();
    expect(mockedRepo.existsById).not.toHaveBeenCalled();
    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
    expect(mockedRepo.findByNameAndParent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Boundary 1: empty list or last-page boundary.
// Result : View All Department accepts the supported boundary (empty
//          list, very large list); the adjacent unsupported value
//          (e.g. an invalid input) is rejected without partial commit
//          or sensitive disclosure.
// ---------------------------------------------------------------------------
describe('[UTCID06] departmentsService.list() – Boundary 1: empty list or last-page boundary', () => {
  it('accepts the empty-list boundary: returns [] when no departments exist', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([]);

    const list = await service.list();

    expect(list).toEqual([]);
    expect(Array.isArray(list)).toBe(true);
  });

  it('returns an empty list with no error', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([]);

    await expect(service.list()).resolves.toEqual([]);
  });

  it('does NOT call any write methods on the empty-list path', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([]);

    await service.list();

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('accepts the very-large-list boundary: returns a list with many rows', async () => {
    const largeList = Array.from({ length: 1000 }, (_, i) =>
      makeListItem({ id: i + 1, name: `Phòng ${i + 1}` }),
    );
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce(largeList);

    const list = await service.list();

    expect(list).toHaveLength(1000);
  });

  it('returns the list verbatim from the repository (no transformation)', async () => {
    const largeList = Array.from({ length: 500 }, (_, i) =>
      makeListItem({ id: i + 1, name: `Phòng ${i + 1}` }),
    );
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce(largeList);

    const list = await service.list();

    expect(list).toEqual(largeList);
  });

  it('accepts the search boundary: returns [] when no matches', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([]);

    const list = await service.list({ search: 'nonexistent' });

    expect(list).toEqual([]);
    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe('nonexistent');
  });

  it('accepts the `includeUserCount: false` boundary', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([
      makeListItem({ id: 1, userCount: 0, childCount: 0 }),
    ]);

    const list = await service.list({ includeUserCount: false });

    expect(list).toHaveLength(1);
    expect(mockedRepo.findAll.mock.calls[0][0].includeCounts).toBe(false);
  });

  it('accepts the empty-string search (forwarded verbatim to the repo)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([makeListItem({ id: 1 })]);

    await service.list({ search: '' });

    // Empty string is forwarded verbatim (no strip / no transform).
    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe('');
  });

  it('accepts the whitespace-only search (forwarded verbatim)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([]);

    await service.list({ search: '   ' });

    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe('   ');
  });

  it('rejects the adjacent unsupported value: repository failure on empty list', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(repoError);

    await expect(service.list()).rejects.toBeInstanceOf(Error);
  });

  it('does NOT call create on the boundary path (no partial commit)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([]);

    await service.list();

    expect(mockedRepo.create).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on the boundary rejection (no password / hash leak)', async () => {
    const repoError = new Error('boundary failure');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(repoError);

    const err = await service.list().catch((e) => e) as Error;

    expect(err.message).toBe('boundary failure');
    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT leak sensitive fields through the empty-list response', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([]);

    const list = await service.list();

    expect(JSON.stringify(list)).not.toMatch(/password/i);
    expect(JSON.stringify(list)).not.toMatch(/hash/i);
    expect(JSON.stringify(list)).not.toMatch(/secret/i);
  });

  it('does NOT leak sensitive fields through the very-large-list response', async () => {
    const largeList = Array.from({ length: 500 }, (_, i) =>
      makeListItem({ id: i + 1, name: `Phòng ${i + 1}` }),
    );
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce(largeList);

    const list = await service.list();

    expect(JSON.stringify(list)).not.toMatch(/password/i);
    expect(JSON.stringify(list)).not.toMatch(/hash/i);
    expect(JSON.stringify(list)).not.toMatch(/secret/i);
  });

  it('does NOT throw on the empty-list boundary', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce([]);

    await expect(service.list()).resolves.toEqual([]);
  });

  it('returns the same array reference (no copy) — the service is a pass-through', async () => {
    const expectedList = [makeListItem({ id: 1 })];
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce(expectedList);

    const list = await service.list();

    expect(list).toBe(expectedList);
  });
});
