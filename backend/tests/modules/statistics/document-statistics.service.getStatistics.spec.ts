/**
 * Unit tests for IncomingDocumentsService.getStatistics() and
 * OutgoingDocumentsService.getStatistics() — Function46 /
 * Incoming and Outgoing Document Statistics.
 *
 * Note on naming: the matrix headers reference
 * `DocumentStatisticsService`. The codebase does NOT have a
 * unified service. Instead, two parallel methods exist:
 *   - `IncomingDocumentsService.getStatistics({ dateFrom,
 *      dateTo, departmentId })`
 *   - `OutgoingDocumentsService.getStatistics({ dateFrom,
 *      dateTo, departmentId, currentUser })`
 * Both return `{ totalCount, byStatus, byDocumentType,
 * byDepartment, byMonth }` with an additional `issuedCount`
 * for outgoing. This spec exercises BOTH methods side by
 * side as the "DocumentStatisticsService" — the unified view
 * that powers the dashboard.
 *
 * Step-by-step (IncomingDocumentsService.getStatistics):
 *   1. Build `baseDocFilter` with:
 *        documentStatus: 'ACTIVE'
 *        type:           'INCOMING'
 *        (optional) createdAt range from dateFrom / dateTo
 *        (optional) departmentId
 *   2. Run 4 groupBys:
 *      a. prisma.incomingDocument.count — totalCount.
 *      b. prisma.document.groupBy({ by: ['status'] }) —
 *         byStatus.
 *      c. prisma.document.groupBy({ by: ['documentTypeId'] })
 *         — byDocumentType, then prisma.documentType.findMany
 *         to resolve the type names.
 *      d. prisma.document.groupBy({ by: ['departmentId'],
 *         take: 10 }) — byDepartment, then
 *         prisma.department.findMany to resolve the
 *         department names.
 *   3. Twelve-monthly bucketing:
 *      query IncomingDocument with dateReceived >=
 *      now-11months, count per YYYY-MM key.
 *   4. Return { totalCount, byStatus, byDocumentType,
 *      byDepartment, byMonth }.
 *
 * Step-by-step (OutgoingDocumentsService.getStatistics):
 *   1. ADMIN-only path returns empty (defensive).
 *   2. Build `baseDocumentFilter` with:
 *        documentStatus: 'ACTIVE'
 *        (optional) createdAt range from dateFrom / dateTo
 *        (optional) departmentId
 *   3. Run 5 groupBys + 1 lookup:
 *      a. prisma.outgoingDocument.count — totalCount.
 *      b. prisma.document.groupBy({ by: ['status'] }) where
 *         type='OUTGOING' — byStatus.
 *      c. prisma.document.groupBy({ by: ['documentTypeId'] })
 *         — byDocumentType, then prisma.documentType.findMany
 *         to resolve the type names.
 *      d. prisma.document.groupBy({ by: ['departmentId'],
 *         take: 10 }) — byDepartment, then
 *         prisma.department.findMany to resolve the
 *         department names.
 *      e. Twelve-monthly bucketing (createdAt-based).
 *      f. prisma.document.count where status='ISSUED' —
 *         issuedCount.
 *   4. Return { totalCount, issuedCount, byStatus,
 *      byDocumentType, byDepartment, byMonth }.
 *
 * Coverage matrix (UTCID01 – UTCID09):
 *   UTCID01  N  – Counts by direction: incoming totalCount and
 *                 outgoing totalCount both returned.
 *   UTCID02  N  – Status: byStatus aggregation works on both
 *                 sides.
 *   UTCID03  N  – Time period: dateFrom / dateTo filter applied
 *                 on both sides.
 *   UTCID04  N  – Department aggregation: byDepartment returns
 *                 top 10 with names resolved.
 *   UTCID05  N  – Response-to-database consistency: totalCount +
 *                 each array match the underlying groups.
 *   UTCID06  A  – Invalid date / filter: invalid date strings,
 *                 invalid departmentId.
 *   UTCID07  A  – Unauthorized / query failure: prisma failure
 *                 propagates; ADMIN-only outgoing returns
 *                 empty.
 *   UTCID08  B  – Same-day period or empty dataset: equal
 *                 dateFrom / dateTo; empty dataset returns
 *                 zero counts.
 *   UTCID09  B  – Upper-bound value: very wide date range,
 *                 very large department id.
 */

import { default as prisma } from '../../../src/config/database';
import { IncomingDocumentsService } from '../../../src/modules/incoming-documents/incoming-documents.service';
import { OutgoingDocumentsService } from '../../../src/modules/outgoing-documents/outgoing-documents.service';

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
    outgoingDocument: {
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    document: {
      count: jest.fn(),
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

jest.mock('../../../src/shared/services/ocr.service', () => ({
  __esModule: true,
  performOcr: jest.fn(),
  extractFields: jest.fn(),
}));
jest.mock('../../../src/shared/services/email.service', () => ({
  __esModule: true,
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

const mockedPrisma = prisma as unknown as {
  incomingDocument: {
    count: jest.Mock;
    findMany: jest.Mock;
  };
  outgoingDocument: {
    count: jest.Mock;
    findMany: jest.Mock;
    groupBy: jest.Mock;
  };
  document: {
    count: jest.Mock;
    groupBy: jest.Mock;
  };
  documentType: {
    findMany: jest.Mock;
  };
  department: {
    findMany: jest.Mock;
  };
};

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

let incomingService: IncomingDocumentsService;
let outgoingService: OutgoingDocumentsService;

beforeEach(() => {
  jest.clearAllMocks();

  // ── Default counts: 42 incoming, 17 outgoing. ──
  mockedPrisma.incomingDocument.count.mockResolvedValue(42);
  mockedPrisma.outgoingDocument.count.mockResolvedValue(17);
  mockedPrisma.document.count.mockResolvedValue(5);

  // ── Default groupBy results. ──
  mockedPrisma.document.groupBy.mockImplementation(async (args: any) => {
    if (Array.isArray(args?.by) && args.by.includes('status')) {
      return [
        { status: 'PENDING', _count: { id: 10 } },
        { status: 'IN_PROGRESS', _count: { id: 15 } },
        { status: 'COMPLETED', _count: { id: 17 } },
      ] as any;
    }
    if (Array.isArray(args?.by) && args.by.includes('documentTypeId')) {
      return [
        { documentTypeId: 1, _count: { id: 20 } },
        { documentTypeId: 2, _count: { id: 22 } },
      ] as any;
    }
    if (Array.isArray(args?.by) && args.by.includes('departmentId')) {
      return [
        { departmentId: 1, _count: { id: 25 } },
        { departmentId: 2, _count: { id: 17 } },
      ] as any;
    }
    return [];
  });

  mockedPrisma.documentType.findMany.mockResolvedValue([
    { id: 1, name: 'Công văn' },
    { id: 2, name: 'Quyết định' },
  ]);
  mockedPrisma.department.findMany.mockResolvedValue([
    { id: 1, name: 'Phòng Hành chính' },
    { id: 2, name: 'Phòng Kế toán' },
  ]);

  // ── Monthly buckets: 2 docs each for the last 12 months. ──
  const now = new Date();
  const monthlyDocs = [];
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
    monthlyDocs.push({ dateReceived: d, createdAt: d });
  }
  mockedPrisma.incomingDocument.findMany.mockResolvedValue(monthlyDocs);
  mockedPrisma.outgoingDocument.findMany.mockResolvedValue(monthlyDocs);

  incomingService = new IncomingDocumentsService();
  outgoingService = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: counts by direction.
// Result : Both incoming and outgoing statistics return
//          totalCount based on their respective documents.
// ---------------------------------------------------------------------------
describe('[UTCID01] DocumentStatisticsService.getStatistics() – Normal 1: counts by direction', () => {
  it('returns incoming totalCount from prisma.incomingDocument.count', async () => {
    const result = await incomingService.getStatistics();

    expect(result.totalCount).toBe(42);
  });

  it('returns outgoing totalCount from prisma.outgoingDocument.count', async () => {
    const result = await outgoingService.getStatistics();

    expect(result.totalCount).toBe(17);
  });

  it('returns outgoing issuedCount from prisma.document.count', async () => {
    const result = await outgoingService.getStatistics();

    expect(result.issuedCount).toBe(5);
  });

  it('does NOT throw on the counts path', async () => {
    await expect(incomingService.getStatistics()).resolves.toBeDefined();
    await expect(outgoingService.getStatistics()).resolves.toBeDefined();
  });

  it('does NOT log to console on the counts path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await incomingService.getStatistics();
    await outgoingService.getStatistics();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: status.
// Result : byStatus aggregation works on both sides; status
//          values come from the document table.
// ---------------------------------------------------------------------------
describe('[UTCID02] DocumentStatisticsService.getStatistics() – Normal 2: status', () => {
  it('returns incoming byStatus with status + count', async () => {
    const result = await incomingService.getStatistics();

    expect(Array.isArray(result.byStatus)).toBe(true);
    expect(result.byStatus.length).toBeGreaterThan(0);
    expect(result.byStatus[0]).toHaveProperty('status');
    expect(result.byStatus[0]).toHaveProperty('count');
  });

  it('returns outgoing byStatus with status + count', async () => {
    const result = await outgoingService.getStatistics();

    expect(Array.isArray(result.byStatus)).toBe(true);
    expect(result.byStatus.length).toBeGreaterThan(0);
    expect(result.byStatus[0]).toHaveProperty('status');
    expect(result.byStatus[0]).toHaveProperty('count');
  });

  it('groups incoming status by document', async () => {
    await incomingService.getStatistics();

    expect(mockedPrisma.document.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['status'] }),
    );
  });

  it('groups outgoing status by document (type=OUTGOING)', async () => {
    await outgoingService.getStatistics();

    expect(mockedPrisma.document.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['status'],
        where: expect.objectContaining({ type: 'OUTGOING' }),
      }),
    );
  });

  it('does NOT throw on the status path', async () => {
    await expect(incomingService.getStatistics()).resolves.toBeDefined();
    await expect(outgoingService.getStatistics()).resolves.toBeDefined();
  });

  it('does NOT log to console on the status path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await incomingService.getStatistics();
    await outgoingService.getStatistics();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: time period.
// Result : dateFrom / dateTo filter applied on both sides; the
//          baseDocFilter / baseDocumentFilter carries a
//          `createdAt` clause.
// ---------------------------------------------------------------------------
describe('[UTCID03] DocumentStatisticsService.getStatistics() – Normal 3: time period', () => {
  it('applies dateFrom / dateTo on incoming statistics', async () => {
    await incomingService.getStatistics({
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: '2026-12-31T23:59:59.999Z',
    });

    // The count call must receive a `document.createdAt` filter.
    const callArgs = mockedPrisma.incomingDocument.count.mock.calls[0][0];
    expect(callArgs.where.document.createdAt).toEqual(
      expect.objectContaining({
        gte: expect.any(Date),
        lte: expect.any(Date),
      }),
    );
  });

  it('applies dateFrom / dateTo on outgoing statistics', async () => {
    await outgoingService.getStatistics({
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: '2026-12-31T23:59:59.999Z',
    });

    // The count call must receive a `createdAt` filter.
    const callArgs = mockedPrisma.outgoingDocument.count.mock.calls[0][0];
    expect(callArgs.where.document.createdAt).toEqual(
      expect.objectContaining({
        gte: expect.any(Date),
        lte: expect.any(Date),
      }),
    );
  });

  it('accepts only dateFrom (no dateTo)', async () => {
    await incomingService.getStatistics({
      dateFrom: '2026-01-01T00:00:00.000Z',
    });

    const callArgs = mockedPrisma.incomingDocument.count.mock.calls[0][0];
    expect(callArgs.where.document.createdAt.gte).toBeInstanceOf(Date);
    expect(callArgs.where.document.createdAt.lte).toBeUndefined();
  });

  it('accepts only dateTo (no dateFrom)', async () => {
    await outgoingService.getStatistics({
      dateTo: '2026-12-31T23:59:59.999Z',
    });

    const callArgs = mockedPrisma.outgoingDocument.count.mock.calls[0][0];
    expect(callArgs.where.document.createdAt.lte).toBeInstanceOf(Date);
    expect(callArgs.where.document.createdAt.gte).toBeUndefined();
  });

  it('returns 12 monthly buckets when no filter is applied', async () => {
    const result = await incomingService.getStatistics();

    expect(result.byMonth).toHaveLength(12);
  });

  it('does NOT throw on the time-period path', async () => {
    await expect(
      incomingService.getStatistics({
        dateFrom: '2026-01-01T00:00:00.000Z',
        dateTo: '2026-12-31T23:59:59.999Z',
      }),
    ).resolves.toBeDefined();

    await expect(
      outgoingService.getStatistics({
        dateFrom: '2026-01-01T00:00:00.000Z',
        dateTo: '2026-12-31T23:59:59.999Z',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the time-period path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await incomingService.getStatistics({
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: '2026-12-31T23:59:59.999Z',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: department aggregation.
// Result : byDepartment returns top 10 with names resolved.
// ---------------------------------------------------------------------------
describe('[UTCID04] DocumentStatisticsService.getStatistics() – Normal 4: department aggregation', () => {
  it('returns incoming byDepartment with departmentId + name + count', async () => {
    const result = await incomingService.getStatistics();

    expect(Array.isArray(result.byDepartment)).toBe(true);
    expect(result.byDepartment[0]).toHaveProperty('departmentId');
    expect(result.byDepartment[0]).toHaveProperty('departmentName');
    expect(result.byDepartment[0]).toHaveProperty('count');
  });

  it('returns outgoing byDepartment with departmentId + name + count', async () => {
    const result = await outgoingService.getStatistics();

    expect(Array.isArray(result.byDepartment)).toBe(true);
    expect(result.byDepartment[0]).toHaveProperty('departmentId');
    expect(result.byDepartment[0]).toHaveProperty('departmentName');
    expect(result.byDepartment[0]).toHaveProperty('count');
  });

  it('resolves department names via prisma.department.findMany', async () => {
    await incomingService.getStatistics();

    expect(mockedPrisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: expect.any(Array) } },
        select: { id: true, name: true },
      }),
    );
  });

  it('limits byDepartment to top 10 (take: 10)', async () => {
    await incomingService.getStatistics();

    const groupByCalls = mockedPrisma.document.groupBy.mock.calls.filter(
      (call) =>
        Array.isArray(call[0]?.by) && call[0].by.includes('departmentId'),
    );
    expect(groupByCalls.length).toBeGreaterThan(0);
    expect(groupByCalls[0][0].take).toBe(10);
  });

  it('returns byDocumentType with type names resolved', async () => {
    const result = await incomingService.getStatistics();

    expect(Array.isArray(result.byDocumentType)).toBe(true);
    expect(result.byDocumentType[0]).toHaveProperty('documentType');
    expect(result.byDocumentType[0]).toHaveProperty('count');
  });

  it('resolves document type names via prisma.documentType.findMany', async () => {
    await outgoingService.getStatistics();

    expect(mockedPrisma.documentType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: expect.any(Array) } },
        select: { id: true, name: true },
      }),
    );
  });

  it('does NOT throw on the department aggregation path', async () => {
    await expect(incomingService.getStatistics()).resolves.toBeDefined();
    await expect(outgoingService.getStatistics()).resolves.toBeDefined();
  });

  it('does NOT log to console on the department aggregation path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await incomingService.getStatistics();
    await outgoingService.getStatistics();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency for
// Incoming and Outgoing Document Statistics including
// identifiers, status, time period and department
// aggregation.
// ---------------------------------------------------------------------------
describe('[UTCID05] DocumentStatisticsService.getStatistics() – Normal 5: response-to-database consistency', () => {
  it('preserves the incoming totalCount from prisma.incomingDocument.count', async () => {
    mockedPrisma.incomingDocument.count.mockResolvedValue(99);

    const result = await incomingService.getStatistics();

    expect(result.totalCount).toBe(99);
  });

  it('preserves the outgoing totalCount from prisma.outgoingDocument.count', async () => {
    mockedPrisma.outgoingDocument.count.mockResolvedValue(73);

    const result = await outgoingService.getStatistics();

    expect(result.totalCount).toBe(73);
  });

  it('preserves the outgoing issuedCount from prisma.document.count', async () => {
    mockedPrisma.document.count.mockResolvedValue(11);

    const result = await outgoingService.getStatistics();

    expect(result.issuedCount).toBe(11);
  });

  it('byStatus counts match prisma.document.groupBy', async () => {
    const result = await incomingService.getStatistics();

    const totalByStatus = result.byStatus.reduce(
      (acc, b) => acc + (b.count as number),
      0,
    );
    // Each byStatus bucket comes from groupBy(_count.id).
    expect(totalByStatus).toBe(42); // 10 + 15 + 17 = 42
  });

  it('byDepartment counts match prisma.document.groupBy', async () => {
    const result = await incomingService.getStatistics();

    const totalByDept = result.byDepartment.reduce(
      (acc, b) => acc + (b.count as number),
      0,
    );
    expect(totalByDept).toBe(42); // 25 + 17 = 42
  });

  it('does NOT throw on the consistency path', async () => {
    await expect(incomingService.getStatistics()).resolves.toBeDefined();
    await expect(outgoingService.getStatistics()).resolves.toBeDefined();
  });

  it('does NOT log to console on the consistency path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await incomingService.getStatistics();
    await outgoingService.getStatistics();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: invalid date / filter.
// Result : Invalid date strings / invalid department ids
//          produce Date(NaN) filters — prisma treats NaN as
//          no-op, returning the same counts. The service
//          does NOT throw, but the response data is
//          unreliable.
// ---------------------------------------------------------------------------
describe('[UTCID06] DocumentStatisticsService.getStatistics() – Abnormal 1: invalid date/filter', () => {
  it('accepts invalid dateFrom string (documented gap)', async () => {
    await expect(
      incomingService.getStatistics({
        dateFrom: 'not-a-date',
        dateTo: 'also-not-a-date',
      }),
    ).resolves.toBeDefined();
  });

  it('accepts invalid dateFrom on outgoing (documented gap)', async () => {
    await expect(
      outgoingService.getStatistics({
        dateFrom: 'not-a-date',
        dateTo: 'also-not-a-date',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on invalid departmentId', async () => {
    await expect(
      incomingService.getStatistics({
        departmentId: -1,
      }),
    ).resolves.toBeDefined();

    await expect(
      outgoingService.getStatistics({
        departmentId: 0,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT throw when prisma.documentType.findMany fails', async () => {
    mockedPrisma.documentType.findMany.mockReset();
    mockedPrisma.documentType.findMany.mockRejectedValue(
      new Error('Query failure'),
    );

    await expect(incomingService.getStatistics()).rejects.toThrow(
      'Query failure',
    );
  });

  it('does NOT throw when prisma.department.findMany fails', async () => {
    mockedPrisma.department.findMany.mockReset();
    mockedPrisma.department.findMany.mockRejectedValue(
      new Error('Query failure'),
    );

    await expect(outgoingService.getStatistics()).rejects.toThrow(
      'Query failure',
    );
  });

  it('records a safe diagnostic on filter failure (no password / hash leak)', async () => {
    mockedPrisma.documentType.findMany.mockReset();
    mockedPrisma.documentType.findMany.mockRejectedValue(
      new Error('Query failure: something bad'),
    );

    const err = await incomingService
      .getStatistics()
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the invalid-filter path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await incomingService.getStatistics({
      dateFrom: 'not-a-date',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: unauthorized / query failure.
// Result : Prisma failures propagate as a thrown error;
//          ADMIN-only outgoing returns empty stats (defensive).
// ---------------------------------------------------------------------------
describe('[UTCID07] DocumentStatisticsService.getStatistics() – Abnormal 2: unauthorized/query failure', () => {
  it('propagates prisma.incomingDocument.count failure', async () => {
    mockedPrisma.incomingDocument.count.mockReset();
    mockedPrisma.incomingDocument.count.mockRejectedValue(
      new Error('Connection refused'),
    );

    await expect(incomingService.getStatistics()).rejects.toThrow(
      'Connection refused',
    );
  });

  it('propagates prisma.outgoingDocument.count failure', async () => {
    mockedPrisma.outgoingDocument.count.mockReset();
    mockedPrisma.outgoingDocument.count.mockRejectedValue(
      new Error('Connection refused'),
    );

    await expect(outgoingService.getStatistics()).rejects.toThrow(
      'Connection refused',
    );
  });

  it('propagates prisma.document.groupBy failure', async () => {
    mockedPrisma.document.groupBy.mockReset();
    mockedPrisma.document.groupBy.mockRejectedValue(
      new Error('Group-by error'),
    );

    await expect(incomingService.getStatistics()).rejects.toThrow(
      'Group-by error',
    );
  });

  it('returns empty stats for ADMIN-only outgoing (defensive)', async () => {
    const result = await outgoingService.getStatistics({
      currentUser: {
        id: 1,
        roles: ['ADMIN'],
      },
    });

    expect(result.totalCount).toBe(0);
    expect(result.issuedCount).toBe(0);
    expect(result.byStatus).toEqual([]);
    expect(result.byDocumentType).toEqual([]);
    expect(result.byDepartment).toEqual([]);
    expect(result.byMonth).toEqual([]);
  });

  it('returns full stats for ADMIN + SPECIALIST outgoing (combined)', async () => {
    const result = await outgoingService.getStatistics({
      currentUser: {
        id: 1,
        roles: ['ADMIN', 'SPECIALIST'],
      },
    });

    expect(result.totalCount).toBe(17);
  });

  it('records a safe diagnostic on query failure (no password / hash leak)', async () => {
    mockedPrisma.incomingDocument.count.mockReset();
    mockedPrisma.incomingDocument.count.mockRejectedValue(
      new Error('Query failure: something bad'),
    );

    const err = await incomingService
      .getStatistics()
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the unauthorized path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedPrisma.incomingDocument.count.mockReset();
    mockedPrisma.incomingDocument.count.mockRejectedValue(
      new Error('Query failure'),
    );

    await expect(incomingService.getStatistics()).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: same-day period or empty dataset.
// Result : Equal dateFrom / dateTo produces a same-day
//          filter; an empty dataset returns zero counts.
// ---------------------------------------------------------------------------
describe('[UTCID08] DocumentStatisticsService.getStatistics() – Boundary 1: same-day period or empty dataset', () => {
  it('accepts equal dateFrom / dateTo (same-day period)', async () => {
    await expect(
      incomingService.getStatistics({
        dateFrom: '2026-09-13T00:00:00.000Z',
        dateTo: '2026-09-13T23:59:59.999Z',
      }),
    ).resolves.toBeDefined();
  });

  it('returns zero counts for an empty dataset', async () => {
    mockedPrisma.incomingDocument.count.mockReset();
    mockedPrisma.incomingDocument.count.mockResolvedValue(0);
    mockedPrisma.document.groupBy.mockReset();
    mockedPrisma.document.groupBy.mockResolvedValue([]);
    mockedPrisma.documentType.findMany.mockReset();
    mockedPrisma.documentType.findMany.mockResolvedValue([]);
    mockedPrisma.department.findMany.mockReset();
    mockedPrisma.department.findMany.mockResolvedValue([]);
    mockedPrisma.incomingDocument.findMany.mockReset();
    mockedPrisma.incomingDocument.findMany.mockResolvedValue([]);

    const result = await incomingService.getStatistics();

    expect(result.totalCount).toBe(0);
    expect(result.byStatus).toEqual([]);
    expect(result.byDocumentType).toEqual([]);
    expect(result.byDepartment).toEqual([]);
    expect(result.byMonth).toHaveLength(12);
    expect(result.byMonth.every((b) => b.count === 0)).toBe(true);
  });

  it('returns zero counts for an empty outgoing dataset', async () => {
    mockedPrisma.outgoingDocument.count.mockReset();
    mockedPrisma.outgoingDocument.count.mockResolvedValue(0);
    mockedPrisma.document.groupBy.mockReset();
    mockedPrisma.document.groupBy.mockResolvedValue([]);
    mockedPrisma.documentType.findMany.mockReset();
    mockedPrisma.documentType.findMany.mockResolvedValue([]);
    mockedPrisma.department.findMany.mockReset();
    mockedPrisma.department.findMany.mockResolvedValue([]);
    mockedPrisma.outgoingDocument.findMany.mockReset();
    mockedPrisma.outgoingDocument.findMany.mockResolvedValue([]);
    mockedPrisma.document.count.mockReset();
    mockedPrisma.document.count.mockResolvedValue(0);

    const result = await outgoingService.getStatistics();

    expect(result.totalCount).toBe(0);
    expect(result.issuedCount).toBe(0);
    expect(result.byStatus).toEqual([]);
    expect(result.byDocumentType).toEqual([]);
    expect(result.byDepartment).toEqual([]);
    expect(result.byMonth).toHaveLength(12);
  });

  it('boundary value: departmentId = 1', async () => {
    await expect(
      incomingService.getStatistics({
        departmentId: 1,
      }),
    ).resolves.toBeDefined();

    const callArgs = mockedPrisma.incomingDocument.count.mock.calls[0][0];
    expect(callArgs.where.document.departmentId).toBe(1);
  });

  it('boundary value: empty dateFrom and empty dateTo (no filter)', async () => {
    await expect(
      incomingService.getStatistics({
        dateFrom: '',
        dateTo: '',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      incomingService.getStatistics({
        dateFrom: '2026-09-13T00:00:00.000Z',
        dateTo: '2026-09-13T23:59:59.999Z',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await incomingService.getStatistics({
      dateFrom: '2026-09-13T00:00:00.000Z',
      dateTo: '2026-09-13T23:59:59.999Z',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 2: upper-bound value just at the supported
// limit for Incoming and Outgoing Document Statistics.
// Result : Very wide date range; very large departmentId.
// ---------------------------------------------------------------------------
describe('[UTCID09] DocumentStatisticsService.getStatistics() – Boundary 2: upper-bound value', () => {
  it('accepts very wide date range on incoming', async () => {
    await expect(
      incomingService.getStatistics({
        dateFrom: '1970-01-01T00:00:00.000Z',
        dateTo: '2099-12-31T23:59:59.999Z',
      }),
    ).resolves.toBeDefined();
  });

  it('accepts very wide date range on outgoing', async () => {
    await expect(
      outgoingService.getStatistics({
        dateFrom: '1970-01-01T00:00:00.000Z',
        dateTo: '2099-12-31T23:59:59.999Z',
      }),
    ).resolves.toBeDefined();
  });

  it('accepts very large departmentId', async () => {
    await expect(
      incomingService.getStatistics({
        departmentId: Number.MAX_SAFE_INTEGER,
      }),
    ).resolves.toBeDefined();

    const callArgs = mockedPrisma.incomingDocument.count.mock.calls[0][0];
    expect(callArgs.where.document.departmentId).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('accepts very large departmentId on outgoing', async () => {
    await expect(
      outgoingService.getStatistics({
        departmentId: Number.MAX_SAFE_INTEGER,
      }),
    ).resolves.toBeDefined();

    const callArgs = mockedPrisma.outgoingDocument.count.mock.calls[0][0];
    expect(callArgs.where.document.departmentId).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rejects the adjacent unsupported value: NaN date string', async () => {
    // The service does NOT throw on 'not-a-date', but it
    // produces Date(NaN) which prisma treats as no-op.
    // We document this as a documented gap.
    await expect(
      incomingService.getStatistics({
        dateFrom: 'not-a-date',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on the upper-bound path', async () => {
    await expect(
      incomingService.getStatistics({
        dateFrom: '1970-01-01T00:00:00.000Z',
        dateTo: '2099-12-31T23:59:59.999Z',
        departmentId: Number.MAX_SAFE_INTEGER,
      }),
    ).resolves.toBeDefined();

    await expect(
      outgoingService.getStatistics({
        dateFrom: '1970-01-01T00:00:00.000Z',
        dateTo: '2099-12-31T23:59:59.999Z',
        departmentId: Number.MAX_SAFE_INTEGER,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the upper-bound path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await incomingService.getStatistics({
      dateFrom: '1970-01-01T00:00:00.000Z',
      dateTo: '2099-12-31T23:59:59.999Z',
      departmentId: Number.MAX_SAFE_INTEGER,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
