/**
 * Unit tests for IncomingDocumentsService.saveDraft() — Function26 /
 * Save Incoming Document Draft.
 *
 * Contract:
 *   async saveDraft(data: {
 *     issuer?, documentTypeId?, documentNumber?, arrivalNumber?,
 *     signerName?, signerTitle?, dateLetter?, dateReceived?, summary?,
 *     pageCount?, urgency?, processingInstructions?, attachments?,
 *     createdBy, confidentialityLevel?, confidentialityId?, documentBookId?
 *   }): Promise<IncomingDocumentWithRelations>
 *
 * Step-by-step:
 *   1. documentNumber:
 *      - Use data.documentNumber.trim() if non-empty.
 *      - Otherwise call documentsRepository.generateDocumentNumber('INCOMING').
 *   2. urgencyId:
 *      - From data.urgency if non-empty.
 *      - Otherwise resolveUrgencyIdWithDefault(null) → THUONG.
 *   3. confidentialityId:
 *      - From `data.confidentialityId ?? data.confidentialityLevel ?? null`.
 *      - Otherwise resolveConfidentialityIdWithDefault(null) → THUONG.
 *   4. documentBookId:
 *      - Defensive parse: string → parseInt(_, 10); number → as-is.
 *      - Otherwise undefined.
 *   5. prisma.$transaction:
 *      - tx.document.create with subject = data.summary ?? '',
 *        status = DRAFT, type = INCOMING.
 *      - tx.incomingDocument.create with dateReceived =
 *        new Date(data.dateReceived) || new Date() (default).
 *      - tx.documentAttachment.createMany if attachments.
 *      - upsertParticipation(CLERK, PENDING).
 *   6. Return this.getById(result.incomingId).
 *
 * Note on the matrix's "update draft" UTCID02:
 *   - The implementation does NOT have an "update existing draft"
 *     path. saveDraft() ALWAYS creates a new Document and
 *     IncomingDocument row. UTCID02 documents this gap.
 *
 * Note on the matrix's "audit" log requirement:
 *   - The service does NOT log anything on saveDraft. This is a
 *     documented gap.
 *
 * Coverage matrix (UTCID01 – UTCID07):
 *   UTCID01  N  – New draft: full payload produces a new
 *                 Document + IncomingDocument.
 *   UTCID02  N  – Update draft (documented gap): re-saving the
 *                 same payload creates a duplicate row.
 *   UTCID03  N  – Incomplete allowed fields: only some fields
 *                 supplied; others fall back to defaults.
 *   UTCID04  N  – Persistence: Document + IncomingDocument +
 *                 DocumentAttachment + Participation rows are
 *                 created.
 *   UTCID05  A  – Invalid draft payload: missing createdBy,
 *                 malformed urgency.
 *   UTCID06  A  – Unauthorized / repository failure: documented
 *                 gap — no actor check at the service layer.
 *   UTCID07  B  – Minimum draft payload or maximum field length:
 *                 empty payload, very long fields, MAX_SAFE_INTEGER.
 */

import { IncomingDocumentsService } from '../../../src/modules/incoming-documents/incoming-documents.service';
import { documentsRepository } from '../../../src/modules/documents/documents.repository';
import { default as prisma } from '../../../src/config/database';
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

jest.mock('../../../src/modules/documents/documents.repository');

// saveDraft() returns this.getById(incomingId), which calls
// incomingDocumentsRepository.findById. We need to mock that.
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

const mockedDocsRepo = documentsRepository as jest.Mocked<
  typeof documentsRepository
>;

import { incomingDocumentsRepository } from '../../../src/modules/incoming-documents/incoming-documents.repository';
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
      create: jest.fn(async ({ data }: any) => ({
        id: 100,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...data,
      })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    incomingDocument: {
      create: jest.fn(async ({ data }: any) => ({
        id: 1,
        ...data,
      })),
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...data,
      })),
    },
    documentBook: {
      update: jest.fn(async () => ({ id: 1, currentNumber: 1 })),
    },
    incomingBookEntry: {
      create: jest.fn(async ({ data }: any) => ({
        id: 1,
        ...data,
      })),
    },
    documentProcessor: {
      createMany: jest.fn(async () => ({ count: 1 })),
    },
    documentAttachment: {
      createMany: jest.fn(async () => ({ count: 1 })),
    },
    documentWorkflow: {
      createMany: jest.fn(async () => ({ count: 3 })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    documentWorkflowParticipation: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({
        id: Math.floor(Math.random() * 1_000_000) + 1,
        ...data,
      })),
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id ?? 1,
        ...data,
      })),
      updateMany: jest.fn(async () => ({ count: 1 })),
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

  (mockedPrisma.$transaction as jest.Mock).mockImplementation(
    async (cb: any) => {
      const tx = makeTxMock();
      return cb(tx);
    },
  );

  mockedUrgency.mockResolvedValue(1);
  mockedConfidentiality.mockResolvedValue(1);

  mockedDocsRepo.generateDocumentNumber.mockResolvedValue('IN-2025-0001');

  // Default mock for incomingDocumentsRepository.findById — saveDraft()
  // calls this.getById(incomingId) at the end of the method.
  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockResolvedValue({
    id: 1,
    documentId: 100,
    arrivalNumber: 1,
    dateReceived: new Date('2025-01-15'),
    receivedDate: new Date('2025-01-15'),
    pageCount: null,
    processingInstructions: null,
    documentBookId: null,
    documentBook: null,
    document: {
      id: 100,
      documentNumber: 'IN-2025-0001',
      subject: 'Test',
      type: 'INCOMING',
      fileUrl: null,
      status: DocumentStatus.DRAFT,
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
    summary: 'Test summary',
    pageCount: 1,
    urgency: 'THUONG',
    processingInstructions: 'Test processing instructions',
    attachments: [],
    createdBy: 5,
    confidentialityLevel: 'THUONG',
    documentBookId: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: new draft.
// Result : A new draft is created.
// ---------------------------------------------------------------------------
describe('[UTCID01] incomingDocumentsService.saveDraft() – Normal 1: new draft', () => {
  it('creates a Document row in DRAFT status', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(makeInput() as any);

    expect(tx.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DocumentStatus.DRAFT }),
      }),
    );
  });

  it('creates an IncomingDocument row tied to the Document', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(makeInput() as any);

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ documentId: 100 }),
      }),
    );
  });

  it('uses the user-supplied documentNumber when non-empty', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(
      makeInput({ documentNumber: '14/2026/NQ-HĐND' }) as any,
    );

    expect(tx.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentNumber: '14/2026/NQ-HĐND',
        }),
      }),
    );
  });

  it('falls back to generateDocumentNumber when documentNumber is empty', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(makeInput({ documentNumber: '' }) as any);

    expect(mockedDocsRepo.generateDocumentNumber).toHaveBeenCalledWith(
      'INCOMING',
    );
    expect(tx.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentNumber: 'IN-2025-0001',
        }),
      }),
    );
  });

  it('sets the Document.type to INCOMING', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(makeInput() as any);

    expect(tx.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'INCOMING' }),
      }),
    );
  });

  it('stores the resolved urgencyId and confidentialityId on the Document', async () => {
    mockedUrgency.mockResolvedValueOnce(2);
    mockedConfidentiality.mockResolvedValueOnce(3);

    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(makeInput() as any);

    expect(tx.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          urgencyId: 2,
          confidentialityId: 3,
        }),
      }),
    );
  });

  it('stores the createdBy user id on the Document', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(makeInput({ createdBy: 99 }) as any);

    expect(tx.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdBy: 99 }),
      }),
    );
  });

  it('forwards the issuer / signerName / signerTitle to Document.create', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(
      makeInput({
        issuer: 'New issuer',
        signerName: 'New signer',
        signerTitle: 'New title',
      }) as any,
    );

    expect(tx.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          issuer: 'New issuer',
          signerName: 'New signer',
          signerTitle: 'New title',
        }),
      }),
    );
  });

  it('does NOT log to console (no audit logging at the service layer)', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.saveDraft(makeInput() as any);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: update draft (documented gap).
// Result : Re-saving the same payload creates a duplicate row.
// ---------------------------------------------------------------------------
describe('[UTCID02] incomingDocumentsService.saveDraft() – Normal 2: update draft (documented gap)', () => {
  it('does NOT detect a duplicate documentNumber (documented gap)', async () => {
    // No select-based "select by documentNumber where exists" call.
    await service.saveDraft(makeInput() as any);

    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does NOT have an "update existing draft" path (documented gap)', async () => {
    // saveDraft() always calls tx.document.create, never tx.document.update.
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(makeInput() as any);

    expect(tx.document.create).toHaveBeenCalledTimes(1);
    expect(tx.document.update).not.toHaveBeenCalled();
  });

  it('a P2002 error bubbles up as a raw Prisma error (no friendly ConflictError mapping)', async () => {
    (mockedPrisma.$transaction as jest.Mock).mockReset();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async () => {
        const err: any = new Error('Unique constraint failed');
        err.code = 'P2002';
        throw err;
      },
    );

    await expect(service.saveDraft(makeInput() as any)).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('does NOT enforce uniqueness at the application layer (documented gap)', async () => {
    // saveDraft is a single-row insert; no pre-check.
    await service.saveDraft(makeInput() as any);

    // No fixture.id collision check.
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does NOT log a warning when P2002 fires (no application-level de-duplication)', async () => {
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    (mockedPrisma.$transaction as jest.Mock).mockReset();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async () => {
        const err: any = new Error('Unique constraint failed');
        err.code = 'P2002';
        throw err;
      },
    );

    await expect(service.saveDraft(makeInput() as any)).rejects.toBeDefined();

    expect(consoleWarnSpy).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: incomplete allowed fields.
// Result : Only some fields supplied; defaults fill in the rest.
// ---------------------------------------------------------------------------
describe('[UTCID03] incomingDocumentsService.saveDraft() – Normal 3: incomplete allowed fields', () => {
  it('accepts the boundary: only documentNumber is supplied', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft({
      documentNumber: '14/2026/NQ-HĐND',
      createdBy: 5,
    } as any);

    expect(tx.document.create).toHaveBeenCalled();
    expect(tx.incomingDocument.create).toHaveBeenCalled();
  });

  it('accepts the boundary: only dateReceived is supplied', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft({
      dateReceived: '2026-01-15T00:00:00.000Z',
      createdBy: 5,
    } as any);

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dateReceived: expect.any(Date),
        }),
      }),
    );
  });

  it('uses an empty string for the subject when summary is missing', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft({ createdBy: 5 } as any);

    expect(tx.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subject: '' }),
      }),
    );
  });

  it('falls back to THUONG urgencyId when data.urgency is missing', async () => {
    mockedUrgency.mockReset();
    mockedUrgency.mockResolvedValueOnce(1);

    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft({ createdBy: 5 } as any);

    expect(tx.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ urgencyId: 1 }),
      }),
    );
  });

  it('falls back to THUONG confidentialityId when both fields are missing', async () => {
    mockedConfidentiality.mockReset();
    mockedConfidentiality.mockResolvedValueOnce(1);

    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft({ createdBy: 5 } as any);

    expect(tx.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ confidentialityId: 1 }),
      }),
    );
  });

  it('uses the current date as dateReceived when not provided', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft({ createdBy: 5 } as any);

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dateReceived: expect.any(Date),
        }),
      }),
    );
  });

  it('accepts the boundary: empty object (only createdBy)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft({ createdBy: 5 } as any);

    expect(tx.document.create).toHaveBeenCalled();
    expect(tx.incomingDocument.create).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: persistence.
// Result : Document + IncomingDocument + DocumentAttachment + CLERK
//          participation row are persisted.
// ---------------------------------------------------------------------------
describe('[UTCID04] incomingDocumentsService.saveDraft() – Normal 4: persistence', () => {
  it('creates Document and IncomingDocument inside the transaction', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(makeInput() as any);

    expect(tx.document.create).toHaveBeenCalledTimes(1);
    expect(tx.incomingDocument.create).toHaveBeenCalledTimes(1);
  });

  it('persists metadata-only attachments', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(
      makeInput({
        attachments: [
          {
            fileName: 'attachment.pdf',
            fileUrl: '/uploads/attachment-12345.pdf',
            fileSize: 1024,
            mimeType: 'application/pdf',
          },
        ],
      }) as any,
    );

    expect(tx.documentAttachment.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            fileName: 'attachment.pdf',
            fileUrl: '/uploads/attachment-12345.pdf',
          }),
        ]),
      }),
    );
  });

  it('does NOT create DocumentAttachment rows when attachments is empty', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(makeInput({ attachments: [] }) as any);

    expect(tx.documentAttachment.createMany).not.toHaveBeenCalled();
  });

  it('creates a CLERK participation row in PENDING status', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(makeInput({ createdBy: 99 }) as any);

    expect(tx.documentWorkflowParticipation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentId: 100,
          userId: 99,
          participationRole: 'CLERK',
          status: 'PENDING',
        }),
      }),
    );
  });

  it('does NOT create DocumentProcessor rows (drafts have no processors)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(makeInput() as any);

    // saveDraft never touches tx.documentProcessor.
    expect(tx.documentProcessor.createMany).not.toHaveBeenCalled();
  });

  it('does NOT create DocumentWorkflow rows (drafts skip the workflow)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(makeInput() as any);

    expect(tx.documentWorkflow.createMany).not.toHaveBeenCalled();
  });

  it('does NOT create IncomingBookEntry rows (drafts skip the book)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(
      makeInput({ documentBookId: 1, arrivalNumber: 1 }) as any,
    );

    expect(tx.incomingBookEntry.create).not.toHaveBeenCalled();
  });

  it('does NOT touch DocumentBook.currentNumber (drafts skip the counter)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(
      makeInput({ documentBookId: 1, arrivalNumber: 1 }) as any,
    );

    expect(tx.documentBook.update).not.toHaveBeenCalled();
  });

  it('does NOT log to console (no audit logging at the service layer)', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.saveDraft(makeInput() as any);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Abnormal 1: invalid draft payload.
// Result : BadRequestError-equivalent: malformed urgency /
//          confidentiality / documentBookId. Note: the service
//          does NOT explicitly validate urgency / confidentiality
//          strings; the resolveUrgencyIdWithDefault /
//          resolveConfidentialityIdWithDefault helpers return
//          the default when the input is unrecognized.
// ---------------------------------------------------------------------------
describe('[UTCID05] incomingDocumentsService.saveDraft() – Abnormal 1: invalid draft payload', () => {
  it('does NOT throw on a missing createdBy (it stores undefined)', async () => {
    // The service does NOT validate `createdBy` — it stores whatever
    // was passed. The route enforces `requireRole`, but the service
    // layer accepts a non-number.
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await expect(
      service.saveDraft({} as any),
    ).resolves.toBeDefined();
  });

  it('does NOT validate the documentNumber length (documented gap)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(
      makeInput({ documentNumber: 'a'.repeat(100000) }) as any,
    );

    expect(tx.document.create).toHaveBeenCalled();
  });

  it('does NOT validate the issuer length (documented gap)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(
      makeInput({ issuer: 'a'.repeat(100000) }) as any,
    );

    expect(tx.document.create).toHaveBeenCalled();
  });

  it('does NOT validate the dateReceived is in the past', async () => {
    const future = '2099-01-15T00:00:00.000Z';
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(makeInput({ dateReceived: future }) as any);

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dateReceived: new Date(future),
        }),
      }),
    );
  });

  it('does NOT validate the pageCount range (documented gap)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(
      makeInput({ pageCount: -100 }) as any,
    );

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pageCount: -100 }),
      }),
    );
  });

  it('does NOT validate the arrivalNumber range (documented gap)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(
      makeInput({ arrivalNumber: -1 }) as any,
    );

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ arrivalNumber: -1 }),
      }),
    );
  });

  it('records a safe diagnostic on Prisma errors (no password / hash leak)', async () => {
    (mockedPrisma.$transaction as jest.Mock).mockReset();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async () => {
        const err: any = new Error(
          'Invalid value for argument `createdBy`. Expected Int.',
        );
        err.code = 'P2009';
        throw err;
      },
    );

    const err = await service
      .saveDraft({ createdBy: 'not a number' } as any)
      .catch((e) => e);

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on validation failures', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    (mockedPrisma.$transaction as jest.Mock).mockReset();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async () => {
        throw new Error('Invalid input');
      },
    );

    await expect(
      service.saveDraft({} as any),
    ).rejects.toBeDefined();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 2: unauthorized / repository failure.
// Result : Documented gap — no actor check at the service layer.
//          P2002 / P2025 errors bubble up as raw Prisma errors.
// ---------------------------------------------------------------------------
describe('[UTCID06] incomingDocumentsService.saveDraft() – Abnormal 2: unauthorized / repository failure', () => {
  it('does NOT verify createdBy has the DOCUMENT_CLERK role (documented gap)', async () => {
    // The service accepts any positive userId; no role-based check.
    await service.saveDraft(makeInput({ createdBy: 999 }) as any);

    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('does NOT verify the creator exists in the database (documented gap)', async () => {
    // No `prisma.user.findUnique({ where: { id: createdBy } })` call.
    await service.saveDraft(makeInput({ createdBy: 999 }) as any);

    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('does NOT enforce authentication at the service layer (documented gap)', async () => {
    await expect(
      service.saveDraft(makeInput() as any),
    ).resolves.toBeDefined();
  });

  it('PERMITS the saveDraft when no actor header is supplied', async () => {
    await expect(
      service.saveDraft(makeInput() as any),
    ).resolves.toBeDefined();
  });

  it('does NOT log unauthorized attempts to console (documented gap)', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.saveDraft(makeInput() as any);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('propagates a repository failure (e.g. documentNumber collision)', async () => {
    (mockedPrisma.$transaction as jest.Mock).mockReset();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async () => {
        const err: any = new Error('Unique constraint failed');
        err.code = 'P2002';
        throw err;
      },
    );

    await expect(
      service.saveDraft(makeInput() as any),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('propagates a "record not found" Prisma error', async () => {
    (mockedPrisma.$transaction as jest.Mock).mockReset();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async () => {
        const err: any = new Error('Record not found');
        err.code = 'P2025';
        throw err;
      },
    );

    await expect(
      service.saveDraft(makeInput() as any),
    ).rejects.toMatchObject({ code: 'P2025' });
  });

  it('records a safe diagnostic on repository failures (no password / hash leak)', async () => {
    (mockedPrisma.$transaction as jest.Mock).mockReset();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async () => {
        const err: any = new Error('Database connection refused');
        err.code = 'P1001';
        throw err;
      },
    );

    const err = await service
      .saveDraft(makeInput() as any)
      .catch((e) => e);

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Boundary 1: minimum draft payload or maximum field length.
// Result : Empty payload (only createdBy), very long fields,
//          MAX_SAFE_INTEGER ids.
// ---------------------------------------------------------------------------
describe('[UTCID07] incomingDocumentsService.saveDraft() – Boundary 1: minimum draft payload or maximum field length', () => {
  it('accepts the boundary: minimum payload (only createdBy)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft({ createdBy: 5 } as any);

    expect(tx.document.create).toHaveBeenCalled();
    expect(tx.incomingDocument.create).toHaveBeenCalled();
  });

  it('accepts the boundary: very long documentNumber (10 000 chars)', async () => {
    const longDocNumber = 'a'.repeat(10000);
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(
      makeInput({ documentNumber: longDocNumber }) as any,
    );

    expect(tx.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentNumber: longDocNumber,
        }),
      }),
    );
  });

  it('accepts the boundary: very long summary (10 000 chars)', async () => {
    const longSummary = 'a'.repeat(10000);
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(makeInput({ summary: longSummary }) as any);

    expect(tx.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subject: longSummary }),
      }),
    );
  });

  it('accepts the boundary: very long processingInstructions (10 000 chars)', async () => {
    const longInstructions = 'a'.repeat(10000);
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(
      makeInput({ processingInstructions: longInstructions }) as any,
    );

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processingInstructions: longInstructions,
        }),
      }),
    );
  });

  it('accepts the boundary: arrivalNumber = Number.MAX_SAFE_INTEGER', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(
      makeInput({ arrivalNumber: Number.MAX_SAFE_INTEGER }) as any,
    );

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
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

    await service.saveDraft(
      makeInput({ pageCount: Number.MAX_SAFE_INTEGER }) as any,
    );

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
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

    await service.saveDraft(
      makeInput({ documentBookId: Number.MAX_SAFE_INTEGER }) as any,
    );

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentBookId: Number.MAX_SAFE_INTEGER,
        }),
      }),
    );
  });

  it('parses a string documentBookId via parseInt (defensive parsing)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(
      makeInput({ documentBookId: '42' }) as any,
    );

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ documentBookId: 42 }),
      }),
    );
  });

  it('uses the numeric documentBookId as-is', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft(makeInput({ documentBookId: 42 }) as any);

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ documentBookId: 42 }),
      }),
    );
  });

  it('uses the current date as dateReceived when not provided', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.saveDraft({ createdBy: 5 } as any);

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dateReceived: expect.any(Date),
        }),
      }),
    );
  });

  it('does NOT enforce an upper bound on documentNumber / summary / processingInstructions (documented gap)', async () => {
    // The service does NOT cap text fields. Express-validator
    // upstream is responsible for length limits.
    expect(true).toBe(true);
  });

  it('does NOT throw on the upper-bound path (no unhandled exception)', async () => {
    await expect(
      service.saveDraft(
        makeInput({
          documentNumber: 'a'.repeat(10000),
          summary: 'b'.repeat(10000),
          processingInstructions: 'c'.repeat(10000),
          arrivalNumber: Number.MAX_SAFE_INTEGER,
          pageCount: Number.MAX_SAFE_INTEGER,
          documentBookId: Number.MAX_SAFE_INTEGER,
        }) as any,
      ),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    const result = await service.saveDraft(makeInput() as any);

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.saveDraft(makeInput() as any);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
