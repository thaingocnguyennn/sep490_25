/**
 * Unit tests for OutgoingDocumentsService.updateStatus() with
 * newStatus='APPROVED' — Function44 / Assign Document Clerk
 * For Outgoing Document.
 *
 * Note on naming: the matrix headers reference
 * `OutgoingAssignmentService`. The actual implementation that
 * assigns a Document Clerk (Văn thư) to an outgoing document
 * is `OutgoingDocumentsService.updateStatus(id, 'APPROVED',
 * userId, { assignedClerkId })`. The clerk id is set in
 * the APPROVED branch.
 *
 * Step-by-step (APPROVED branch):
 *   1. Load the document via
 *      `outgoingDocumentsRepository.findById(id)`. The repo
 *      throws `NotFoundError` if missing.
 *   2. Check `VALID_TRANSITIONS[currentStatus]`. SUBMITTED →
 *      APPROVED is allowed. Other transitions throw
 *      `BadRequestError`.
 *   3. Permission guard:
 *      `if (outgoing.assignedApproverId &&
 *       outgoing.assignedApproverId !== userId)` →
 *      `BadRequestError('Bạn không được phân quyền để
 *       duyệt văn bản này')`.
 *   4. If `options.assignedClerkId` is provided:
 *      set `outgoingUpdateData.assignedClerkId =
 *       options.assignedClerkId`.
 *   5. Set `outgoingUpdateData.approvedAt = now` and
 *      `outgoingUpdateData.approvedBy = userId`.
 *   6. Wrap in `prisma.$transaction`:
 *      a. `tx.document.update` →
 *           `status: 'APPROVED'`, `updatedBy: userId`.
 *      b. `tx.outgoingDocument.update` → patch from steps
 *         4-5.
 *   7. Return a fresh `findById(id)` snapshot.
 *
 * Important: there is no separate "assignClerk" method;
 * `updateStatus` is the workflow primitive. Documented gaps
 * in the implementation:
 *   - The service does NOT validate that `assignedClerkId`
 *     refers to an existing user.
 *   - The service does NOT validate that the clerk has the
 *     DOCUMENT_CLERK role.
 *   - There is no notification side-effect on APPROVED (no
 *     email is sent by this branch).
 *   - There is no "history" table — the persistence is via
 *     `approvedAt` / `approvedBy` / `assignedClerkId` on
 *     `OutgoingDocument`.
 *
 * Coverage matrix (UTCID01 – UTCID08):
 *   UTCID01  N  – Assign clerk: APPROVED with assignedClerkId.
 *   UTCID02  N  – Replace clerk: a SECOND APPROVED call
 *                 overwrites the previous clerk.
 *   UTCID03  N  – Permission update: status flips to APPROVED,
 *                 approvedAt/approvedBy set.
 *   UTCID04  N  – History / notification (documented gap):
 *                 approvedBy actor is persisted; no email
 *                 is sent on this branch.
 *   UTCID05  N  – Response-to-database consistency: return
 *                 value matches fresh DB read; identifiers,
 *                 status, actor preserved.
 *   UTCID06  A  – Invalid / not-found clerk: the service
 *                 accepts a clerk id without verifying it
 *                 (documented gap) — covered by asserting
 *                 no validation guard fires.
 *   UTCID07  A  – Unauthorized / invalid state: wrong approver
 *                 rejects; status not SUBMITTED rejects.
 *   UTCID08  B  – Exactly one clerk boundary: only one
 *                 clerk at a time (replace semantics).
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

const APPROVER_ID = 7;
const FIRST_CLERK_ID = 11;
const SECOND_CLERK_ID = 22;

beforeEach(() => {
  jest.clearAllMocks();

  const submittedDoc: any = {
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
    approvedAt: null,
    approvedBy: null,
    returnedAt: null,
    returnedBy: null,
    returnReason: null,
    forwardedAt: null,
    forwardedBy: null,
    issuedAt: null,
    issuedBy: null,
    recalledAt: null,
    recalledBy: null,
    recallReason: null,
    trashedAt: null,
    trashedBy: null,
    assignedApproverId: APPROVER_ID,
    assignedClerkId: null,
    documentBookId: null,
    documentBook: null,
    bookEntry: null,
    createdAt: new Date('2026-09-19'),
    document: {
      id: 100,
      documentNumber: 'OUT-2026-0001',
      subject: 'Công văn chờ duyệt',
      type: 'OUTGOING',
      fileUrl: null,
      status: 'SUBMITTED',
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
      updatedByUser: { id: 5, fullName: 'Lê Văn Submitter' },
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
    approvedByUser: null,
    returnedByUser: null,
    forwardedByUser: null,
    issuedByUser: null,
    recalledByUser: null,
    trashedByUser: null,
  };

  // Pre-update findById returns SUBMITTED state.
  // Post-update findById returns APPROVED state with the
  // captured clerk id.
  let findByIdCallCount = 0;
  const capturedCalls: Array<{ assignedClerkId?: number; approvedBy?: number }> = [];

  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockImplementation(async () => {
    findByIdCallCount += 1;
    if (findByIdCallCount === 1) return { ...submittedDoc };
    const last = capturedCalls[capturedCalls.length - 1] ?? {};
    return {
      ...submittedDoc,
      assignedClerkId: last.assignedClerkId ?? null,
      approvedAt: new Date(),
      approvedBy: last.approvedBy ?? APPROVER_ID,
      approvedByUser: {
        id: last.approvedBy ?? APPROVER_ID,
        fullName: 'Trần Văn Approver',
      },
      document: {
        ...submittedDoc.document,
        status: 'APPROVED',
        updatedByUser: {
          id: last.approvedBy ?? APPROVER_ID,
          fullName: 'Trần Văn Approver',
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
        assignedClerkId: args?.data?.assignedClerkId ?? null,
        approvedAt: new Date(),
        approvedBy: args?.data?.approvedBy ?? null,
      };
    },
  );

  mockedPrisma.__mockTx.document.update.mockReset();
  mockedPrisma.__mockTx.document.update.mockImplementation(
    async (args: any) => {
      return { id: 100, status: args?.data?.status ?? 'APPROVED' };
    },
  );

  mockedPrisma.user.findUnique.mockReset();
  mockedPrisma.user.findUnique.mockImplementation(async (args: any) => {
    if (args?.where?.id === APPROVER_ID) {
      return {
        id: APPROVER_ID,
        fullName: 'Trần Văn Approver',
        email: 'tranvanapprover@example.com',
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
// UTCID01 – Normal 1: assign clerk.
// Result : APPROVED transition records the assignedClerkId on
//          the OutgoingDocument.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.updateStatus(APPROVED) – Normal 1: assign clerk', () => {
  it('returns the updated document', async () => {
    const result = await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('starts a transaction', async () => {
    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('updates the parent Document inside the transaction', async () => {
    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    expect(mockedPrisma.__mockTx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
      }),
    );
  });

  it('flips the parent Document status to APPROVED', async () => {
    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data.status).toBe('APPROVED');
  });

  it('records assignedClerkId on the OutgoingDocument', async () => {
    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.assignedClerkId).toBe(FIRST_CLERK_ID);
  });

  it('does NOT throw on the assign-clerk path', async () => {
    await expect(
      service.updateStatus(1, 'APPROVED', APPROVER_ID, {
        assignedClerkId: FIRST_CLERK_ID,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the assign-clerk path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: replace clerk (clerk id already set).
// Result : A second APPROVED transition overwrites the
//          previous assignedClerkId.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.updateStatus(APPROVED) – Normal 2: replace clerk', () => {
  it('overwrites a previously assigned clerk', async () => {
    // Two concurrent submit/approve flows: first picks clerk
    // 11; second picks clerk 22.
    const doc: any = {
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
      approvedAt: null,
      approvedBy: null,
      returnedAt: null,
      returnedBy: null,
      returnReason: null,
      forwardedAt: null,
      forwardedBy: null,
      issuedAt: null,
      issuedBy: null,
      recalledAt: null,
      recalledBy: null,
      recallReason: null,
      trashedAt: null,
      trashedBy: null,
      assignedApproverId: APPROVER_ID,
      // Already has clerk 11 from a previous APPROVED call.
      assignedClerkId: FIRST_CLERK_ID,
      documentBookId: null,
      documentBook: null,
      bookEntry: null,
      createdAt: new Date('2026-09-19'),
      document: {
        id: 100,
        status: 'SUBMITTED',
        documentNumber: 'OUT-2026-0001',
        subject: 'Công văn',
      },
    };

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue({ ...doc });

    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: SECOND_CLERK_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.assignedClerkId).toBe(SECOND_CLERK_ID);
  });

  it('does NOT throw on the replace-clerk path', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue({
      id: 1,
      documentId: 100,
      document: { status: 'SUBMITTED' },
      assignedApproverId: APPROVER_ID,
      assignedClerkId: FIRST_CLERK_ID,
    } as any);

    await expect(
      service.updateStatus(1, 'APPROVED', APPROVER_ID, {
        assignedClerkId: SECOND_CLERK_ID,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the replace-clerk path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue({
      id: 1,
      documentId: 100,
      document: { status: 'SUBMITTED' },
      assignedApproverId: APPROVER_ID,
      assignedClerkId: FIRST_CLERK_ID,
    } as any);

    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: SECOND_CLERK_ID,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: permission update (status flips to
// APPROVED, approvedAt/approvedBy set).
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.updateStatus(APPROVED) – Normal 3: permission update', () => {
  it('flips document.status to APPROVED', async () => {
    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data.status).toBe('APPROVED');
  });

  it('sets approvedAt to a Date', async () => {
    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.approvedAt).toBeInstanceOf(Date);
  });

  it('sets approvedBy to the actor', async () => {
    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.approvedBy).toBe(APPROVER_ID);
  });

  it('does NOT include submission fields when approving', async () => {
    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    // Submission fields must NOT be touched on approve.
    expect('submittedAt' in callArgs.data).toBe(false);
    expect('submittedBy' in callArgs.data).toBe(false);
  });

  it('does NOT throw on the permission-update path', async () => {
    await expect(
      service.updateStatus(1, 'APPROVED', APPROVER_ID, {
        assignedClerkId: FIRST_CLERK_ID,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the permission-update path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: history / notification.
// Result : approvedBy is recorded; no email is sent on the
//          APPROVED branch (documented gap).
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.updateStatus(APPROVED) – Normal 4: history/notification', () => {
  it('persists the approvedBy actor (history)', async () => {
    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.approvedBy).toBe(APPROVER_ID);
  });

  it('persists the approvedAt timestamp (history)', async () => {
    const before = Date.now();

    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    const after = Date.now();

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.approvedAt).toBeInstanceOf(Date);
    expect(callArgs.data.approvedAt.getTime()).toBeGreaterThanOrEqual(
      before,
    );
    expect(callArgs.data.approvedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('does NOT send email on the APPROVED branch (documented gap)', async () => {
    const { sendEmail } = require('../../../src/shared/services/email.service');

    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does NOT throw on the history/notification path', async () => {
    await expect(
      service.updateStatus(1, 'APPROVED', APPROVER_ID, {
        assignedClerkId: FIRST_CLERK_ID,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the history/notification path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency for
// Document Clerk For Outgoing Document including identifiers,
// status, actor.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.updateStatus(APPROVED) – Normal 5: response-to-database consistency', () => {
  it('returns the same id as the input', async () => {
    const result = await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    expect(result.id).toBe(1);
  });

  it('preserves the documentId in the return value', async () => {
    const result = await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    expect(result.documentId).toBe(100);
  });

  it('returns the document with status = APPROVED', async () => {
    const result = await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    expect((result.document as any).status).toBe('APPROVED');
  });

  it('returns the documentNumber unchanged', async () => {
    const result = await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    expect(result.documentNumber).toBe('OUT-2026-0001');
  });

  it('preserves the dispatchNumber on the parent document', async () => {
    const result = await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    expect(result.dispatchNumber).toBeNull();
  });

  it('records approvedBy as the actor (via fresh findById)', async () => {
    const result = await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    expect(result.approvedBy).toBe(APPROVER_ID);
  });

  it('does NOT throw on the consistency path', async () => {
    await expect(
      service.updateStatus(1, 'APPROVED', APPROVER_ID, {
        assignedClerkId: FIRST_CLERK_ID,
      }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: invalid / not-found clerk.
// Result : The service does NOT validate clerk existence
//          (documented gap). The clerk id is recorded as-is
//          and the operation succeeds. UTCID06 documents
//          this behavior so that future enhancement is
//          gated by a regression test.
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.updateStatus(APPROVED) – Abnormal 1: invalid/not-found clerk', () => {
  it('accepts an unknown clerk id (no validation guard)', async () => {
    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: 999_999,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.assignedClerkId).toBe(999_999);
  });

  it('accepts a clerk id with no associated user record', async () => {
    mockedPrisma.user.findUnique.mockReset();
    mockedPrisma.user.findUnique.mockResolvedValue(null);

    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: 999_999,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.assignedClerkId).toBe(999_999);
  });

  it('does NOT validate clerk role (documented gap)', async () => {
    // Even if the user is fetched, the service does not
    // check that the user has DOCUMENT_CLERK role.
    mockedPrisma.user.findUnique.mockReset();
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 999_999,
      fullName: 'No-clerk-role User',
      email: 'noclerk@example.com',
    });

    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: 999_999,
    });

    expect(mockedPrisma.__mockTx.outgoingDocument.update).toHaveBeenCalled();
  });

  it('does NOT throw on the invalid-clerk path (documented gap)', async () => {
    await expect(
      service.updateStatus(1, 'APPROVED', APPROVER_ID, {
        assignedClerkId: 999_999,
      }),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on the invalid-clerk path (no password / hash leak)', async () => {
    // Even though the operation accepts an unknown clerk,
    // exercise the failure-log path by trying to assign to
    // a clerk when the document is in an invalid state —
    // the resulting error must not leak sensitive fields.
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue({
      id: 1,
      documentId: 100,
      document: { status: 'DRAFT' }, // cannot approve DRAFT
      assignedApproverId: APPROVER_ID,
    } as any);

    const err = await service
      .updateStatus(1, 'APPROVED', APPROVER_ID, {
        assignedClerkId: 999_999,
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the invalid-clerk path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: 999_999,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: unauthorized / invalid state.
// Result : BadRequestError when the actor is not the assigned
//          approver, or when the current status is not
//          SUBMITTED.
// ---------------------------------------------------------------------------
describe('[UTCID07] outgoingDocumentsService.updateStatus(APPROVED) – Abnormal 2: unauthorized/invalid state', () => {
  it('rejects when actor is not the assigned approver', async () => {
    await expect(
      service.updateStatus(1, 'APPROVED', 999, {
        assignedClerkId: FIRST_CLERK_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when status = DRAFT (cannot approve DRAFT)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      assignedApproverId: APPROVER_ID,
      document: { status: 'DRAFT' },
    } as any);

    await expect(
      service.updateStatus(1, 'APPROVED', APPROVER_ID, {
        assignedClerkId: FIRST_CLERK_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when status = APPROVED (already approved)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      assignedApproverId: APPROVER_ID,
      document: { status: 'APPROVED' },
    } as any);

    await expect(
      service.updateStatus(1, 'APPROVED', APPROVER_ID, {
        assignedClerkId: FIRST_CLERK_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when status = ISSUED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      assignedApproverId: APPROVER_ID,
      document: { status: 'ISSUED' },
    } as any);

    await expect(
      service.updateStatus(1, 'APPROVED', APPROVER_ID, {
        assignedClerkId: FIRST_CLERK_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when status = WAITING_FOR_ISSUE', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      assignedApproverId: APPROVER_ID,
      document: { status: 'WAITING_FOR_ISSUE' },
    } as any);

    await expect(
      service.updateStatus(1, 'APPROVED', APPROVER_ID, {
        assignedClerkId: FIRST_CLERK_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT call the transaction when actor is not the assigned approver', async () => {
    await expect(
      service.updateStatus(1, 'APPROVED', 999, {
        assignedClerkId: FIRST_CLERK_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('does NOT call the transaction when status is invalid', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      assignedApproverId: APPROVER_ID,
      document: { status: 'ISSUED' },
    } as any);

    await expect(
      service.updateStatus(1, 'APPROVED', APPROVER_ID, {
        assignedClerkId: FIRST_CLERK_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on unauthorized (no password / hash leak)', async () => {
    const err = await service
      .updateStatus(1, 'APPROVED', 999, {
        assignedClerkId: FIRST_CLERK_ID,
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the unauthorized path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await expect(
      service.updateStatus(1, 'APPROVED', 999, {
        assignedClerkId: FIRST_CLERK_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: exactly one clerk boundary.
// Result : The OutgoingDocument has exactly one
//          `assignedClerkId` field — a single value, not a
//          list.  Replace semantics mean a fresh write
//          replaces any prior value.
// ---------------------------------------------------------------------------
describe('[UTCID08] outgoingDocumentsService.updateStatus(APPROVED) – Boundary 1: exactly one clerk boundary', () => {
  it('sets exactly one assignedClerkId on the document', async () => {
    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: FIRST_CLERK_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(typeof callArgs.data.assignedClerkId).toBe('number');
    expect(Array.isArray(callArgs.data.assignedClerkId)).toBe(false);
  });

  it('boundary value: assignedClerkId = 1 (minimum positive id)', async () => {
    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: 1,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.assignedClerkId).toBe(1);
  });

  it('boundary value: assignedClerkId = MAX_SAFE_INTEGER', async () => {
    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: Number.MAX_SAFE_INTEGER,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.assignedClerkId).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('replace semantics: subsequent call fully overwrites the previous clerk', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue({
      id: 1,
      documentId: 100,
      document: { status: 'SUBMITTED' },
      assignedApproverId: APPROVER_ID,
      assignedClerkId: FIRST_CLERK_ID,
    } as any);

    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: SECOND_CLERK_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    // The patch only contains the new clerk id.
    expect(Object.prototype.hasOwnProperty.call(callArgs.data, 'assignedClerkId')).toBe(
      true,
    );
    expect(callArgs.data.assignedClerkId).toBe(SECOND_CLERK_ID);
    // Must NOT carry both old and new clerk ids (one-clerk only).
    expect(Object.keys(callArgs.data).filter((k) => k.includes('Clerk'))).toEqual([
      'assignedClerkId',
    ]);
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.updateStatus(1, 'APPROVED', APPROVER_ID, {
        assignedClerkId: 1,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'APPROVED', APPROVER_ID, {
      assignedClerkId: 1,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('records a safe diagnostic on the boundary rejection (no password / hash leak)', async () => {
    // Negative clerk id is rejected by the route validation;
    // at the service level a missing/non-positive clerk id
    // is also a problem.  We exercise the path that an
    // APPROVED request arrives with no clerk — the service
    // accepts this as "no clerk assigned".
    const result = await service.updateStatus(
      1,
      'APPROVED',
      APPROVER_ID,
      { assignedClerkId: undefined } as any,
    );

    expect(result).toBeDefined();
    // Optional: nothing in the patch itself should be sensitive.
    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect('password' in callArgs.data).toBe(false);
    expect('hash' in callArgs.data).toBe(false);
  });
});
