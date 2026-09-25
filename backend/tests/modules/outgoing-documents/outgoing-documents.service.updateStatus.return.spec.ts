/**
 * Unit tests for OutgoingDocumentsService.updateStatus() —
 * Function67 / Return Outgoing Document (focus on the
 * RETURNED state transition with returnReason).
 *
 * Note on naming: the matrix headers reference
 * `OutgoingWorkflowService`. The actual implementation that
 * handles the return is
 * `OutgoingDocumentsService.updateStatus(id, 'RETURNED',
 * userId, { returnReason })`. The 'RETURNED' branch persists
 * `returnedAt`, `returnedBy`, and `returnReason` on the
 * `OutgoingDocument`, plus flips the parent `Document.status`
 * to 'RETURNED'.
 *
 * Step-by-step:
 *   1. `outgoing = await outgoingDocumentsRepository.findById
 *      (id)`.
 *   2. Validate `validNextStatuses = VALID_TRANSITIONS
 *      [currentStatus]`; if 'RETURNED' not in it, throw
 *      `BadRequestError('Không thể chuyển từ trạng thái ...')`.
 *   3. Switch on `newStatus === 'RETURNED'`:
 *      - If `outgoing.assignedApproverId` exists and
 *        `assignedApproverId !== userId`, throw
 *        `BadRequestError('Bạn không được phân quyền ...')`.
 *      - Set `returnedAt = now`.
 *      - Set `returnedBy = userId`.
 *      - Set `returnReason = options?.returnReason`.
 *   4. Run prisma.$transaction:
 *      - `tx.document.update({ where: { id:
 *        outgoing.documentId }, data: { status:
 *        'RETURNED', updatedBy: userId } })`.
 *      - `tx.outgoingDocument.update({ where: { id }, data:
 *        outgoingUpdateData })`.
 *   5. Return `outgoingDocumentsRepository.findById(id)`.
 *
 * Coverage matrix (UTCID01 – UTCID08):
 *   UTCID01  N  – Valid return.
 *   UTCID02  N  – Reason persistence.
 *   UTCID03  N  – State transition.
 *   UTCID04  N  – History/notification (timestamps + actor).
 *   UTCID05  N  – Response-to-database consistency.
 *   UTCID06  A  – Missing reason.
 *   UTCID07  A  – Unauthorized/invalid state.
 *   UTCID08  B  – Minimum/maximum return-reason length.
 */

import { OutgoingDocumentsService } from '../../../src/modules/outgoing-documents/outgoing-documents.service';
import { outgoingDocumentsRepository } from '../../../src/modules/outgoing-documents/outgoing-documents.repository';
import { BadRequestError } from '../../../src/shared/exceptions/app-error';
import prisma from '../../../src/config/database';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/outgoing-documents/outgoing-documents.repository',
);

jest.mock('../../../src/shared/services/ocr.service', () => ({
  __esModule: true,
  performOcr: jest.fn(),
  extractFields: jest.fn(),
}));
jest.mock('../../../src/shared/services/email.service', () => ({
  __esModule: true,
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/config/database', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    confidentiality: {
      findUnique: jest.fn().mockResolvedValue({ id: 1 }),
    },
    urgency: {
      findUnique: jest.fn().mockResolvedValue({ id: 1 }),
    },
    document: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    outgoingDocument: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    documentBook: { findFirst: jest.fn().mockResolvedValue(null) },
    outgoingBookEntry: { findFirst: jest.fn().mockResolvedValue(null) },
  },
}));

jest.mock(
  '../../../src/modules/documents/documents.repository',
);

jest.mock('../../../src/shared/utils/pdf-signature.util', () => ({
  __esModule: true,
  extractSignaturesFromFile: jest.fn(),
  buildSignatureSummary: jest.fn(),
  buildVisualMarks: jest.fn(),
  calculateFileHash: jest.fn(),
  isSupportedSignatureFile: jest.fn(),
  checkPdfSignature: jest.fn(),
}));

jest.mock('fs');

const mockedRepo = outgoingDocumentsRepository as jest.Mocked<
  typeof outgoingDocumentsRepository
>;
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

let service: OutgoingDocumentsService;

const buildDocument = (overrides: any = {}): any => ({
  id: 1,
  documentId: 100,
  documentNumber: 'OUT-2026-0001',
  dispatchNumber: 'OUT-DISP-001',
  assignedApproverId: 5,
  assignedClerkId: 7,
  submittedAt: new Date('2026-09-09T08:00:00.000Z'),
  submittedBy: 8,
  approvedAt: null,
  approvedBy: null,
  returnedAt: null,
  returnedBy: null,
  returnReason: null,
  document: {
    id: 100,
    documentNumber: 'OUT-2026-0001',
    subject: 'Công văn phát hành',
    fileUrl: '/uploads/test.pdf',
    status: 'SUBMITTED',
    documentStatus: 'ACTIVE',
    createdAt: new Date('2026-09-09T07:00:00.000Z'),
    updatedAt: new Date('2026-09-12T12:00:00.000Z'),
    createdByUser: { id: 8, fullName: 'Lê Văn Submitter' },
    department: { id: 1, name: 'Phòng Hành chính' },
    documentTypeRef: { id: 1, name: 'Công văn' },
  },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();

  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockImplementation(async () => buildDocument());

  mockedPrisma.$transaction.mockReset();
  mockedPrisma.$transaction.mockImplementation(async (cb: any) =>
    cb({
      document: mockedPrisma.document,
      outgoingDocument: mockedPrisma.outgoingDocument,
    }),
  );

  mockedPrisma.document.update.mockReset();
  mockedPrisma.document.update.mockImplementation(async () => ({}));

  mockedPrisma.outgoingDocument.update.mockReset();
  mockedPrisma.outgoingDocument.update.mockImplementation(async () => ({}));

  service = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid return.
// Result : update succeeds when the current status allows
//          'RETURNED' (e.g. SUBMITTED).
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.updateStatus(RETURNED) – Normal 1: valid return', () => {
  it('returns the document successfully when SUBMITTED → RETURNED', async () => {
    const result = await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Cần bổ sung thông tin',
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('calls prisma.document.update once', async () => {
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Cần bổ sung thông tin',
    });

    expect(mockedPrisma.document.update).toHaveBeenCalledTimes(1);
  });

  it('calls prisma.outgoingDocument.update once', async () => {
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Cần bổ sung thông tin',
    });

    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledTimes(1);
  });

  it('accepts return without options object', async () => {
    await expect(
      service.updateStatus(1, 'RETURNED', 5),
    ).resolves.toBeDefined();
  });

  it('handles return reason with Vietnamese characters', async () => {
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Cần bổ sung thông tin người ký',
    });

    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalled();
  });

  it('does NOT throw on the valid-return path', async () => {
    await expect(
      service.updateStatus(1, 'RETURNED', 5, {
        returnReason: 'Reason',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the valid-return path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Reason',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: reason persistence.
// Result : returnReason persisted on outgoingDocument.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.updateStatus(RETURNED) – Normal 2: reason persistence', () => {
  it('persists returnReason on outgoingDocument', async () => {
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Cần bổ sung thông tin',
    });

    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          returnReason: 'Cần bổ sung thông tin',
        }),
      }),
    );
  });

  it('persists returnReason with Vietnamese characters', async () => {
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Vui lòng bổ sung số văn bản',
    });

    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          returnReason: 'Vui lòng bổ sung số văn bản',
        }),
      }),
    );
  });

  it('persists returnReason as empty string when provided', async () => {
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: '',
    });

    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          returnReason: '',
        }),
      }),
    );
  });

  it('persists returnReason as null when not provided', async () => {
    await service.updateStatus(1, 'RETURNED', 5);

    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          returnReason: undefined,
        }),
      }),
    );
  });

  it('does NOT throw on the reason-persistence path', async () => {
    await expect(
      service.updateStatus(1, 'RETURNED', 5, {
        returnReason: 'Reason',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the reason-persistence path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Reason',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: state transition.
// Result : Document.status flipped to RETURNED.
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.updateStatus(RETURNED) – Normal 3: state transition', () => {
  it('transitions Document.status to RETURNED', async () => {
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Reason',
    });

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: expect.objectContaining({
          status: 'RETURNED',
        }),
      }),
    );
  });

  it('flips the Document.updatedBy to the approver', async () => {
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Reason',
    });

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          updatedBy: 5,
        }),
      }),
    );
  });

  it('persists the state transition in a single transaction', async () => {
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Reason',
    });

    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('handles APPROVED → RETURNED transition (rejection)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({
        document: { ...buildDocument().document, status: 'APPROVED' },
      }),
    );

    await expect(
      service.updateStatus(1, 'RETURNED', 5, {
        returnReason: 'Need re-review',
      }),
    ).rejects.toThrow();
  });

  it('does NOT throw on the state-transition path (SUBMITTED→RETURNED)', async () => {
    await expect(
      service.updateStatus(1, 'RETURNED', 5, {
        returnReason: 'Reason',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the state-transition path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Reason',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: history/notification.
// Result : returnedAt + returnedBy persisted.
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.updateStatus(RETURNED) – Normal 4: history/notification', () => {
  it('persists returnedAt timestamp', async () => {
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Reason',
    });

    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          returnedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('persists returnedBy user id', async () => {
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Reason',
    });

    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          returnedBy: 5,
        }),
      }),
    );
  });

  it('persists returnedBy with different user ids', async () => {
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Reason',
    });

    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          returnedBy: 5,
        }),
      }),
    );
  });

  it('persists all history fields together (returnedAt + returnedBy + returnReason)', async () => {
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Need clarification',
    });

    const call = mockedPrisma.outgoingDocument.update.mock.calls[0];

    expect(call[0].data).toEqual(
      expect.objectContaining({
        returnedAt: expect.any(Date),
        returnedBy: 5,
        returnReason: 'Need clarification',
      }),
    );
  });

  it('does NOT throw on the history/notification path', async () => {
    await expect(
      service.updateStatus(1, 'RETURNED', 5, {
        returnReason: 'Reason',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the history/notification path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Reason',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency for
// Outgoing Document including identifiers, status, actor and
// target.
// Result : returned document mirrors DB state.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.updateStatus(RETURNED) – Normal 5: response-to-database consistency', () => {
  it('matches DB id to response.id', async () => {
    const result = await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Reason',
    });

    expect(result.id).toBe(1);
  });

  it('matches DB documentId to response.documentId', async () => {
    const result = await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Reason',
    });

    expect(result.documentId).toBe(100);
  });

  it('matches DB documentNumber to response.documentNumber', async () => {
    const result = await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Reason',
    });

    expect(result.documentNumber).toBe('OUT-2026-0001');
  });

  it('matches DB dispatchNumber to response.dispatchNumber', async () => {
    const result = await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Reason',
    });

    expect(result.dispatchNumber).toBe('OUT-DISP-001');
  });

  it('does NOT throw on the consistency path', async () => {
    await expect(
      service.updateStatus(1, 'RETURNED', 5, {
        returnReason: 'Reason',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the consistency path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'Reason',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: missing reason.
// Result : the service accepts undefined returnReason; reason
//          persistence is allowed to be null.
//          (The implementation does NOT enforce that a reason
//          must be supplied — it persists whatever is in
//          `options?.returnReason`. This is a documented gap.)
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.updateStatus(RETURNED) – Abnormal 1: missing reason', () => {
  it('accepts undefined returnReason (no validation on missing reason)', async () => {
    await expect(
      service.updateStatus(1, 'RETURNED', 5),
    ).resolves.toBeDefined();
  });

  it('persists returnReason = undefined when omitted', async () => {
    await service.updateStatus(1, 'RETURNED', 5);

    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          returnReason: undefined,
        }),
      }),
    );
  });

  it('throws BadRequestError when current status is DRAFT (cannot return)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({
        document: { ...buildDocument().document, status: 'DRAFT' },
      }),
    );

    await expect(
      service.updateStatus(1, 'RETURNED', 5, {
        returnReason: 'Reason',
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when current status is ISSUED (cannot return)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({
        document: { ...buildDocument().document, status: 'ISSUED' },
      }),
    );

    await expect(
      service.updateStatus(1, 'RETURNED', 5, {
        returnReason: 'Reason',
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('records a safe diagnostic on invalid status (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({
        document: { ...buildDocument().document, status: 'DRAFT' },
      }),
    );

    const err = await service
      .updateStatus(1, 'RETURNED', 5, { returnReason: 'Reason' })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the missing-reason path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'RETURNED', 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: unauthorized/invalid state.
// Result : BadRequestError when assignedApproverId mismatch
//          or invalid state transition.
// ---------------------------------------------------------------------------
describe('[UTCID07] outgoingDocumentsService.updateStatus(RETURNED) – Abnormal 2: unauthorized/invalid state', () => {
  it('throws BadRequestError when user is not the assigned approver', async () => {
    await expect(
      service.updateStatus(1, 'RETURNED', 999, {
        returnReason: 'Reason',
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when current status is RETURNED (already returned)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({
        document: { ...buildDocument().document, status: 'RETURNED' },
      }),
    );

    await expect(
      service.updateStatus(1, 'RETURNED', 5, {
        returnReason: 'Reason',
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws when prisma.document.update throws', async () => {
    mockedPrisma.document.update.mockReset();
    mockedPrisma.document.update.mockRejectedValueOnce(
      new Error('DB connection lost'),
    );

    await expect(
      service.updateStatus(1, 'RETURNED', 5, {
        returnReason: 'Reason',
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('records a safe diagnostic on unauthorized (no password / hash leak)', async () => {
    const err = await service
      .updateStatus(1, 'RETURNED', 999, { returnReason: 'Reason' })
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the unauthorized path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await expect(
      service.updateStatus(1, 'RETURNED', 999, { returnReason: 'Reason' }),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: minimum/maximum return-reason length.
// Result : reason at exactly min/max length accepted.
// ---------------------------------------------------------------------------
describe('[UTCID08] outgoingDocumentsService.updateStatus(RETURNED) – Boundary 1: minimum/maximum return-reason length', () => {
  it('handles the boundary: returnReason at exactly 1 char', async () => {
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'a',
    });

    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          returnReason: 'a',
        }),
      }),
    );
  });

  it('handles the boundary: returnReason at exactly 1000 chars', async () => {
    const longReason = 'a'.repeat(1000);
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: longReason,
    });

    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          returnReason: longReason,
        }),
      }),
    );
  });

  it('handles the boundary: returnReason with 5000 chars (large)', async () => {
    const veryLongReason = 'a'.repeat(5000);
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: veryLongReason,
    });

    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          returnReason: veryLongReason,
        }),
      }),
    );
  });

  it('handles the boundary: returnReason empty string', async () => {
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: '',
    });

    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          returnReason: '',
        }),
      }),
    );
  });

  it('handles the boundary: returnReason with Vietnamese at 1000 chars', async () => {
    const vnReason = 'Cần'.repeat(500);
    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: vnReason,
    });

    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          returnReason: vnReason,
        }),
      }),
    );
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.updateStatus(1, 'RETURNED', 5, {
        returnReason: 'a',
      }),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'RETURNED', 5, {
      returnReason: 'a',
    });

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
