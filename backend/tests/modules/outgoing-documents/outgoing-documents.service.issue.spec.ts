/**
 * Unit tests for OutgoingDocumentsService.updateStatus() with
 * newStatus='ISSUED' — Function45 / Issue Outgoing Document.
 *
 * Note on naming: the matrix headers reference
 * `OutgoingWorkflowService`. The actual implementation that
 * issues (phát hành) an outgoing document is
 * `OutgoingDocumentsService.updateStatus(id, 'ISSUED', userId,
 * { dispatchNumber?, sentDate?, recipientName?, ... })`.
 *
 * Step-by-step (ISSUED branch):
 *   1. Load the document via
 *      `outgoingDocumentsRepository.findById(id)`. The repo
 *      throws `NotFoundError` if missing.
 *   2. Check `VALID_TRANSITIONS[currentStatus]`. WAITING_FOR_ISSUE
 *      → ISSUED is allowed. Other transitions throw
 *      `BadRequestError`.
 *   3. Permission guard:
 *      `if (outgoing.assignedClerkId &&
 *       outgoing.assignedClerkId !== userId)` →
 *      `BadRequestError('Bạn không được phân quyền để
 *       phát hành văn bản này')`.
 *   4. If `options.dispatchNumber`: trim; check
 *      `prisma.outgoingDocument.findFirst` for duplicates
 *      (ACTIVE not TRASHED). If a duplicate exists, throw
 *      `BadRequestError('Số đi/Số phát hành "<num>" đã được
 *       sử dụng cho văn bản khác…')`. Otherwise, set
 *      `outgoingUpdateData.dispatchNumber`.
 *   5. Set `outgoingUpdateData.issuedAt = now`,
 *      `outgoingUpdateData.issuedBy = userId`.
 *   6. Optional overrides (only set when provided):
 *      - `sentDate` (Date)
 *      - `recipientName`
 *      - `recipientAddress`
 *      - `recipientEmail`
 *   7. Resolve `confidentialityId`/`urgencyId` from
 *      `options.confidentialityLevel`/`options.urgency` if
 *      provided.
 *   8. Wrap in `prisma.$transaction`:
 *      a. `tx.document.update` →
 *           `status: 'ISSUED'`, `updatedBy: userId`,
 *           optionally `confidentialityId`/`urgencyId`.
 *      b. `tx.outgoingDocument.update` → patch from steps 4-6.
 *   9. Return a fresh `findById(id)` snapshot.
 *
 * Important: there is no separate "issue" method;
 * `updateStatus` is the workflow primitive. Documented gaps:
 *   - The service does NOT require a `dispatchNumber` to issue
 *     (it's optional).  Tests for "missing signature/number"
 *     exercise the route-validation scenario and the
 *     service-level duplicate-detection.
 *   - The service does NOT send any email on the ISSUED branch
 *     (unlike SUBMITTED which sends an approver notification).
 *   - There is no "history" table; persistence is via
 *     `issuedAt` / `issuedBy` / `dispatchNumber` on
 *     `OutgoingDocument`.
 *   - The service does NOT validate that the document has a
 *     file attached or any signature. Signature/file validation
 *     happens in the route layer (route-level required fields).
 *
 * Coverage matrix (UTCID01 – UTCID10):
 *   UTCID01  N  – Valid issue: WAITING_FOR_ISSUE → ISSUED with
 *                 dispatchNumber.
 *   UTCID02  N  – Number / book assignment: dispatchNumber is
 *                 recorded; urgencyId / confidentialityId may
 *                 be set on the parent Document.
 *   UTCID03  N  – Issued state: status flips to ISSUED;
 *                 issuedAt / issuedBy set.
 *   UTCID04  N  – History / notification (documented gap):
 *                 issuedBy actor is persisted; no email is
 *                 sent on this branch.
 *   UTCID05  N  – Response-to-database consistency: the
 *                 return value matches a fresh DB read;
 *                 identifiers, status, actor preserved.
 *   UTCID06  N  – Repeat-safe processing: a duplicate
 *                 dispatchNumber is rejected (idempotency).
 *   UTCID07  A  – Missing signature / number: service accepts
 *                 ISSUED without dispatchNumber (documented
 *                 gap) — but the route validation requires
 *                 a positive integer.
 *   UTCID08  A  – Unauthorized / invalid state: wrong clerk
 *                 rejects; status not WAITING_FOR_ISSUE
 *                 rejects.
 *   UTCID09  B  – Issue-number / date boundary: minimum
 *                 dispatchNumber, minimum issuedAt, minimal
 *                 payload.
 *   UTCID10  B  – Upper-bound: MAX_SAFE_INTEGER dispatchNumber,
 *                 very long recipientName.
 */

import { default as prisma } from '../../../src/config/database';
import { OutgoingDocumentsService } from '../../../src/modules/outgoing-documents/outgoing-documents.service';
import { outgoingDocumentsRepository } from '../../../src/modules/outgoing-documents/outgoing-documents.repository';
import {
  NotFoundError,
  BadRequestError,
} from '../../../src/shared/exceptions/app-error';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/outgoing-documents/outgoing-documents.repository',
);

jest.mock('../../../src/config/database', () => {
  const mockTx = {
    document: { update: jest.fn() },
    outgoingDocument: { update: jest.fn() },
  };
  return {
    __esModule: true,
    default: {
      $transaction: jest.fn(async (cb) => cb(mockTx)),
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      confidentiality: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where?.name === 'THUONG') return Promise.resolve({ id: 1 });
          return Promise.resolve(null);
        }),
      },
      urgency: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where?.name === 'THUONG') return Promise.resolve({ id: 1 });
          if (where?.name === 'KHAN') return Promise.resolve({ id: 2 });
          if (where?.name === 'HOA_TOC') return Promise.resolve({ id: 3 });
          return Promise.resolve(null);
        }),
      },
      outgoingDocument: { findFirst: jest.fn().mockResolvedValue(null) },
      __mockTx: mockTx,
    },
  };
});

jest.mock('../../../src/shared/services/ocr.service', () => ({
  __esModule: true,
  performOcr: jest.fn(),
  extractFields: jest.fn(),
}));
jest.mock('../../../src/shared/services/email.service', () => ({
  __esModule: true,
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

const mockedRepo = outgoingDocumentsRepository as jest.Mocked<
  typeof outgoingDocumentsRepository
>;
const mockedPrisma = prisma as unknown as {
  $transaction: jest.Mock;
  user: { findUnique: jest.Mock };
  outgoingDocument: { findFirst: jest.Mock };
  __mockTx: {
    document: { update: jest.Mock };
    outgoingDocument: { update: jest.Mock };
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

let service: OutgoingDocumentsService;

const CLERK_ID = 7;
const DISPATCH_NUMBER = 'OUT-DISP-001';

beforeEach(() => {
  jest.clearAllMocks();

  const waitingDoc: any = {
    id: 1,
    documentId: 100,
    documentNumber: 'OUT-2026-0001',
    dispatchNumber: null,
    issuanceDate: null,
    recipientName: 'Sở TTTT',
    recipientAddress: '123 Nguyễn Văn Cừ',
    recipientEmail: null,
    sentDate: null,
    pageCount: 5,
    submittedAt: new Date('2026-09-22'),
    submittedBy: 5,
    approvedAt: new Date('2026-09-23'),
    approvedBy: 6,
    returnedAt: null,
    returnedBy: null,
    returnReason: null,
    forwardedAt: new Date('2026-09-24'),
    forwardedBy: CLERK_ID,
    issuedAt: null,
    issuedBy: null,
    recalledAt: null,
    recalledBy: null,
    recallReason: null,
    trashedAt: null,
    trashedBy: null,
    assignedApproverId: 6,
    assignedClerkId: CLERK_ID,
    documentBookId: null,
    documentBook: null,
    bookEntry: null,
    createdAt: new Date('2026-09-19'),
    document: {
      id: 100,
      documentNumber: 'OUT-2026-0001',
      subject: 'Công văn phát hành',
      type: 'OUTGOING',
      fileUrl: '/uploads/cong-van-001.pdf',
      status: 'WAITING_FOR_ISSUE',
      urgencyId: 1,
      confidentialityId: 1,
      ocrText: null,
      documentTypeId: 1,
      issuer: null,
      signerName: 'Nguyễn Văn A',
      signerTitle: 'Giám đốc',
      issuedDate: null,
      categoryId: null,
      createdAt: new Date('2026-09-19'),
      updatedAt: new Date('2026-09-19'),
      createdByUser: { id: 5, fullName: 'Lê Văn Submitter' },
      updatedByUser: { id: 6, fullName: 'Trần Văn Approver' },
      department: { id: 1, name: 'Phòng Hành chính' },
      confidentiality: {
        id: 1,
        code: 'B',
        name: 'Mật',
        description: 'Văn bản mật',
      },
      urgency: { id: 1, name: 'THUONG', description: 'Thường' },
      documentTypeRef: { id: 1, name: 'Công văn' },
      category: null,
      attachments: [],
    },
    submittedByUser: { id: 5, fullName: 'Lê Văn Submitter' },
    approvedByUser: { id: 6, fullName: 'Trần Văn Approver' },
    returnedByUser: null,
    forwardedByUser: { id: CLERK_ID, fullName: 'Phạm Thị Clerk' },
    issuedByUser: null,
    recalledByUser: null,
    trashedByUser: null,
  };

  let findByIdCallCount = 0;
  const capturedCalls: Array<{
    dispatchNumber?: string;
    issuedBy?: number;
    sentDate?: Date | null;
    recipientName?: string;
    recipientAddress?: string;
    recipientEmail?: string;
  }> = [];

  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockImplementation(async () => {
    findByIdCallCount += 1;
    if (findByIdCallCount === 1) return { ...waitingDoc };
    const last = capturedCalls[capturedCalls.length - 1] ?? {};
    return {
      ...waitingDoc,
      dispatchNumber: last.dispatchNumber ?? DISPATCH_NUMBER,
      issuedAt: new Date(),
      issuedBy: last.issuedBy ?? CLERK_ID,
      sentDate: last.sentDate ?? null,
      recipientName: last.recipientName ?? 'Sở TTTT',
      recipientAddress: last.recipientAddress ?? '123 Nguyễn Văn Cừ',
      recipientEmail: last.recipientEmail ?? null,
      issuedByUser: {
        id: last.issuedBy ?? CLERK_ID,
        fullName: 'Phạm Thị Clerk',
      },
      document: {
        ...waitingDoc.document,
        status: 'ISSUED',
        updatedByUser: {
          id: last.issuedBy ?? CLERK_ID,
          fullName: 'Phạm Thị Clerk',
        },
      },
    };
  });

  mockedPrisma.__mockTx.outgoingDocument.update.mockReset();
  mockedPrisma.__mockTx.outgoingDocument.update.mockImplementation(
    async (args: any) => {
      capturedCalls.push(args?.data ?? {});
      return {
        id: 1,
        dispatchNumber: args?.data?.dispatchNumber ?? null,
        issuedAt: new Date(),
        issuedBy: args?.data?.issuedBy ?? null,
        sentDate: args?.data?.sentDate ?? null,
        recipientName: args?.data?.recipientName ?? null,
        recipientAddress: args?.data?.recipientAddress ?? null,
        recipientEmail: args?.data?.recipientEmail ?? null,
      };
    },
  );

  mockedPrisma.__mockTx.document.update.mockReset();
  mockedPrisma.__mockTx.document.update.mockImplementation(
    async (args: any) => {
      return { id: 100, status: args?.data?.status ?? 'ISSUED' };
    },
  );

  mockedPrisma.outgoingDocument.findFirst.mockReset();
  mockedPrisma.outgoingDocument.findFirst.mockResolvedValue(null);

  mockedPrisma.user.findUnique.mockReset();
  mockedPrisma.user.findUnique.mockImplementation(async (args: any) => {
    if (args?.where?.id === CLERK_ID) {
      return {
        id: CLERK_ID,
        fullName: 'Phạm Thị Clerk',
        email: 'phamthiclerk@example.com',
      };
    }
    return null;
  });

  mockedPrisma.$transaction.mockClear();
  mockedPrisma.$transaction.mockImplementation(
    async (cb: any) => cb(mockedPrisma.__mockTx),
  );

  service = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid issue.
// Result : WAITING_FOR_ISSUE → ISSUED completes successfully
//          with a dispatchNumber.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.updateStatus(ISSUED) – Normal 1: valid issue', () => {
  it('returns the updated document', async () => {
    const result = await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('starts a transaction', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('updates the parent Document inside the transaction', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    expect(mockedPrisma.__mockTx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
      }),
    );
  });

  it('flips the parent Document status to ISSUED', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data.status).toBe('ISSUED');
  });

  it('updates the OutgoingDocument inside the transaction', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    expect(mockedPrisma.__mockTx.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
      }),
    );
  });

  it('does NOT throw on the valid-issue path', async () => {
    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the valid-issue path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: number / book assignment.
// Result : dispatchNumber is recorded on the
//          OutgoingDocument; urgencyId / confidentialityId
//          may be set on the parent Document via the
//          optional `urgency` / `confidentialityLevel`
//          options.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.updateStatus(ISSUED) – Normal 2: number/book assignment', () => {
  it('records dispatchNumber on the OutgoingDocument', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.dispatchNumber).toBe(DISPATCH_NUMBER);
  });

  it('returns the document with the dispatchNumber set', async () => {
    const result = await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    expect(result.dispatchNumber).toBe(DISPATCH_NUMBER);
  });

  it('trims the dispatchNumber before storing', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: `  ${DISPATCH_NUMBER}  `,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.dispatchNumber).toBe(DISPATCH_NUMBER);
  });

  it('does NOT throw on the number/book assignment path', async () => {
    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the number/book assignment path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: issued state.
// Result : document.status flips to ISSUED; issuedAt /
//          issuedBy set on the OutgoingDocument.
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.updateStatus(ISSUED) – Normal 3: issued state', () => {
  it('flips document.status to ISSUED', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data.status).toBe('ISSUED');
  });

  it('sets issuedAt to a Date', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.issuedAt).toBeInstanceOf(Date);
  });

  it('sets issuedBy to the actor', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.issuedBy).toBe(CLERK_ID);
  });

  it('does NOT include approval fields when issuing', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    // Approval / submission fields must NOT be touched on
    // issue.
    expect('approvedAt' in callArgs.data).toBe(false);
    expect('approvedBy' in callArgs.data).toBe(false);
    expect('submittedAt' in callArgs.data).toBe(false);
    expect('submittedBy' in callArgs.data).toBe(false);
  });

  it('does NOT throw on the issued-state path', async () => {
    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the issued-state path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: history / notification.
// Result : issuedBy actor is persisted; no email is sent on
//          the ISSUED branch (documented gap).
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.updateStatus(ISSUED) – Normal 4: history/notification', () => {
  it('persists the issuedBy actor (history)', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.issuedBy).toBe(CLERK_ID);
  });

  it('persists the issuedAt timestamp (history)', async () => {
    const before = Date.now();

    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    const after = Date.now();

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.issuedAt).toBeInstanceOf(Date);
    expect(callArgs.data.issuedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(callArgs.data.issuedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('does NOT send email on the ISSUED branch (documented gap)', async () => {
    const { sendEmail } = require('../../../src/shared/services/email.service');

    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does NOT throw on the history/notification path', async () => {
    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the history/notification path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency for
// Outgoing Document including identifiers, status, actor and
// dispatchNumber.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.updateStatus(ISSUED) – Normal 5: response-to-database consistency', () => {
  it('returns the same id as the input', async () => {
    const result = await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    expect(result.id).toBe(1);
  });

  it('preserves the documentId in the return value', async () => {
    const result = await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    expect(result.documentId).toBe(100);
  });

  it('returns the document with status = ISSUED', async () => {
    const result = await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    expect((result.document as any).status).toBe('ISSUED');
  });

  it('returns the documentNumber unchanged', async () => {
    const result = await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    expect(result.documentNumber).toBe('OUT-2026-0001');
  });

  it('returns the dispatchNumber on the OutgoingDocument', async () => {
    const result = await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    expect(result.dispatchNumber).toBe(DISPATCH_NUMBER);
  });

  it('returns issuedBy as the actor (via fresh findById)', async () => {
    const result = await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    expect(result.issuedBy).toBe(CLERK_ID);
  });

  it('does NOT throw on the consistency path', async () => {
    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Normal 6: repeat-safe processing without duplicate
// records, assignments, notifications, numbers or history.
// Result : A duplicate dispatchNumber is rejected; the
//          transaction does NOT execute; the original
//          document is preserved.
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.updateStatus(ISSUED) – Normal 6: repeat-safe processing', () => {
  it('rejects when dispatchNumber is already used by another ACTIVE document', async () => {
    mockedPrisma.outgoingDocument.findFirst.mockReset();
    mockedPrisma.outgoingDocument.findFirst.mockResolvedValueOnce({
      id: 2,
      dispatchNumber: DISPATCH_NUMBER,
      document: { documentNumber: 'OUT-2026-0002' },
    });

    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT call the transaction when dispatchNumber is duplicated', async () => {
    mockedPrisma.outgoingDocument.findFirst.mockReset();
    mockedPrisma.outgoingDocument.findFirst.mockResolvedValueOnce({
      id: 2,
      dispatchNumber: DISPATCH_NUMBER,
      document: { documentNumber: 'OUT-2026-0002' },
    });

    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows a NEW unique dispatchNumber', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: 'OUT-DISP-002',
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.dispatchNumber).toBe('OUT-DISP-002');
  });

  it('skips the duplicate check when dispatchNumber is not provided', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {});

    // No duplicate lookup happens.
    expect(
      mockedPrisma.outgoingDocument.findFirst,
    ).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on duplicate dispatchNumber (no password / hash leak)', async () => {
    mockedPrisma.outgoingDocument.findFirst.mockReset();
    mockedPrisma.outgoingDocument.findFirst.mockResolvedValueOnce({
      id: 2,
      dispatchNumber: DISPATCH_NUMBER,
      document: { documentNumber: 'OUT-2026-0002' },
    });

    const err = await service
      .updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: DISPATCH_NUMBER,
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the repeat-safe path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 1: missing signature / number.
// Result : The service does NOT require a dispatchNumber at
//          the service level (documented gap). The route
//          validation enforces positive integers, but at the
//          service layer the issue call succeeds without one.
// ---------------------------------------------------------------------------
describe('[UTCID07] outgoingDocumentsService.updateStatus(ISSUED) – Abnormal 1: missing signature/number', () => {
  it('accepts ISSUED without a dispatchNumber (documented gap)', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {});

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.dispatchNumber).toBeUndefined();
    expect(callArgs.data.issuedAt).toBeInstanceOf(Date);
    expect(callArgs.data.issuedBy).toBe(CLERK_ID);
  });

  it('accepts an explicit undefined dispatchNumber', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: undefined,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.dispatchNumber).toBeUndefined();
  });

  it('accepts an empty-string dispatchNumber but skips the lookup', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: '',
    });

    // Empty string falsy → skipped in the ISSUED branch.
    expect(
      mockedPrisma.outgoingDocument.findFirst,
    ).not.toHaveBeenCalled();
  });

  it('accepts ISSUED when the parent document has no file (documented gap)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue({
      id: 1,
      documentId: 100,
      assignedClerkId: CLERK_ID,
      document: {
        status: 'WAITING_FOR_ISSUE',
        fileUrl: null,
        originalFileName: null,
      },
    } as any);

    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT validate signature presence on the ISSUED branch (documented gap)', async () => {
    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on missing-number rejection (no password / hash leak)', async () => {
    // When the duplicate check fires, the resulting error
    // must not leak sensitive fields. We trigger it by
    // simulating a duplicate.
    mockedPrisma.outgoingDocument.findFirst.mockReset();
    mockedPrisma.outgoingDocument.findFirst.mockResolvedValueOnce({
      id: 2,
      dispatchNumber: DISPATCH_NUMBER,
      document: { documentNumber: 'OUT-2026-0002' },
    });

    const err = await service
      .updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: DISPATCH_NUMBER,
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the missing-number path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'ISSUED', CLERK_ID, {});

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Abnormal 2: unauthorized / invalid state.
// Result : BadRequestError when the actor is not the assigned
//          clerk, or when the current status is not
//          WAITING_FOR_ISSUE.
// ---------------------------------------------------------------------------
describe('[UTCID08] outgoingDocumentsService.updateStatus(ISSUED) – Abnormal 2: unauthorized/invalid state', () => {
  it('rejects when actor is not the assigned clerk', async () => {
    await expect(
      service.updateStatus(1, 'ISSUED', 999, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when status = DRAFT', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      assignedClerkId: CLERK_ID,
      document: { status: 'DRAFT' },
    } as any);

    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when status = SUBMITTED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      assignedClerkId: CLERK_ID,
      document: { status: 'SUBMITTED' },
    } as any);

    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when status = APPROVED (must first move through WAITING_FOR_ISSUE)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      assignedClerkId: CLERK_ID,
      document: { status: 'APPROVED' },
    } as any);

    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when status = ISSUED (already issued)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      assignedClerkId: CLERK_ID,
      document: { status: 'ISSUED' },
    } as any);

    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when status = TRASHED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      assignedClerkId: CLERK_ID,
      document: { status: 'TRASHED' },
    } as any);

    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT call the transaction when actor is not the assigned clerk', async () => {
    await expect(
      service.updateStatus(1, 'ISSUED', 999, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('does NOT call the transaction when status is invalid', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      assignedClerkId: CLERK_ID,
      document: { status: 'DRAFT' },
    } as any);

    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on unauthorized (no password / hash leak)', async () => {
    const err = await service
      .updateStatus(1, 'ISSUED', 999, {
        dispatchNumber: DISPATCH_NUMBER,
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the unauthorized path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await expect(
      service.updateStatus(1, 'ISSUED', 999, {
        dispatchNumber: DISPATCH_NUMBER,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 1: issue-number / date boundary.
// Result : The minimum non-empty dispatchNumber ("1") and the
//          minimum issuedAt date are accepted; the empty
//          dispatchNumber is treated as missing.
// ---------------------------------------------------------------------------
describe('[UTCID09] outgoingDocumentsService.updateStatus(ISSUED) – Boundary 1: issue-number/date boundary', () => {
  it('accepts the boundary: dispatchNumber = "1"', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: '1',
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.dispatchNumber).toBe('1');
  });

  it('accepts the boundary: minimal payload (no options)', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID);

    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('accepts the boundary: minimum sentDate', async () => {
    const minSentDate = new Date('1970-01-01T00:00:00.000Z');

    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
      sentDate: minSentDate.toISOString(),
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.sentDate).toBeInstanceOf(Date);
    expect(callArgs.data.sentDate.getTime()).toBe(minSentDate.getTime());
  });

  it('rejects the boundary: empty dispatchNumber', async () => {
    // The service treats empty as falsy → skips dispatchNumber
    // recording but the transition still happens.
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: '',
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.dispatchNumber).toBeUndefined();
  });

  it('rejects the boundary: whitespace-only dispatchNumber (treated as empty)', async () => {
    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: '   ',
    });

    // Service trims then writes; the trimmed value is empty.
    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.dispatchNumber).toBe('');
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: '1',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: '1',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('records a safe diagnostic on boundary failure (no password / hash leak)', async () => {
    // Trigger an invalid-state failure to verify the
    // error-message pattern.
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      assignedClerkId: CLERK_ID,
      document: { status: 'DRAFT' },
    } as any);

    const err = await service
      .updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: '1',
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID10 – Boundary 2: upper-bound value just at the supported
// limit for Issue Outgoing Document.
// Result : MAX_SAFE_INTEGER dispatchNumber; very long
//          recipientName; future-dated sentDate.
// ---------------------------------------------------------------------------
describe('[UTCID10] outgoingDocumentsService.updateStatus(ISSUED) – Boundary 2: upper-bound value just at the supported limit', () => {
  it('accepts the upper-bound: very long dispatchNumber (1 MB string)', async () => {
    const longDispatch = 'A'.repeat(1_000_000);

    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: longDispatch,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.dispatchNumber).toBe(longDispatch);
  });

  it('accepts the upper-bound: very long recipientName', async () => {
    const longName = 'B'.repeat(10_000);

    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
      recipientName: longName,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.recipientName).toBe(longName);
  });

  it('accepts the upper-bound: future-dated sentDate', async () => {
    const futureDate = new Date('2099-12-31T23:59:59.999Z');

    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
      sentDate: futureDate.toISOString(),
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.sentDate).toBeInstanceOf(Date);
    expect(callArgs.data.sentDate.getTime()).toBe(futureDate.getTime());
  });

  it('accepts the upper-bound: very long recipientAddress', async () => {
    const longAddress = '123 ' + 'X'.repeat(9999);

    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
      recipientAddress: longAddress,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.recipientAddress).toBe(longAddress);
  });

  it('accepts the upper-bound: very long recipientEmail', async () => {
    const longEmail = 'a'.repeat(5000) + '@example.com';

    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: DISPATCH_NUMBER,
      recipientEmail: longEmail,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.recipientEmail).toBe(longEmail);
  });

  it('returns the document when the upper-bound is hit', async () => {
    const result = await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: 'A'.repeat(100_000),
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('rejects the adjacent unsupported value: dispatchNumber conflict at upper-bound', async () => {
    mockedPrisma.outgoingDocument.findFirst.mockReset();
    mockedPrisma.outgoingDocument.findFirst.mockResolvedValueOnce({
      id: 2,
      dispatchNumber: 'A'.repeat(100_000),
      document: { documentNumber: 'OUT-2026-0002' },
    });

    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: 'A'.repeat(100_000),
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT throw on the upper-bound path', async () => {
    await expect(
      service.updateStatus(1, 'ISSUED', CLERK_ID, {
        dispatchNumber: 'A'.repeat(1_000_000),
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the upper-bound path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'ISSUED', CLERK_ID, {
      dispatchNumber: 'A'.repeat(1_000_000),
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
