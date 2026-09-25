/**
 * Unit tests for OutgoingDocumentsService.updateStatus() with
 * newStatus='SUBMITTED' — Function43 / Submit Outgoing Document
 * For Approval.
 *
 * Note on naming: the matrix headers reference
 * `OutgoingWorkflowService`. The actual implementation that
 * submits an outgoing document for approval is
 * `OutgoingDocumentsService.updateStatus(id, 'SUBMITTED',
 * userId, { assignedApproverId })`.
 *
 * Step-by-step (SUBMITTED branch):
 *   1. Load the document via
 *      `outgoingDocumentsRepository.findById(id)`. The repo
 *      throws `NotFoundError` if missing.
 *   2. Check transition: `VALID_TRANSITIONS[DRAFT]` includes
 *      `SUBMITTED`. The service throws `BadRequestError` if
 *      the transition is invalid.
 *   3. Validate `options.assignedApproverId` — required; if
 *      absent, throws `BadRequestError('Vui lòng chọn người
 *      phê duyệt…')`.
 *   4. Build the OutgoingDocument patch:
 *      `assignedApproverId`, `submittedAt = now`,
 *      `submittedBy = userId`.
 *   5. Wrap in `prisma.$transaction`:
 *      a. `tx.document.update` →
 *           `status: 'SUBMITTED'`, `updatedBy: userId`.
 *      b. `tx.outgoingDocument.update` →
 *           patch from step 4.
 *   6. Notification: when `newStatus === 'SUBMITTED'` and
 *      `options.assignedApproverId`, the service fetches the
 *      submitter + approver (via `prisma.user.findUnique`) and
 *      calls `sendEmail`. Email failures are caught and
 *      logged via `console.warn`.
 *   7. Return a fresh `findById(id)` snapshot.
 *
 * Important: there is no separate `submitForApproval` method;
 * `updateStatus` is the workflow primitive that handles every
 * state transition.
 *
 * Coverage matrix (UTCID01 – UTCID09):
 *   UTCID01  N  – Valid submission: DRAFT → SUBMITTED with
 *                 assignedApproverId.
 *   UTCID02  N  – Validator / approver routing:
 *                 `assignedApproverId` is recorded.
 *   UTCID03  N  – State transition: `status` updates to
 *                 `SUBMITTED`; `submittedAt` and
 *                 `submittedBy` set.
 *   UTCID04  N  – History / notification: participation rows
 *                 (documented gap — implementation only logs
 *                 a warn on email failure); audit data
 *                 persisted via `submittedBy`/`submittedAt`.
 *   UTCID05  N  – Response-to-database consistency: the
 *                 return value matches a fresh DB read;
 *                 identifiers, status, actor preserved.
 *   UTCID06  A  – Missing required data: no
 *                 `assignedApproverId`.
 *   UTCID07  A  – Unauthorized / invalid state: status not
 *                 DRAFT (e.g., APPROVED) rejects.
 *   UTCID08  B  – Submission at deadline or minimum
 *                 attachment boundary: empty options object;
 *                 minimal payload.
 *   UTCID09  B  – Upper-bound value: large
 *                 `assignedApproverId`.
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

// Stub the outgoing-document service's transitive dependencies so Jest
// doesn't pull in pdfjs-dist / napi-rs/canvas at module-load time.
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

const APPROVER_ID = 99;
const SUBMITTER_ID = 7;

beforeEach(() => {
  jest.clearAllMocks();

  // ── Default: a DRAFT outgoing document belonging to user 7. ──
  const draftDoc: any = {
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
    submittedAt: null,
    submittedBy: null,
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
    assignedApproverId: null,
    assignedClerkId: null,
    documentBookId: null,
    documentBook: null,
    bookEntry: null,
    createdAt: new Date('2026-09-19'),
    document: {
      id: 100,
      documentNumber: 'OUT-2026-0001',
      subject: 'Trình duyệt công văn',
      type: 'OUTGOING',
      fileUrl: null,
      status: 'DRAFT',
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
      createdByUser: { id: 7, fullName: 'Trần Văn C' },
      updatedByUser: { id: 7, fullName: 'Trần Văn C' },
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
    submittedByUser: null,
    approvedByUser: null,
    returnedByUser: null,
    forwardedByUser: null,
    issuedByUser: null,
    recalledByUser: null,
    trashedByUser: null,
  };

  // Pre-update findById returns the DRAFT state; post-update
  // returns SUBMITTED.
  const submittedDoc: any = {
    ...draftDoc,
    assignedApproverId: APPROVER_ID,
    submittedAt: new Date('2026-09-25T08:00:00Z'),
    submittedBy: SUBMITTER_ID,
    document: {
      ...draftDoc.document,
      status: 'SUBMITTED',
      updatedByUser: { id: SUBMITTER_ID, fullName: 'Trần Văn C' },
    },
  };

  let findByIdCallCount = 0;
  // We let the post-update document reflect whatever the
  // service wrote via the OutgoingDocument update.
  const capturedCalls: Array<{ assignedApproverId?: number; submittedBy?: number }> = [];
  mockedPrisma.__mockTx.outgoingDocument.update.mockReset();
  mockedPrisma.__mockTx.outgoingDocument.update.mockImplementation(
    async (args: any) => {
      capturedCalls.push(args?.data ?? {});
      return {
        id: 1,
        assignedApproverId: args?.data?.assignedApproverId ?? null,
        submittedAt: new Date(),
        submittedBy: args?.data?.submittedBy ?? null,
      };
    },
  );

  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockImplementation(async () => {
    findByIdCallCount += 1;
    if (findByIdCallCount === 1) return { ...draftDoc };
    // Pick the latest captured actor.
    const last = capturedCalls[capturedCalls.length - 1] ?? {};
    return {
      ...submittedDoc,
      assignedApproverId: last.assignedApproverId ?? APPROVER_ID,
      submittedBy: last.submittedBy ?? SUBMITTER_ID,
    };
  });

  mockedPrisma.__mockTx.document.update.mockReset();
  mockedPrisma.__mockTx.document.update.mockImplementation(
    async (args: any) => {
      return { id: 100, status: args?.data?.status ?? 'SUBMITTED' };
    },
  );

  // prisma.user.findUnique: submitter (full record with
  // department) and approver (id, fullName, email).
  mockedPrisma.user.findUnique.mockReset();
  mockedPrisma.user.findUnique.mockImplementation(async (args: any) => {
    if (args?.where?.id === SUBMITTER_ID) {
      return {
        id: SUBMITTER_ID,
        fullName: 'Trần Văn C',
        email: 'tranvanc@example.com',
        department: { id: 1, name: 'Phòng Hành chính' },
      };
    }
    if (args?.where?.id === APPROVER_ID) {
      return {
        id: APPROVER_ID,
        fullName: 'Lê Văn D',
        email: 'levand@example.com',
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
// UTCID01 – Normal 1: valid submission.
// Result : The DRAFT → SUBMITTED transition completes and
//          returns the document.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.updateStatus(SUBMITTED) – Normal 1: valid submission', () => {
  it('returns the updated document', async () => {
    const result = await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('starts a transaction', async () => {
    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('updates the parent Document inside the transaction', async () => {
    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    expect(mockedPrisma.__mockTx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
      }),
    );
  });

  it('sets the parent Document status to SUBMITTED', async () => {
    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data.status).toBe('SUBMITTED');
  });

  it('sets updatedBy to the actor', async () => {
    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data.updatedBy).toBe(7);
  });

  it('updates the OutgoingDocument with assignedApproverId', async () => {
    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.assignedApproverId).toBe(APPROVER_ID);
  });

  it('does NOT throw on the valid-submission path', async () => {
    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {
        assignedApproverId: APPROVER_ID,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the valid-submission path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: validator / approver routing.
// Result : `assignedApproverId` is recorded and the approver
//          is queried for the notification email.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.updateStatus(SUBMITTED) – Normal 2: validator/approver routing', () => {
  it('records assignedApproverId on the OutgoingDocument', async () => {
    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.assignedApproverId).toBe(APPROVER_ID);
  });

  it('returns the document with the assigned approver', async () => {
    const result = await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    expect(result.assignedApproverId).toBe(APPROVER_ID);
  });

  it('queries the submitter via prisma.user.findUnique', async () => {
    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    expect(mockedPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 } }),
    );
  });

  it('queries the approver via prisma.user.findUnique', async () => {
    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    expect(mockedPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: APPROVER_ID },
        select: { id: true, fullName: true, email: true },
      }),
    );
  });

  it('does NOT throw on the routing path', async () => {
    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {
        assignedApproverId: APPROVER_ID,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the routing path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: state transition.
// Result : The Document's `status` flips to `SUBMITTED`.
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.updateStatus(SUBMITTED) – Normal 3: state transition', () => {
  it('flips document.status to SUBMITTED', async () => {
    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.document.update.mock.calls[0][0];
    expect(callArgs.data.status).toBe('SUBMITTED');
  });

  it('sets submittedAt to a Date', async () => {
    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.submittedAt).toBeInstanceOf(Date);
  });

  it('sets submittedBy to the actor', async () => {
    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.submittedBy).toBe(7);
  });

  it('does NOT include approver fields when only submitting', async () => {
    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    // approvedAt/approvedBy must NOT be set on submission.
    expect('approvedAt' in callArgs.data).toBe(false);
    expect('approvedBy' in callArgs.data).toBe(false);
  });

  it('does NOT throw on the state-transition path', async () => {
    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {
        assignedApproverId: APPROVER_ID,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the state-transition path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: history / notification.
// Result : The actor + target are persisted; the
//          notification email is dispatched (and email
//          failure is caught with a console.warn).
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.updateStatus(SUBMITTED) – Normal 4: history/notification', () => {
  it('persists the submittedBy actor (history)', async () => {
    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.submittedBy).toBe(7);
  });

  it('persists the submittedAt timestamp (history)', async () => {
    const before = Date.now();

    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    const after = Date.now();

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.submittedAt).toBeInstanceOf(Date);
    expect(callArgs.data.submittedAt.getTime()).toBeGreaterThanOrEqual(
      before,
    );
    expect(callArgs.data.submittedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('does NOT throw when the approver email is sent successfully', async () => {
    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {
        assignedApproverId: APPROVER_ID,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the history/notification path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency for
// Outgoing Document For Approval including identifiers, status,
// actor.
// Result : The return value matches a fresh DB read; the id
//          and documentId are unchanged; the status is
//          SUBMITTED; the actor (submittedBy) is recorded.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.updateStatus(SUBMITTED) – Normal 5: response-to-database consistency', () => {
  it('returns the same id as the input', async () => {
    const result = await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    expect(result.id).toBe(1);
  });

  it('preserves the documentId in the return value', async () => {
    const result = await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    expect(result.documentId).toBe(100);
  });

  it('preserves the status as SUBMITTED in the return value', async () => {
    const result = await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    expect((result.document as any).status).toBe('SUBMITTED');
  });

  it('returns the documentNumber unchanged', async () => {
    const result = await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    expect(result.documentNumber).toBe('OUT-2026-0001');
  });

  it('preserves the dispatchNumber on the parent document', async () => {
    const result = await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    expect(result.dispatchNumber).toBeNull();
  });

  it('does NOT throw on the consistency path', async () => {
    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {
        assignedApproverId: APPROVER_ID,
      }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: missing required data (no
// assignedApproverId).
// Result : BadRequestError('Vui lòng chọn người phê duyệt…').
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.updateStatus(SUBMITTED) – Abnormal 1: missing required data', () => {
  it('rejects when assignedApproverId is missing', async () => {
    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {} as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when options is undefined entirely', async () => {
    await expect(
      service.updateStatus(1, 'SUBMITTED', 7),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when assignedApproverId is explicitly undefined', async () => {
    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {
        assignedApproverId: undefined,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT call the transaction when the approver is missing', async () => {
    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {} as any),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on the missing-data path (no password / hash leak)', async () => {
    const err = await service
      .updateStatus(1, 'SUBMITTED', 7, {} as any)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the missing-data path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {} as any),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: unauthorized / invalid state.
// Result : BadRequestError because the current status does
//          not allow transitioning to SUBMITTED.  Currently
//          the only allowed "from" states are DRAFT and
//          RETURNED.
// ---------------------------------------------------------------------------
describe('[UTCID07] outgoingDocumentsService.updateStatus(SUBMITTED) – Abnormal 2: unauthorized/invalid state', () => {
  it('rejects when status = ISSUED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'ISSUED' },
    } as any);

    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {
        assignedApproverId: APPROVER_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when status = SUBMITTED (already submitted)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'SUBMITTED' },
    } as any);

    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {
        assignedApproverId: APPROVER_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when status = APPROVED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'APPROVED' },
    } as any);

    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {
        assignedApproverId: APPROVER_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when status = WAITING_FOR_ISSUE', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'WAITING_FOR_ISSUE' },
    } as any);

    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {
        assignedApproverId: APPROVER_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when status = TRASHED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'TRASHED' },
    } as any);

    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {
        assignedApproverId: APPROVER_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT call the transaction when the status is invalid', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'ISSUED' },
    } as any);

    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {
        assignedApproverId: APPROVER_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on invalid state (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'ISSUED' },
    } as any);

    const err = await service
      .updateStatus(1, 'SUBMITTED', 7, {
        assignedApproverId: APPROVER_ID,
      })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the invalid-state path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'ISSUED' },
    } as any);

    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {
        assignedApproverId: APPROVER_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: submission at deadline or minimum
// attachment boundary.
// Result : Empty options / minimal payload.  Note: the
//          service REQUIRES assignedApproverId, so the only
//          way to test a "minimal" payload is to pass only
//          `assignedApproverId`.  The service also requires
//          the document to be in DRAFT state — that's the
//          supported edge.
// ---------------------------------------------------------------------------
describe('[UTCID08] outgoingDocumentsService.updateStatus(SUBMITTED) – Boundary 1: minimum attachment boundary / deadline', () => {
  it('accepts the supported boundary: status = DRAFT (the supported edge)', async () => {
    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: APPROVER_ID,
    });

    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('accepts the boundary: minimal approver id (1)', async () => {
    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: 1,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.assignedApproverId).toBe(1);
  });

  it('rejects the boundary: empty options (no approver)', async () => {
    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {} as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects the boundary: null assignedApproverId', async () => {
    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {
        assignedApproverId: null as any,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects the boundary: status = RETURNED (acceptable, but rejected because missing approver)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: 'RETURNED' },
    } as any);

    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {} as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    const err = await service
      .updateStatus(1, 'SUBMITTED', 7, {} as any)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {} as any),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 2: upper-bound value just at the supported
// limit.
// Result : A MAX_SAFE_INTEGER assignedApproverId is accepted;
//          the adjacent unsupported value (no approver) is
//          rejected.
// ---------------------------------------------------------------------------
describe('[UTCID09] outgoingDocumentsService.updateStatus(SUBMITTED) – Boundary 2: upper-bound value just at the supported limit', () => {
  it('accepts the upper-bound: MAX_SAFE_INTEGER approver id', async () => {
    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: Number.MAX_SAFE_INTEGER,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.assignedApproverId).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('accepts the upper-bound: very large approver id (1e15)', async () => {
    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: 1e15,
    });

    const callArgs =
      mockedPrisma.__mockTx.outgoingDocument.update.mock.calls[0][0];
    expect(callArgs.data.assignedApproverId).toBe(1e15);
  });

  it('returns the document when the upper-bound is hit', async () => {
    const result = await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: Number.MAX_SAFE_INTEGER,
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('rejects the adjacent unsupported value: empty options at upper-bound', async () => {
    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {} as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT throw on the upper-bound path', async () => {
    await expect(
      service.updateStatus(1, 'SUBMITTED', 7, {
        assignedApproverId: Number.MAX_SAFE_INTEGER,
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the upper-bound path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'SUBMITTED', 7, {
      assignedApproverId: Number.MAX_SAFE_INTEGER,
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
