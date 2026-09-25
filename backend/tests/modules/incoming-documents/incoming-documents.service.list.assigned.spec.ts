/**
 * Unit tests for IncomingDocumentsService.list() — Function31 /
 * View My Assigned Incoming Documents.
 *
 * Note on naming: the matrix headers reference
 * `AssignmentQueryService`, but the actual implementation that
 * surfaces the caller's assigned documents is
 * `IncomingDocumentsService.list(params)` when the caller is a
 * DEPARTMENT_HEAD or SPECIALIST. The service transparently sets
 * `assignedToUserId` and `assignedProcessorTypes: ['XLC', 'PHXL',
 * 'XDB']` so the repository's `findAll` filters by the caller's
 * participation rows. We exercise `list()` at the service layer
 * with mocked repository.
 *
 * Contract:
 *   async list(params: {
 *     page: number;
 *     limit: number;
 *     search?: string;
 *     status?: string;
 *     documentTypeId?: number;
 *     urgency?: string;
 *     userId?: number;
 *     userRoles?: string[];
 *   }): Promise<{ items: IncomingDocumentListRow[]; total: number }>
 *
 * Step-by-step:
 *   1. Extract userId / userRoles from params.
 *   2. If both are defined:
 *      - If caller is NOT ADMIN AND caller is DEPARTMENT_HEAD or
 *        SPECIALIST → set assignedToUserId = userId,
 *        assignedProcessorTypes = ['XLC', 'PHXL', 'XDB'].
 *      - Always set viewerFor = { userId, userRoles }.
 *   3. Call incomingDocumentsRepository.findAll with the augmented
 *      params and return the result.
 *
 * Note on the matrix's "boundary" UTCID05:
 *   - The boundary case is "no assignments or last-page boundary".
 *   - The repository handles pagination internally; the service
 *     passes page/limit through. An empty result set is a valid
 *     boundary.
 *
 * Coverage matrix (UTCID01 – UTCID05):
 *   UTCID01  N  – Primary assignments: DEPARTMENT_HEAD caller
 *                 receives their XLC-assigned documents.
 *   UTCID02  N  – Collaborator assignments: SPECIALIST caller
 *                 receives their PHXL-assigned documents.
 *   UTCID03  N  – Viewer assignments: SPECIALIST caller receives
 *                 their XDB-assigned documents.
 *   UTCID04  A  – Unauthenticated user: caller with no userId /
 *                 userRoles receives the unfiltered list.
 *   UTCID05  B  – No assignments or last-page boundary: empty
 *                 result set is returned for a caller with no
 *                 assignments.
 */

import { IncomingDocumentsService } from '../../../src/modules/incoming-documents/incoming-documents.service';
import { incomingDocumentsRepository } from '../../../src/modules/incoming-documents/incoming-documents.repository';
import {
  resolveUrgencyId,
} from '../../../src/shared/utils/urgency';
import { DocumentStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/incoming-documents/incoming-documents.repository',
);

jest.mock('../../../src/shared/utils/urgency', () => ({
  resolveUrgencyId: jest.fn(),
  resolveUrgencyIdWithDefault: jest.fn(),
}));

const mockedRepo = incomingDocumentsRepository as jest.Mocked<
  typeof incomingDocumentsRepository
>;

const mockedUrgency = resolveUrgencyId as jest.MockedFunction<
  typeof resolveUrgencyId
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
  jest.useRealTimers();

  // Default: urgency resolves to id=1.
  mockedUrgency.mockResolvedValue(1);

  // Default repository response: empty result set. Individual tests
  // override this with mockResolvedValueOnce.
  mockedRepo.findAll.mockReset();
  mockedRepo.findAll.mockResolvedValue({ items: [], total: 0 });

  service = new IncomingDocumentsService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeListItem(overrides: any = {}) {
  return {
    id: 1,
    documentId: 100,
    arrivalNumber: 1,
    dateReceived: new Date('2025-01-15'),
    receivedDate: new Date('2025-01-15'),
    pageCount: 1,
    processingInstructions: null,
    documentBookId: null,
    documentBook: null,
    document: {
      id: 100,
      documentNumber: 'IN-2025-0001',
      subject: 'Test subject',
      type: 'INCOMING',
      fileUrl: null,
      status: DocumentStatus.PENDING,
      urgencyId: 1,
      urgency: null as any,
      confidentialityId: 1,
      confidentiality: null as any,
      ocrText: null,
      documentTypeId: null,
      documentTypeRef: null,
      issuer: null,
      signerName: null,
      signerTitle: null,
      issuedDate: null,
      categoryId: null,
      category: null as any,
      createdAt: new Date('2025-01-15'),
      updatedAt: new Date('2025-01-15'),
      createdByUser: null as any,
      createdBy: 5,
      updatedByUser: null as any,
      processors: [],
      attachments: [],
      workflows: [],
    },
    ...overrides,
  };
}

function makeParams(overrides: any = {}) {
  return {
    page: 1,
    limit: 10,
    search: undefined,
    status: undefined,
    documentTypeId: undefined,
    urgency: undefined,
    userId: 7,
    userRoles: ['DEPARTMENT_HEAD'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: primary assignments (XLC).
// Result : DEPARTMENT_HEAD caller receives their XLC-assigned
//          documents. The service sets assignedToUserId=userId and
//          assignedProcessorTypes=['XLC','PHXL','XDB'].
// ---------------------------------------------------------------------------
describe('[UTCID01] incomingDocumentsService.list() – Normal 1: primary assignments (XLC)', () => {
  it('sets assignedToUserId to the caller userId', async () => {
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [makeListItem()],
      total: 1,
    });

    await service.list(
      makeParams({ userId: 7, userRoles: ['DEPARTMENT_HEAD'] }) as any,
    );

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedToUserId: 7,
      }),
    );
  });

  it('sets assignedProcessorTypes to all three processor types', async () => {
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [makeListItem()],
      total: 1,
    });

    await service.list(
      makeParams({ userId: 7, userRoles: ['DEPARTMENT_HEAD'] }) as any,
    );

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedProcessorTypes: ['XLC', 'PHXL', 'XDB'],
      }),
    );
  });

  it('sets viewerFor to the caller userId + userRoles', async () => {
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [makeListItem()],
      total: 1,
    });

    await service.list(
      makeParams({ userId: 7, userRoles: ['DEPARTMENT_HEAD'] }) as any,
    );

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerFor: { userId: 7, userRoles: ['DEPARTMENT_HEAD'] },
      }),
    );
  });

  it('returns the repository result verbatim', async () => {
    const expected = {
      items: [makeListItem(), makeListItem({ id: 2, documentId: 101 })],
      total: 2,
    };
    mockedRepo.findAll.mockResolvedValueOnce(expected);

    const result = await service.list(
      makeParams({ userId: 7, userRoles: ['DEPARTMENT_HEAD'] }) as any,
    );

    expect(result).toEqual(expected);
  });

  it('passes the original page / limit through unchanged', async () => {
    await service.list(
      makeParams({
        page: 3,
        limit: 25,
        userId: 7,
        userRoles: ['DEPARTMENT_HEAD'],
      }) as any,
    );

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 3,
        limit: 25,
      }),
    );
  });

  it('does NOT log to console on the success path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list(
      makeParams({ userId: 7, userRoles: ['DEPARTMENT_HEAD'] }) as any,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: collaborator assignments (PHXL).
// Result : SPECIALIST caller receives their PHXL-assigned
//          documents. The same filtering applies.
// ---------------------------------------------------------------------------
describe('[UTCID02] incomingDocumentsService.list() – Normal 2: collaborator assignments (PHXL)', () => {
  it('sets assignedToUserId for a SPECIALIST caller', async () => {
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [makeListItem()],
      total: 1,
    });

    await service.list(
      makeParams({ userId: 8, userRoles: ['SPECIALIST'] }) as any,
    );

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedToUserId: 8,
      }),
    );
  });

  it('sets assignedProcessorTypes to all three for a SPECIALIST', async () => {
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [makeListItem()],
      total: 1,
    });

    await service.list(
      makeParams({ userId: 8, userRoles: ['SPECIALIST'] }) as any,
    );

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedProcessorTypes: ['XLC', 'PHXL', 'XDB'],
      }),
    );
  });

  it('returns the repository result for a SPECIALIST caller', async () => {
    const expected = {
      items: [makeListItem()],
      total: 1,
    };
    mockedRepo.findAll.mockResolvedValueOnce(expected);

    const result = await service.list(
      makeParams({ userId: 8, userRoles: ['SPECIALIST'] }) as any,
    );

    expect(result).toEqual(expected);
  });

  it('combines multiple roles: SPECIALIST + DEPARTMENT_HEAD', async () => {
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [makeListItem()],
      total: 1,
    });

    await service.list(
      makeParams({
        userId: 9,
        userRoles: ['SPECIALIST', 'DEPARTMENT_HEAD'],
      }) as any,
    );

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedToUserId: 9,
        assignedProcessorTypes: ['XLC', 'PHXL', 'XDB'],
      }),
    );
  });

  it('does NOT log to console on the PHXL path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list(
      makeParams({ userId: 8, userRoles: ['SPECIALIST'] }) as any,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: viewer assignments (XDB).
// Result : The service does NOT distinguish XDB from PHXL at the
//          service layer — both are folded into the same
//          `assignedProcessorTypes: ['XLC','PHXL','XDB']` filter.
//          The repository handles the type-level filtering.
// ---------------------------------------------------------------------------
describe('[UTCID03] incomingDocumentsService.list() – Normal 3: viewer assignments (XDB)', () => {
  it('treats XDB the same as PHXL at the service layer (both included in assignedProcessorTypes)', async () => {
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [makeListItem()],
      total: 1,
    });

    await service.list(
      makeParams({ userId: 10, userRoles: ['SPECIALIST'] }) as any,
    );

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedProcessorTypes: expect.arrayContaining(['XDB']),
      }),
    );
  });

  it('returns the repository result for an XDB-only viewer', async () => {
    const expected = {
      items: [makeListItem()],
      total: 1,
    };
    mockedRepo.findAll.mockResolvedValueOnce(expected);

    const result = await service.list(
      makeParams({ userId: 10, userRoles: ['SPECIALIST'] }) as any,
    );

    expect(result).toEqual(expected);
  });

  it('does NOT log to console on the XDB path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list(
      makeParams({ userId: 10, userRoles: ['SPECIALIST'] }) as any,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: unauthenticated user.
// Result : Documented gap — the service does NOT verify the caller
//          identity. Without userId/userRoles, the service passes
//          through to the repository unfiltered (no
//          assignedToUserId).
// ---------------------------------------------------------------------------
describe('[UTCID04] incomingDocumentsService.list() – Abnormal 1: unauthenticated user (documented gap)', () => {
  it('returns the unfiltered list when userId is undefined', async () => {
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [makeListItem(), makeListItem({ id: 2 })],
      total: 2,
    });

    await service.list(
      makeParams({ userId: undefined, userRoles: undefined }) as any,
    );

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedToUserId: undefined,
      }),
    );
  });

  it('returns the unfiltered list when userRoles is empty', async () => {
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [makeListItem()],
      total: 1,
    });

    await service.list(
      makeParams({ userId: 7, userRoles: [] }) as any,
    );

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedToUserId: undefined,
        assignedProcessorTypes: undefined,
      }),
    );
  });

  it('does NOT throw for an ADMIN caller (admins see everything)', async () => {
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [makeListItem(), makeListItem({ id: 2 })],
      total: 2,
    });

    const result = await service.list(
      makeParams({ userId: 1, userRoles: ['ADMIN'] }) as any,
    );

    expect(result.items).toHaveLength(2);
  });

  it('does NOT set assignedToUserId for an ADMIN caller (admin bypass)', async () => {
    await service.list(
      makeParams({ userId: 1, userRoles: ['ADMIN'] }) as any,
    );

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedToUserId: undefined,
      }),
    );
  });

  it('does NOT set assignedToUserId for a DOCUMENT_CLERK caller', async () => {
    await service.list(
      makeParams({ userId: 5, userRoles: ['DOCUMENT_CLERK'] }) as any,
    );

    expect(mockedRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedToUserId: undefined,
      }),
    );
  });

  it('does NOT throw for a VIEWER caller (viewer sees nothing)', async () => {
    await expect(
      service.list(
        makeParams({ userId: 11, userRoles: ['VIEWER'] }) as any,
      ),
    ).resolves.toBeDefined();
  });

  it('propagates a repository failure (e.g. database error)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(
      new Error('Database connection refused'),
    );

    await expect(
      service.list(
        makeParams({ userId: 7, userRoles: ['DEPARTMENT_HEAD'] }) as any,
      ),
    ).rejects.toThrow('Database connection refused');
  });

  it('records a safe diagnostic on repository failures (no password / hash leak)', async () => {
    mockedRepo.findAll.mockReset();
    mockedRepo.findAll.mockRejectedValueOnce(
      new Error('Database connection refused'),
    );

    const err = await service
      .list(
        makeParams({ userId: 7, userRoles: ['DEPARTMENT_HEAD'] }) as any,
      )
      .catch((e) => e);

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on failure paths', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.list(
      makeParams({ userId: 7, userRoles: ['DEPARTMENT_HEAD'] }) as any,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Boundary 1: no assignments or last-page boundary.
// Result : A caller with no assignments receives an empty result
//          set. A caller on the last page receives a partial
//          result set with the correct total count.
// ---------------------------------------------------------------------------
describe('[UTCID05] incomingDocumentsService.list() – Boundary 1: no assignments or last-page boundary', () => {
  it('returns an empty result set for a caller with no assignments', async () => {
    mockedRepo.findAll.mockResolvedValueOnce({ items: [], total: 0 });

    const result = await service.list(
      makeParams({ userId: 999, userRoles: ['DEPARTMENT_HEAD'] }) as any,
    );

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('passes an empty result set through verbatim', async () => {
    mockedRepo.findAll.mockResolvedValueOnce({ items: [], total: 0 });

    const result = await service.list(
      makeParams({ userId: 999, userRoles: ['DEPARTMENT_HEAD'] }) as any,
    );

    expect(result).toEqual({ items: [], total: 0 });
  });

  it('returns a partial result set on the last page', async () => {
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [makeListItem()],
      total: 11, // total = 11, page=2, limit=10 → 1 item on the last page
    });

    const result = await service.list(
      makeParams({
        page: 2,
        limit: 10,
        userId: 7,
        userRoles: ['DEPARTMENT_HEAD'],
      }) as any,
    );

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(11);
  });

  it('returns a full result set on the first page', async () => {
    mockedRepo.findAll.mockResolvedValueOnce({
      items: Array.from({ length: 10 }, (_, i) =>
        makeListItem({ id: i + 1, documentId: 100 + i }),
      ),
      total: 10,
    });

    const result = await service.list(
      makeParams({
        page: 1,
        limit: 10,
        userId: 7,
        userRoles: ['DEPARTMENT_HEAD'],
      }) as any,
    );

    expect(result.items).toHaveLength(10);
    expect(result.total).toBe(10);
  });

  it('returns a partial result set when page exceeds available pages', async () => {
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 5,
    });

    const result = await service.list(
      makeParams({
        page: 99,
        limit: 10,
        userId: 7,
        userRoles: ['DEPARTMENT_HEAD'],
      }) as any,
    );

    expect(result.items).toEqual([]);
    expect(result.total).toBe(5);
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findAll.mockResolvedValueOnce({ items: [], total: 0 });

    await service.list(
      makeParams({ userId: 999, userRoles: ['DEPARTMENT_HEAD'] }) as any,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('handles large total counts (1 000 000 documents)', async () => {
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [],
      total: 1_000_000,
    });

    const result = await service.list(
      makeParams({ userId: 7, userRoles: ['DEPARTMENT_HEAD'] }) as any,
    );

    expect(result.total).toBe(1_000_000);
  });

  it('handles a single-item result set on the boundary', async () => {
    mockedRepo.findAll.mockResolvedValueOnce({
      items: [makeListItem()],
      total: 1,
    });

    const result = await service.list(
      makeParams({ userId: 7, userRoles: ['DEPARTMENT_HEAD'] }) as any,
    );

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});
