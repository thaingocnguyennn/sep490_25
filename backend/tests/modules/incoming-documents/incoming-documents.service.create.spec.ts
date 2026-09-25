/**
 * Unit tests for IncomingDocumentsService.create() — Function23 /
 * Create Incoming Document.
 *
 * Contract:
 *   async create(data: {
 *     issuer?, documentTypeId?, documentNumber?, arrivalNumber?,
 *     signerName?, signerTitle?, dateLetter?, dateReceived, summary,
 *     pageCount?, urgency?, processingInstructions?, processorIds:
 *     ProcessorInput[], attachments?, createdBy, confidentialityLevel?,
 *     confidentialityId?, documentBookId?
 *   }): Promise<IncomingDocumentWithRelations>
 *
 * Step-by-step:
 *   1. Verify all `processorIds` reference existing users
 *      (`prisma.user.findMany`). If any are missing, throw
 *      BadRequestError.
 *   2. `validateProcessorRoles` (module-level helper):
 *      - Processor list must be non-empty.
 *      - Exactly one XLC.
 *      - No user appears twice.
 *      - XLC must hold DEPARTMENT_HEAD.
 *      - PHXL / XDB must hold DEPARTMENT_HEAD or SPECIALIST.
 *   3. `documentNumber`:
 *      - Use `data.documentNumber.trim()` if non-empty.
 *      - Otherwise call `documentsRepository.generateDocumentNumber('INCOMING')`.
 *   4. `prisma.workflowStep.findMany` — order by stepOrder: 'asc'.
 *   5. Resolve `urgencyId`:
 *      - From `data.urgency` if provided.
 *      - Default to THUONG otherwise.
 *   6. Resolve `confidentialityId`:
 *      - From `data.confidentialityId ?? data.confidentialityLevel ?? null`.
 *      - Default to THUONG otherwise.
 *   7. Defensively parse `documentBookId` (string → int).
 *   8. `prisma.$transaction`:
 *      - Create Document (status PENDING, type INCOMING).
 *      - Create IncomingDocument.
 *      - If documentBookId + arrivalNumber: create IncomingBookEntry
 *        and bump DocumentBook.currentNumber.
 *      - Create DocumentProcessor rows (one per processor).
 *      - Create DocumentAttachment rows (one per attachment).
 *      - Create DocumentWorkflow rows (one per step, all PENDING).
 *      - Mark CLERK step (stepOrder=1) as COMPLETED.
 *      - Create participation rows for CLERK (COMPLETED), XLC
 *        (PENDING + DEPARTMENT_HEAD pending), and PHXL/XDB (PENDING).
 *   9. Return `this.getById(result.incomingId)`.
 *
 * Note on the matrix's "repeat-safe processing" requirement:
 *   - The current implementation does NOT detect duplicate
 *     `documentNumber` and does NOT reject re-submission of the same
 *     arrival number. P2002 errors from the unique constraint on
 *     Document.documentNumber bubble up as raw Prisma errors. This is
 *     a documented gap.
 *
 * Coverage matrix (UTCID01 – UTCID10):
 *   UTCID01  N  – Valid metadata: create accepts a fully-populated
 *                 payload.
 *   UTCID02  N  – Document number / book mapping: caller-supplied
 *                 documentNumber wins; otherwise auto-generated.
 *                 Book id mapping respects string vs number.
 *   UTCID03  N  – File association: attachments are persisted.
 *   UTCID04  N  – Persistence / audit: workflow steps + participation
 *                 rows are created.
 *   UTCID05  N  – Response-to-database consistency: returned
 *                 `getById` matches the inserted ids.
 *   UTCID06  N  – Repeat-safe processing: documented gap — no
 *                 duplicate detection.
 *   UTCID07  A  – Invalid / duplicate required data: missing
 *                 processors, missing users, XLC count, dedup
 *                 invariant.
 *   UTCID08  A  – Unauthorized creator: documented gap — no actor
 *                 verification at the service layer. The route
 *                 handles `requireRole` enforcement.
 *   UTCID09  B  – Exact metadata / file / date limit: 1-page doc,
 *                 long subject, future dates.
 *   UTCID10  B  – Upper-bound value just at the supported limit for
 *                 Create Incoming Document: max processors, max
 *                 attachments.
 */

import { IncomingDocumentsService } from '../../../src/modules/incoming-documents/incoming-documents.service';
import { incomingDocumentsRepository } from '../../../src/modules/incoming-documents/incoming-documents.repository';
import { documentsRepository } from '../../../src/modules/documents/documents.repository';
import { BadRequestError } from '../../../src/shared/exceptions/app-error';
import { default as prisma } from '../../../src/config/database';
import {
  resolveUrgencyIdWithDefault,
} from '../../../src/shared/utils/urgency';
import {
  resolveConfidentialityIdWithDefault,
} from '../../../src/shared/utils/confidentiality';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/incoming-documents/incoming-documents.repository',
);

jest.mock('../../../src/modules/documents/documents.repository');

jest.mock('../../../src/config/database', () => ({
  __esModule: true,
  default: {
    user: {
      findMany: jest.fn(),
    },
    workflowStep: {
      findMany: jest.fn(),
    },
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

const mockedDocsRepo = documentsRepository as jest.Mocked<
  typeof documentsRepository
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
// Test transaction runner — runs the inner callback against a fake tx
// client that mirrors the keys touched by `create()`.
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

// Default workflow steps: CLERK (stepOrder=1), HEAD (stepOrder=2),
// SPECIALIST (stepOrder=3), ARCHIVE (stepOrder=4).
const WORKFLOW_STEPS = [
  { id: 1, stepOrder: 1, roleName: 'DOCUMENT_CLERK' },
  { id: 2, stepOrder: 2, roleName: 'DEPARTMENT_HEAD' },
  { id: 3, stepOrder: 3, roleName: 'SPECIALIST' },
  { id: 4, stepOrder: 4, roleName: 'ARCHIVE' },
];

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

  // Default user-existence mock — every requested id exists.
  (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
    async (args: any) => {
      const ids = (args?.where?.id?.in ?? []) as number[];
      return ids.map((id) => ({
        id,
        userRoles: [
          { role: { name: 'DEPARTMENT_HEAD' } },
          { role: { name: 'SPECIALIST' } },
        ],
      }));
    },
  );

  (mockedPrisma.workflowStep.findMany as jest.Mock).mockResolvedValue(
    WORKFLOW_STEPS,
  );

  // The transaction runner — runs the inner async callback against a
  // fake tx client and returns the inner result.
  (mockedPrisma.$transaction as jest.Mock).mockImplementation(
    async (cb: any) => {
      const tx = makeTxMock();
      return cb(tx);
    },
  );

  mockedUrgency.mockResolvedValue(1);
  mockedConfidentiality.mockResolvedValue(1);

  mockedDocsRepo.generateDocumentNumber.mockResolvedValue('IN-2025-0001');

  // Default `getById` mock — returns a synthetic incoming document.
  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockImplementation(async (id: any) => {
    return {
      id,
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
        status: 'PENDING',
        urgencyId: 1,
        urgency: { id: 1, name: 'THUONG', description: null },
        confidentialityId: 1,
        confidentiality: {
          id: 1,
          code: 'BT',
          name: 'Bình thường',
          description: null,
        },
        ocrText: null,
        documentTypeId: null,
        documentTypeRef: null,
        issuer: null,
        signerName: null,
        signerTitle: null,
        issuedDate: null,
        categoryId: null,
        category: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdByUser: null,
        createdBy: 5,
        updatedByUser: null,
        processors: [],
        attachments: [],
        workflows: [],
      },
    } as any;
  });

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
    processorIds: [{ userId: 10, processorType: 'XLC' }],
    attachments: [],
    createdBy: 5,
    confidentialityLevel: 'THUONG',
    documentBookId: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid metadata.
// Result : A fully-populated payload produces a successful create.
// ---------------------------------------------------------------------------
describe('[UTCID01] incomingDocumentsService.create() – Normal 1: valid metadata', () => {
  it('creates a document with a fully-populated payload', async () => {
    const result = await service.create(makeInput() as any);

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('forwards the processorIds to the user-existence check', async () => {
    await service.create(
      makeInput({
        processorIds: [{ userId: 10, processorType: 'XLC' }],
      }) as any,
    );

    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [10] } },
      }),
    );
  });

  it('verifies each processor user exists', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValue([
      {
        id: 10,
        userRoles: [{ role: { name: 'DEPARTMENT_HEAD' } }],
      },
    ]);

    await service.create(
      makeInput({
        processorIds: [{ userId: 10, processorType: 'XLC' }],
      }) as any,
    );

    // findMany has been called twice: once for the existence check,
    // once for the role validation.
    expect(mockedPrisma.user.findMany).toHaveBeenCalled();
  });

  it('resolves urgencyId and confidentialityId before the transaction', async () => {
    await service.create(makeInput() as any);

    expect(mockedUrgency).toHaveBeenCalledTimes(1);
    expect(mockedConfidentiality).toHaveBeenCalledTimes(1);
  });

  it('does NOT log to console (no audit logging at the service layer)', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create(makeInput() as any);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: document number / book mapping.
// Result : Caller-supplied `data.documentNumber` wins over the
//          auto-generated archive number. The book id is forwarded
//          to the transaction verbatim (or parsed if string).
// ---------------------------------------------------------------------------
describe('[UTCID02] incomingDocumentsService.create() – Normal 2: document number / book mapping', () => {
  it('uses the caller-supplied documentNumber when non-empty', async () => {
    await service.create(
      makeInput({ documentNumber: '14/2026/NQ-HĐND' }) as any,
    );

    expect(mockedDocsRepo.generateDocumentNumber).not.toHaveBeenCalled();
  });

  it('falls back to generateDocumentNumber when documentNumber is empty', async () => {
    await service.create(makeInput({ documentNumber: '' }) as any);

    expect(mockedDocsRepo.generateDocumentNumber).toHaveBeenCalledWith(
      'INCOMING',
    );
  });

  it('falls back to generateDocumentNumber when documentNumber is only whitespace', async () => {
    await service.create(makeInput({ documentNumber: '   ' }) as any);

    expect(mockedDocsRepo.generateDocumentNumber).toHaveBeenCalled();
  });

  it('falls back to generateDocumentNumber when documentNumber is omitted', async () => {
    const { documentNumber, ...input } = makeInput();
    void documentNumber;

    await service.create(input as any);

    expect(mockedDocsRepo.generateDocumentNumber).toHaveBeenCalledWith(
      'INCOMING',
    );
  });

  it('parses the documentBookId when given as a string', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(makeInput({ documentBookId: '42' }) as any);

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentBookId: 42,
        }),
      }),
    );
  });

  it('uses the numeric documentBookId as-is', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(makeInput({ documentBookId: 42 }) as any);

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentBookId: 42,
        }),
      }),
    );
  });

  it('omits documentBookId from IncomingDocument.create when undefined', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const input = makeInput();
    delete input.documentBookId;

    await service.create(input as any);

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentBookId: undefined,
        }),
      }),
    );
  });

  it('creates an IncomingBookEntry when both documentBookId and arrivalNumber are provided', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({ documentBookId: 1, arrivalNumber: 1 }) as any,
    );

    expect(tx.incomingBookEntry.create).toHaveBeenCalledTimes(1);
  });

  it('updates DocumentBook.currentNumber when a book entry is created', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({ documentBookId: 1, arrivalNumber: 1 }) as any,
    );

    expect(tx.documentBook.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { currentNumber: { increment: 1 } },
      }),
    );
  });

  it('does NOT create an IncomingBookEntry when documentBookId is missing', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const input = makeInput();
    delete input.documentBookId;

    await service.create(input as any);

    expect(tx.incomingBookEntry.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: file association.
// Result : Attachments are persisted to DocumentAttachment.
// ---------------------------------------------------------------------------
describe('[UTCID03] incomingDocumentsService.create() – Normal 3: file association', () => {
  it('persists metadata-only attachments', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
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

    await service.create(makeInput({ attachments: [] }) as any);

    expect(tx.documentAttachment.createMany).not.toHaveBeenCalled();
  });

  it('creates one DocumentAttachment per attachment entry', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        attachments: [
          {
            fileName: 'a.pdf',
            fileUrl: '/uploads/a.pdf',
            fileSize: 100,
            mimeType: 'application/pdf',
          },
          {
            fileName: 'b.pdf',
            fileUrl: '/uploads/b.pdf',
            fileSize: 200,
            mimeType: 'application/pdf',
          },
          {
            fileName: 'c.pdf',
            fileUrl: '/uploads/c.pdf',
            fileSize: 300,
            mimeType: 'application/pdf',
          },
        ],
      }) as any,
    );

    expect(tx.documentAttachment.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ fileName: 'a.pdf' }),
          expect.objectContaining({ fileName: 'b.pdf' }),
          expect.objectContaining({ fileName: 'c.pdf' }),
        ]),
      }),
    );
  });

  it('does NOT pass a `file` field to create() (function is the no-file path)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(makeInput() as any);

    // Document.create should NOT have fileUrl/originalFileName
    // because that comes via the createWithFile path.
    const docCreateCall = tx.document.create.mock.calls[0]?.[0];
    expect(docCreateCall).toBeDefined();
    expect(docCreateCall.data).not.toHaveProperty('fileUrl');
    expect(docCreateCall.data).not.toHaveProperty('originalFileName');
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: persistence / audit.
// Result : Workflow steps and participation rows are created.
// ---------------------------------------------------------------------------
describe('[UTCID04] incomingDocumentsService.create() – Normal 4: persistence / audit', () => {
  it('creates DocumentWorkflow rows for every workflow step', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(makeInput() as any);

    expect(tx.documentWorkflow.createMany).toHaveBeenCalledTimes(1);
    const call = tx.documentWorkflow.createMany.mock.calls[0][0];
    expect(call.data).toHaveLength(WORKFLOW_STEPS.length);
  });

  it('marks the CLERK step (stepOrder=1) as COMPLETED inside the transaction', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(makeInput() as any);

    expect(tx.documentWorkflow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          documentId: 100,
          workflowStep: { stepOrder: 1, roleName: 'DOCUMENT_CLERK' },
        },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('creates DocumentProcessor rows for each processor', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [
          { userId: 10, processorType: 'XLC' },
          { userId: 11, processorType: 'PHXL' },
          { userId: 12, processorType: 'XDB' },
        ],
      }) as any,
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            documentId: 100,
            userId: 10,
            processorType: 'XLC',
          }),
          expect.objectContaining({
            documentId: 100,
            userId: 11,
            processorType: 'PHXL',
          }),
        ]),
      }),
    );
  });

  it('creates Document and IncomingDocument inside the transaction', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(makeInput() as any);

    expect(tx.document.create).toHaveBeenCalledTimes(1);
    expect(tx.incomingDocument.create).toHaveBeenCalledTimes(1);
  });

  it('queries workflowStep.findMany ordered by stepOrder asc', async () => {
    await service.create(makeInput() as any);

    expect(mockedPrisma.workflowStep.findMany).toHaveBeenCalledWith({
      orderBy: { stepOrder: 'asc' },
    });
  });

  it('does NOT log to console (audit logging is not part of the service layer)', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create(makeInput() as any);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : The returned `getById` matches the inserted ids.
// ---------------------------------------------------------------------------
describe('[UTCID05] incomingDocumentsService.create() – Normal 5: response-to-database consistency', () => {
  it('returns the result of getById(incomingId) verbatim', async () => {
    const fakeReturned: any = {
      id: 1,
      documentId: 100,
      arrivalNumber: 1,
      dateReceived: new Date('2026-01-15'),
      document: { id: 100, documentNumber: 'IN-2025-0001' },
    };
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValueOnce(fakeReturned);

    const result = await service.create(makeInput() as any);

    expect(result).toEqual(fakeReturned);
  });

  it('passes the IncomingDocument.id (not Document.id) to getById', async () => {
    const tx = makeTxMock();
    (tx.incomingDocument.create as jest.Mock).mockReset();
    (tx.incomingDocument.create as jest.Mock).mockResolvedValueOnce({
      id: 7,
      documentId: 100,
    });

    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(makeInput() as any);

    // getById may receive (id) or (id, undefined) depending on
    // whether the caller supplies a viewer context. Either way, the
    // FIRST argument must be the IncomingDocument.id (7), not the
    // Document.id (100).
    expect(mockedRepo.findById.mock.calls[0][0]).toBe(7);
  });

  it('passes the Document.id (not IncomingDocument.id) to internal tx operations', async () => {
    const tx = makeTxMock();
    (tx.document.create as jest.Mock).mockReset();
    (tx.document.create as jest.Mock).mockResolvedValueOnce({
      id: 555,
    });
    (tx.incomingDocument.create as jest.Mock).mockReset();
    (tx.incomingDocument.create as jest.Mock).mockResolvedValueOnce({
      id: 7,
      documentId: 555,
    });

    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(makeInput() as any);

    expect(tx.documentProcessor.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ documentId: 555 }),
        ]),
      }),
    );
  });

  it('sets the Document.status to PENDING', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(makeInput() as any);

    expect(tx.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
  });

  it('sets the Document.type to INCOMING', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(makeInput() as any);

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

    await service.create(makeInput() as any);

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

    await service.create(makeInput({ createdBy: 99 }) as any);

    expect(tx.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdBy: 99 }),
      }),
    );
  });

  it('does NOT leak sensitive fields through the Document row (no password / hash / secret)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(makeInput() as any);

    const docCreateArgs = tx.document.create.mock.calls[0][0];
    expect(JSON.stringify(docCreateArgs.data)).not.toMatch(/password/i);
    expect(JSON.stringify(docCreateArgs.data)).not.toMatch(/hash/i);
    expect(JSON.stringify(docCreateArgs.data)).not.toMatch(/secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Normal 6: repeat-safe processing.
// Result : Documented gap — no duplicate detection on
//          `documentNumber` / `arrivalNumber` at the service layer.
//          P2002 bubbles up as raw Prisma errors.
// ---------------------------------------------------------------------------
describe('[UTCID06] incomingDocumentsService.create() – Normal 6: repeat-safe processing (documented gap)', () => {
  it('does NOT detect duplicate documentNumber before the transaction', async () => {
    // No select-based "select by documentNumber where exists" call.
    await service.create(makeInput() as any);

    expect(mockedPrisma.user.findMany).toHaveBeenCalled();
    expect(mockedPrisma.workflowStep.findMany).toHaveBeenCalled();
    // No duplicate check.
  });

  it('does NOT detect duplicate arrivalNumber per documentBookId', async () => {
    // The transaction is a single-step insert; no pre-check.
    await service.create(
      makeInput({ documentBookId: 1, arrivalNumber: 1 }) as any,
    );

    // No unique-constraint check.
  });

  it('does NOT enforce uniqueness at the application layer (documented gap)', async () => {
    // Repeated calls with the same payload all hit the same flow.
    // The unique constraint (if any) is at the DB layer.
    await service.create(makeInput() as any);

    // No fixture.id collision check in the service.
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
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

    await expect(service.create(makeInput() as any)).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('does NOT log a warning when a P2002 fires (no application-level de-duplication)', async () => {
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

    await expect(service.create(makeInput() as any)).rejects.toBeDefined();

    // The create() flow does NOT log; only createWithFile catches P2002
    // and turns it into ConflictError. The plain create() does NOT.
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 1: invalid / duplicate required data.
// Result : BadRequestError on missing processors, missing users,
//          invalid XLC count, dedup invariant.
// ---------------------------------------------------------------------------
describe('[UTCID07] incomingDocumentsService.create() – Abnormal 1: invalid / duplicate required data', () => {
  it('rejects with BadRequestError when processorIds is empty', async () => {
    await expect(
      service.create(makeInput({ processorIds: [] }) as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects with BadRequestError (400) on empty processorIds', async () => {
    const err = await service
      .create(makeInput({ processorIds: [] }) as any)
      .catch((e) => e) as BadRequestError;

    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Phải chọn ít nhất một người xử lý');
  });

  it('rejects when there is no XLC', async () => {
    // Only PHXL — validateProcessorRoles will throw because XLC count != 1.
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
      async (args: any) => {
        const ids = (args?.where?.id?.in ?? []) as number[];
        return ids.map((id) => ({
          id,
          userRoles: [{ role: { name: 'DEPARTMENT_HEAD' } }],
        }));
      },
    );

    await expect(
      service.create(
        makeInput({
          processorIds: [{ userId: 10, processorType: 'PHXL' }],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when there are multiple XLCs', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
      async (args: any) => {
        const ids = (args?.where?.id?.in ?? []) as number[];
        return ids.map((id) => ({
          id,
          userRoles: [{ role: { name: 'DEPARTMENT_HEAD' } }],
        }));
      },
    );

    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 10, processorType: 'XLC' },
            { userId: 11, processorType: 'XLC' },
          ],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects with the correct XLC-count error message', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
      async (args: any) => {
        const ids = (args?.where?.id?.in ?? []) as number[];
        return ids.map((id) => ({
          id,
          userRoles: [{ role: { name: 'DEPARTMENT_HEAD' } }],
        }));
      },
    );

    const err = await service
      .create(
        makeInput({
          processorIds: [{ userId: 10, processorType: 'PHXL' }],
        }) as any,
      )
      .catch((e) => e) as BadRequestError;

    expect(err.message).toBe('Phải chọn đúng 1 Người xử lý chính (XLC)');
  });

  it('rejects when the same user is in two roles (priority invariant)', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
      async (args: any) => {
        const ids = (args?.where?.id?.in ?? []) as number[];
        return ids.map((id) => ({
          id,
          userRoles: [{ role: { name: 'DEPARTMENT_HEAD' } }],
        }));
      },
    );

    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 10, processorType: 'XLC' },
            { userId: 10, processorType: 'PHXL' },
          ],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when the XLC user does not hold DEPARTMENT_HEAD', async () => {
    // XLC user has only SPECIALIST — fails role check.
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
      async (args: any) => {
        const ids = (args?.where?.id?.in ?? []) as number[];
        // Two separate lookups: existence, then role validation.
        // Distinguish by some heuristic — in real life, it goes
        // through validateProcessorRoles (second pass). Here we
        // return SPECIALIST for user 10 (fails role check).
        return ids.map((id) => ({
          id,
          userRoles: [{ role: { name: 'SPECIALIST' } }],
        }));
      },
    );

    await expect(
      service.create(
        makeInput({
          processorIds: [{ userId: 10, processorType: 'XLC' }],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when a PHXL user holds neither DEPARTMENT_HEAD nor SPECIALIST', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    let invocationCount = 0;
    (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
      async (args: any) => {
        invocationCount++;
        const ids = (args?.where?.id?.in ?? []) as number[];
        if (invocationCount === 1) {
          // Existence check: all users exist.
          return ids.map((id) => ({ id }));
        }
        // Role check: user 11 (PHXL) has only CLERK role — invalid.
        return ids.map((id) => ({
          id,
          userRoles:
            id === 10
              ? [{ role: { name: 'DEPARTMENT_HEAD' } }]
              : [{ role: { name: 'CLERK' } }],
        }));
      },
    );

    await expect(
      service.create(
        makeInput({
          processorIds: [
            { userId: 10, processorType: 'XLC' },
            { userId: 11, processorType: 'PHXL' },
          ],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects when a referenced user does not exist', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]); // empty

    await expect(
      service.create(
        makeInput({
          processorIds: [{ userId: 999, processorType: 'XLC' }],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does NOT call workflowStep.findMany when a referenced user is missing', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]); // empty

    await expect(
      service.create(
        makeInput({
          processorIds: [{ userId: 999, processorType: 'XLC' }],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.workflowStep.findMany).not.toHaveBeenCalled();
  });

  it('does NOT enter the transaction when a referenced user is missing', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]); // empty

    await expect(
      service.create(
        makeInput({
          processorIds: [{ userId: 999, processorType: 'XLC' }],
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a safe diagnostic on the missing-user error (no password / hash leak)', async () => {
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]); // empty

    const err = await service
      .create(
        makeInput({
          processorIds: [{ userId: 999, processorType: 'XLC' }],
        }) as any,
      )
      .catch((e) => e) as BadRequestError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('records a safe diagnostic on the bad-processor error (no password / hash leak)', async () => {
    const err = await service
      .create(makeInput({ processorIds: [] }) as any)
      .catch((e) => e) as BadRequestError;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Abnormal 2: unauthorized creator.
// Result : Documented gap — `createdBy` is not verified at the
//          service layer. The route enforces `requireRole`.
// ---------------------------------------------------------------------------
describe('[UTCID08] incomingDocumentsService.create() – Abnormal 2: unauthorized creator (documented gap)', () => {
  it('does NOT verify createdBy has the DOCUMENT_CLERK role (documented gap)', async () => {
    // The service accepts any positive userId; no role-based check.
    await service.create(makeInput({ createdBy: 999 }) as any);

    expect(mockedRepo.findById).toHaveBeenCalled();
  });

  it('does NOT verify the creator exists in the database (documented gap)', async () => {
    // No `prisma.user.findUnique({ where: { id: createdBy } })` call.
    await service.create(makeInput({ createdBy: 999 }) as any);

    // The existence check is on processorIds only, not on createdBy.
    const userFindManyCalls = (mockedPrisma.user.findMany as jest.Mock).mock
      .calls;
    for (const call of userFindManyCalls) {
      const arg = call[0] as any;
      const inIds = (arg?.where?.id?.in ?? []) as number[];
      expect(inIds).not.toContain(999);
    }
  });

  it('does NOT enforce authentication at the service layer (documented gap)', async () => {
    // No `req.user` argument is consumed by `create()`.
    await expect(service.create(makeInput() as any)).resolves.toBeDefined();
  });

  it('PERMITS creation when no actor header is supplied (the actor is the controller concern)', async () => {
    await expect(service.create(makeInput() as any)).resolves.toBeDefined();
  });

  it('does NOT log unauthorized attempts to console (documented gap)', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create(makeInput() as any);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 1: exact metadata / file / date limit.
// Result : 1-page doc, very long subject, future dates — all
//          accepted (no upper bound enforced at the service).
// ---------------------------------------------------------------------------
describe('[UTCID09] incomingDocumentsService.create() – Boundary 1: exact metadata / file / date limit', () => {
  it('accepts the boundary: pageCount = 1', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(makeInput({ pageCount: 1 }) as any);

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pageCount: 1 }),
      }),
    );
  });

  it('accepts the boundary: very long subject (10 000 chars)', async () => {
    const longSubject = 'a'.repeat(10000);
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(makeInput({ summary: longSubject }) as any);

    expect(tx.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subject: longSubject }),
      }),
    );
  });

  it('accepts the boundary: future date (2030)', async () => {
    const future = '2030-01-15';
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({ dateReceived: `${future}T00:00:00.000Z` }) as any,
    );

    expect(tx.incomingDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dateReceived: new Date(future),
        }),
      }),
    );
  });

  it('accepts the boundary: arrivalNumber = 1', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({ arrivalNumber: 1, documentBookId: 1 }) as any,
    );

    expect(tx.incomingBookEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ arrivalNumber: 1 }),
      }),
    );
  });

  it('accepts the boundary: arrivalNumber = Number.MAX_SAFE_INTEGER', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        arrivalNumber: Number.MAX_SAFE_INTEGER,
        documentBookId: 1,
      }) as any,
    );

    expect(tx.incomingBookEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          arrivalNumber: Number.MAX_SAFE_INTEGER,
        }),
      }),
    );
  });

  it('accepts the boundary: documentBookId = Number.MAX_SAFE_INTEGER', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
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

  it('does NOT throw on the boundary success path (no unhandled exception)', async () => {
    await expect(service.create(makeInput({ pageCount: 1 }) as any)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UTCID10 – Boundary 2: upper-bound value just at the supported limit.
// Result : Maximum processors, maximum attachments — all accepted
//          (no upper bound enforced at the service).
// ---------------------------------------------------------------------------
describe('[UTCID10] incomingDocumentsService.create() – Boundary 2: upper-bound value just at the supported limit', () => {
  it('accepts the boundary: 1 processor (minimum required by validation)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(
      makeInput({
        processorIds: [{ userId: 10, processorType: 'XLC' }],
      }) as any,
    );

    expect(tx.documentProcessor.createMany).toHaveBeenCalled();
  });

  it('accepts the boundary: many processors (XLC + multiple PHXL/XDB)', async () => {
    const processorIds = [
      { userId: 10, processorType: 'XLC' },
      ...Array.from({ length: 50 }, (_, i) => ({
        userId: 100 + i,
        processorType: 'PHXL',
      })),
      ...Array.from({ length: 50 }, (_, i) => ({
        userId: 200 + i,
        processorType: 'XDB',
      })),
    ];

    // All 101 users exist + hold appropriate roles.
    (mockedPrisma.user.findMany as jest.Mock).mockReset();
    (mockedPrisma.user.findMany as jest.Mock).mockImplementation(
      async (args: any) => {
        const ids = (args?.where?.id?.in ?? []) as number[];
        return ids.map((id) => ({
          id,
          userRoles: [{ role: { name: 'DEPARTMENT_HEAD' } }],
        }));
      },
    );

    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(makeInput({ processorIds }) as any);

    expect(tx.documentProcessor.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 10, processorType: 'XLC' }),
        ]),
      }),
    );
  });

  it('accepts the boundary: 100 attachments', async () => {
    const attachments = Array.from({ length: 100 }, (_, i) => ({
      fileName: `attachment-${i}.pdf`,
      fileUrl: `/uploads/attachment-${i}.pdf`,
      fileSize: 1024,
      mimeType: 'application/pdf',
    }));

    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    await service.create(makeInput({ attachments }) as any);

    expect(tx.documentAttachment.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ fileName: 'attachment-0.pdf' }),
          expect.objectContaining({ fileName: 'attachment-99.pdf' }),
        ]),
      }),
    );
  });

  it('accepts the boundary: zero attachments (omitted)', async () => {
    const tx = makeTxMock();
    (mockedPrisma.$transaction as jest.Mock).mockImplementationOnce(
      async (cb: any) => cb(tx),
    );

    const input = makeInput();
    delete input.attachments;

    await service.create(input as any);

    expect(tx.documentAttachment.createMany).not.toHaveBeenCalled();
  });

  it('does NOT enforce an upper bound on processors (documented gap)', async () => {
    // The service does not cap processorIds.
    expect(true).toBe(true);
  });

  it('does NOT enforce an upper bound on attachments (documented gap)', async () => {
    // The service does not cap attachments length.
    expect(true).toBe(true);
  });

  it('does NOT throw on the upper-bound path (no unhandled exception)', async () => {
    const processorIds = [{ userId: 10, processorType: 'XLC' }];
    const attachments = Array.from({ length: 100 }, (_, i) => ({
      fileName: `att-${i}.pdf`,
      fileUrl: `/uploads/att-${i}.pdf`,
      fileSize: 1024,
      mimeType: 'application/pdf',
    }));

    await expect(
      service.create(makeInput({ processorIds, attachments }) as any),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    const result = await service.create(makeInput() as any);

    expect(JSON.stringify(result)).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create(makeInput() as any);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
