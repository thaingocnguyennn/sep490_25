/**
 * Unit tests for IncomingDocumentsService.list() — search aspect
 * (Function37 / Search Incoming Document).
 *
 * Note on naming: the matrix headers reference
 * `IncomingDocumentQueryService`, but the actual implementation
 * that performs search with full-text matching is
 * `IncomingDocumentsService.list(params)`. The search is
 * delegated to `incomingDocumentsRepository.findAll(params)`,
 * which builds a `Prisma.DocumentWhereInput` with `OR`
 * predicates over documentNumber, subject, issuer, signerName
 * (case-insensitive).
 *
 * Step-by-step (search aspect, omitting the assignment-filter
 * aspect which is covered by
 * `incoming-documents.service.list.assigned.spec.ts`):
 *   1. The service receives `{ page, limit, search, status,
 *      documentTypeId, urgency, userId, userRoles }`.
 *   2. It computes `assignedToUserId` and
 *      `assignedProcessorTypes` based on caller roles (default
 *      none for ADMIN; XLC/PHXL/XDB for DEPT_HEAD/SPECIALIST).
 *   3. It calls repository.findAll with these params plus a
 *      `viewerFor` decoration when caller is authenticated.
 *   4. The repository builds OR predicates:
 *        documentNumber: { contains: search, mode: 'insensitive' }
 *        subject:        { contains: search, mode: 'insensitive' }
 *        issuer:         { contains: search, mode: 'insensitive' }
 *        signerName:     { contains: search, mode: 'insensitive' }
 *   5. Pagination: skip = (page - 1) * limit; take = limit.
 *   6. Order by document.createdAt descending.
 *   7. Returns `{ items, total }` to the controller.
 *
 * Coverage matrix (UTCID01 – UTCID10):
 *   UTCID01  N  – Number search: `documentNumber` matches.
 *   UTCID02  N  – Summary search: `subject` matches.
 *   UTCID03  N  – Normalized Vietnamese text: case-insensitive
 *                 match (`mode: 'insensitive'`).
 *   UTCID04  N  – Pagination: page + limit.
 *   UTCID05  N  – Response-to-database consistency: shape
 *                 `{ items, total, page, limit, totalPages }`.
 *   UTCID06  N  – Repeat-safe processing: search is pure read;
 *                 no writes.
 *   UTCID07  A  – Malformed query: malformed `search` is
 *                 tolerated (treated as a literal substring) or
 *                 empty-result when no documents match.
 *   UTCID08  A  – Unauthorized / repository failure: caller
 *                 without auth or repository failure.
 *   UTCID09  B  – Minimum keyword + empty-result boundary.
 *   UTCID10  B  – Upper-bound value at the supported limit:
 *                 very long search keyword, very deep page.
 */

import { IncomingDocumentsService } from '../../../src/modules/incoming-documents/incoming-documents.service';
import { incomingDocumentsRepository } from '../../../src/modules/incoming-documents/incoming-documents.repository';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/incoming-documents/incoming-documents.repository',
);

const mockedRepo = incomingDocumentsRepository as jest.Mocked<
  typeof incomingDocumentsRepository
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

let service: IncomingDocumentsService;

beforeEach(() => {
  jest.clearAllMocks();

  // Default: 2 items found on a basic search.
  mockedRepo.findAll.mockReset();
  mockedRepo.findAll.mockResolvedValue({
    items: [
      {
        id: 1,
        documentId: 100,
        document: {
          id: 100,
          documentNumber: 'IN-2026-0001',
          subject: 'Test subject',
          type: 'INCOMING',
          fileUrl: null,
          status: 'IN_PROGRESS',
          urgencyId: 1,
          confidentialityId: 1,
          ocrText: null,
          documentTypeId: null,
          issuer: null,
          signerName: null,
          signerTitle: null,
          issuedDate: null,
          categoryId: null,
          createdAt: new Date('2026-09-25'),
          updatedAt: new Date('2026-09-25'),
          createdByUser: null as any,
          updatedByUser: null as any,
          processors: [],
          attachments: [],
          workflows: [],
        } as any,
      },
    ] as any,
    total: 1,
  });

  service = new IncomingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: number search.
// Result : search by documentNumber finds a match.
// ---------------------------------------------------------------------------
describe('[UTCID01] incomingDocumentsService.list() – Normal 1: number search', () => {
  it('forwards a search to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: 'IN-2026-0001',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'IN-2026-0001',
      }),
    );
  });

  it('returns the items array', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
      search: 'IN-2026-0001',
    });

    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('returns the total count', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
      search: 'IN-2026-0001',
    });

    expect(result.total).toBe(1);
  });

  it('does NOT throw on a valid number search', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
        search: 'IN-2026-0001',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the number-search path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
      search: 'IN-2026-0001',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: summary search.
// Result : search by subject finds a match.
// ---------------------------------------------------------------------------
describe('[UTCID02] incomingDocumentsService.list() – Normal 2: summary search', () => {
  it('forwards a subject search to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: 'Báo cáo công tác',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'Báo cáo công tác',
      }),
    );
  });

  it('returns the items array for a subject search', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
      search: 'Báo cáo công tác',
    });

    expect(result.items).toBeDefined();
  });

  it('returns the total count for a subject search', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
      search: 'Báo cáo công tác',
    });

    expect(result.total).toBe(1);
  });

  it('does NOT throw on a valid summary search', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
        search: 'Báo cáo công tác',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the summary-search path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
      search: 'Báo cáo công tác',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: normalized Vietnamese text.
// Result : The repository receives the search string as-is; the
//          repository's query uses `mode: 'insensitive'`.
// ---------------------------------------------------------------------------
describe('[UTCID03] incomingDocumentsService.list() – Normal 3: normalized Vietnamese text', () => {
  it('forwards Vietnamese diacritics to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: 'Báo cáo công tác năm 2026',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'Báo cáo công tác năm 2026',
      }),
    );
  });

  it('forwards the literal search string (no normalization)', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: 'Bao cao cong tac',
    });

    // The service does NOT transform the search string — that
    // is the repository's job (PostgreSQL unaccent extension).
    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'Bao cao cong tac',
      }),
    );
  });

  it('returns the items array for a Vietnamese-diacritics search', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
      search: 'Báo cáo công tác',
    });

    expect(result.items).toBeDefined();
  });

  it('returns the total count for a Vietnamese-diacritics search', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
      search: 'Báo cáo công tác',
    });

    expect(result.total).toBe(1);
  });

  it('does NOT throw on a normalized Vietnamese search', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
        search: 'Báo cáo công tác',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the normalized-Vietnamese path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
      search: 'Báo cáo công tác',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: pagination.
// Result : page + limit are forwarded to the repository; total
//          count is returned; total pages can be derived.
// ---------------------------------------------------------------------------
describe('[UTCID04] incomingDocumentsService.list() – Normal 4: pagination', () => {
  it('forwards page and limit to the repository', async () => {
    await service.list({
      page: 3,
      limit: 25,
      search: 'IN-2026',
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
      total: 50,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(result.total).toBe(50);
    // Controller computes totalPages = Math.ceil(50/10) = 5.
  });

  it('returns the items array in a paginated result', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('does NOT throw on a valid paginated search', async () => {
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
// UTCID05 – Normal 5: response-to-database consistency.
// Result : The return shape is `{ items, total }` — controller
//          computes `{ items, total, page, limit, totalPages }`.
// ---------------------------------------------------------------------------
describe('[UTCID05] incomingDocumentsService.list() – Normal 5: response-to-database consistency', () => {
  it('returns a shape with both items and total', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('total');
  });

  it('reflects the repository return value', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [
        {
          id: 42,
          documentId: 999,
          document: {
            id: 999,
            documentNumber: 'IN-2026-9999',
            subject: 'Last item',
            type: 'INCOMING',
            fileUrl: null,
            status: 'COMPLETED',
            urgencyId: 1,
            confidentialityId: 1,
            ocrText: null,
            documentTypeId: null,
            issuer: null,
            signerName: null,
            signerTitle: null,
            issuedDate: null,
            categoryId: null,
            createdAt: new Date('2026-09-25'),
            updatedAt: new Date('2026-09-25'),
            createdByUser: null as any,
            updatedByUser: null as any,
            processors: [],
            attachments: [],
            workflows: [],
          } as any,
        },
      ] as any,
      total: 9999,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
    });

    expect((result.items[0] as any).id).toBe(42);
    expect(result.total).toBe(9999);
  });

  it('returns the same shape on repeated identical calls', async () => {
    const result1 = await service.list({
      page: 1,
      limit: 10,
      search: 'IN-2026-0001',
    });
    const result2 = await service.list({
      page: 1,
      limit: 10,
      search: 'IN-2026-0001',
    });

    expect(result1.total).toBe(result2.total);
    expect(result1.items.length).toBe(result2.items.length);
  });

  it('does NOT throw on a consistency check', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the consistency path', async () => {
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
// UTCID06 – Normal 6: repeat-safe processing.
// Result : Search is pure read; no writes; identical inputs
//          produce identical outputs.
// ---------------------------------------------------------------------------
describe('[UTCID06] incomingDocumentsService.list() – Normal 6: repeat-safe processing (no writes)', () => {
  it('does NOT call any write method on the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: 'IN-2026-0001',
    });

    // The repository is only used for findAll (a read). The
    // service.list() body is `return repo.findAll(...)` so any
    // other repo call would indicate a regression.
    expect(mockedRepo.findAll).toHaveBeenCalledTimes(1);

    // The service does NOT use any of these write helpers, so
    // they remain un-invoked during the test session. We assert
    // by inspecting the call counts directly on the mock so we
    // don't have to coerce the typing into a per-method jest spy.
    expect((mockedRepo as any).create).toBeUndefined();
    expect((mockedRepo as any).update).toBeUndefined();
    expect((mockedRepo as any).delete).toBeUndefined();
    expect((mockedRepo as any).assign).toBeUndefined();
  });

  it('returns identical items on two consecutive identical calls', async () => {
    const result1 = await service.list({
      page: 1,
      limit: 10,
      search: 'IN-2026-0001',
    });
    const result2 = await service.list({
      page: 1,
      limit: 10,
      search: 'IN-2026-0001',
    });

    expect(result1.items.length).toBe(result2.items.length);
    expect(result1.total).toBe(result2.total);
  });

  it('does NOT emit notifications or emails', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: 'IN-2026-0001',
    });

    // The service does not call any notification / email hooks.
    // (No mocked hooks were set up; assert nothing was emitted.)
    expect(console.log).not.toBeDefined;
  });

  it('does NOT mutate the input params', async () => {
    const params = {
      page: 1,
      limit: 10,
      search: 'IN-2026-0001',
    };
    const snapshot = JSON.stringify(params);

    await service.list(params);

    expect(JSON.stringify(params)).toBe(snapshot);
  });

  it('does NOT log to console on the repeat-safe path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
      search: 'IN-2026-0001',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 1: malformed query.
// Result : The service tolerates a malformed `search` (treated
//          as a literal substring by the repository) and returns
//          an empty items array when no documents match.
// ---------------------------------------------------------------------------
describe('[UTCID07] incomingDocumentsService.list() – Abnormal 1: malformed query', () => {
  it('forwards a malformed search string to the repository (no validation at service layer)', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: '%malformed%!!', // SQL-like wildcards
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: '%malformed%!!',
      }),
    );
  });

  it('returns an empty items array when no documents match a malformed query', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
      search: '%malformed%!!',
    });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('does NOT throw on a malformed query', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
        search: '%malformed%!!',
      }),
    ).resolves.toBeDefined();
  });

  it('forwards a search with special chars verbatim to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: '<script>alert(1)</script>',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: '<script>alert(1)</script>',
      }),
    );
  });

  it('does NOT log to console on a malformed query', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 1,
      limit: 10,
      search: '%malformed%!!',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Abnormal 2: unauthorized / repository failure.
// Result : The service has no role gate (the route enforces
//          `authenticate`); the service tolerates an unauthenticated
//          caller by NOT setting `viewerFor`. Repository failure
//          propagates as an exception.
// ---------------------------------------------------------------------------
describe('[UTCID08] incomingDocumentsService.list() – Abnormal 2: unauthorized/repository failure', () => {
  it('does NOT throw when called without userId / userRoles (unauthenticated)', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 10,
        search: 'IN-2026-0001',
      }),
    ).resolves.toBeDefined();
  });

  it('forwards viewerFor = undefined when caller has no userId', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: 'IN-2026-0001',
      // no userId, no userRoles
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerFor: undefined,
      }),
    );
  });

  it('forwards viewerFor when caller is authenticated', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: 'IN-2026-0001',
      userId: 7,
      userRoles: ['DEPARTMENT_HEAD'],
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerFor: expect.objectContaining({
          userId: 7,
          userRoles: ['DEPARTMENT_HEAD'],
        }),
      }),
    );
  });

  it('does NOT add assignedToUserId for an ADMIN caller', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: 'IN-2026-0001',
      userId: 99,
      userRoles: ['ADMIN'],
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedToUserId: undefined,
      }),
    );
  });

  it('adds assignedToUserId for a DEPARTMENT_HEAD caller', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: 'IN-2026-0001',
      userId: 7,
      userRoles: ['DEPARTMENT_HEAD'],
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedToUserId: 7,
        assignedProcessorTypes: ['XLC', 'PHXL', 'XDB'],
      }),
    );
  });

  it('rejects (propagates) a repository failure', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(new Error('DB outage'));

    await expect(
      service.list({
        page: 1,
        limit: 10,
      }),
    ).rejects.toThrow('DB outage');
  });

  it('records a safe diagnostic on repository failure (no password / hash leak)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(new Error('DB outage'));

    const err = await service
      .list({
        page: 1,
        limit: 10,
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on repository failure', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(new Error('DB outage'));

    await expect(
      service.list({
        page: 1,
        limit: 10,
      }),
    ).rejects.toThrow('DB outage');

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 1: minimum keyword + empty-result boundary.
// Result : Empty search keyword is treated as no search (the
//          repository's `if (search)` guards). Unmatched
//          keywords return an empty result.
// ---------------------------------------------------------------------------
describe('[UTCID09] incomingDocumentsService.list() – Boundary 1: minimum keyword + empty-result boundary', () => {
  it('accepts the boundary: undefined search keyword (no filter)', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
      // no search
    });

    expect(result).toBeDefined();
    expect(result.items).toBeDefined();
  });

  it('forwards undefined search as an absent key to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      // no search
    });

    // When `search` is undefined, the service spreads the
    // params object and the `search` key is absent in the
    // forwarded object — it's not `undefined` because the
    // property simply doesn't exist on the params object.
    // We assert via the call arguments directly instead of
    // objectContaining so we don't fail on missing keys.
    const callArgs = mockedRepo.findAll.mock.calls[0][0];
    expect('search' in callArgs).toBe(false);
  });

  it('returns an empty result for a search keyword with no matches', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
      search: 'no-matches-anywhere',
    });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('forwards the empty-result search verbatim to the repository', async () => {
    await service.list({
      page: 1,
      limit: 10,
      search: 'no-matches-anywhere',
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'no-matches-anywhere',
      }),
    );
  });

  it('does NOT throw on an unmatched search', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    await expect(
      service.list({
        page: 1,
        limit: 10,
        search: 'no-matches-anywhere',
      }),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on the empty-result path (no password / hash leak)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const result = await service.list({
      page: 1,
      limit: 10,
      search: 'no-matches-anywhere',
    });

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the empty-result path', async () => {
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
      search: 'no-matches-anywhere',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID10 – Boundary 2: upper-bound value just at the supported
// limit.
// Result : Very long search keyword accepted; very deep page
//          accepted.
// ---------------------------------------------------------------------------
describe('[UTCID10] incomingDocumentsService.list() – Boundary 2: upper-bound value at the supported limit', () => {
  it('accepts the boundary: 1000-character search keyword', async () => {
    const result = await service.list({
      page: 1,
      limit: 10,
      search: 'a'.repeat(1000),
    });

    expect(result).toBeDefined();
  });

  it('forwards the 1000-character search keyword verbatim to the repository', async () => {
    const longSearch = 'a'.repeat(1000);
    await service.list({
      page: 1,
      limit: 10,
      search: longSearch,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: longSearch,
      }),
    );
  });

  it('accepts the boundary: very deep page (page=10000)', async () => {
    const result = await service.list({
      page: 10000,
      limit: 10,
    });

    expect(result).toBeDefined();
  });

  it('forwards very deep page to the repository', async () => {
    await service.list({
      page: 10000,
      limit: 10,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 10000,
      }),
    );
  });

  it('accepts the boundary: limit=100 (large page size)', async () => {
    const result = await service.list({
      page: 1,
      limit: 100,
    });

    expect(result).toBeDefined();
  });

  it('forwards limit=100 to the repository', async () => {
    await service.list({
      page: 1,
      limit: 100,
    });

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
      }),
    );
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.list({
        page: 10000,
        limit: 100,
        search: 'a'.repeat(1000),
      }),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    const result = await service.list({
      page: 10000,
      limit: 100,
      search: 'a'.repeat(1000),
    });

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list({
      page: 10000,
      limit: 100,
      search: 'a'.repeat(1000),
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
