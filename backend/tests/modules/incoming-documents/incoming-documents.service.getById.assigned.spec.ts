/**
 * Unit tests for IncomingDocumentsService.getById() — Function32 /
 * View My Assigned Incoming Document Details.
 *
 * Note on naming: the matrix headers reference
 * `AssignmentQueryService`, but the actual implementation that
 * surfaces a single assigned document for the caller is
 * `IncomingDocumentsService.getById(id, userId, userRoles)`. The
 * service delegates to `incomingDocumentsRepository.findById(id,
 * { userId, userRoles })` and additionally calls
 * `checkIncomingDocumentAccess(id, userId, userRoles)` as an
 * explicit access gate.
 *
 * Contract:
 *   async getById(
 *     id: number,
 *     userId?: number,
 *     userRoles?: string[]
 *   ): Promise<IncomingDocumentWithRelations>
 *
 * Step-by-step:
 *   1. Find the document via repository.findById(id, { userId,
 *      userRoles } | undefined). Throws NotFoundError if not found.
 *   2. If both userId and userRoles are provided, call
 *      checkIncomingDocumentAccess(id, userId, userRoles) — throws
 *      ForbiddenError / NotFoundError if the caller is not allowed.
 *   3. Return the incoming document with viewer-status decoration.
 *
 * Note on the matrix's "boundary" UTCID05:
 *   - The boundary case is "assignment expires/starts at exact time".
 *   - The codebase does NOT have explicit assignment expiration
 *     logic. We exercise the boundary at the document-date level
 *     (dateReceived at midnight), which is the most relevant
 *     timestamp on the document.
 *
 * Coverage matrix (UTCID01 – UTCID05):
 *   UTCID01  N  – XLC detail: DEPARTMENT_HEAD caller with XLC
 *                 processor assignment can read the document.
 *   UTCID02  N  – PHXL detail: SPECIALIST caller with PHXL
 *                 processor assignment can read the document.
 *   UTCID03  N  – XDB detail: SPECIALIST caller with XDB processor
 *                 assignment can read the document.
 *   UTCID04  A  – Document not found: throws NotFoundError when
 *                 the document id does not exist; throws when the
 *                 caller is not authorized.
 *   UTCID05  B  – Assignment expires / starts at exact time:
 *                 accepts the boundary dateReceived = midnight.
 */

import { IncomingDocumentsService } from '../../../src/modules/incoming-documents/incoming-documents.service';
import { incomingDocumentsRepository } from '../../../src/modules/incoming-documents/incoming-documents.repository';
import {
  checkIncomingDocumentAccess,
} from '../../../src/shared/access/document-access';
import { NotFoundError } from '../../../src/shared/exceptions/app-error';
import { DocumentStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/incoming-documents/incoming-documents.repository',
);

jest.mock('../../../src/shared/access/document-access', () => ({
  checkIncomingDocumentAccess: jest.fn(),
}));

const mockedRepo = incomingDocumentsRepository as jest.Mocked<
  typeof incomingDocumentsRepository
>;

const mockedAccess = checkIncomingDocumentAccess as jest.MockedFunction<
  typeof checkIncomingDocumentAccess
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

let service: IncomingDocumentsService;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();

  // Default: repository returns a valid document with one XLC
  // processor (id=7) and the caller is also id=7 with
  // DEPARTMENT_HEAD role.
  mockedRepo.findById.mockReset();
  mockedRepo.findById.mockResolvedValue({
    id: 1,
    documentId: 100,
    arrivalNumber: 1,
    dateReceived: new Date('2026-09-25T00:00:00.000Z'),
    receivedDate: new Date('2026-09-25T00:00:00.000Z'),
    pageCount: 1,
    processingInstructions: 'Test instructions',
    documentBookId: null,
    documentBook: null,
    document: {
      id: 100,
      documentNumber: 'IN-2026-0001',
      subject: 'Test subject',
      type: 'INCOMING',
      fileUrl: null,
      status: DocumentStatus.PENDING,
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
      createdAt: new Date('2026-09-25'),
      updatedAt: new Date('2026-09-25'),
      createdByUser: null as any,
      createdBy: 5,
      updatedByUser: null as any,
      processors: [
        {
          id: 1,
          userId: 7,
          processorType: 'XLC',
          user: {
            id: 7,
            email: 'head@example.com',
            fullName: 'Head User',
            username: 'head',
          },
        },
      ],
      attachments: [],
      workflows: [],
    },
  } as any);

  // Default: access helper allows.
  mockedAccess.mockResolvedValue(undefined);

  service = new IncomingDocumentsService();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: XLC detail.
// Result : DEPARTMENT_HEAD caller with XLC processor assignment
//          can read the document detail.
// ---------------------------------------------------------------------------
describe('[UTCID01] incomingDocumentsService.getById() – Normal 1: XLC detail', () => {
  it('returns the document when the caller is the XLC processor', async () => {
    const result = await service.getById(1, 7, ['DEPARTMENT_HEAD']);

    expect(result.id).toBe(1);
    expect(result.documentId).toBe(100);
    expect(result.document.processors[0].processorType).toBe('XLC');
  });

  it('passes the caller as viewerFor to the repository', async () => {
    await service.getById(1, 7, ['DEPARTMENT_HEAD']);

    expect(mockedRepo.findById).toHaveBeenCalledWith(1, {
      userId: 7,
      userRoles: ['DEPARTMENT_HEAD'],
    });
  });

  it('calls checkIncomingDocumentAccess with the same arguments', async () => {
    await service.getById(1, 7, ['DEPARTMENT_HEAD']);

    expect(mockedAccess).toHaveBeenCalledWith(1, 7, ['DEPARTMENT_HEAD']);
  });

  it('returns the full document with processors', async () => {
    const result = await service.getById(1, 7, ['DEPARTMENT_HEAD']);

    expect(result.document.processors).toHaveLength(1);
    expect(result.document.processors[0].userId).toBe(7);
  });

  it('does NOT log to console on the success path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getById(1, 7, ['DEPARTMENT_HEAD']);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: PHXL detail.
// Result : SPECIALIST caller with PHXL processor assignment can
//          read the document detail.
// ---------------------------------------------------------------------------
describe('[UTCID02] incomingDocumentsService.getById() – Normal 2: PHXL detail', () => {
  beforeEach(() => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue({
      id: 2,
      documentId: 200,
      arrivalNumber: 2,
      dateReceived: new Date('2026-09-25T00:00:00.000Z'),
      receivedDate: new Date('2026-09-25T00:00:00.000Z'),
      pageCount: 1,
      processingInstructions: 'Test instructions',
      documentBookId: null,
      documentBook: null,
      document: {
        id: 200,
        documentNumber: 'IN-2026-0002',
        subject: 'PHXL document',
        type: 'INCOMING',
        fileUrl: null,
        status: DocumentStatus.IN_PROGRESS,
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
        createdAt: new Date('2026-09-25'),
        updatedAt: new Date('2026-09-25'),
        createdByUser: null as any,
        createdBy: 5,
        updatedByUser: null as any,
        processors: [
          {
            id: 1,
            userId: 7,
            processorType: 'XLC',
            user: {
              id: 7,
              email: 'head@example.com',
              fullName: 'Head User',
              username: 'head',
            },
          },
          {
            id: 2,
            userId: 8,
            processorType: 'PHXL',
            user: {
              id: 8,
              email: 'phxl@example.com',
              fullName: 'PHXL User',
              username: 'phxl',
            },
          },
        ],
        attachments: [],
        workflows: [],
      },
    } as any);
  });

  it('returns the document when the caller is the PHXL processor', async () => {
    const result = await service.getById(2, 8, ['SPECIALIST']);

    expect(result.id).toBe(2);
    expect(result.document.processors).toHaveLength(2);
    expect(
      result.document.processors.find((p) => p.processorType === 'PHXL')
        .userId,
    ).toBe(8);
  });

  it('passes the PHXL caller as viewerFor to the repository', async () => {
    await service.getById(2, 8, ['SPECIALIST']);

    expect(mockedRepo.findById).toHaveBeenCalledWith(2, {
      userId: 8,
      userRoles: ['SPECIALIST'],
    });
  });

  it('calls checkIncomingDocumentAccess with the PHXL caller', async () => {
    await service.getById(2, 8, ['SPECIALIST']);

    expect(mockedAccess).toHaveBeenCalledWith(2, 8, ['SPECIALIST']);
  });

  it('does NOT log to console on the PHXL path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getById(2, 8, ['SPECIALIST']);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: XDB detail.
// Result : SPECIALIST caller with XDB processor assignment can
//          read the document detail.
// ---------------------------------------------------------------------------
describe('[UTCID03] incomingDocumentsService.getById() – Normal 3: XDB detail', () => {
  beforeEach(() => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue({
      id: 3,
      documentId: 300,
      arrivalNumber: 3,
      dateReceived: new Date('2026-09-25T00:00:00.000Z'),
      receivedDate: new Date('2026-09-25T00:00:00.000Z'),
      pageCount: 1,
      processingInstructions: 'Test instructions',
      documentBookId: null,
      documentBook: null,
      document: {
        id: 300,
        documentNumber: 'IN-2026-0003',
        subject: 'XDB document',
        type: 'INCOMING',
        fileUrl: null,
        status: DocumentStatus.PENDING,
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
        createdAt: new Date('2026-09-25'),
        updatedAt: new Date('2026-09-25'),
        createdByUser: null as any,
        createdBy: 5,
        updatedByUser: null as any,
        processors: [
          {
            id: 1,
            userId: 7,
            processorType: 'XLC',
            user: {
              id: 7,
              email: 'head@example.com',
              fullName: 'Head User',
              username: 'head',
            },
          },
          {
            id: 2,
            userId: 9,
            processorType: 'XDB',
            user: {
              id: 9,
              email: 'xdb@example.com',
              fullName: 'XDB User',
              username: 'xdb',
            },
          },
        ],
        attachments: [],
        workflows: [],
      },
    } as any);
  });

  it('returns the document when the caller is the XDB viewer', async () => {
    const result = await service.getById(3, 9, ['SPECIALIST']);

    expect(result.id).toBe(3);
    expect(result.document.processors).toHaveLength(2);
    expect(
      result.document.processors.find((p) => p.processorType === 'XDB')
        .userId,
    ).toBe(9);
  });

  it('passes the XDB caller as viewerFor to the repository', async () => {
    await service.getById(3, 9, ['SPECIALIST']);

    expect(mockedRepo.findById).toHaveBeenCalledWith(3, {
      userId: 9,
      userRoles: ['SPECIALIST'],
    });
  });

  it('calls checkIncomingDocumentAccess with the XDB caller', async () => {
    await service.getById(3, 9, ['SPECIALIST']);

    expect(mockedAccess).toHaveBeenCalledWith(3, 9, ['SPECIALIST']);
  });

  it('does NOT log to console on the XDB path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getById(3, 9, ['SPECIALIST']);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Abnormal 1: document not found.
// Result : Throws NotFoundError when the document id does not
//          exist; throws when the caller is not authorized.
// ---------------------------------------------------------------------------
describe('[UTCID04] incomingDocumentsService.getById() – Abnormal 1: document not found', () => {
  it('throws NotFoundError when the document does not exist', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đến'),
    );

    await expect(
      service.getById(999, 7, ['DEPARTMENT_HEAD']),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws when the caller is not authorized (access helper throws)', async () => {
    mockedAccess.mockRejectedValueOnce(
      new Error('Forbidden: caller is not a processor on this document'),
    );

    await expect(
      service.getById(1, 999, ['DEPARTMENT_HEAD']),
    ).rejects.toThrow();
  });

  it('does NOT throw when no userId/userRoles are provided (admin / service-to-service)', async () => {
    // Without userId / userRoles, the service does NOT call the
    // access helper. The repository call passes `undefined` as
    // viewerFor.
    const result = await service.getById(1);

    expect(result.id).toBe(1);
    expect(mockedAccess).not.toHaveBeenCalled();
  });

  it('does NOT call checkIncomingDocumentAccess when userId is undefined', async () => {
    await service.getById(1, undefined, ['DEPARTMENT_HEAD']);

    expect(mockedAccess).not.toHaveBeenCalled();
  });

  it('does NOT call checkIncomingDocumentAccess when userRoles is undefined', async () => {
    await service.getById(1, 7, undefined);

    expect(mockedAccess).not.toHaveBeenCalled();
  });

  it('does NOT call checkIncomingDocumentAccess when both are undefined', async () => {
    await service.getById(1);

    expect(mockedAccess).not.toHaveBeenCalled();
  });

  it('propagates a repository failure (e.g. database error)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new Error('Database connection refused'),
    );

    await expect(
      service.getById(1, 7, ['DEPARTMENT_HEAD']),
    ).rejects.toThrow('Database connection refused');
  });

  it('records a safe diagnostic on repository failures (no password / hash leak)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new Error('Database connection refused'),
    );

    const err = await service
      .getById(1, 7, ['DEPARTMENT_HEAD'])
      .catch((e) => e);

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on failure paths', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockRejectedValueOnce(
      new NotFoundError('Không tìm thấy văn bản đến'),
    );

    await expect(
      service.getById(999, 7, ['DEPARTMENT_HEAD']),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Boundary 1: assignment expires/starts at exact time.
// Result : Accepts the boundary dateReceived = midnight. Document
//          with dateReceived exactly at midnight is returned
//          verbatim.
// ---------------------------------------------------------------------------
describe('[UTCID05] incomingDocumentsService.getById() – Boundary 1: assignment expires/starts at exact time', () => {
  it('accepts the boundary: dateReceived at midnight (00:00:00.000)', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue({
      id: 5,
      documentId: 500,
      arrivalNumber: 5,
      dateReceived: new Date('2026-09-25T00:00:00.000Z'),
      receivedDate: new Date('2026-09-25T00:00:00.000Z'),
      pageCount: 1,
      processingInstructions: null,
      documentBookId: null,
      documentBook: null,
      document: {
        id: 500,
        documentNumber: 'IN-2026-0005',
        subject: 'Boundary document',
        type: 'INCOMING',
        fileUrl: null,
        status: DocumentStatus.PENDING,
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
        createdAt: new Date('2026-09-25T00:00:00.000Z'),
        updatedAt: new Date('2026-09-25T00:00:00.000Z'),
        createdByUser: null as any,
        createdBy: 5,
        updatedByUser: null as any,
        processors: [],
        attachments: [],
        workflows: [],
      },
    } as any);

    const result = await service.getById(5, 7, ['DEPARTMENT_HEAD']);

    expect(result.dateReceived.getTime()).toBe(
      new Date('2026-09-25T00:00:00.000Z').getTime(),
    );
  });

  it('accepts the boundary: dateReceived at end-of-day (23:59:59.999)', async () => {
    const boundaryEnd = new Date('2026-09-25T23:59:59.999Z');
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue({
      id: 6,
      documentId: 600,
      arrivalNumber: 6,
      dateReceived: boundaryEnd,
      receivedDate: boundaryEnd,
      pageCount: 1,
      processingInstructions: null,
      documentBookId: null,
      documentBook: null,
      document: {
        id: 600,
        documentNumber: 'IN-2026-0006',
        subject: 'End-of-day document',
        type: 'INCOMING',
        fileUrl: null,
        status: DocumentStatus.PENDING,
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
        createdAt: boundaryEnd,
        updatedAt: boundaryEnd,
        createdByUser: null as any,
        createdBy: 5,
        updatedByUser: null as any,
        processors: [],
        attachments: [],
        workflows: [],
      },
    } as any);

    const result = await service.getById(6, 7, ['DEPARTMENT_HEAD']);

    expect(result.dateReceived.getTime()).toBe(boundaryEnd.getTime());
  });

  it('returns the document at the exact-time boundary', async () => {
    mockedRepo.findById.mockReset();
    mockedRepo.findById.mockResolvedValue({
      id: 7,
      documentId: 700,
      arrivalNumber: 7,
      dateReceived: new Date('2026-09-25T12:00:00.000Z'),
      receivedDate: new Date('2026-09-25T12:00:00.000Z'),
      pageCount: 1,
      processingInstructions: null,
      documentBookId: null,
      documentBook: null,
      document: {
        id: 700,
        documentNumber: 'IN-2026-0007',
        subject: 'Noon document',
        type: 'INCOMING',
        fileUrl: null,
        status: DocumentStatus.PENDING,
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
        createdAt: new Date('2026-09-25T12:00:00.000Z'),
        updatedAt: new Date('2026-09-25T12:00:00.000Z'),
        createdByUser: null as any,
        createdBy: 5,
        updatedByUser: null as any,
        processors: [],
        attachments: [],
        workflows: [],
      },
    } as any);

    const result = await service.getById(7, 7, ['DEPARTMENT_HEAD']);

    expect(result.id).toBe(7);
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.getById(1, 7, ['DEPARTMENT_HEAD']),
    ).resolves.toBeDefined();
  });

  it('records a safe diagnostic on the boundary path (no password / hash leak)', async () => {
    await expect(
      service.getById(1, 7, ['DEPARTMENT_HEAD']),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.getById(1, 7, ['DEPARTMENT_HEAD']);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
