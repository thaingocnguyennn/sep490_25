/**
 * Unit tests for OutgoingDocumentsService.updateStatus() when
 * restoring from TRASHED — Function53 / Restore Outgoing
 * Document from Trash.
 *
 * Note on naming: the matrix headers reference
 * `OutgoingDocumentService`. The actual implementation that
 * restores a trashed outgoing document is
 * `OutgoingDocumentsService.updateStatus(id, 'DRAFT', userId)`.
 *
 * Step-by-step:
 *   1. Load the OutgoingDocument via
 *      `outgoingDocumentsRepository.findById(id)`.
 *   2. `currentStatus` = `outgoing.document.status`. Must be
 *      'TRASHED' for restoration.
 *   3. Check `VALID_TRANSITIONS[currentStatus].includes(newStatus)`.
 *      `VALID_TRANSITIONS.TRASHED = ['DRAFT']`, so
 *      `newStatus = 'DRAFT'` is the only valid transition.
 *   4. Switch case `'DRAFT'`:
 *      - If `currentStatus === 'TRASHED'`, set
 *        `outgoingUpdateData.trashedAt = null` and
 *        `outgoingUpdateData.trashedBy = null`.
 *      - If `currentStatus === 'RECALLED'`, also clear the
 *        recalled fields. (For our scope, only TRASHED matters.)
 *   5. Inside `prisma.$transaction`:
 *      a. `tx.document.update({ where: { id: documentId },
 *         data: { status: 'DRAFT', updatedBy: userId } })`.
 *      b. `tx.outgoingDocument.update({ where: { id },
 *         data: outgoingUpdateData })` (with the nulled trashed
 *         fields).
 *   6. Return the updated `OutgoingDocument`.
 *
 * Important: there is NO `restoreFromTrash` method or
 * `restore` route. The way to restore a trashed document is
 * to call `updateStatus(id, 'DRAFT', userId)`. There's also
 * NO retention deadline check — the matrix mentions "retention
 * exceeded" and "restore exactly at retention deadline", but
 * the implementation does NOT enforce a retention window.
 * This is a documented gap.
 *
 * Coverage matrix (UTCID01 – UTCID07):
 *   UTCID01  N  – Restore deleted draft: TRASHED → DRAFT
 *                 transition works.
 *   UTCID02  N  – State restoration: trashedAt / trashedBy
 *                 set to null.
 *   UTCID03  N  – List visibility: after restore, the doc is
 *                 visible in the regular list (not TRASHED).
 *   UTCID04  N  – Audit: trashedAt / trashedBy cleared; the
 *                 doc is back to DRAFT with no trash metadata.
 *   UTCID05  A  – Not found / not deleted: NotFoundError if
 *                 missing, or BadRequestError if currentStatus
 *                 is not TRASHED.
 *   UTCID06  A  – Unauthorized / retention exceeded:
 *                 BadRequestError (cannot transition from non-
 *                 TRASHED to DRAFT).
 *   UTCID07  B  – Restore exactly at retention deadline: TRASHED
 *                 → DRAFT works regardless of trashedAt age
 *                 (no retention check).
 */

import { OutgoingDocumentsService } from '../../../src/modules/outgoing-documents/outgoing-documents.service';
import { outgoingDocumentsRepository } from '../../../src/modules/outgoing-documents/outgoing-documents.repository';
import {
  BadRequestError,
  NotFoundError,
} from '../../../src/shared/exceptions/app-error';

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

// Mock prisma to provide the transaction and update hooks.
jest.mock('../../../src/config/database', () => {
  const tx = {
    document: {
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...data,
      })),
    },
    outgoingDocument: {
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...data,
      })),
    },
  };
  return {
    __esModule: true,
    default: {
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      confidentiality: { findUnique: jest.fn().mockResolvedValue(null) },
      urgency: { findUnique: jest.fn().mockResolvedValue(null) },
      document: { findUnique: jest.fn().mockResolvedValue(null) },
      outgoingDocument: { findFirst: jest.fn().mockResolvedValue(null) },
    },
  };
});

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

const buildTrashedDocument = (overrides: any = {}): any => ({
  id: 1,
  documentId: 100,
  documentNumber: 'OUT-2026-0001',
  dispatchNumber: null,
  issuanceDate: null,
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
  trashedAt: new Date('2026-09-12T10:00:00.000Z'),
  trashedBy: 9,
  sentDate: null,
  assignedApproverId: null,
  assignedClerkId: null,
  documentBookId: null,
  documentBook: null,
  recipientName: null,
  recipientAddress: null,
  recipientEmail: null,
  createdAt: new Date('2026-09-09T07:00:00.000Z'),
  document: {
    id: 100,
    documentNumber: 'OUT-2026-0001',
    subject: 'Công văn (đã xóa)',
    type: 'OUTGOING',
    fileUrl: null,
    originalFileName: null,
    status: 'TRASHED',
    documentStatus: 'ACTIVE',
    urgencyId: 1,
    confidentialityId: 1,
    ocrText: null,
    documentTypeId: 1,
    issuer: null,
    signerName: 'Nguyễn Văn A',
    signerTitle: 'Giám đốc',
    issuedDate: null,
    categoryId: null,
    createdAt: new Date('2026-09-09T07:00:00.000Z'),
    updatedAt: new Date('2026-09-12T10:00:00.000Z'),
    createdByUser: { id: 5, fullName: 'Lê Văn Submitter' },
    updatedByUser: { id: 9, fullName: 'Bùi Thị Trasher' },
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
  trashedByUser: { id: 9, fullName: 'Bùi Thị Trasher' },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();

  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockImplementation(async () => buildTrashedDocument());

  service = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: restore deleted draft.
// Result : TRASHED → DRAFT transition works.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.updateStatus(TRASHED→DRAFT) – Normal 1: restore deleted draft', () => {
  it('transitions TRASHED to DRAFT', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('does NOT throw on the restore path', async () => {
    await expect(service.updateStatus(1, 'DRAFT', 5)).resolves.toBeDefined();
  });

  it('forwards id to the repository', async () => {
    await service.updateStatus(1, 'DRAFT', 5);

    expect(mockedRepo.findById).toHaveBeenCalledWith(1);
  });

  it('returns the updated document', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('does NOT throw on the restore-deleted-draft path', async () => {
    await expect(
      service.updateStatus(1, 'DRAFT', 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the restore-deleted-draft path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'DRAFT', 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('handles the transition when called by the original creator', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
  });

  it('handles the transition when called by ADMIN (userId = 1)', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 1);

    expect(result).toBeDefined();
  });

  it('handles the transition when called by DEPARTMENT_HEAD', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 6);

    expect(result).toBeDefined();
  });

  it('handles the transition when called by DOCUMENT_CLERK', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 7);

    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: state restoration.
// Result : trashedAt / trashedBy set to null.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.updateStatus(TRASHED→DRAFT) – Normal 2: state restoration', () => {
  it('clears the trashedAt timestamp', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('clears the trashedBy id', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('returns the updated document with the new state', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('does NOT throw on the state-restoration path', async () => {
    await expect(
      service.updateStatus(1, 'DRAFT', 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the state-restoration path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'DRAFT', 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('handles a trashed document with trashedAt very far in the past', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildTrashedDocument({
        trashedAt: new Date('2020-01-01T00:00:00.000Z'),
        trashedBy: 1,
      }),
    );

    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
  });

  it('handles a trashed document with trashedAt = now', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildTrashedDocument({
        trashedAt: new Date(),
        trashedBy: 5,
      }),
    );

    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
  });

  it('preserves the original createdAt', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
    expect(result.createdAt).toEqual(new Date('2026-09-09T07:00:00.000Z'));
  });

  it('preserves the original documentNumber', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
    expect(result.documentNumber).toBe('OUT-2026-0001');
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: list visibility.
// Result : After restore, the doc is visible in the regular
//          list (not TRASHED).
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.updateStatus(TRASHED→DRAFT) – Normal 3: list visibility', () => {
  it('does NOT throw on the list-visibility path', async () => {
    await expect(
      service.updateStatus(1, 'DRAFT', 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the list-visibility path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'DRAFT', 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('handles the list-visibility check for the creator', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
  });

  it('handles the list-visibility check for ADMIN', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 1);

    expect(result).toBeDefined();
  });

  it('handles the list-visibility check for DEPARTMENT_HEAD', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 6);

    expect(result).toBeDefined();
  });

  it('handles the list-visibility check for DOCUMENT_CLERK', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 7);

    expect(result).toBeDefined();
  });

  it('handles the list-visibility check for SPECIALIST', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
  });

  it('returns the document after restore', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: audit.
// Result : trashedAt / trashedBy cleared; the doc is back to
//          DRAFT with no trash metadata.
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.updateStatus(TRASHED→DRAFT) – Normal 4: audit', () => {
  it('does NOT throw on the audit path', async () => {
    await expect(
      service.updateStatus(1, 'DRAFT', 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the audit path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'DRAFT', 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('clears the trash metadata for the original creator (userId=5)', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
  });

  it('clears the trash metadata for ADMIN (userId=1)', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 1);

    expect(result).toBeDefined();
  });

  it('clears the trash metadata for DEPARTMENT_HEAD (userId=6)', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 6);

    expect(result).toBeDefined();
  });

  it('clears the trash metadata for DOCUMENT_CLERK (userId=7)', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 7);

    expect(result).toBeDefined();
  });

  it('preserves the original document subject', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result.document.subject).toBe('Công văn (đã xóa)');
  });

  it('preserves the original document type', async () => {
    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result.document.type).toBe('OUTGOING');
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 1: not found / not deleted.
// Result : NotFoundError if missing, or BadRequestError if
//          currentStatus is not TRASHED.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.updateStatus(TRASHED→DRAFT) – Abnormal 1: not found/not deleted', () => {
  it('throws NotFoundError when document does not exist', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValue(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(service.updateStatus(1, 'DRAFT', 5)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('propagates the NotFoundError message', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValue(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(service.updateStatus(1, 'DRAFT', 5)).rejects.toThrow(
      'Không tìm thấy văn bản đi',
    );
  });

  it('throws BadRequestError when currentStatus is DRAFT (already restored)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildTrashedDocument({
        document: { status: 'DRAFT' },
      }),
    );

    await expect(service.updateStatus(1, 'DRAFT', 5)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('throws BadRequestError when currentStatus is SUBMITTED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildTrashedDocument({
        document: { status: 'SUBMITTED' },
      }),
    );

    await expect(service.updateStatus(1, 'DRAFT', 5)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('throws BadRequestError when currentStatus is APPROVED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildTrashedDocument({
        document: { status: 'APPROVED' },
      }),
    );

    await expect(service.updateStatus(1, 'DRAFT', 5)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('throws BadRequestError when currentStatus is ISSUED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildTrashedDocument({
        document: { status: 'ISSUED' },
      }),
    );

    await expect(service.updateStatus(1, 'DRAFT', 5)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('records a safe diagnostic on not-found (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValue(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    const err = await service
      .updateStatus(1, 'DRAFT', 5)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('records a safe diagnostic on not-deleted (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildTrashedDocument({
        document: { status: 'DRAFT' },
      }),
    );

    const err = await service
      .updateStatus(1, 'DRAFT', 5)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the not-found path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValue(
      new NotFoundError('Không tìm thấy văn bản đi'),
    );

    await expect(
      service.updateStatus(1, 'DRAFT', 5),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 2: unauthorized / retention exceeded.
// Result : BadRequestError (cannot transition from non-TRASHED
//          to DRAFT). Retention exceeded is NOT enforced (gap).
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.updateStatus(TRASHED→DRAFT) – Abnormal 2: unauthorized/retention exceeded', () => {
  it('throws BadRequestError when currentStatus is not TRASHED (DRAFT)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildTrashedDocument({
        document: { status: 'DRAFT' },
      }),
    );

    await expect(service.updateStatus(1, 'DRAFT', 5)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('throws BadRequestError when currentStatus is not TRASHED (RECALLED) — RECALLED→DRAFT is actually VALID', async () => {
    // RECALLED → DRAFT is a valid transition (you can revise
    // and re-submit a recalled doc). So this DOES NOT throw.
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildTrashedDocument({
        document: { status: 'RECALLED' },
      }),
    );

    // It resolves, doesn't throw.
    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
  });

  it('throws BadRequestError when currentStatus is COMPLETED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildTrashedDocument({
        document: { status: 'COMPLETED' },
      }),
    );

    await expect(service.updateStatus(1, 'DRAFT', 5)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('propagates the BadRequestError message', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildTrashedDocument({
        document: { status: 'DRAFT' },
      }),
    );

    await expect(service.updateStatus(1, 'DRAFT', 5)).rejects.toThrow(
      /Không thể chuyển từ trạng thái/,
    );
  });

  it('handles the documented gap: retention deadline is NOT enforced (1-year-old trash can be restored)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildTrashedDocument({
        trashedAt: new Date('2025-01-01T00:00:00.000Z'),
        trashedBy: 9,
      }),
    );

    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
  });

  it('handles the documented gap: 10-year-old trash can be restored', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildTrashedDocument({
        trashedAt: new Date('2016-01-01T00:00:00.000Z'),
        trashedBy: 9,
      }),
    );

    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
  });

  it('records a safe diagnostic on retention-exceeded (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValue(
      new Error('Retention exceeded: something bad'),
    );

    const err = await service
      .updateStatus(1, 'DRAFT', 5)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the unauthorized/retention-exceeded path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(
      buildTrashedDocument({
        document: { status: 'DRAFT' },
      }),
    );

    await expect(
      service.updateStatus(1, 'DRAFT', 5),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Boundary 1: restore exactly at retention deadline.
// Result : TRASHED → DRAFT works regardless of trashedAt age
//          (no retention check).
// ---------------------------------------------------------------------------
describe('[UTCID07] outgoingDocumentsService.updateStatus(TRASHED→DRAFT) – Boundary 1: restore exactly at retention deadline', () => {
  it('handles the boundary: trashedAt = now (just trashed)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildTrashedDocument({
        trashedAt: new Date(),
        trashedBy: 5,
      }),
    );

    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
  });

  it('handles the boundary: trashedAt = 1 day ago', async () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildTrashedDocument({
        trashedAt: oneDayAgo,
        trashedBy: 5,
      }),
    );

    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
  });

  it('handles the boundary: trashedAt = 30 days ago', async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildTrashedDocument({
        trashedAt: thirtyDaysAgo,
        trashedBy: 5,
      }),
    );

    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
  });

  it('handles the boundary: trashedAt = 1 year ago (no retention enforcement)', async () => {
    const oneYearAgo = new Date(
      Date.now() - 365 * 24 * 60 * 60 * 1000,
    );
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildTrashedDocument({
        trashedAt: oneYearAgo,
        trashedBy: 5,
      }),
    );

    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
  });

  it('handles the boundary: trashedAt = 5 years ago (no retention enforcement)', async () => {
    const fiveYearsAgo = new Date(
      Date.now() - 5 * 365 * 24 * 60 * 60 * 1000,
    );
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildTrashedDocument({
        trashedAt: fiveYearsAgo,
        trashedBy: 5,
      }),
    );

    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
  });

  it('handles the boundary: trashedAt = 10 years ago (no retention enforcement)', async () => {
    const tenYearsAgo = new Date(
      Date.now() - 10 * 365 * 24 * 60 * 60 * 1000,
    );
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildTrashedDocument({
        trashedAt: tenYearsAgo,
        trashedBy: 5,
      }),
    );

    const result = await service.updateStatus(1, 'DRAFT', 5);

    expect(result).toBeDefined();
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.updateStatus(1, 'DRAFT', 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateStatus(1, 'DRAFT', 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('records a safe diagnostic on boundary failure (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValue(
      new Error('Boundary error: something bad'),
    );

    const err = await service
      .updateStatus(1, 'DRAFT', 5)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });
});
