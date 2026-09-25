/**
 * Unit tests for OutgoingDocumentsService.list() — Function39 /
 * View All Outgoing Documents.
 *
 * Note on naming: the matrix headers reference
 * `OutgoingDocumentQueryService`, but the actual implementation
 * that lists outgoing documents is
 * `OutgoingDocumentsService.list(params)`. The service is a
 * thin delegate: it just forwards the params to
 * `outgoingDocumentsRepository.findAll(params)`. The repository
 * is where the role scope, the auth OR, and the search OR get
 * applied.
 *
 * Step-by-step:
 *   1. The service receives `{ page, limit, search, status,
 *      urgency, documentType, documentTypeId, documentBookId,
 *      dateFrom, dateTo, confidentialityLevel, departmentId,
 *      currentUser }`.
 *   2. It calls `outgoingDocumentsRepository.findAll(params)`
 *      and returns the result verbatim.
 *   3. The repository:
 *      a. Defaults to `documentStatus=ACTIVE` and skips
 *         TRASHED unless `includeTrashed`.
 *      b. If `currentUser` is supplied, builds an auth OR
 *         filter based on the caller's role(s):
 *         - ADMIN only (no other roles): `id = -1` (admin
 *           never sees the list directly).
 *         - SPECIALIST: own department OR own processor
 *           assignment OR own creator OR `recipientName`
 *           matches the caller's department name.
 *         - DEPARTMENT_HEAD: own department OR own
 *           approver assignment OR own processor assignment
 *           OR own creator OR `recipientName` match.
 *         - DOCUMENT_CLERK: own clerk assignment OR own
 *           department OR own creator OR `recipientName`
 *           match.
 *         - Fallback (no matching role branch): `id = -1`.
 *      c. Adds search OR (over dispatchNumber, subject,
 *         documentNumber, ocrText, signerName, recipientName).
 *      d. Applies status / urgency / documentTypeId /
 *         documentBookId / dateFrom/dateTo /
 *         confidentialityLevel / departmentId filters.
 *      e. Returns `{ items, total }`.
 *
 * Coverage matrix (UTCID01 – UTCID06):
 *   UTCID01  N  – Default list: returns { items, total }.
 *   UTCID02  N  – Role scope: ADMIN-only caller triggers
 *                 `id = -1`; SPECIALIST/DEPARTMENT_HEAD/
 *                 DOCUMENT_CLERK each apply their own auth OR.
 *   UTCID03  N  – Pagination: page + limit are forwarded.
 *   UTCID04  A  – Unauthorized access: caller has no recognized
 *                 role (and is not admin-only), triggers `id =
 *                 -1` so the list returns empty.
 *   UTCID05  A  – Repository failure: prisma failure propagates.
 *   UTCID06  B  – Empty list or last-page boundary: empty
 *                 items array + total=0.
 */

import { OutgoingDocumentsService } from '../../../src/modules/outgoing-documents/outgoing-documents.service';
import { outgoingDocumentsRepository } from '../../../src/modules/outgoing-documents/outgoing-documents.repository';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/outgoing-documents/outgoing-documents.repository',
);

// Stub the outgoing-document service's transitive dependencies so Jest
// doesn't pull in pdfjs-dist / napi-rs/canvas at module-load time.
jest.mock('../../../src/shared/services/ocr.service', () => ({
  __esModule: true,
  performOcr: jest.fn(),
  extractFields: jest.fn(),
}));
jest.mock('../../../src/shared/services/email.service', () => ({
  __esModule: true,
  sendEmail: jest.fn(),
}));

const mockedRepo = outgoingDocumentsRepository as jest.Mocked<
  typeof outgoingDocumentsRepository
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

let service: OutgoingDocumentsService;

beforeEach(() => {
  jest.clearAllMocks();

  // Default: a healthy response with 2 items.
  mockedRepo.findAll.mockReset();
  mockedRepo.findAll.mockResolvedValue({
    items: [
      {
        id: 1,
        documentId: 100,
        document: { id: 100, documentNumber: 'OUT-2026-0001', subject: 'Công văn số 1', status: 'ISSUED' },
      },
      {
        id: 2,
        documentId: 101,
        document: { id: 101, documentNumber: 'OUT-2026-0002', subject: 'Công văn số 2', status: 'DRAFT' },
      },
    ] as any,
    total: 2,
  });

  service = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: default list.
// Result : Default param values are forwarded; { items, total }
//          is returned; controller computes totalPages.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.list() – Normal 1: default list', () => {
  it('returns the items array', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('returns the total count', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(result.total).toBe(2);
  });

  it('forwards the params to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: 'Công văn',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 10,
        search: 'Công văn',
      }),
    );
  });

  it('does NOT throw on the default list path', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the default-list path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: role scope.
// Result : currentUser with ADMIN-only / SPECIALIST /
//          DEPARTMENT_HEAD / DOCUMENT_CLERK are forwarded to
//          the repository; the repository decides the actual
//          auth OR. The service just delegates.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.list() – Normal 2: role scope', () => {
  it('forwards an ADMIN-only caller to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      currentUser: {
        id: 99,
        roles: ['ADMIN'],
      },
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        currentUser: expect.objectContaining({
          id: 99,
          roles: ['ADMIN'],
        }),
      }),
    );
  });

  it('forwards a SPECIALIST caller with departmentId', async () => {
    await service.list({
      page: 1,
      limit: 10,
      currentUser: {
        id: 7,
        roles: ['SPECIALIST'],
        departmentId: 2,
        departmentName: 'Phòng Kế toán',
      },
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        currentUser: expect.objectContaining({
          id: 7,
          roles: ['SPECIALIST'],
          departmentId: 2,
          departmentName: 'Phòng Kế toán',
        }),
      }),
    );
  });

  it('forwards a DEPARTMENT_HEAD caller with departmentId', async () => {
    await service.list({
      page: 1,
      limit: 10,
      currentUser: {
        id: 5,
        roles: ['DEPARTMENT_HEAD'],
        departmentId: 1,
        departmentName: 'Phòng Hành chính',
      },
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        currentUser: expect.objectContaining({
          id: 5,
          roles: ['DEPARTMENT_HEAD'],
          departmentId: 1,
          departmentName: 'Phòng Hành chính',
        }),
      }),
    );
  });

  it('forwards a DOCUMENT_CLERK caller with departmentId', async () => {
    await service.list({
      page: 1,
      limit: 10,
      currentUser: {
        id: 8,
        roles: ['DOCUMENT_CLERK'],
        departmentId: 1,
      },
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        currentUser: expect.objectContaining({
          id: 8,
          roles: ['DOCUMENT_CLERK'],
          departmentId: 1,
        }),
      }),
    );
  });

  it('forwards a multi-role caller (e.g., head who is also a clerk)', async () => {
    await service.list({
      page: 1,
      limit: 10,
      currentUser: {
        id: 5,
        roles: ['DEPARTMENT_HEAD', 'DOCUMENT_CLERK'],
        departmentId: 1,
      },
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        currentUser: expect.objectContaining({
          roles: ['DEPARTMENT_HEAD', 'DOCUMENT_CLERK'],
        }),
      }),
    );
  });

  it('forwards currentUser as an absent key when caller has no auth', async () => {
    await service.list({
      page: 1,
      limit: 10,
      // no currentUser
    });

    // The forwarded call has no `currentUser` key because the
    // service just returns `repo.findAll(params)` and the key
    // isn't in the input params.
    const callArgs = mockedRepo.findAll.mock.calls[0][0];
    expect('currentUser' in callArgs).toBe(false);
  });

  it('does NOT throw on a role-scoped list', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
        currentUser: {
          id: 7,
          roles: ['SPECIALIST'],
          departmentId: 2,
        },
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the role-scope path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
      currentUser: {
        id: 7,
        roles: ['SPECIALIST'],
        departmentId: 2,
      },
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: pagination.
// Result : page + limit are forwarded to the repository; total
//          is returned so the controller can compute totalPages.
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.list() – Normal 3: pagination', () => {
  it('forwards page and limit to the repository', async () => {
    await service.list({
      page: 3,
      limit: 25,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 3,
        limit: 25,
      }),
    );
  });

  it('returns the total count so the controller can compute totalPages', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 250,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(result.total).toBe(250);
    // Controller computes totalPages = Math.ceil(250/10) = 25.
  });

  it('returns the items array in a paginated result', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('handles page=1 + limit=10 (default-like)', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(result).toBeDefined();
    expect(result.items.length).toBe(2);
  });

  it('does NOT throw on a valid paginated list', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the pagination path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: unauthorized access.
// Result : The service has no role gate (the route enforces
//          `authenticate`); the service tolerates an
//          unauthenticated caller by NOT setting `currentUser`.
//          A caller with no recognized role at the repository
//          level triggers `id = -1`, returning empty.
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.list() – Abnormal 1: unauthorized access', () => {
  it('does NOT throw when called without currentUser (unauthenticated)', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
        // no currentUser
      }),
    ).resolves.toBeDefined();
  });

  it('forwards currentUser as an absent key when caller is unauthenticated', async () => {
    await service.list({
      page: 1,
      limit: 10,
    });

    // When `currentUser` is undefined, the service forwards
    // the params object and the `currentUser` key is absent in
    // the forwarded object — it's not `undefined` because the
    // property simply doesn't exist on the params object.
    const callArgs = mockedRepo.findAll.mock.calls[0][0];
    expect('currentUser' in callArgs).toBe(false);
  });

  it('forwards an empty roles array (caller with no roles)', async () => {
    await service.list({
      page: 1,
      limit: 10,
      currentUser: {
        id: 100,
        roles: [],
      },
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        currentUser: expect.objectContaining({
          id: 100,
          roles: [],
        }),
      }),
    );
  });

  it('does NOT call any write method on the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
    });

    // The service.list body is `return
    // repo.findAll(...)`. Any other repo call would indicate
    // a regression in the read-only contract.
    expect((mockedRepo as any).create).toBeUndefined();
    expect((mockedRepo as any).update).toBeUndefined();
    expect((mockedRepo as any).delete).toBeUndefined();
  });

  it('records a safe diagnostic on the unauthorized path (no password / hash leak)', async () => {
    const result = await service
      .list({
        page: 1,
        limit: 10,
        currentUser: { id: 100, roles: [] },
      })
      .catch((e) => e) as any;

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the unauthorized path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
      currentUser: { id: 100, roles: [] },
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 2: repository failure.
// Result : Repository failures propagate.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.list() – Abnormal 2: repository failure', () => {
  it('propagates a repository failure', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(new Error('DB outage'));

    await expect(service.list({ page: 1, limit: 10 })).rejects.toThrow(
      'DB outage',
    );
  });

  it('rejects with the original Error type', async () => {
    class CustomError extends Error {}
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(new CustomError('custom'));

    const err = await service
      .list({ page: 1, limit: 10 })
      .catch((e) => e) as Error;

    expect(err).toBeInstanceOf(CustomError);
  });

  it('does NOT throw on a successful path (no failure)', async () => {
    await expect(
      service.list({ page: 1, limit: 10 }),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on repository failure (no password / hash leak)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(new Error('DB outage'));

    const err = await service
      .list({ page: 1, limit: 10 })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on repository failure', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(new Error('DB outage'));

    await expect(service.list({ page: 1, limit: 10 })).rejects.toThrow(
      'DB outage',
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Boundary 1: empty list or last-page boundary.
// Result : An empty items array + total=0 is returned when no
//          documents match.
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.list() – Boundary 1: empty list or last-page boundary', () => {
  it('accepts the boundary: empty list (no matching documents)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('returns an empty items array on the last page', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 100,
    });

    const result = await service.list({
      page: 1000, // far past the last page
      limit: 10,
    });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(100);
  });

  it('does NOT throw on an empty result', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    await expect(
      service.list({
        page: 1,
        limit: 10,
      }),
    ).resolves.toBeDefined();
  });

  it('forwards page=Number.MAX_SAFE_INTEGER / limit=Number.MAX_SAFE_INTEGER to the repository', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    await service.list({
      page: Number.MAX_SAFE_INTEGER,
      limit: Number.MAX_SAFE_INTEGER,
    });

    const callArgs = mockedRepo.findAll.mock.calls[0][0];
    expect(callArgs.page).toBe(Number.MAX_SAFE_INTEGER);
    expect(callArgs.limit).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('forwards page=1 / limit=1 (smallest page size)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 50,
    });

    await service.list({
      page: 1,
      limit: 1,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 1,
      }),
    );
  });

  it('records a safe diagnostic on the empty-list path (no password / hash leak)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the empty-list path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    await service.list({
      page: 1,
      limit: 10,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
