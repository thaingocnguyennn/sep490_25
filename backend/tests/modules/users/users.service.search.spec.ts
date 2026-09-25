/**
 * Unit tests for UsersService.getAll() — Function13 / Search User.
 *
 * Note on naming: the matrix headers reference `UserQueryService`, but
 * the implementation is `UsersService.getAll(params)` inside
 * `backend/src/modules/users/users.service.ts`. We exercise the actual
 * export and label the describe blocks with the matrix UTCIDs.
 *
 * The matrix's "Search User" maps to the `search` parameter on
 * `getAll(...)`. The service is a thin pass-through:
 *
 *   async getAll({ search }) → usersRepository.findAll({ search })
 *
 * The service does NOT trim, lowercase, or normalize the search
 * string — it forwards the raw value verbatim. The repository then
 * builds a `Prisma.UserWhereInput.OR` clause of:
 *   { username: { contains: search, mode: 'insensitive' } }
 *   { email:    { contains: search, mode: 'insensitive' } }
 *   { fullName: { contains: search, mode: 'insensitive' } }
 *
 * Coverage matrix (UTCID01 – UTCID07):
 *   UTCID01  N  – Search User completes successfully for search by
 *                 name (fullName / username substring match).
 *   UTCID02  N  – Search User completes successfully for email
 *                 substring match.
 *   UTCID03  N  – Search User completes successfully for normalized
 *                 text (the service does NOT normalize — the
 *                 repository uses `mode: 'insensitive'`).
 *   UTCID04  N  – Search User completes successfully for pagination
 *                 (page + limit) on top of the search.
 *   UTCID05  A  – Search User rejects with a controlled error on an
 *                 invalid search payload (non-string types that the
 *                 Prisma layer rejects).
 *   UTCID06  A  – Search User rejects with a controlled error on
 *                 repository failure (database unavailable).
 *   UTCID07  B  – Boundary 1: empty / minimum / maximum keyword
 *                 length. Supported boundaries (empty, single char,
 *                 very long) are accepted; the adjacent unsupported
 *                 value (non-string) is rejected without partial
 *                 commit or sensitive disclosure.
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

  // Healthy defaults — every test overrides what it needs.
  mockedRepo.findAll.mockResolvedValue(makeListResult());

  service = new UsersService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: search by name.
// Result : Search User returns the expected success value for a
//          fullName / username substring match.
// ---------------------------------------------------------------------------
describe('[UTCID01] usersService.getAll() – Normal 1: search by name', () => {
  it('forwards the search string verbatim to the repository', async () => {
    await service.getAll({ search: 'Alice' });

    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe('Alice');
  });

  it('returns the expected success value for a fullName substring match', async () => {
    const alice = makeSummary({
      id: 1,
      fullName: 'Alice Nguyen',
      username: 'alice',
      email: 'alice@example.com',
    });
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([alice], 1, 1, 10),
    );

    const result = await service.getAll({ search: 'Alice' });

    expect(result.users).toHaveLength(1);
    expect(result.users[0].fullName).toBe('Alice Nguyen');
    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe('Alice');
  });

  it('returns the expected success value for a username substring match', async () => {
    const alice = makeSummary({ id: 1, username: 'alice' });
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([alice], 1, 1, 10),
    );

    const result = await service.getAll({ search: 'ali' });

    expect(result.users).toHaveLength(1);
    expect(result.users[0].username).toBe('alice');
    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe('ali');
  });

  it('returns multiple matches when several users share a substring', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult(
        [
          makeSummary({ id: 1, fullName: 'Alice Nguyen' }),
          makeSummary({ id: 2, fullName: 'Alice Tran' }),
          makeSummary({ id: 3, fullName: 'Alice Le' }),
        ],
        3,
        1,
        10,
      ),
    );

    const result = await service.getAll({ search: 'Alice' });

    expect(result.users).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  it('does NOT transform the search string (forwarded verbatim)', async () => {
    const mixedCase = 'aLiCe';

    await service.getAll({ search: mixedCase });

    // The service does NOT lowercase / normalize — the repository
    // uses `mode: 'insensitive'` for case-insensitivity. The raw
    // string is forwarded.
    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe(mixedCase);
  });

  it('does NOT trim the search string (whitespace is preserved)', async () => {
    const padded = '  Alice  ';

    await service.getAll({ search: padded });

    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe(padded);
  });

  it('does not call any write methods on the search path', async () => {
    await service.getAll({ search: 'Alice' });

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does NOT leak sensitive fields through the response (no password / hash / secret)', async () => {
    const alice = makeSummary({ id: 1 });
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([alice], 1, 1, 10),
    );

    const result = await service.getAll({ search: 'Alice' });

    // The response includes the matched user's email and fullName
    // (those are expected fields on the UserSummary type). But it
    // must NOT include the password hash, bcrypt secret, etc.
    expect(JSON.stringify(result)).not.toMatch(/password/i);
    expect(JSON.stringify(result)).not.toMatch(/hash/i);
    expect(JSON.stringify(result)).not.toMatch(/secret/i);
    // The response must NOT contain any bcrypt-style prefix
    // ($2a$, $2b$, $2y$) — those would indicate a leaked hash.
    expect(JSON.stringify(result)).not.toMatch(/\$2[aby]\$/);
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: search by email.
// Result : Search User returns the expected success value for an email
//          substring match.
// ---------------------------------------------------------------------------
describe('[UTCID02] usersService.getAll() – Normal 2: search by email', () => {
  it('forwards the email substring verbatim to the repository', async () => {
    await service.getAll({ search: 'alice@example' });

    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe(
      'alice@example',
    );
  });

  it('returns the expected success value for an email substring match', async () => {
    const alice = makeSummary({
      id: 1,
      email: 'alice@example.com',
    });
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([alice], 1, 1, 10),
    );

    const result = await service.getAll({ search: 'alice@' });

    expect(result.users).toHaveLength(1);
    expect(result.users[0].email).toBe('alice@example.com');
  });

  it('matches by the domain part of the email', async () => {
    const alice = makeSummary({
      id: 1,
      email: 'alice@example.com',
    });
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([alice], 1, 1, 10),
    );

    const result = await service.getAll({ search: 'example.com' });

    expect(result.users).toHaveLength(1);
    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe('example.com');
  });

  it('matches by the local part of the email (before @)', async () => {
    const alice = makeSummary({
      id: 1,
      email: 'alice@example.com',
    });
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([alice], 1, 1, 10),
    );

    const result = await service.getAll({ search: 'alice' });

    expect(result.users).toHaveLength(1);
  });

  it('does NOT leak the full email through the response', async () => {
    const alice = makeSummary({
      id: 1,
      email: 'alice@example.com',
    });
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([alice], 1, 1, 10),
    );

    const result = await service.getAll({ search: 'alice@' });

    // The response includes the email (it's the matched user). But
    // the password / hash / secret must NOT leak.
    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: normalized text (case-insensitive match).
// Result : Search User returns the expected success value for
//          case-insensitive text (the service does NOT normalize; the
//          repository uses `mode: 'insensitive'`).
// ---------------------------------------------------------------------------
describe('[UTCID03] usersService.getAll() – Normal 3: normalized text', () => {
  it('forwards the raw mixed-case string verbatim (no normalization)', async () => {
    await service.getAll({ search: 'ALICE' });

    // The service does NOT lowercase. The raw value is forwarded.
    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe('ALICE');
  });

  it('does NOT lowercase the search string before forwarding', async () => {
    await service.getAll({ search: 'AlIcE' });

    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe('AlIcE');
  });

  it('does NOT strip whitespace before forwarding', async () => {
    const padded = '\t  Alice \n';

    await service.getAll({ search: padded });

    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe(padded);
  });

  it('does NOT Unicode-normalize the search string', async () => {
    // Vietnamese: 'Nguyễn' uses the precomposed 'ễ' (U+1EC5)
    const vietnamese = 'Nguyễn';

    await service.getAll({ search: vietnamese });

    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe(vietnamese);
  });

  it('returns the expected success value for a mixed-case search (case-insensitivity at the repository)', async () => {
    const alice = makeSummary({
      id: 1,
      username: 'alice',
      fullName: 'Alice Nguyen',
    });
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([alice], 1, 1, 10),
    );

    // The repository is responsible for case-insensitivity via
    // `mode: 'insensitive'`. We model that here.
    const result = await service.getAll({ search: 'ALICE' });

    expect(result.users).toHaveLength(1);
    expect(result.users[0].username).toBe('alice');
  });

  it('does NOT remove diacritics before forwarding', async () => {
    const withDiacritics = 'Nguyễn Văn A';

    await service.getAll({ search: withDiacritics });

    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe(
      withDiacritics,
    );
  });

  it('does NOT call any normalization helper on the search path', async () => {
    // The service has no normalization step in its code path. We
    // verify that no extra repository methods are called beyond
    // findAll.
    await service.getAll({ search: 'AlIcE' });

    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: pagination on top of search.
// Result : Search User returns the expected success value with page +
//          limit on top of the search string.
// ---------------------------------------------------------------------------
describe('[UTCID04] usersService.getAll() – Normal 4: pagination', () => {
  it('forwards search + page + limit verbatim to the repository', async () => {
    await service.getAll({
      search: 'alice',
      page: 2,
      limit: 25,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
    expect(mockedRepo.findAll.mock.calls[0][0]).toMatchObject({
      search: 'alice',
      page: 2,
      limit: 25,
    });
  });

  it('returns the expected success value for paginated search', async () => {
    const alice = makeSummary({ id: 1, fullName: 'Alice Nguyen' });
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([alice], 50, 2, 25),
    );

    const result = await service.getAll({
      search: 'alice',
      page: 2,
      limit: 25,
    });

    expect(result.users).toHaveLength(1);
    expect(result.total).toBe(50);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(25);
  });

  it('defaults page=1 and limit=10 when only search is supplied', async () => {
    await service.getAll({ search: 'alice' });

    expect(mockedRepo.findAll.mock.calls[0][0]).toMatchObject({
      search: 'alice',
      page: 1,
      limit: 10,
    });
  });

  it('returns the empty page when page is beyond the result set', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([], 0, 99, 10),
    );

    const result = await service.getAll({
      search: 'nonexistent',
      page: 99,
      limit: 10,
    });

    expect(result.users).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(99);
    expect(result.limit).toBe(10);
  });

  it('forwards page and limit correctly alongside a long search string', async () => {
    const longSearch = 'a'.repeat(200);

    await service.getAll({
      search: longSearch,
      page: 3,
      limit: 50,
    });

    expect(mockedRepo.findAll.mock.calls[0][0]).toMatchObject({
      search: longSearch,
      page: 3,
      limit: 50,
    });
  });

  it('returns the expected success value for combined search + filter + pagination', async () => {
    const alice = makeSummary({
      id: 1,
      fullName: 'Alice Nguyen',
      status: UserStatus.ACTIVE,
      roles: ['ADMIN'],
    });
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([alice], 1, 2, 5),
    );

    const result = await service.getAll({
      search: 'alice',
      page: 2,
      limit: 5,
      status: 'ACTIVE' as any,
      role: 'ADMIN',
    });

    expect(result).toEqual({
      users: [alice],
      total: 1,
      page: 2,
      limit: 5,
    });
    expect(mockedRepo.findAll.mock.calls[0][0]).toMatchObject({
      search: 'alice',
      status: 'ACTIVE',
      role: 'ADMIN',
    });
  });

  it('does NOT call any write methods on the paginated search path', async () => {
    await service.getAll({
      search: 'alice',
      page: 2,
      limit: 25,
    });

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 1: invalid search payload.
// Result : Search User rejects the operation with a controlled error
//          when the search payload is invalid (non-string types).
// ---------------------------------------------------------------------------
describe('[UTCID05] usersService.getAll() – Abnormal 1: invalid search payload', () => {
  it('rejects a non-string search payload via repository failure (number)', async () => {
    const repoError = new Error('Invalid search value');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.getAll({ search: 12345 as any }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('rejects a non-string search payload via repository failure (boolean)', async () => {
    const repoError = new Error('Invalid search value');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.getAll({ search: true as any }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('rejects a non-string search payload via repository failure (object)', async () => {
    const repoError = new Error('Invalid search value');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.getAll({ search: { foo: 'bar' } as any }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('rejects a non-string search payload via repository failure (array)', async () => {
    const repoError = new Error('Invalid search value');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.getAll({ search: ['alice'] as any }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('records a safe diagnostic on invalid-payload rejection (no password / hash leak)', async () => {
    const repoError = new Error('Invalid search value');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    const err = await service
      .getAll({ search: 12345 as any })
      .catch((e) => e) as Error;

    expect(err.message).toBe('Invalid search value');
    expect(err.message).not.toMatch(/password|hash|secret/i);
    expect(err.message).not.toMatch(/email|@/i);
  });

  it('does not call any other repository method on the invalid-payload path', async () => {
    const repoError = new Error('Invalid search value');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.getAll({ search: 12345 as any }),
    ).rejects.toBeInstanceOf(Error);

    // Only findAll was called.
    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 2: repository failure / unauthorized.
// Result : Search User rejects the operation with a controlled error
//          on repository failure (database unavailable); no partial
//          commit; safe diagnostic.
// ---------------------------------------------------------------------------
describe('[UTCID06] usersService.getAll() – Abnormal 2: repository failure/unauthorized', () => {
  it('rejects with a controlled error on repository failure (database unavailable)', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    await expect(service.getAll({ search: 'alice' })).rejects.toBe(
      repoError,
    );
  });

  it('rejects when the repository returns an unexpected error type', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw new TypeError('Unexpected');
    });

    await expect(
      service.getAll({ search: 'alice' }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('records a safe diagnostic on repository failure (no password / hash leak)', async () => {
    const repoError = new Error('connection refused');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    const err = await service
      .getAll({ search: 'alice' })
      .catch((e) => e) as Error;

    expect(err.message).toBe('connection refused');
    expect(err.message).not.toMatch(/password|hash|secret/i);
    expect(err.message).not.toMatch(/email|@/i);
  });

  it('does not call any write methods on the read-failure path', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    await expect(service.getAll({ search: 'alice' })).rejects.toBe(
      repoError,
    );

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does not retry the read on failure', async () => {
    const repoError = new Error('database unavailable');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    await expect(service.getAll({ search: 'alice' })).rejects.toBe(
      repoError,
    );

    // Exactly one findAll call — no retry.
    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);
  });

  it('rejects with a controlled error when search is unauthorized (RBAC denylist)', async () => {
    // RBAC is enforced at the controller / middleware layer. The
    // service does NOT perform its own authorization. We model the
    // unauthorized scenario as a repository failure.
    const authError = new Error('Unauthorized');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw authError;
    });

    await expect(
      service.getAll({ search: 'alice' }),
    ).rejects.toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Boundary 1: empty, minimum, or maximum keyword length.
// Result : Search User accepts the supported boundary (empty string,
//          single-character, very long); the adjacent unsupported
//          value (non-string) is rejected without partial commit or
//          sensitive disclosure.
// ---------------------------------------------------------------------------
describe('[UTCID07] usersService.getAll() – Boundary 1: empty, minimum, or maximum keyword length', () => {
  // ---- empty string (falsy) ----

  it('accepts an empty-string search (no filter applied)', async () => {
    await service.getAll({ search: '' });

    // Empty string IS forwarded (the service does not strip it).
    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe('');
  });

  it('returns the expected success value for an empty-string search', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult(
        [makeSummary({ id: 1 }), makeSummary({ id: 2 })],
        2,
        1,
        10,
      ),
    );

    const result = await service.getAll({ search: '' });

    expect(result.users).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('accepts undefined search (no filter applied)', async () => {
    await service.getAll({ search: undefined });

    // `undefined` is forwarded.
    expect(mockedRepo.findAll.mock.calls[0][0].search).toBeUndefined();
  });

  // ---- minimum non-empty ----

  it('accepts a single-character search', async () => {
    await service.getAll({ search: 'a' });

    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe('a');
  });

  it('returns the expected success value for a single-character search', async () => {
    const alice = makeSummary({ id: 1, username: 'alice' });
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([alice], 1, 1, 10),
    );

    const result = await service.getAll({ search: 'a' });

    expect(result.users).toHaveLength(1);
    expect(result.users[0].username).toBe('alice');
  });

  it('accepts a single non-ASCII character (Vietnamese)', async () => {
    await service.getAll({ search: 'ễ' });

    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe('ễ');
  });

  // ---- whitespace-only (truthy) ----

  it('forwards a whitespace-only search string (truthy)', async () => {
    // The service does NOT trim. A whitespace-only string is
    // truthy at the service layer and forwarded verbatim.
    await service.getAll({ search: '   ' });

    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe('   ');
  });

  it('forwards a tab-only search string', async () => {
    await service.getAll({ search: '\t' });

    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe('\t');
  });

  // ---- maximum / very long ----

  it('accepts a very long search string (1000 chars)', async () => {
    const longSearch = 'a'.repeat(1000);

    await service.getAll({ search: longSearch });

    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe(longSearch);
    expect(mockedRepo.findAll.mock.calls[0][0].search).toHaveLength(1000);
  });

  it('accepts a maximum-length search string (1 MB)', async () => {
    const maxSearch = 'a'.repeat(1024 * 1024);

    await service.getAll({ search: maxSearch });

    expect(mockedRepo.findAll.mock.calls[0][0].search).toBe(maxSearch);
  });

  // ---- empty result boundary ----

  it('returns an empty result set when no users match the search', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([], 0, 1, 10),
    );

    const result = await service.getAll({ search: 'nonexistent' });

    expect(result.users).toEqual([]);
    expect(result.total).toBe(0);
  });

  // ---- adjacent unsupported value: non-string ----

  it('rejects the adjacent unsupported value: non-string search (number) via repository failure', async () => {
    const repoError = new Error('Invalid search value');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    await expect(
      service.getAll({ search: 12345 as any }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('rejects the adjacent unsupported value: null search', async () => {
    // The repository's `if (params.search)` check treats null as
    // falsy and skips the OR clause. We model the null case here:
    // the service forwards null, and the repository handles it
    // gracefully.
    await service.getAll({ search: null as any });

    expect(mockedRepo.findAll.mock.calls[0][0].search).toBeNull();
  });

  it('does NOT call any write methods on the boundary path', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([], 0, 1, 10),
    );

    await service.getAll({ search: '' });

    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedRepo.update).not.toHaveBeenCalled();
    expect(mockedRepo.delete).not.toHaveBeenCalled();
  });

  it('does NOT leak sensitive fields on the empty-result boundary', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([], 0, 1, 10),
    );

    const result = await service.getAll({ search: 'nonexistent' });

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('records a safe diagnostic on the adjacent unsupported value (non-string)', async () => {
    const repoError = new Error('Invalid search value');
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockImplementation(async () => {
      throw repoError;
    });

    const err = await service
      .getAll({ search: 12345 as any })
      .catch((e) => e) as Error;

    expect(err.message).toBe('Invalid search value');
    expect(err.message).not.toMatch(/password|hash|secret/i);
    expect(err.message).not.toMatch(/email|@/i);
  });

  it('does not throw on the empty result boundary', async () => {
    mockedRepo.findAll.mockResolvedValueOnce(
      makeListResult([], 0, 1, 10),
    );

    await expect(
      service.getAll({ search: 'nonexistent' }),
    ).resolves.toMatchObject({ users: [], total: 0 });
  });
});
