/**
 * Unit tests for OutgoingDocumentsService.updateMetadata() —
 * Function66 / Update Outgoing Document Metadata (focus on
 * relationship-update edge cases).
 *
 * Note on naming: this function was previously tested as
 * Function41 (Update Draft Outgoing Document) in
 * `outgoing-documents.service.updateMetadata.spec.ts`. The
 * Function66 matrix emphasizes "relationship update" (i.e.
 * department, documentType, urgency, confidentiality) so
 * this spec covers more of the relational edges.
 *
 * Step-by-step:
 *   1. `outgoing = await outgoingDocumentsRepository.findById
 *      (id)`.
 *   2. If `outgoing.document.status` not in
 *      `['DRAFT', 'RETURNED']`, throw
 *      `BadRequestError('Không thể cập nhật metadata ...')`.
 *   3. Build `documentUpdate` with subject, departmentId,
 *      updatedBy (always set).
 *   4. If `data.confidentialityLevel !== undefined`, set
 *      `documentUpdate.confidentialityId = ...`.
 *   5. If `data.urgency !== undefined`, set
 *      `documentUpdate.urgencyId = ...`.
 *   6. If `data.documentTypeId !== undefined`, set
 *      `documentUpdate.documentTypeId`.
 *   7. If `data.signerName !== undefined`, set
 *      `documentUpdate.signerName`.
 *   8. If `data.signerTitle !== undefined`, set
 *      `documentUpdate.signerTitle`.
 *   9. Run prisma.$transaction:
 *      - `tx.document.update({ where: { id:
 *        outgoing.documentId }, data: documentUpdate })`.
 *      - `tx.outgoingDocument.update({ where: { id }, data:
 *        { documentNumber, recipientName, recipientAddress,
 *        recipientEmail, pageCount } })`.
 *   10. Return `outgoingDocumentsRepository.findById(id)`.
 *
 * Coverage matrix (UTCID01 – UTCID09):
 *   UTCID01  N  – Valid update.
 *   UTCID02  N  – Partial update.
 *   UTCID03  N  – Relationship update (department, type,
 *                 urgency, confidentiality).
 *   UTCID04  N  – Persistence/history (transaction + updatedBy).
 *   UTCID05  N  – Response-to-database consistency.
 *   UTCID06  A  – Invalid/duplicate data.
 *   UTCID07  A  – Not found/invalid state/unauthorized.
 *   UTCID08  B  – Exact field/date range boundary.
 *   UTCID09  B  – Upper-bound value just at the supported
 *                 limit.
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
  document: {
    id: 100,
    documentNumber: 'OUT-2026-0001',
    subject: 'Công văn phát hành',
    fileUrl: '/uploads/test.pdf',
    originalFileName: 'test.pdf',
    fileSize: 1024 * 1024,
    mimeType: 'application/pdf',
    status: 'DRAFT',
    documentStatus: 'ACTIVE',
    departmentId: 1,
    documentTypeId: 1,
    urgencyId: 1,
    confidentialityId: 1,
    createdAt: new Date('2026-09-09T07:00:00.000Z'),
    updatedAt: new Date('2026-09-12T12:00:00.000Z'),
    createdByUser: { id: 5, fullName: 'Lê Văn Submitter' },
    department: { id: 1, name: 'Phòng Hành chính' },
    documentTypeRef: { id: 1, name: 'Công văn' },
  },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();

  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockImplementation(async () => buildDocument());

  // $transaction runs the callback immediately, forwarding tx to the
  // underlying mocked models.
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

  mockedPrisma.confidentiality.findUnique.mockReset();
  mockedPrisma.confidentiality.findUnique.mockImplementation(async () => ({
    id: 1,
  }));

  mockedPrisma.urgency.findUnique.mockReset();
  mockedPrisma.urgency.findUnique.mockImplementation(async () => ({
    id: 1,
  }));

  service = new OutgoingDocumentsService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid update.
// Result : update succeeds.
// ---------------------------------------------------------------------------
describe('[UTCID01] outgoingDocumentsService.updateMetadata() – Normal 1: valid update', () => {
  it('updates subject', async () => {
    await service.updateMetadata(1, { subject: 'New subject' }, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subject: 'New subject',
        }),
      }),
    );
  });

  it('updates all top-level fields in one transaction', async () => {
    await service.updateMetadata(
      1,
      {
        subject: 'S',
        signerName: 'Nguyễn Văn A',
        signerTitle: 'Giám đốc',
        departmentId: 2,
        documentTypeId: 2,
      },
      99,
    );

    expect(mockedPrisma.document.update).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledTimes(1);
  });

  it('updates outgoingDocument fields', async () => {
    await service.updateMetadata(
      1,
      {
        documentNumber: 'OUT-2026-9999',
        recipientName: 'Người nhận',
        recipientAddress: 'Hà Nội',
        recipientEmail: 'n@example.com',
        pageCount: 5,
      },
      99,
    );

    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentNumber: 'OUT-2026-9999',
          recipientName: 'Người nhận',
          recipientAddress: 'Hà Nội',
          recipientEmail: 'n@example.com',
          pageCount: 5,
        }),
      }),
    );
  });

  it('returns the updated outgoing document', async () => {
    const result = await service.updateMetadata(
      1,
      { subject: 'Updated subject' },
      99,
    );

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('does NOT throw on the valid-update path', async () => {
    await expect(
      service.updateMetadata(1, { subject: 'S' }, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the valid-update path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateMetadata(1, { subject: 'S' }, 99);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: partial update.
// Result : only provided fields are updated.
// ---------------------------------------------------------------------------
describe('[UTCID02] outgoingDocumentsService.updateMetadata() – Normal 2: partial update', () => {
  it('updates only subject when other fields omitted', async () => {
    await service.updateMetadata(1, { subject: 'Only subject' }, 99);

    const call = mockedPrisma.document.update.mock.calls[0];

    expect(call[0].data).toEqual(
      expect.objectContaining({
        subject: 'Only subject',
        updatedBy: 99,
      }),
    );
    expect(call[0].data).not.toHaveProperty('signerName');
    expect(call[0].data).not.toHaveProperty('signerTitle');
  });

  it('handles empty body (no fields changed except updatedBy)', async () => {
    await service.updateMetadata(1, {}, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledTimes(1);
  });

  it('updates only signerName', async () => {
    await service.updateMetadata(1, { signerName: 'Only signer' }, 99);

    const call = mockedPrisma.document.update.mock.calls[0];

    expect(call[0].data.signerName).toBe('Only signer');
    expect(call[0].data.subject).toBeUndefined();
  });

  it('updates only outgoingDocument fields without document fields', async () => {
    await service.updateMetadata(
      1,
      { documentNumber: 'PART-001', pageCount: 3 },
      99,
    );

    expect(mockedPrisma.document.update).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledTimes(1);
  });

  it('does NOT throw on the partial-update path', async () => {
    await expect(
      service.updateMetadata(1, { subject: 'S' }, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the partial-update path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateMetadata(1, { subject: 'S' }, 99);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: relationship update.
// Result : department, documentType, urgency, confidentiality
//          all updatable.
// ---------------------------------------------------------------------------
describe('[UTCID03] outgoingDocumentsService.updateMetadata() – Normal 3: relationship update', () => {
  it('updates departmentId', async () => {
    await service.updateMetadata(1, { departmentId: 2 }, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          departmentId: 2,
        }),
      }),
    );
  });

  it('clears departmentId when null', async () => {
    await service.updateMetadata(1, { departmentId: null }, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          departmentId: null,
        }),
      }),
    );
  });

  it('updates documentTypeId', async () => {
    await service.updateMetadata(1, { documentTypeId: 2 }, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentTypeId: 2,
        }),
      }),
    );
  });

  it('updates urgencyId when urgency code provided', async () => {
    await service.updateMetadata(1, { urgency: 'A' }, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          urgencyId: 1,
        }),
      }),
    );
  });

  it('clears urgencyId when urgency is null', async () => {
    await service.updateMetadata(1, { urgency: null }, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          urgencyId: null,
        }),
      }),
    );
  });

  it('updates confidentialityId when confidentialityLevel provided', async () => {
    await service.updateMetadata(1, { confidentialityLevel: 'A' }, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          confidentialityId: 1,
        }),
      }),
    );
  });

  it('clears confidentialityId when null', async () => {
    await service.updateMetadata(1, { confidentialityLevel: null }, 99);

    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          confidentialityId: null,
        }),
      }),
    );
  });

  it('updates all relationships in one transaction', async () => {
    await service.updateMetadata(
      1,
      {
        departmentId: 2,
        documentTypeId: 3,
        urgency: 'B',
        confidentialityLevel: 'C',
      },
      99,
    );

    const call = mockedPrisma.document.update.mock.calls[0];

    expect(call[0].data).toEqual(
      expect.objectContaining({
        departmentId: 2,
        documentTypeId: 3,
        urgencyId: 1,
        confidentialityId: 1,
      }),
    );
  });

  it('does NOT throw on the relationship-update path', async () => {
    await expect(
      service.updateMetadata(
        1,
        { departmentId: 2, documentTypeId: 2, urgency: 'A', confidentialityLevel: 'A' },
        99,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the relationship-update path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateMetadata(
      1,
      { departmentId: 2, documentTypeId: 2 },
      99,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: persistence/history (transaction +
// updatedBy).
// Result : single transaction, updatedBy always set.
// ---------------------------------------------------------------------------
describe('[UTCID04] outgoingDocumentsService.updateMetadata() – Normal 4: persistence/history', () => {
  it('uses a transaction (atomic document + outgoingDocument update)', async () => {
    await service.updateMetadata(1, { subject: 'S' }, 99);

    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('always sets updatedBy', async () => {
    await service.updateMetadata(1, { subject: 'S' }, 42);

    const call = mockedPrisma.document.update.mock.calls[0];

    expect(call[0].data.updatedBy).toBe(42);
  });

  it('sets updatedBy with different user ids', async () => {
    await service.updateMetadata(1, { subject: 'S' }, 7);

    const call = mockedPrisma.document.update.mock.calls[0];

    expect(call[0].data.updatedBy).toBe(7);
  });

  it('persists both Document and OutgoingDocument in transaction', async () => {
    await service.updateMetadata(
      1,
      { subject: 'S', documentNumber: 'OUT-2026-9999' },
      99,
    );

    expect(mockedPrisma.document.update).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.outgoingDocument.update).toHaveBeenCalledTimes(1);
  });

  it('does NOT throw on the persistence/history path', async () => {
    await expect(
      service.updateMetadata(1, { subject: 'S' }, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the persistence/history path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateMetadata(1, { subject: 'S' }, 99);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : returned object mirrors DB state.
// ---------------------------------------------------------------------------
describe('[UTCID05] outgoingDocumentsService.updateMetadata() – Normal 5: response-to-database consistency', () => {
  it('matches DB id to response.id', async () => {
    const result = await service.updateMetadata(1, { subject: 'S' }, 99);

    expect(result.id).toBe(1);
  });

  it('matches DB documentId to response.documentId', async () => {
    const result = await service.updateMetadata(1, { subject: 'S' }, 99);

    expect(result.documentId).toBe(100);
  });

  it('matches DB documentNumber to response.documentNumber', async () => {
    const result = await service.updateMetadata(
      1,
      { documentNumber: 'OUT-2026-9999' },
      99,
    );

    expect(result.documentNumber).toBe('OUT-2026-0001');
  });

  it('matches DB dispatchNumber to response.dispatchNumber', async () => {
    const result = await service.updateMetadata(1, { subject: 'S' }, 99);

    expect(result.dispatchNumber).toBe('OUT-DISP-001');
  });

  it('does NOT throw on the consistency path', async () => {
    await expect(
      service.updateMetadata(1, { subject: 'S' }, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the consistency path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateMetadata(1, { subject: 'S' }, 99);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: invalid/duplicate data.
// Result : BadRequestError on invalid status.
// ---------------------------------------------------------------------------
describe('[UTCID06] outgoingDocumentsService.updateMetadata() – Abnormal 1: invalid/duplicate data', () => {
  it('throws BadRequestError when status is SUBMITTED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({
        document: { ...buildDocument().document, status: 'SUBMITTED' },
      }),
    );

    await expect(
      service.updateMetadata(1, { subject: 'S' }, 99),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when status is APPROVED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({
        document: { ...buildDocument().document, status: 'APPROVED' },
      }),
    );

    await expect(
      service.updateMetadata(1, { subject: 'S' }, 99),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when status is ISSUED', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({
        document: { ...buildDocument().document, status: 'ISSUED' },
      }),
    );

    await expect(
      service.updateMetadata(1, { subject: 'S' }, 99),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('records a safe diagnostic on invalid status (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({
        document: { ...buildDocument().document, status: 'SUBMITTED' },
      }),
    );

    const err = await service
      .updateMetadata(1, { subject: 'S' }, 99)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the invalid-data path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({
        document: { ...buildDocument().document, status: 'SUBMITTED' },
      }),
    );

    await expect(
      service.updateMetadata(1, { subject: 'S' }, 99),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: not found/invalid state/unauthorized.
// Result : BadRequestError on not-found or invalid state.
// ---------------------------------------------------------------------------
describe('[UTCID07] outgoingDocumentsService.updateMetadata() – Abnormal 2: not found/invalid state/unauthorized', () => {
  it('throws BadRequestError when document not found', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () => {
      throw new BadRequestError('Document not found');
    });

    await expect(
      service.updateMetadata(1, { subject: 'S' }, 99),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when prisma.document.update throws', async () => {
    mockedPrisma.document.update.mockReset();
    mockedPrisma.document.update.mockRejectedValueOnce(
      new BadRequestError('Document update failed'),
    );

    await expect(
      service.updateMetadata(1, { subject: 'S' }, 99),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws when prisma.outgoingDocument.update throws', async () => {
    mockedPrisma.outgoingDocument.update.mockReset();
    mockedPrisma.outgoingDocument.update.mockRejectedValueOnce(
      new Error('OutgoingDocument update failed'),
    );

    await expect(
      service.updateMetadata(
        1,
        { documentNumber: 'OUT-2026-9999' },
        99,
      ),
    ).rejects.toBeInstanceOf(Error);
  });

  it('records a safe diagnostic on not-found (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () => {
      throw new BadRequestError('Document not found');
    });

    const err = await service
      .updateMetadata(1, { subject: 'S' }, 99)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the not-found path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockImplementation(async () => {
      throw new BadRequestError('Document not found');
    });

    await expect(
      service.updateMetadata(1, { subject: 'S' }, 99),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: exact field/date range boundary.
// Result : field/date range boundary values handled.
// ---------------------------------------------------------------------------
describe('[UTCID08] outgoingDocumentsService.updateMetadata() – Boundary 1: exact field/date range boundary', () => {
  it('handles the boundary: subject at exactly 1 char', async () => {
    await service.updateMetadata(1, { subject: 'a' }, 99);

    const call = mockedPrisma.document.update.mock.calls[0];

    expect(call[0].data.subject).toBe('a');
  });

  it('handles the boundary: subject at exactly 500 chars', async () => {
    const longSubject = 'a'.repeat(500);
    await service.updateMetadata(1, { subject: longSubject }, 99);

    const call = mockedPrisma.document.update.mock.calls[0];

    expect(call[0].data.subject).toBe(longSubject);
  });

  it('handles the boundary: pageCount = 0', async () => {
    await service.updateMetadata(1, { pageCount: 0 }, 99);

    const call = mockedPrisma.outgoingDocument.update.mock.calls[0];

    expect(call[0].data.pageCount).toBe(0);
  });

  it('handles the boundary: pageCount = Number.MAX_SAFE_INTEGER', async () => {
    await service.updateMetadata(
      1,
      { pageCount: Number.MAX_SAFE_INTEGER },
      99,
    );

    const call = mockedPrisma.outgoingDocument.update.mock.calls[0];

    expect(call[0].data.pageCount).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('handles the boundary: documentNumber empty string', async () => {
    await service.updateMetadata(1, { documentNumber: '' }, 99);

    const call = mockedPrisma.outgoingDocument.update.mock.calls[0];

    expect(call[0].data.documentNumber).toBe('');
  });

  it('handles the boundary: subject with Vietnamese', async () => {
    await service.updateMetadata(
      1,
      { subject: 'Công văn số 123' },
      99,
    );

    const call = mockedPrisma.document.update.mock.calls[0];

    expect(call[0].data.subject).toBe('Công văn số 123');
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.updateMetadata(1, { subject: 'a' }, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateMetadata(1, { subject: 'a' }, 99);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID09 – Boundary 2: upper-bound value just at the supported
// limit.
// Result : extreme values at supported limit accepted.
// ---------------------------------------------------------------------------
describe('[UTCID09] outgoingDocumentsService.updateMetadata() – Boundary 2: upper-bound value just at the supported limit', () => {
  it('handles the boundary: id = Number.MAX_SAFE_INTEGER', async () => {
    mockedRepo.findById.mockImplementation(async () =>
      buildDocument({ id: Number.MAX_SAFE_INTEGER }),
    );

    await expect(
      service.updateMetadata(Number.MAX_SAFE_INTEGER, { subject: 'S' }, 99),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: updatedBy = 0 (system user)', async () => {
    await expect(
      service.updateMetadata(1, { subject: 'S' }, 0),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: subject at exactly 1000 chars', async () => {
    const longSubject = 'a'.repeat(1000);
    await service.updateMetadata(1, { subject: longSubject }, 99);

    const call = mockedPrisma.document.update.mock.calls[0];

    expect(call[0].data.subject).toBe(longSubject);
  });

  it('handles the boundary: pageCount = 1', async () => {
    await service.updateMetadata(1, { pageCount: 1 }, 99);

    const call = mockedPrisma.outgoingDocument.update.mock.calls[0];

    expect(call[0].data.pageCount).toBe(1);
  });

  it('handles the boundary: pageCount = 100', async () => {
    await service.updateMetadata(1, { pageCount: 100 }, 99);

    const call = mockedPrisma.outgoingDocument.update.mock.calls[0];

    expect(call[0].data.pageCount).toBe(100);
  });

  it('handles the boundary: id = 1 (smallest valid id)', async () => {
    await expect(
      service.updateMetadata(1, { subject: 'S' }, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on the upper-bound path', async () => {
    await expect(
      service.updateMetadata(1, { subject: 'S' }, 99),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the upper-bound path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.updateMetadata(1, { subject: 'S' }, 99);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
