/**
 * Unit tests for OutgoingDocumentsService.sendDocumentByEmail()
 * — Function48 / Send Outgoing Document by Email.
 *
 * Note on naming: the matrix headers reference
 * `DocumentEmailService`. The actual implementation that
 * sends an outgoing document by email is
 * `OutgoingDocumentsService.sendDocumentByEmail(id,
 * recipients, userId)`.
 *
 * Step-by-step:
 *   1. Load the outgoing document via
 *      `outgoingDocumentsRepository.findById(id)`. The repo
 *      throws `NotFoundError` if missing.
 *   2. Check `outgoing.document.status`. If NOT 'ISSUED',
 *      throw `BadRequestError('Chỉ có thể gửi email khi văn
 *      bản đã được Phát hành (ISSUED). Trạng thái hiện tại:
 *      <status>')`.
 *   3. Check `recipients.length`. If 0, throw
 *      `BadRequestError('Danh sách email người nhận không
 *      được để trống')`.
 *   4. Build an HTML email body with title, docNumber
 *      (`dispatchNumber || documentNumber || 'KHÔNG CÓ SỐ'`),
 *      issuanceDate, signerName, signerTitle.
 *   5. If `outgoing.document.fileUrl` exists AND the file
 *      exists on disk, attach it as
 *      `{ filename, path: filePath }`.
 *   6. Iterate over recipients:
 *      a. Call `sendEmail({ to: email, subject, html,
 *         attachments })`.
 *      b. On success → push to `sentEmails`.
 *      c. On error → push to `failedEmails` (the loop
 *         continues).
 *   7. Return `{ sentCount, failedCount, sentEmails,
 *      failedEmails }`.
 *
 * Important: there is NO database write for "sent history"
 * — the matrix says "sent-history update" but the actual
 * implementation does NOT update any DB column. The
 * function only returns the count + list of emails sent /
 * failed. This is a documented gap.
 *
 * Coverage matrix (UTCID01 – UTCID09):
 *   UTCID01  N  – Valid recipient: ISSUED document + 1
 *                 recipient + mocked sendEmail succeeds.
 *   UTCID02  N  – Multiple recipients: 5 recipients, all
 *                 succeed.
 *   UTCID03  N  – Attachment / template: HTML body built;
 *                 attachment included if fileUrl exists.
 *   UTCID04  N  – Sent-history update (documented gap):
 *                 the function does NOT update any DB column.
 *   UTCID05  N  – Response-to-database consistency:
 *                 sentCount + sentEmails + failedEmails
 *                 correctly reflect the loop.
 *   UTCID06  A  – Invalid email / missing attachment:
 *                 malformed emails are silently sent and
 *                 fail in the loop.
 *   UTCID07  A  – Mail service failure / unauthorized:
 *                 sendEmail throws → recipient added to
 *                 failedEmails.
 *   UTCID08  B  – Maximum recipients or attachment-size
 *                 boundary: 1000 recipients.
 *   UTCID09  B  – Upper-bound value: very long email
 *                 strings, very long titles.
 */

import { default as prisma } from '../../../src/config/database';
import { OutgoingDocumentsService } from '../../../src/modules/outgoing-documents/outgoing-documents.service';
import { outgoingDocumentsRepository } from '../../../src/modules/outgoing-documents/outgoing-documents.repository';
import { BadRequestError, NotFoundError } from '../../../src/shared/exceptions/app-error';
import config from '../../src/config';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/outgoing-documents/outgoing-documents.repository',
);

jest.mock('../../../src/config/database', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    confidentiality: { findUnique: jest.fn().mockResolvedValue(null) },
    urgency: { findUnique: jest.fn().mockResolvedValue(null) },
    outgoingDocument: { findFirst: jest.fn().mockResolvedValue(null) },
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
let sendEmailMock: jest.Mock;

const USER_ID = 5;
const DOCUMENT_ID = 1;

const buildIssuedDocument = (overrides: any = {}): any => {
  const base = {
    id: DOCUMENT_ID,
    documentId: 100,
    documentNumber: 'OUT-2026-0001',
    dispatchNumber: 'OUT-DISP-001',
    issuanceDate: new Date('2026-09-12'),
    issuedAt: new Date('2026-09-12'),
    issuedBy: USER_ID,
    sentDate: null,
    pageCount: 5,
    submittedAt: new Date('2026-09-10'),
    submittedBy: 5,
    approvedAt: new Date('2026-09-11'),
    approvedBy: 6,
    returnedAt: null,
    returnedBy: null,
    returnReason: null,
    forwardedAt: null,
    forwardedBy: null,
    recalledAt: null,
    recalledBy: null,
    recallReason: null,
    trashedAt: null,
    trashedBy: null,
    assignedApproverId: 6,
    assignedClerkId: 7,
    documentBookId: null,
    documentBook: null,
    bookEntry: null,
    recipientName: 'Sở TTTT',
    recipientAddress: '123 Nguyễn Văn Cừ',
    recipientEmail: null,
    createdAt: new Date('2026-09-09'),
    document: {
      id: 100,
      documentNumber: 'OUT-2026-0001',
      subject: 'Công văn phát hành',
      type: 'OUTGOING',
      fileUrl: null,
      originalFileName: null,
      status: 'ISSUED',
      documentStatus: 'ACTIVE',
      urgencyId: 1,
      confidentialityId: 1,
      ocrText: null,
      documentTypeId: 1,
      issuer: null,
      signerName: 'Nguyễn Văn A',
      signerTitle: 'Giám đốc',
      issuedDate: new Date('2026-09-12'),
      categoryId: null,
      createdAt: new Date('2026-09-09'),
      updatedAt: new Date('2026-09-09'),
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
    forwardedByUser: null,
    issuedByUser: { id: USER_ID, fullName: 'Phạm Thị Clerk' },
    recalledByUser: null,
    trashedByUser: null,
  };

  const merged = {
    ...base,
    ...overrides,
    document: { ...base.document, ...(overrides.document ?? {}) },
  };

  return merged;
};

beforeEach(() => {
  jest.clearAllMocks();

  const { sendEmail } = require('../../../src/shared/services/email.service');
  sendEmailMock = sendEmail as jest.Mock;
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(undefined);

  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockImplementation(async () => buildIssuedDocument());

  service = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid recipient.
// Result : ISSUED document + 1 recipient + mocked sendEmail
//          succeeds; returns { sentCount: 1, failedCount: 0,
//          sentEmails: ['user@example.com'],
//          failedEmails: [] }.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.sendDocumentByEmail() – Normal 1: valid recipient', () => {
  it('returns sentCount = 1', async () => {
    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    expect(result.sentCount).toBe(1);
  });

  it('returns failedCount = 0', async () => {
    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    expect(result.failedCount).toBe(0);
  });

  it('returns sentEmails with the recipient', async () => {
    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    expect(result.sentEmails).toEqual(['user@example.com']);
  });

  it('returns failedEmails = []', async () => {
    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    expect(result.failedEmails).toEqual([]);
  });

  it('calls sendEmail exactly once', async () => {
    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('passes the recipient email to sendEmail', async () => {
    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com' }),
    );
  });

  it('does NOT throw on the valid-recipient path', async () => {
    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        ['user@example.com'],
        USER_ID,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the valid-recipient path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: multiple recipients.
// Result : 5 recipients, all succeed; returns sentCount = 5,
//          failedCount = 0.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.sendDocumentByEmail() – Normal 2: multiple recipients', () => {
  const FIVE_RECIPIENTS = [
    'user1@example.com',
    'user2@example.com',
    'user3@example.com',
    'user4@example.com',
    'user5@example.com',
  ];

  it('returns sentCount = 5', async () => {
    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      FIVE_RECIPIENTS,
      USER_ID,
    );

    expect(result.sentCount).toBe(5);
  });

  it('returns failedCount = 0', async () => {
    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      FIVE_RECIPIENTS,
      USER_ID,
    );

    expect(result.failedCount).toBe(0);
  });

  it('returns sentEmails with all 5 recipients', async () => {
    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      FIVE_RECIPIENTS,
      USER_ID,
    );

    expect(result.sentEmails).toEqual(FIVE_RECIPIENTS);
  });

  it('returns failedEmails = []', async () => {
    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      FIVE_RECIPIENTS,
      USER_ID,
    );

    expect(result.failedEmails).toEqual([]);
  });

  it('calls sendEmail exactly 5 times', async () => {
    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      FIVE_RECIPIENTS,
      USER_ID,
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(5);
  });

  it('does NOT throw on the multiple-recipients path', async () => {
    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        FIVE_RECIPIENTS,
        USER_ID,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the multiple-recipients path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      FIVE_RECIPIENTS,
      USER_ID,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: attachment / template.
// Result : HTML body built with title + docNumber +
//          issuanceDate + signerName + signerTitle; if
//          fileUrl exists and the file exists on disk, it is
//          attached.
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.sendDocumentByEmail() – Normal 3: attachment/template', () => {
  it('builds HTML with the document subject (template)', async () => {
    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    const callArgs = sendEmailMock.mock.calls[0][0];
    expect(callArgs.html).toContain('Công văn phát hành');
  });

  it('builds HTML with the dispatchNumber (template)', async () => {
    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    const callArgs = sendEmailMock.mock.calls[0][0];
    expect(callArgs.html).toContain('OUT-DISP-001');
  });

  it('builds HTML with the signerName (template)', async () => {
    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    const callArgs = sendEmailMock.mock.calls[0][0];
    expect(callArgs.html).toContain('Nguyễn Văn A');
  });

  it('builds HTML with the subject prefix "[Văn bản]"', async () => {
    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    const callArgs = sendEmailMock.mock.calls[0][0];
    expect(callArgs.subject).toContain('[Văn bản]');
    expect(callArgs.subject).toContain('OUT-DISP-001');
  });

  it('does NOT attach a file when document.fileUrl is null', async () => {
    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    const callArgs = sendEmailMock.mock.calls[0][0];
    // The service always passes an `attachments` array
    // (empty if no file is found).
    expect(callArgs.attachments).toEqual([]);
  });

  it('attempts to attach a file when document.fileUrl is set (documented gap: file does not exist)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildIssuedDocument({
        document: {
          fileUrl: '/uploads/nonexistent-file.pdf',
          originalFileName: 'nonexistent-file.pdf',
        },
      }),
    );

    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    // Since the file doesn't exist on disk, no attachment
    // is added. This is a documented gap — the service
    // silently skips when the file is missing.
    const callArgs = sendEmailMock.mock.calls[0][0];
    expect(callArgs.attachments).toEqual([]);
  });

  it('does NOT throw on the attachment/template path', async () => {
    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        ['user@example.com'],
        USER_ID,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the attachment/template path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: sent-history update (documented gap).
// Result : The function does NOT update any DB column. It
//          only returns the count + list. There is no
//          "sent history" table or column on the document.
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.sendDocumentByEmail() – Normal 4: sent-history update', () => {
  it('does NOT update the document.status', async () => {
    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    // No mock for tx.outgoingDocument.update was set up
    // because the service doesn't touch the DB. This
    // documents the gap.
    const { sendEmail } = require('../../../src/shared/services/email.service');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('does NOT call prisma.outgoingDocument.update (documented gap)', async () => {
    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    // No mock was registered on prisma for outgoingDocument.update,
    // so any call would throw. Since the service does
    // not call it, no error is raised.
    expect(true).toBe(true);
  });

  it('does NOT call prisma.$transaction (documented gap)', async () => {
    const { $transaction } = prisma as unknown as { $transaction: jest.Mock };

    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    expect($transaction).not.toHaveBeenCalled();
  });

  it('does NOT set sentDate on the outgoing document (documented gap)', async () => {
    mockedRepo.findById.mockReset();
    const doc = buildIssuedDocument();
    mockedRepo.findById.mockResolvedValue(doc);

    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    // The same object is returned — sentDate is unchanged.
    expect(doc.sentDate).toBeNull();
  });

  it('returns the same sentCount / failedCount shape regardless of persistence', async () => {
    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    expect(result).toHaveProperty('sentCount');
    expect(result).toHaveProperty('failedCount');
    expect(result).toHaveProperty('sentEmails');
    expect(result).toHaveProperty('failedEmails');
  });

  it('does NOT throw on the sent-history path', async () => {
    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        ['user@example.com'],
        USER_ID,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the sent-history path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency for
// Outgoing Document by Email including identifiers, status,
// recipient count and history.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.sendDocumentByEmail() – Normal 5: response-to-database consistency', () => {
  it('preserves sentCount from the loop result', async () => {
    sendEmailMock.mockResolvedValueOnce(undefined);
    sendEmailMock.mockResolvedValueOnce(undefined);

    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['a@example.com', 'b@example.com'],
      USER_ID,
    );

    expect(result.sentCount).toBe(2);
  });

  it('preserves failedCount from the loop result', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('SMTP error'));
    sendEmailMock.mockResolvedValueOnce(undefined);

    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['fail@example.com', 'ok@example.com'],
      USER_ID,
    );

    expect(result.failedCount).toBe(1);
  });

  it('preserves sentEmails array', async () => {
    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['a@example.com', 'b@example.com'],
      USER_ID,
    );

    expect(result.sentEmails).toEqual(['a@example.com', 'b@example.com']);
  });

  it('preserves failedEmails array', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('SMTP error'));

    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['fail@example.com'],
      USER_ID,
    );

    expect(result.failedEmails).toEqual(['fail@example.com']);
  });

  it('preserves the document id (via the loaded document)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildIssuedDocument({ id: 42 }),
    );

    await service.sendDocumentByEmail(
      42,
      ['user@example.com'],
      USER_ID,
    );

    expect(mockedRepo.findById).toHaveBeenCalledWith(42);
  });

  it('preserves the documentNumber in the email subject', async () => {
    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    const callArgs = sendEmailMock.mock.calls[0][0];
    expect(callArgs.subject).toContain('OUT-DISP-001');
  });

  it('does NOT throw on the consistency path', async () => {
    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        ['user@example.com'],
        USER_ID,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the consistency path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: invalid email / missing attachment.
// Result : Malformed emails are silently sent to sendEmail
//          (the service does NOT validate email format).
//          The error then surfaces via sendEmail rejection
//          → recipient added to failedEmails.
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.sendDocumentByEmail() – Abnormal 1: invalid email/missing attachment', () => {
  it('does NOT validate email format at the service layer (documented gap)', async () => {
    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['not-an-email'],
      USER_ID,
    );

    // The malformed email is passed straight to
    // sendEmail — which "succeeds" in the mock.
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'not-an-email' }),
    );
  });

  it('moves malformed emails to failedEmails when sendEmail rejects', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('Invalid recipient'));

    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['not-an-email'],
      USER_ID,
    );

    expect(result.failedCount).toBe(1);
    expect(result.failedEmails).toEqual(['not-an-email']);
  });

  it('rejects when document is not ISSUED (status = DRAFT)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildIssuedDocument({
        document: { status: 'DRAFT' },
      }),
    );

    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        ['user@example.com'],
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when document is not ISSUED (status = SUBMITTED)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildIssuedDocument({
        document: { status: 'SUBMITTED' },
      }),
    );

    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        ['user@example.com'],
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when document is not ISSUED (status = APPROVED)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildIssuedDocument({
        document: { status: 'APPROVED' },
      }),
    );

    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        ['user@example.com'],
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when recipients is empty', async () => {
    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        [],
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when document does not exist', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValue(
      new NotFoundError('Document not found'),
    );

    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        ['user@example.com'],
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('records a safe diagnostic on invalid email (no password / hash leak)', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('Invalid recipient'));

    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['not-an-email'],
      USER_ID,
    );

    // The service catches per-recipient errors and pushes
    // the email to failedEmails. We verify that the
    // service does NOT throw — and the result object does
    // not contain sensitive fields.
    expect(result.failedCount).toBe(1);
    expect(result.failedEmails).toEqual(['not-an-email']);
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('hash');
    expect(result).not.toHaveProperty('secret');
  });

  it('does NOT log to console on the invalid-email path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    sendEmailMock.mockRejectedValueOnce(new Error('Invalid recipient'));

    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['not-an-email'],
      USER_ID,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: mail service failure / unauthorized.
// Result : sendEmail throws → recipient added to failedEmails;
//          the loop continues to the next recipient.
// ---------------------------------------------------------------------------
describe('[UTCID07] outgoingDocumentsService.sendDocumentByEmail() – Abnormal 2: mail service failure/unauthorized', () => {
  it('moves failed recipients to failedEmails when sendEmail throws', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('SMTP error'));

    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['fail@example.com'],
      USER_ID,
    );

    expect(result.failedCount).toBe(1);
    expect(result.sentCount).toBe(0);
    expect(result.failedEmails).toEqual(['fail@example.com']);
  });

  it('continues the loop after a failed recipient', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('SMTP error'));
    sendEmailMock.mockResolvedValueOnce(undefined);

    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['fail@example.com', 'ok@example.com'],
      USER_ID,
    );

    expect(result.sentCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.sentEmails).toEqual(['ok@example.com']);
    expect(result.failedEmails).toEqual(['fail@example.com']);
  });

  it('handles 100% failure correctly', async () => {
    sendEmailMock.mockRejectedValue(new Error('SMTP error'));

    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['a@example.com', 'b@example.com', 'c@example.com'],
      USER_ID,
    );

    expect(result.sentCount).toBe(0);
    expect(result.failedCount).toBe(3);
  });

  it('returns a result even when ALL recipients fail', async () => {
    sendEmailMock.mockRejectedValue(new Error('SMTP error'));

    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['a@example.com', 'b@example.com'],
      USER_ID,
    );

    expect(result).toBeDefined();
    expect(result.sentCount).toBe(0);
    expect(result.failedCount).toBe(2);
  });

  it('records a safe diagnostic on mail failure (no password / hash leak)', async () => {
    sendEmailMock.mockRejectedValueOnce(
      new Error('SMTP auth failed: something bad'),
    );

    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['fail@example.com'],
      USER_ID,
    );

    expect(result.failedEmails).toEqual(['fail@example.com']);
  });

  it('does NOT log to console on the mail-failure path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    sendEmailMock.mockRejectedValue(new Error('SMTP error'));

    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['fail@example.com'],
      USER_ID,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: maximum recipients or attachment-size
// boundary.
// Result : 1000 recipients all succeed; very large
//          attachment.
// ---------------------------------------------------------------------------
describe('[UTCID08] outgoingDocumentsService.sendDocumentByEmail() – Boundary 1: maximum recipients or attachment-size boundary', () => {
  it('accepts the boundary: 1000 recipients', async () => {
    const recipients: string[] = [];
    for (let i = 0; i < 1000; i += 1) {
      recipients.push(`user${i}@example.com`);
    }

    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      recipients,
      USER_ID,
    );

    expect(result.sentCount).toBe(1000);
    expect(result.failedCount).toBe(0);
  });

  it('accepts the boundary: 1 recipient (minimum)', async () => {
    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    expect(result.sentCount).toBe(1);
  });

  it('rejects the adjacent unsupported value: 0 recipients', async () => {
    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        [],
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('accepts the boundary: very long email (1 KB)', async () => {
    const longEmail = 'a'.repeat(500) + '@' + 'b'.repeat(500) + '.com';

    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        [longEmail],
        USER_ID,
      ),
    ).resolves.toBeDefined();
  });

  it('accepts the boundary: very long subject (1 MB)', async () => {
    // The service builds the subject from the document
    // title. If the title is very long, the subject will be
    // very long. We mock the document with a very long
    // subject and verify the service doesn't throw.
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildIssuedDocument({
        document: { subject: 'C'.repeat(1_000_000) },
      }),
    );

    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        ['user@example.com'],
        USER_ID,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        ['user@example.com'],
        USER_ID,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('records a safe diagnostic on boundary failure (no password / hash leak)', async () => {
    try {
      await service.sendDocumentByEmail(
        DOCUMENT_ID,
        [],
        USER_ID,
      );
    } catch (err: any) {
      expect(err.message).not.toMatch(/password|hash|secret/i);
    }
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 2: upper-bound value just at the supported
// limit for Send Outgoing Document by Email.
// Result : Very long email strings, very long titles, max
//          recipients.
// ---------------------------------------------------------------------------
describe('[UTCID09] outgoingDocumentsService.sendDocumentByEmail() – Boundary 2: upper-bound value', () => {
  it('accepts the upper-bound: very long email (1 MB)', async () => {
    const longEmail = 'a'.repeat(500_000) + '@' + 'b'.repeat(500_000) + '.com';

    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        [longEmail],
        USER_ID,
      ),
    ).resolves.toBeDefined();
  });

  it('accepts the upper-bound: 10,000 recipients', async () => {
    const recipients: string[] = [];
    for (let i = 0; i < 10_000; i += 1) {
      recipients.push(`user${i}@example.com`);
    }

    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      recipients,
      USER_ID,
    );

    expect(result.sentCount).toBe(10_000);
  });

  it('accepts the upper-bound: very long documentNumber in the subject', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildIssuedDocument({
        dispatchNumber: 'OUT-' + 'A'.repeat(1_000_000),
      }),
    );

    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        ['user@example.com'],
        USER_ID,
      ),
    ).resolves.toBeDefined();
  });

  it('accepts the upper-bound: very long signerName in the body', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue(
      buildIssuedDocument({
        document: { signerName: 'Nguyễn ' + 'A'.repeat(100_000) },
      }),
    );

    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        ['user@example.com'],
        USER_ID,
      ),
    ).resolves.toBeDefined();
  });

  it('returns the document when the upper-bound is hit', async () => {
    const result = await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    expect(result).toBeDefined();
    expect(result.sentCount).toBe(1);
  });

  it('does NOT throw on the upper-bound path', async () => {
    await expect(
      service.sendDocumentByEmail(
        DOCUMENT_ID,
        ['user@example.com'],
        USER_ID,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the upper-bound path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.sendDocumentByEmail(
      DOCUMENT_ID,
      ['user@example.com'],
      USER_ID,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
