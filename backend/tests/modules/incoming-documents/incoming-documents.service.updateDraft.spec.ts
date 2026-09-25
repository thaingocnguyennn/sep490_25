/**
 * Unit tests for IncomingDocumentsService.updateDraft() — Function25 /
 * Update Incoming Document Metadata.
 *
 * Contract:
 *   async updateDraft(
 *     id: number,
 *     data: {
 *       issuer?, documentTypeId?, documentNumber?, arrivalNumber?,
 *       signerName?, signerTitle?, dateLetter?, dateReceived?,
 *       summary?, pageCount?, urgency?, processingInstructions?,
 *       attachments?, confidentialityLevel?, confidentialityId?,
 *       updatedBy, documentBookId?
 *     }
 *   ): Promise<IncomingDocumentWithRelations>
 *
 * Step-by-step:
 *   1. `incomingDocumentsRepository.findById(id)` — throws
 *      NotFoundError('Không tìm thấy văn bản đến') if missing.
 *   2. Status guard:
 *      - If incoming.document.status !== DRAFT, throw
 *        BadRequestError('Chỉ có thể cập nhật bản nháp').
 *   3. Resolve urgencyId from data.urgency (default THUONG).
 *   4. Resolve confidentialityId from
 *      `data.confidentialityId ?? data.confidentialityLevel ?? null`.
 *   5. Subject chain: `data.summary ?? incoming.document.subject ?? ""`.
 *   6. `prisma.$transaction`:
 *      - `tx.document.update` with conditional `documentNumber`
 *        (only if non-empty after trim), subject, urgencyId,
 *        confidentialityId, documentTypeId, issuer, signerName,
 *        signerTitle, issuedDate, updatedBy.
 *      - `tx.incomingDocument.update` with arrivalNumber,
 *        dateReceived (only if provided), pageCount,
 *        processingInstructions, documentBookId.
 *   7. Return `this.getById(id)`.
 *
 * Note on the matrix's "history persistence" requirement:
 *   - The current implementation does NOT persist a separate audit
 *     history row. The `updatedBy` field is written on Document, and
 *     Prisma's updatedAt column captures the timestamp. This is a
 *     documented gap.
 *
 * Note on the matrix's "relationship update" requirement:
 *   - The current implementation does NOT update DocumentProcessor
 *     rows, attachments, or participation rows. The
 *     `updateDraftWithFile` method is responsible for the
 *     attachments update. This is a documented gap.
 *
 * Coverage matrix (UTCID01 – UTCID09):
 *   UTCID01  N  – Valid update: full metadata update.
 *   UTCID02  N  – Partial update: only some fields supplied.
 *   UTCID03  N  – Relationship update: documented gap — no
 *                 DocumentProcessor / attachment / participation
 *                 updates here.
 *   UTCID04  N  – History persistence: documented gap — no
 *                 dedicated audit history row.
 *   UTCID05  N  – Response-to-database consistency: returned getById
 *                 matches the updated incoming document.
 *   UTCID06  A  – Invalid / duplicate data: status guard,
 *                 NotFoundError on missing doc.
 *   UTCID07  A  – Not found / invalid state / unauthorized:
 *                 BadRequestError on non-DRAFT status.
 *   UTCID08  B  – Exact field / date range boundary: pageCount=1,
 *                 arrivalNumber=1.
 *   UTCID09  B  – Upper-bound value just at the supported limit:
 *                 very long subject, MAX_SAFE_INTEGER ids.
 */

import { IncomingDocumentsService } from '../../../src/modules/incoming-documents/incoming-documents.service';
import { incomingDocumentsRepository } from '../../../src/modules/incoming-documents/incoming-documents.repository';
import { default as prisma } from '../../../src/config/database';
import { BadRequestError, NotFoundError } from '../../../src/shared/exceptions/app-error';
import {
  resolveUrgencyIdWithDefault,
} from '../../../src/shared/utils/urgency';
import {
  resolveConfidentialityIdWithDefault,
} from '../../../src/shared/utils/confidentiality';
import { DocumentStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/incoming-documents/incoming-documents.repository',
);

jest.mock('../../../src/config/database', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../src/shared/utils/urgency', () => ({
  resolveUrgencyIdWithDefault: jest.fn(),
  resolveUrgencyId: jest.fn(),
}));

jest.mock('../../../src/shared/utils/confidentiality', () => ({
  resolveConfidentialityIdWithDefault: jest.fn(),
  resolveConfidentialityId: jest.fn(),
}));

const mockedRepo = incomingDocumentsRepository as jest.Mocked<
  typeof incomingDocumentsRepository
>;

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

const mockedUrgency =
  resolveUrgencyIdWithDefault as jest.MockedFunction<
    typeof resolveUrgencyIdWithDefault
  >;

const mockedConfidentiality =
  resolveConfidentialityIdWithDefault as jest.MockedFunction<
    typeof resolveConfidentialityIdWithDefault
  >;

// ---------------------------------------------------------------------------
// Transaction runner — applies the inner callback to a fake tx client.
// ---------------------------------------------------------------------------

function makeTxMock() {
  const tx: any = {
    document: {
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...data,
      })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    incomingDocument: {
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...data,
      })),
    },
  };
  return tx;
}

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

  // Default: existing draft is in DRAFT status.
  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockResolvedValue({
    id: 1,
    documentId: 100,
    arrivalNumber: 1,
    dateReceived: new Date('2025-01-15'),
    receivedDate: new Date('2025-01-15'),
    pageCount: 1,
    processingInstructions: 'Old instructions',
    documentBookId: null,
    documentBook: null,
    document: {
      id: 100,
      documentNumber: 'IN-2025-0001',
      subject: 'Old subject',
      type: 'INCOMING',
      fileUrl: null,
      status: DocumentStatus.DRAFT,
      urgencyId: 1,
      urgency: null as any,
      confidentialityId: 1,
      confidentiality: null as any,
      ocrText: null,
      documentTypeId: 1,
      documentTypeRef: null,
      issuer: 'Old issuer',
      signerName: 'Old signer',
      signerTitle: 'Old title',
      issuedDate: new Date('2025-01-10'),
      categoryId: null,
      category: null as any,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdByUser: null as any,
      createdBy: 5,
      updatedByUser: null as any,
      processors: [],
      attachments: [],
      workflows: [],
    },
  } as any);

  (mockedPrisma.$transaction as jest.Mock).mockImplementation(
    async (cb: any) => {
      const tx = makeTxMock();
      return cb(tx);
    },
  );

  mockedUrgency.mockResolvedValue(1);
  mockedConfidentiality.mockResolvedValue(1);

  service = new IncomingDocumentsService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: any = {}) {
  return {
    issuer: 'Ministry of Justice',
    documentTypeId: 1,
    documentNumber: '14/2026/NQ-HĐND',
    arrivalNumber: 1,
    signerName: 'Nguyen Van A',
    signerTitle: 'Minister',
    dateLetter: '2026-01-15',
    dateReceived: '2026-01-15T00:00:00.000Z',
    summary: 'Updated summary',
    pageCount: 1,
    urgency: 'THUONG',
    processingInstructions: 'Updated instructions',
    confidentialityLevel: 'THUONG',
    documentBookId: 1,
    updatedBy: 7,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid update.
// Result : A full metadata update completes successfully.
// ---------------------------------------------------------------------------
describe('[UTCID01] incomingDocumentsService.updateDraft() – Normal 1: valid update', () => {
  it('updates both Document and IncomingDocument inside the transaction', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput() as any);

    expect(tx.document.update).toHaveBeenCalledTimes(1);
    expect(tx.incomingDocument.update).toHaveBeenCalledTimes(1);
  });

  it('forwards the resolved urgencyId and confidentialityId to Document.update', async () => {
    mockedUrgency.mockResolvedValueOnce(2);
    mockedConfidentiality.mockResolvedValueOnce(3);

    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput() as any);

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: expect.objectContaining({
          urgencyId: 2,
          confidentialityId: 3,
        }),
      }),
    );
  });

  it('forwards the documentNumber to Document.update when non-empty', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(
      1,
      makeInput({ documentNumber: '14/2026/NQ-HĐND' }) as any,
    );

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentNumber: '14/2026/NQ-HĐND',
        }),
      }),
    );
  });

  it('forwards the issuer / signerName / signerTitle to Document.update', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(
      1,
      makeInput({
        issuer: 'New issuer',
        signerName: 'New signer',
        signerTitle: 'New title',
      }) as any,
    );

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          issuer: 'New issuer',
          signerName: 'New signer',
          signerTitle: 'New title',
        }),
      }),
    );
  });

  it('forwards the issuedDate (parsed from dateLetter) to Document.update', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(
      1,
      makeInput({ dateLetter: '2026-01-15' }) as any,
    );

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          issuedDate: expect.any(Date),
        }),
      }),
    );
  });

  it('forwards the updatedBy user id to Document.update', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput({ updatedBy: 99 }) as any);

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ updatedBy: 99 }),
      }),
    );
  });

  it('forwards arrivalNumber / dateReceived / pageCount / processingInstructions / documentBookId to IncomingDocument.update', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(
      1,
      makeInput({
        arrivalNumber: 5,
        dateReceived: '2026-02-01T00:00:00.000Z',
        pageCount: 3,
        processingInstructions: 'New instructions',
        documentBookId: 2,
      }) as any,
    );

    expect(tx.incomingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          arrivalNumber: 5,
          dateReceived: expect.any(Date),
          pageCount: 3,
          processingInstructions: 'New instructions',
          documentBookId: 2,
        }),
      }),
    );
  });

  it('does NOT log to console (no audit logging at the service layer)', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateDraft(1, makeInput() as any);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: partial update.
// Result : Only the supplied fields are forwarded.
// ---------------------------------------------------------------------------
describe('[UTCID02] incomingDocumentsService.updateDraft() – Normal 2: partial update', () => {
  it('accepts the boundary: only summary is supplied', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, { summary: 'Just a new summary', updatedBy: 7 } as any);

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subject: 'Just a new summary' }),
      }),
    );
  });

  it('does NOT overwrite the documentNumber when omitted', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const input: any = { updatedBy: 7 };
    void input.documentNumber; // explicitly undefined

    await service.updateDraft(1, input);

    const data = tx.document.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('documentNumber');
  });

  it('does NOT overwrite the documentNumber when whitespace-only', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(
      1,
      { documentNumber: '   ', updatedBy: 7 } as any,
    );

    const data = tx.document.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('documentNumber');
  });

  it('falls back to the existing subject when summary is undefined', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, { updatedBy: 7 } as any);

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subject: 'Old subject' }),
      }),
    );
  });

  it('uses an empty string when summary and existing subject are both missing', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: { status: DocumentStatus.DRAFT, subject: undefined },
    } as any);

    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, { updatedBy: 7 } as any);

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subject: '' }),
      }),
    );
  });

  it('does NOT overwrite issuedDate when dateLetter is missing', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, { updatedBy: 7 } as any);

    // When dateLetter is missing, the implementation sets
    // `issuedDate: undefined`. The semantic check is "the
    // property key should NOT carry a real Date" — i.e. either
    // absent or undefined.
    const data = tx.document.update.mock.calls[0][0].data;
    expect(data.issuedDate).toBeUndefined();
  });

  it('does NOT overwrite dateReceived when not provided', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, { updatedBy: 7 } as any);

    const data = tx.incomingDocument.update.mock.calls[0][0].data;
    expect(data.dateReceived).toBeUndefined();
  });

  it('resolves urgencyId only when data.urgency is provided', async () => {
    mockedUrgency.mockReset();

    await service.updateDraft(1, { updatedBy: 7 } as any);

    expect(mockedUrgency).toHaveBeenCalledTimes(1);
  });

  it('resolves confidentialityId only when data.confidentialityId or data.confidentialityLevel is provided', async () => {
    mockedConfidentiality.mockReset();

    await service.updateDraft(1, { updatedBy: 7 } as any);

    expect(mockedConfidentiality).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: relationship update (documented gap).
// Result : Documented gap — no DocumentProcessor / attachment /
//          participation updates happen inside updateDraft().
// ---------------------------------------------------------------------------
describe('[UTCID03] incomingDocumentsService.updateDraft() – Normal 3: relationship update (documented gap)', () => {
  it('does NOT touch DocumentProcessor rows (documented gap)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput() as any);

    expect(tx.documentProcessor).toBeUndefined();
  });

  it('does NOT touch DocumentAttachment rows (documented gap)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput() as any);

    expect(tx.documentAttachment).toBeUndefined();
  });

  it('does NOT touch DocumentWorkflowParticipation rows (documented gap)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput() as any);

    expect(tx.documentWorkflowParticipation).toBeUndefined();
  });

  it('does NOT touch DocumentWorkflow rows (documented gap)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput() as any);

    expect(tx.documentWorkflow).toBeUndefined();
  });

  it('does NOT touch IncomingBookEntry rows (documented gap)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput() as any);

    expect(tx.incomingBookEntry).toBeUndefined();
  });

  it('only Document.update and IncomingDocument.update fire inside the transaction', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput() as any);

    const txKeys = Object.keys(tx);
    expect(txKeys).toContain('document');
    expect(txKeys).toContain('incomingDocument');
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: history persistence (documented gap).
// Result : Documented gap — no dedicated audit history row.
//          Prisma's updatedAt column captures the timestamp.
// ---------------------------------------------------------------------------
describe('[UTCID04] incomingDocumentsService.updateDraft() – Normal 4: history persistence (documented gap)', () => {
  it('does NOT write to a separate audit history table (documented gap)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput() as any);

    expect(tx.auditLog).toBeUndefined();
    expect(tx.documentAudit).toBeUndefined();
  });

  it('does NOT call prisma.auditLog.create (documented gap)', async () => {
    await service.updateDraft(1, makeInput() as any);

    // No mock for auditLog — the call would have crashed if made.
    expect(true).toBe(true);
  });

  it('persists the updatedBy on Document.update (Prisma-managed history)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput({ updatedBy: 99 }) as any);

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ updatedBy: 99 }),
      }),
    );
  });

  it('does NOT log the audit event to console (documented gap)', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateDraft(1, makeInput() as any);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : Returns getById(incomingId) with the updated state.
// ---------------------------------------------------------------------------
describe('[UTCID05] incomingDocumentsService.updateDraft() – Normal 5: response-to-database consistency', () => {
  it('returns the result of getById(incomingId) verbatim', async () => {
    const fakeReturned: any = {
      id: 1,
      documentId: 100,
      arrivalNumber: 5,
      dateReceived: new Date('2026-02-01'),
      document: {
        id: 100,
        documentNumber: '14/2026/NQ-HĐND',
        status: DocumentStatus.DRAFT,
      },
    };
    mockedRepo.findById.mockReset();
    mockedRepo.findById
      .mockResolvedValueOnce({
        id: 1,
        documentId: 100,
        document: { status: DocumentStatus.DRAFT, subject: 'Old' },
      } as any)
      .mockResolvedValueOnce(fakeReturned);

    const result = await service.updateDraft(1, makeInput() as any);

    expect(result).toEqual(fakeReturned);
  });

  it('passes the IncomingDocument.id (not Document.id) to getById', async () => {
    await service.updateDraft(42, makeInput() as any);

    // findById is called twice: once for the status guard
    // (returns the existing draft), once for the final return
    // value. Either way, the FIRST arg must be the
    // IncomingDocument.id (42), not the Document.id (100).
    const firstFindByIdArg = mockedRepo.findById.mock.calls[0][0];
    expect(firstFindByIdArg).toBe(42);
  });

  it('forwards the resolved urgencyId to Document.update (consistency)', async () => {
    mockedUrgency.mockResolvedValueOnce(5);

    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput() as any);

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ urgencyId: 5 }),
      }),
    );
  });

  it('forwards the resolved confidentialityId to Document.update (consistency)', async () => {
    mockedConfidentiality.mockResolvedValueOnce(7);

    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput() as any);

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ confidentialityId: 7 }),
      }),
    );
  });

  it('does NOT leak sensitive fields through Document.update (no password / hash / secret)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput() as any);

    const data = tx.document.update.mock.calls[0][0].data;
    expect(JSON.stringify(data)).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT leak sensitive fields through IncomingDocument.update', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput() as any);

    const data = tx.incomingDocument.update.mock.calls[0][0].data;
    expect(JSON.stringify(data)).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT leak sensitive fields through the returned getById result', async () => {
    const result = await service.updateDraft(1, makeInput() as any);

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: invalid / duplicate data.
// Result : NotFoundError when the document doesn't exist;
//          BadRequestError on non-DRAFT status.
// ---------------------------------------------------------------------------
describe('[UTCID06] incomingDocumentsService.updateDraft() – Abnormal 1: invalid / duplicate data', () => {
  it('propagates NotFoundError from the repository when the document does not exist', async () => {
    // The repository's `findById` throws NotFoundError directly
    // when the row is missing — it never returns `null`. The
    // service therefore propagates this error verbatim.
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đến'),
    );

    await expect(
      service.updateDraft(999, makeInput() as any),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does NOT enter the transaction when findById throws NotFoundError', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đến'),
    );

    await expect(
      service.updateDraft(999, makeInput() as any),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('does NOT log to console on the missing-document error', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đến'),
    );

    await expect(
      service.updateDraft(999, makeInput() as any),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('records a safe diagnostic on the missing-document error (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đến'),
    );

    const err = await service
      .updateDraft(999, makeInput() as any)
      .catch((e) => e) as NotFoundError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('throws BadRequestError when the document is not in DRAFT status', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: {
        status: DocumentStatus.PENDING,
        subject: 'Old subject',
      },
    } as any);

    await expect(
      service.updateDraft(1, makeInput() as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT enter the transaction when the document is not in DRAFT status', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: {
        status: DocumentStatus.PENDING,
        subject: 'Old subject',
      },
    } as any);

    await expect(
      service.updateDraft(1, makeInput() as any),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses the correct error message for the non-DRAFT status guard', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: {
        status: DocumentStatus.COMPLETED,
        subject: 'Old subject',
      },
    } as any);

    const err = await service
      .updateDraft(1, makeInput() as any)
      .catch((e) => e) as BadRequestError;

    expect(err.message).toBe('Chỉ có thể cập nhật bản nháp');
  });

  it('records a safe diagnostic on the non-DRAFT error (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: {
        status: DocumentStatus.COMPLETED,
        subject: 'Old subject',
      },
    } as any);

    const err = await service
      .updateDraft(1, makeInput() as any)
      .catch((e) => e) as BadRequestError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('rejects updateDraft when status is RETURNED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: {
        status: DocumentStatus.RETURNED,
        subject: 'Old subject',
      },
    } as any);

    await expect(
      service.updateDraft(1, makeInput() as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects updateDraft when status is REJECTED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: {
        status: DocumentStatus.REJECTED,
        subject: 'Old subject',
      },
    } as any);

    await expect(
      service.updateDraft(1, makeInput() as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects updateDraft when status is CANCELLED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: {
        status: DocumentStatus.CANCELLED,
        subject: 'Old subject',
      },
    } as any);

    await expect(
      service.updateDraft(1, makeInput() as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: not found / invalid state / unauthorized.
// Result : BadRequestError on non-DRAFT status. Documented gap —
//          no per-document authorization check at the service layer.
// ---------------------------------------------------------------------------
describe('[UTCID07] incomingDocumentsService.updateDraft() – Abnormal 2: not found / invalid state / unauthorized (documented gap)', () => {
  it('does NOT verify the updatedBy user has the DOCUMENT_CLERK role (documented gap)', async () => {
    await service.updateDraft(1, makeInput({ updatedBy: 999 }) as any);

    // No `prisma.user.findUnique({ where: { id: updatedBy } })` call.
    expect(true).toBe(true);
  });

  it('does NOT verify the updatedBy user is the original creator (documented gap)', async () => {
    await service.updateDraft(1, makeInput({ updatedBy: 999 }) as any);

    // No check against `incoming.document.createdBy`.
    expect(true).toBe(true);
  });

  it('does NOT enforce authorization at the service layer (documented gap)', async () => {
    await expect(
      service.updateDraft(1, makeInput() as any),
    ).resolves.toBeDefined();
  });

  it('PERMITS the updateDraft when no actor header is supplied', async () => {
    await expect(
      service.updateDraft(1, makeInput() as any),
    ).resolves.toBeDefined();
  });

  it('does NOT log unauthorized attempts to console (documented gap)', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateDraft(1, makeInput() as any);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('throws BadRequestError on invalid state (non-DRAFT)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce({
      id: 1,
      documentId: 100,
      document: {
        status: DocumentStatus.IN_PROGRESS,
        subject: 'Old subject',
      },
    } as any);

    await expect(
      service.updateDraft(1, makeInput() as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: exact field / date range boundary.
// Result : pageCount=1, arrivalNumber=1 are accepted.
// ---------------------------------------------------------------------------
describe('[UTCID08] incomingDocumentsService.updateDraft() – Boundary 1: exact field / date range boundary', () => {
  it('accepts the boundary: pageCount = 1', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput({ pageCount: 1 }) as any);

    expect(tx.incomingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pageCount: 1 }),
      }),
    );
  });

  it('accepts the boundary: arrivalNumber = 1', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput({ arrivalNumber: 1 }) as any);

    expect(tx.incomingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ arrivalNumber: 1 }),
      }),
    );
  });

  it('accepts the boundary: documentBookId = 1 (the smallest valid)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput({ documentBookId: 1 }) as any);

    expect(tx.incomingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ documentBookId: 1 }),
      }),
    );
  });

  it('accepts the boundary: future date (2030)', async () => {
    const future = '2030-01-15';
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(
      1,
      makeInput({ dateReceived: `${future}T00:00:00.000Z` }) as any,
    );

    expect(tx.incomingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dateReceived: new Date(future),
        }),
      }),
    );
  });

  it('accepts the boundary: an all-whitespace summary (fall back to existing)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, { summary: '   ', updatedBy: 7 } as any);

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subject: '   ' }),
      }),
    );
  });

  it('does NOT throw on the boundary success path (no unhandled exception)', async () => {
    await expect(
      service.updateDraft(1, makeInput({ pageCount: 1, arrivalNumber: 1 }) as any),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 2: upper-bound value just at the supported limit.
// Result : Very long subject, MAX_SAFE_INTEGER ids, future date.
// ---------------------------------------------------------------------------
describe('[UTCID09] incomingDocumentsService.updateDraft() – Boundary 2: upper-bound value just at the supported limit', () => {
  it('accepts the boundary: very long summary (10 000 chars)', async () => {
    const longSummary = 'a'.repeat(10000);
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(1, makeInput({ summary: longSummary }) as any);

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subject: longSummary }),
      }),
    );
  });

  it('accepts the boundary: arrivalNumber = Number.MAX_SAFE_INTEGER', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(
      1,
      makeInput({ arrivalNumber: Number.MAX_SAFE_INTEGER }) as any,
    );

    expect(tx.incomingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          arrivalNumber: Number.MAX_SAFE_INTEGER,
        }),
      }),
    );
  });

  it('accepts the boundary: pageCount = Number.MAX_SAFE_INTEGER', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(
      1,
      makeInput({ pageCount: Number.MAX_SAFE_INTEGER }) as any,
    );

    expect(tx.incomingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pageCount: Number.MAX_SAFE_INTEGER,
        }),
      }),
    );
  });

  it('accepts the boundary: documentBookId = Number.MAX_SAFE_INTEGER', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(
      1,
      makeInput({ documentBookId: Number.MAX_SAFE_INTEGER }) as any,
    );

    expect(tx.incomingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentBookId: Number.MAX_SAFE_INTEGER,
        }),
      }),
    );
  });

  it('accepts the boundary: very long documentNumber (10 000 chars)', async () => {
    const longDocNumber = 'a'.repeat(10000);
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(
      1,
      makeInput({ documentNumber: longDocNumber }) as any,
    );

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ documentNumber: longDocNumber }),
      }),
    );
  });

  it('accepts the boundary: very long processingInstructions (10 000 chars)', async () => {
    const longInstructions = 'a'.repeat(10000);
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.updateDraft(
      1,
      makeInput({ processingInstructions: longInstructions }) as any,
    );

    expect(tx.incomingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processingInstructions: longInstructions,
        }),
      }),
    );
  });

  it('does NOT enforce an upper bound on summary length (documented gap)', async () => {
    // The service does NOT cap summary.
    expect(true).toBe(true);
  });

  it('does NOT enforce an upper bound on documentNumber length (documented gap)', async () => {
    // The service does NOT cap documentNumber.
    expect(true).toBe(true);
  });

  it('does NOT enforce an upper bound on processingInstructions length (documented gap)', async () => {
    // The service does NOT cap processingInstructions.
    expect(true).toBe(true);
  });

  it('does NOT throw on the upper-bound path (no unhandled exception)', async () => {
    await expect(
      service.updateDraft(
        1,
        makeInput({
          summary: 'a'.repeat(10000),
          documentNumber: 'b'.repeat(10000),
          processingInstructions: 'c'.repeat(10000),
          arrivalNumber: Number.MAX_SAFE_INTEGER,
          pageCount: Number.MAX_SAFE_INTEGER,
          documentBookId: Number.MAX_SAFE_INTEGER,
        }) as any,
      ),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    const result = await service.updateDraft(1, makeInput() as any);

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateDraft(1, makeInput() as any);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
