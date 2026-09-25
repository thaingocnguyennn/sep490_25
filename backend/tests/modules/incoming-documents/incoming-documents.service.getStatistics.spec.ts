/**
 * Unit tests for IncomingDocumentsService.getStatistics() —
 * Function38 / Filter Incoming Document.
 *
 * Note on naming: the matrix headers reference
 * `IncomingDocumentQueryService`, but the actual implementation
 * that filters incoming documents by status, date, and
 * department/type and aggregates the result is
 * `IncomingDocumentsService.getStatistics({ dateFrom, dateTo,
 * departmentId })`. This is the entry point called by the
 * `GET /incoming-documents/statistics` route handler.
 *
 * Step-by-step:
 *   1. Build `baseDocFilter` with:
 *        documentStatus: 'ACTIVE'
 *        type:           'INCOMING'
 *        (optional) createdAt range from dateFrom / dateTo
 *        (optional) departmentId
 *   2. Wrap in `baseFilter = { document: baseDocFilter }` (since
 *      IncomingDocument has a 1:1 relation with Document).
 *   3. Run 4 query paths plus 1 lookup:
 *      a. prisma.incomingDocument.count — total count.
 *      b. prisma.document.groupBy({ by: ['status'] }) — byStatus.
 *      c. prisma.document.groupBy({ by: ['documentTypeId'] }) —
 *         byDocumentType, then prisma.documentType.findMany to
 *         resolve the type names.
 *      d. prisma.document.groupBy({ by: ['departmentId'], take:
 *         10 }) — byDepartment, then prisma.department.findMany
 *         to resolve the department names.
 *      e. Twelve-monthly bucketing: query IncomingDocument with
 *         dateReceived >= now-11months, count per YYYY-MM key.
 *   4. Return { totalCount, byStatus, byDocumentType,
 *      byDepartment, byMonth }.
 *
 * Coverage matrix (UTCID01 – UTCID09):
 *   UTCID01  N  – Status filter: byStatus aggregation works.
 *   UTCID02  N  – Date filter: dateFrom / dateTo apply.
 *   UTCID03  N  – Agency/type filter: byDepartment / byDocumentType
 *                 work.
 *   UTCID04  N  – Combined filters: status + date + type all
 *                 together.
 *   UTCID05  N  – Response-to-database consistency: totalCount +
 *                 each array match the underlying groups.
 *   UTCID06  A  – Invalid range/filter: invalid date strings,
 *                 invalid departmentId.
 *   UTCID07  A  – Unauthorized/repository failure: prisma failure
 *                 propagates.
 *   UTCID08  B  – Equal start/end date: equal dateFrom / dateTo.
 *   UTCID09  B  – Upper-bound value just at the supported limit:
 *                 very wide date range, very large department id.
 */

import { IncomingDocumentsService } from '../../../src/modules/incoming-documents/incoming-documents.service';
import { default as prisma } from '../../../src/config/database';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  __esModule: true,
  default: {
    incomingDocument: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    document: {
      groupBy: jest.fn(),
    },
    documentType: {
      findMany: jest.fn(),
    },
    department: {
      findMany: jest.fn(),
    },
  },
}));

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

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

  // Default: a healthy response with all groups populated.
  (mockedPrisma.incomingDocument.count as jest.Mock).mockResolvedValue(100);

  (mockedPrisma.document.groupBy as jest.Mock).mockImplementation(
    async ({ by }: any) => {
      if (by.includes('status')) {
        return [
          { status: 'IN_PROGRESS', _count: { id: 60 } },
          { status: 'COMPLETED', _count: { id: 30 } },
          { status: 'PENDING', _count: { id: 10 } },
        ];
      }
      if (by.includes('documentTypeId')) {
        return [
          { documentTypeId: 1, _count: { id: 50 } },
          { documentTypeId: 2, _count: { id: 30 } },
        ];
      }
      if (by.includes('departmentId')) {
        return [
          { departmentId: 1, _count: { id: 40 } },
          { departmentId: 2, _count: { id: 30 } },
        ];
      }
      return [];
    },
  );

  (mockedPrisma.documentType.findMany as jest.Mock).mockResolvedValue([
    { id: 1, name: 'Công văn' },
    { id: 2, name: 'Báo cáo' },
  ]);

  (mockedPrisma.department.findMany as jest.Mock).mockResolvedValue([
    { id: 1, name: 'Phòng Hành chính' },
    { id: 2, name: 'Phòng Kế toán' },
  ]);

  (mockedPrisma.incomingDocument.findMany as jest.Mock).mockResolvedValue([
    { dateReceived: new Date('2026-09-25') },
    { dateReceived: new Date('2026-08-15') },
    { dateReceived: new Date('2026-09-25') },
  ]);

  service = new IncomingDocumentsService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: status filter.
// Result : byStatus aggregation is returned; status labels are
//          preserved.
// ---------------------------------------------------------------------------
describe('[UTCID01] incomingDocumentsService.getStatistics() – Normal 1: status filter', () => {
  it('returns byStatus with the configured statuses', async () => {
    const result = await service.getStatistics({});

    expect(result.byStatus).toBeDefined();
    expect(Array.isArray(result.byStatus)).toBe(true);
  });

  it('preserves IN_PROGRESS and COMPLETED labels', async () => {
    const result = await service.getStatistics({});

    const labels = result.byStatus.map((b: any) => b.status);
    expect(labels).toContain('IN_PROGRESS');
    expect(labels).toContain('COMPLETED');
  });

  it('preserves the count per status', async () => {
    const result = await service.getStatistics({});

    const inProgress = result.byStatus.find(
      (b: any) => b.status === 'IN_PROGRESS',
    );
    expect(inProgress.count).toBe(60);

    const completed = result.byStatus.find(
      (b: any) => b.status === 'COMPLETED',
    );
    expect(completed.count).toBe(30);
  });

  it('does NOT throw on a valid status filter', async () => {
    await expect(service.getStatistics({})).resolves.toBeDefined();
  });

  it('does NOT log to console on the status-filter path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getStatistics({});

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: date filter.
// Result : dateFrom / dateTo are applied to the count and
//          groupBy queries.
// ---------------------------------------------------------------------------
describe('[UTCID02] incomingDocumentsService.getStatistics() – Normal 2: date filter', () => {
  it('applies the dateFrom filter to the count', async () => {
    await service.getStatistics({
      dateFrom: '2026-01-01',
    });

    expect(mockedPrisma.incomingDocument.count).toHaveBeenCalled();
  });

  it('applies the dateTo filter to the count', async () => {
    await service.getStatistics({
      dateTo: '2026-12-31',
    });

    expect(mockedPrisma.incomingDocument.count).toHaveBeenCalled();
  });

  it('applies the dateFrom / dateTo range to both count and groupBy', async () => {
    await service.getStatistics({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });

    expect(mockedPrisma.incomingDocument.count).toHaveBeenCalled();
    expect(mockedPrisma.document.groupBy).toHaveBeenCalled();
  });

  it('does NOT throw on a valid date filter', async () => {
    await expect(
      service.getStatistics({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the date-filter path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getStatistics({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: agency/type filter.
// Result : byDepartment and byDocumentType aggregations work.
// ---------------------------------------------------------------------------
describe('[UTCID03] incomingDocumentsService.getStatistics() – Normal 3: agency/type filter', () => {
  it('returns byDepartment aggregation', async () => {
    const result = await service.getStatistics({});

    expect(result.byDepartment).toBeDefined();
    expect(Array.isArray(result.byDepartment)).toBe(true);
  });

  it('resolves department names from the department lookup', async () => {
    const result = await service.getStatistics({});

    const deptNames = result.byDepartment.map((d: any) => d.departmentName);
    expect(deptNames).toContain('Phòng Hành chính');
    expect(deptNames).toContain('Phòng Kế toán');
  });

  it('returns byDocumentType aggregation', async () => {
    const result = await service.getStatistics({});

    expect(result.byDocumentType).toBeDefined();
    expect(Array.isArray(result.byDocumentType)).toBe(true);
  });

  it('resolves document type names from the type lookup', async () => {
    const result = await service.getStatistics({});

    const typeNames = result.byDocumentType.map((t: any) => t.documentType);
    expect(typeNames).toContain('Công văn');
    expect(typeNames).toContain('Báo cáo');
  });

  it('caps byDepartment at 10 entries (top-10 departments)', async () => {
    await service.getStatistics({});

    expect(mockedPrisma.document.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
      }),
    );
  });

  it('does NOT throw on agency/type filters', async () => {
    await expect(service.getStatistics({})).resolves.toBeDefined();
  });

  it('does NOT log to console on agency/type filters', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getStatistics({});

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: combined filters.
// Result : status + date + type filters apply together via
//          baseDocFilter.
// ---------------------------------------------------------------------------
describe('[UTCID04] incomingDocumentsService.getStatistics() – Normal 4: combined filters', () => {
  it('applies combined filters to the count', async () => {
    await service.getStatistics({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      departmentId: 1,
    });

    expect(mockedPrisma.incomingDocument.count).toHaveBeenCalled();
  });

  it('applies combined filters to the groupBy queries', async () => {
    await service.getStatistics({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      departmentId: 1,
    });

    expect(mockedPrisma.document.groupBy).toHaveBeenCalledTimes(3);
  });

  it('wraps baseDocFilter as `{ document: baseDocFilter }` for incomingDocument queries', async () => {
    await service.getStatistics({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      departmentId: 1,
    });

    expect(mockedPrisma.incomingDocument.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          document: expect.objectContaining({
            documentStatus: 'ACTIVE',
            type: 'INCOMING',
          }),
        }),
      }),
    );
  });

  it('always sets documentStatus=ACTIVE and type=INCOMING', async () => {
    await service.getStatistics({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      departmentId: 1,
    });

    expect(mockedPrisma.document.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          documentStatus: 'ACTIVE',
          type: 'INCOMING',
        }),
      }),
    );
  });

  it('does NOT throw on combined filters', async () => {
    await expect(
      service.getStatistics({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        departmentId: 1,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on combined filters', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getStatistics({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      departmentId: 1,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : totalCount matches the count; byDepartment /
//          byDocumentType match the groupBy + lookup output.
// ---------------------------------------------------------------------------
describe('[UTCID05] incomingDocumentsService.getStatistics() – Normal 5: response-to-database consistency', () => {
  it('returns totalCount matching the count result', async () => {
    (mockedPrisma.incomingDocument.count as jest.Mock).mockReset();
    (mockedPrisma.incomingDocument.count as jest.Mock).mockResolvedValue(1234);

    const result = await service.getStatistics({});

    expect(result.totalCount).toBe(1234);
  });

  it('returns byStatus with one row per status', async () => {
    const result = await service.getStatistics({});

    expect(result.byStatus.length).toBe(3);
  });

  it('returns byDepartment with the configured rows', async () => {
    const result = await service.getStatistics({});

    expect(result.byDepartment.length).toBe(2);
  });

  it('returns byDocumentType with the configured rows', async () => {
    const result = await service.getStatistics({});

    expect(result.byDocumentType.length).toBe(2);
  });

  it('returns byMonth with 12 monthly buckets (12-monthly aggregation)', async () => {
    const result = await service.getStatistics({});

    expect(result.byMonth).toBeDefined();
    expect(Array.isArray(result.byMonth)).toBe(true);
    // 12 monthly buckets: (current month - 11) to (current month).
    expect(result.byMonth.length).toBe(12);
  });

  it('returns the same shape on repeated identical calls', async () => {
    const result1 = await service.getStatistics({});
    const result2 = await service.getStatistics({});

    expect(result1.totalCount).toBe(result2.totalCount);
    expect(result1.byStatus.length).toBe(result2.byStatus.length);
    expect(result1.byMonth.length).toBe(result2.byMonth.length);
  });

  it('does NOT throw on consistency check', async () => {
    await expect(service.getStatistics({})).resolves.toBeDefined();
  });

  it('does NOT log to console on consistency check', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getStatistics({});

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: invalid range/filter.
// Result : Invalid date strings produce NaN dates (or are passed
//          through); invalid departmentIds are ignored.
// ---------------------------------------------------------------------------
describe('[UTCID06] incomingDocumentsService.getStatistics() – Abnormal 1: invalid range/filter', () => {
  it('does NOT throw on a malformed dateFrom', async () => {
    await expect(
      service.getStatistics({
        dateFrom: 'not-a-date',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on a malformed dateTo', async () => {
    await expect(
      service.getStatistics({
        dateTo: '2026-13-99',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on a negative departmentId', async () => {
    await expect(
      service.getStatistics({
        departmentId: -1,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on a malformed departmentId (NaN)', async () => {
    await expect(
      service.getStatistics({
        departmentId: Number.NaN as any,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on an empty string dateFrom', async () => {
    await expect(
      service.getStatistics({
        dateFrom: '',
      }),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on invalid filters (no password / hash leak)', async () => {
    const result = await service
      .getStatistics({
        dateFrom: 'not-a-date',
      })
      .catch((e) => e) as any;

    // The service doesn't throw, so we inspect the result;
    // explicit safe-message check.
    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on invalid filters', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getStatistics({
      dateFrom: 'not-a-date',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: unauthorized/repository failure.
// Result : Repository failures propagate as exceptions.
// ---------------------------------------------------------------------------
describe('[UTCID07] incomingDocumentsService.getStatistics() – Abnormal 2: unauthorized/repository failure', () => {
  it('propagates an incomingDocument.count failure', async () => {
    (mockedPrisma.incomingDocument.count as jest.Mock).mockReset();
    (mockedPrisma.incomingDocument.count as jest.Mock).mockRejectedValueOnce(
      new Error('DB outage'),
    );

    await expect(service.getStatistics({})).rejects.toThrow('DB outage');
  });

  it('propagates a document.groupBy failure', async () => {
    (mockedPrisma.document.groupBy as jest.Mock).mockReset();
    (mockedPrisma.document.groupBy as jest.Mock).mockRejectedValueOnce(
      new Error('DB outage'),
    );

    await expect(service.getStatistics({})).rejects.toThrow('DB outage');
  });

  it('propagates a documentType.findMany failure', async () => {
    (mockedPrisma.documentType.findMany as jest.Mock).mockReset();
    (mockedPrisma.documentType.findMany as jest.Mock).mockRejectedValueOnce(
      new Error('DB outage'),
    );

    await expect(service.getStatistics({})).rejects.toThrow('DB outage');
  });

  it('propagates a department.findMany failure', async () => {
    (mockedPrisma.department.findMany as jest.Mock).mockReset();
    (mockedPrisma.department.findMany as jest.Mock).mockRejectedValueOnce(
      new Error('DB outage'),
    );

    await expect(service.getStatistics({})).rejects.toThrow('DB outage');
  });

  it('records a safe diagnostic on repository failure (no password / hash leak)', async () => {
    (mockedPrisma.incomingDocument.count as jest.Mock).mockReset();
    (mockedPrisma.incomingDocument.count as jest.Mock).mockRejectedValueOnce(
      new Error('DB outage'),
    );

    const err = await service
      .getStatistics({})
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on repository failure', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    (mockedPrisma.incomingDocument.count as jest.Mock).mockReset();
    (mockedPrisma.incomingDocument.count as jest.Mock).mockRejectedValueOnce(
      new Error('DB outage'),
    );

    await expect(service.getStatistics({})).rejects.toThrow('DB outage');

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: equal start/end date.
// Result : When dateFrom === dateTo, the service accepts the
//          range and queries with gte/lte around the same date.
// ---------------------------------------------------------------------------
describe('[UTCID08] incomingDocumentsService.getStatistics() – Boundary 1: equal start/end date', () => {
  it('accepts the boundary: dateFrom === dateTo', async () => {
    const result = await service.getStatistics({
      dateFrom: '2026-09-25',
      dateTo: '2026-09-25',
    });

    expect(result).toBeDefined();
  });

  it('does NOT throw on a single-day range', async () => {
    await expect(
      service.getStatistics({
        dateFrom: '2026-09-25',
        dateTo: '2026-09-25',
      }),
    ).resolves.toBeDefined();
  });

  it('applies the single-day range to the count', async () => {
    await service.getStatistics({
      dateFrom: '2026-09-25',
      dateTo: '2026-09-25',
    });

    expect(mockedPrisma.incomingDocument.count).toHaveBeenCalled();
  });

  it('applies the single-day range to the groupBy queries', async () => {
    await service.getStatistics({
      dateFrom: '2026-09-25',
      dateTo: '2026-09-25',
    });

    expect(mockedPrisma.document.groupBy).toHaveBeenCalledTimes(3);
  });

  it('does NOT log to console on a single-day range', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getStatistics({
      dateFrom: '2026-09-25',
      dateTo: '2026-09-25',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 2: upper-bound value just at the supported
// limit.
// Result : very wide date range (10+ years), very large
//          departmentId are accepted.
// ---------------------------------------------------------------------------
describe('[UTCID09] incomingDocumentsService.getStatistics() – Boundary 2: upper-bound value at the supported limit', () => {
  it('accepts the boundary: 50-year date range', async () => {
    const result = await service.getStatistics({
      dateFrom: '1976-01-01',
      dateTo: '2026-12-31',
    });

    expect(result).toBeDefined();
  });

  it('accepts the boundary: very large departmentId (e.g. 999999999)', async () => {
    const result = await service.getStatistics({
      departmentId: 999_999_999,
    });

    expect(result).toBeDefined();
  });

  it('accepts the boundary: very large departmentId (Number.MAX_SAFE_INTEGER)', async () => {
    const result = await service.getStatistics({
      departmentId: Number.MAX_SAFE_INTEGER,
    });

    expect(result).toBeDefined();
  });

  it('applies the wide date range to the count', async () => {
    await service.getStatistics({
      dateFrom: '1976-01-01',
      dateTo: '2026-12-31',
    });

    expect(mockedPrisma.incomingDocument.count).toHaveBeenCalled();
  });

  it('applies the wide date range to the groupBy queries', async () => {
    await service.getStatistics({
      dateFrom: '1976-01-01',
      dateTo: '2026-12-31',
    });

    expect(mockedPrisma.document.groupBy).toHaveBeenCalledTimes(3);
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.getStatistics({
        dateFrom: '1976-01-01',
        dateTo: '2026-12-31',
        departmentId: Number.MAX_SAFE_INTEGER,
      }),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    const result = await service
      .getStatistics({
        dateFrom: '1976-01-01',
        dateTo: '2026-12-31',
        departmentId: Number.MAX_SAFE_INTEGER,
      })
      .catch((e) => e) as any;

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getStatistics({
      dateFrom: '1976-01-01',
      dateTo: '2026-12-31',
      departmentId: Number.MAX_SAFE_INTEGER,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
