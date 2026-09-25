/**
 * Unit tests for DocumentTypesService.create() —
 * Function68 / Create Document Type.
 *
 * Step-by-step:
 *   1. Normalize:
 *      - `name = dto.name.trim().replace(/\s+/g, ' ')`.
 *      - `normalizedName = normalizeDocumentTypeName(name)`.
 *      - `code = normalizeDocumentTypeCode(dto.code)`.
 *      - `description = dto.description?.trim() || null`.
 *      - `status = dto.status ?? DocumentTypeStatus.ACTIVE`.
 *   2. Validate code pattern
 *      (`/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u`):
 *      if invalid, throw `BadRequestError('Mã thể loại chỉ
 *      được chứa chữ cái, chữ số và dấu gạch ngang (-)...')`.
 *   3. Check duplicates in parallel:
 *      - `duplicateName = repository.findByNormalizedName
 *        (normalizedName)`.
 *      - `duplicateCode = repository.findByCode(code)`.
 *      - If duplicateName → `ConflictError('Tên thể loại văn
 *        bản đã tồn tại')`.
 *      - If duplicateCode → `ConflictError('Mã thể loại văn
 *        bản đã tồn tại')`.
 *   4. Create inside `prisma.$transaction(async (tx) => ...)`:
 *      - `repository.create({ name, normalizedName, code,
 *        description, status, createdById: userId }, tx)`.
 *   5. On `Prisma.PrismaClientKnownRequestError.code === 'P2002'`,
 *      throw `ConflictError('Tên hoặc mã thể loại văn bản đã
 *      tồn tại')`.
 *
 * Coverage matrix (UTCID01 – UTCID08):
 *   UTCID01  N  – Valid type.
 *   UTCID02  N  – Unique code/name.
 *   UTCID03  N  – Direction mapping (usageDetail).
 *   UTCID04  N  – Persistence.
 *   UTCID05  N  – Response-to-database consistency.
 *   UTCID06  A  – Missing/duplicate invalid data.
 *   UTCID07  A  – Unauthorized creator.
 *   UTCID08  B  – Minimum/maximum code or name length.
 */

import { DocumentTypeStatus } from '@prisma/client';
import { DocumentTypesService } from '../../../src/modules/document-types/document-types.service';
import { DocumentTypesRepository } from '../../../src/modules/document-types/document-types.repository';
import {
  BadRequestError,
  ConflictError,
} from '../../../src/shared/exceptions/app-error';
import prisma from '../../../src/config/database';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../src/modules/document-types/document-types.repository',
  () => {
    const mockFindByNormalizedName = jest.fn();
    const mockFindByCode = jest.fn();
    const mockCreate = jest.fn();
    const mockFindById = jest.fn();
    const mockFindAll = jest.fn();
    const mockUpdate = jest.fn();
    const mockDelete = jest.fn();
    const mockRestore = jest.fn();
    const mockFindActiveOptions = jest.fn();
    const mockCountUsage = jest.fn();

    return {
      __esModule: true,
      DocumentTypesRepository: jest.fn().mockImplementation(() => ({
        findByNormalizedName: mockFindByNormalizedName,
        findByCode: mockFindByCode,
        create: mockCreate,
        findById: mockFindById,
        findAll: mockFindAll,
        update: mockUpdate,
        delete: mockDelete,
        restore: mockRestore,
        findActiveOptions: mockFindActiveOptions,
        countUsage: mockCountUsage,
      })),
      // Expose mocks via module for direct access
      _mocks: {
        mockFindByNormalizedName,
        mockFindByCode,
        mockCreate,
        mockFindById,
        mockFindAll,
        mockUpdate,
        mockDelete,
        mockRestore,
        mockFindActiveOptions,
        mockCountUsage,
      },
    };
  },
);

jest.mock('../../../src/config/database', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    documentType: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const mockedRepoModule =
  jest.requireMock(
    '../../../src/modules/document-types/document-types.repository',
  );
const mockFindByNormalizedName =
  mockedRepoModule._mocks.mockFindByNormalizedName;
const mockFindByCode = mockedRepoModule._mocks.mockFindByCode;
const mockCreate = mockedRepoModule._mocks.mockCreate;
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

let service: DocumentTypesService;

const buildType = (overrides: any = {}): any => ({
  id: 1,
  name: 'Công văn',
  code: 'CV',
  description: 'Công văn',
  status: DocumentTypeStatus.ACTIVE,
  isSystem: false,
  createdAt: new Date('2026-09-09T07:00:00.000Z'),
  updatedAt: new Date('2026-09-12T12:00:00.000Z'),
  deletedAt: null,
  createdBy: { id: 5, fullName: 'Admin' },
  usageCount: 0,
  usageDetail: { incoming: 0, outgoing: 0 },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();

  mockFindByNormalizedName.mockReset();
  mockFindByNormalizedName.mockResolvedValue(null);

  mockFindByCode.mockReset();
  mockFindByCode.mockResolvedValue(null);

  mockCreate.mockReset();
  mockCreate.mockImplementation(async () => buildType());

  mockedPrisma.$transaction.mockReset();
  mockedPrisma.$transaction.mockImplementation(async (cb: any) =>
    cb({
      documentType: mockedPrisma.documentType,
    }),
  );

  service = new DocumentTypesService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid type.
// Result : create succeeds.
// ---------------------------------------------------------------------------
describe('[UTCID01] documentTypesService.create() – Normal 1: valid type', () => {
  it('creates a valid document type', async () => {
    const result = await service.create(
      { name: 'Công văn', code: 'CV' },
      5,
    );

    expect(result).toBeDefined();
    expect(result.name).toBe('Công văn');
  });

  it('returns the generated id', async () => {
    const result = await service.create(
      { name: 'Công văn', code: 'CV' },
      5,
    );

    expect(result.id).toBe(1);
  });

  it('returns status = ACTIVE when not provided', async () => {
    const result = await service.create(
      { name: 'Công văn', code: 'CV' },
      5,
    );

    expect(result.status).toBe(DocumentTypeStatus.ACTIVE);
  });

  it('accepts status = INACTIVE', async () => {
    await service.create(
      {
        name: 'Inactive Type',
        code: 'IN',
        status: DocumentTypeStatus.INACTIVE,
      },
      5,
    );

    expect(mockCreate).toHaveBeenCalled();
  });

  it('accepts description', async () => {
    await service.create(
      {
        name: 'Công văn',
        code: 'CV',
        description: 'Công văn hành chính',
      },
      5,
    );

    expect(mockCreate).toHaveBeenCalled();
  });

  it('does NOT throw on the valid-type path', async () => {
    await expect(
      service.create({ name: 'Công văn', code: 'CV' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the valid-type path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create({ name: 'Công văn', code: 'CV' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: unique code/name.
// Result : the unique check passes when no duplicate.
// ---------------------------------------------------------------------------
describe('[UTCID02] documentTypesService.create() – Normal 2: unique code/name', () => {
  it('passes the duplicate-name check', async () => {
    mockFindByNormalizedName.mockReset();
    mockFindByNormalizedName.mockResolvedValue(null);

    await service.create({ name: 'Unique Name', code: 'UN' }, 5);

    expect(mockFindByNormalizedName).toHaveBeenCalledTimes(1);
  });

  it('passes the duplicate-code check', async () => {
    mockFindByCode.mockReset();
    mockFindByCode.mockResolvedValue(null);

    await service.create({ name: 'Unique Name', code: 'UN' }, 5);

    expect(mockFindByCode).toHaveBeenCalledTimes(1);
  });

  it('normalizes code to uppercase', async () => {
    await service.create({ name: 'Test', code: 'lower' }, 5);

    expect(mockFindByCode).toHaveBeenCalledWith('LOWER');
  });

  it('normalizes name to stripped-lowercase', async () => {
    await service.create(
      { name: 'Công   Văn', code: 'CV' },
      5,
    );

    expect(mockFindByNormalizedName).toHaveBeenCalledWith(
      'cong van',
    );
  });

  it('handles Vietnamese name normalization (đ → d)', async () => {
    await service.create({ name: 'Đặc biệt', code: 'DB' }, 5);

    expect(mockFindByNormalizedName).toHaveBeenCalledWith(
      'dac biet',
    );
  });

  it('does NOT throw on the unique-check path', async () => {
    await expect(
      service.create({ name: 'Unique', code: 'UN' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the unique-check path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create({ name: 'Unique', code: 'UN' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: direction mapping (usageDetail).
// Result : the response includes usageDetail with incoming
//          and outgoing.
// ---------------------------------------------------------------------------
describe('[UTCID03] documentTypesService.create() – Normal 3: direction mapping', () => {
  it('returns usageDetail field', async () => {
    const result = await service.create(
      { name: 'Công văn', code: 'CV' },
      5,
    );

    expect(result.usageDetail).toBeDefined();
  });

  it('returns usageDetail.incoming = 0 on creation', async () => {
    const result = await service.create(
      { name: 'Công văn', code: 'CV' },
      5,
    );

    expect(result.usageDetail.incoming).toBe(0);
  });

  it('returns usageDetail.outgoing = 0 on creation', async () => {
    const result = await service.create(
      { name: 'Công văn', code: 'CV' },
      5,
    );

    expect(result.usageDetail.outgoing).toBe(0);
  });

  it('returns usageCount = 0 on creation', async () => {
    const result = await service.create(
      { name: 'Công văn', code: 'CV' },
      5,
    );

    expect(result.usageCount).toBe(0);
  });

  it('handles usageDetail when incoming/outgoing pre-populated', async () => {
    mockCreate.mockReset();
    mockCreate.mockImplementation(async () =>
      buildType({
        usageDetail: { incoming: 5, outgoing: 3 },
        usageCount: 8,
      }),
    );

    const result = await service.create(
      { name: 'Công văn', code: 'CV' },
      5,
    );

    expect(result.usageDetail.incoming).toBe(5);
    expect(result.usageDetail.outgoing).toBe(3);
  });

  it('does NOT throw on the direction-mapping path', async () => {
    await expect(
      service.create({ name: 'Công văn', code: 'CV' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the direction-mapping path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create({ name: 'Công văn', code: 'CV' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: persistence.
// Result : repository.create is called with correct data.
// ---------------------------------------------------------------------------
describe('[UTCID04] documentTypesService.create() – Normal 4: persistence', () => {
  it('persists within prisma.$transaction', async () => {
    await service.create({ name: 'Công văn', code: 'CV' }, 5);

    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('passes name, normalizedName, code, status, createdById to repository', async () => {
    await service.create(
      {
        name: 'Công văn',
        code: 'CV',
        description: 'Mô tả',
      },
      5,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Công văn',
        normalizedName: 'cong van',
        code: 'CV',
        status: DocumentTypeStatus.ACTIVE,
        createdById: 5,
      }),
      expect.anything(),
    );
  });

  it('passes description when provided', async () => {
    await service.create(
      {
        name: 'Công văn',
        code: 'CV',
        description: 'Mô tả',
      },
      5,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Mô tả',
      }),
      expect.anything(),
    );
  });

  it('passes description = null when not provided', async () => {
    await service.create({ name: 'Công văn', code: 'CV' }, 5);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        description: null,
      }),
      expect.anything(),
    );
  });

  it('does NOT throw on the persistence path', async () => {
    await expect(
      service.create({ name: 'Công văn', code: 'CV' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the persistence path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create({ name: 'Công văn', code: 'CV' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : returned type mirrors DB state.
// ---------------------------------------------------------------------------
describe('[UTCID05] documentTypesService.create() – Normal 5: response-to-database consistency', () => {
  it('matches DB id to response.id', async () => {
    const result = await service.create(
      { name: 'Công văn', code: 'CV' },
      5,
    );

    expect(result.id).toBe(1);
  });

  it('matches DB name to response.name', async () => {
    const result = await service.create(
      { name: 'Công văn', code: 'CV' },
      5,
    );

    expect(result.name).toBe('Công văn');
  });

  it('matches DB code to response.code', async () => {
    const result = await service.create(
      { name: 'Công văn', code: 'CV' },
      5,
    );

    expect(result.code).toBe('CV');
  });

  it('matches DB createdBy.id to response.createdBy.id', async () => {
    const result = await service.create(
      { name: 'Công văn', code: 'CV' },
      5,
    );

    expect(result.createdBy.id).toBe(5);
  });

  it('matches DB createdBy.fullName to response.createdBy.fullName', async () => {
    const result = await service.create(
      { name: 'Công văn', code: 'CV' },
      5,
    );

    expect(result.createdBy.fullName).toBe('Admin');
  });

  it('does NOT throw on the consistency path', async () => {
    await expect(
      service.create({ name: 'Công văn', code: 'CV' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the consistency path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create({ name: 'Công văn', code: 'CV' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: missing/duplicate invalid data.
// Result : BadRequestError or ConflictError on invalid input.
// ---------------------------------------------------------------------------
describe('[UTCID06] documentTypesService.create() – Abnormal 1: missing/duplicate invalid data', () => {
  it('throws ConflictError when code is duplicate', async () => {
    mockFindByCode.mockReset();
    mockFindByCode.mockResolvedValue({
      id: 1,
      code: 'CV',
    });

    await expect(
      service.create({ name: 'Other', code: 'CV' }, 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ConflictError when name is duplicate', async () => {
    mockFindByNormalizedName.mockReset();
    mockFindByNormalizedName.mockResolvedValue({
      id: 1,
      name: 'Công văn',
    });

    await expect(
      service.create({ name: 'Công văn', code: 'OTHER' }, 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws BadRequestError when code contains a slash', async () => {
    await expect(
      service.create({ name: 'Bad', code: 'CV/INVALID' }, 5),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('accepts code containing spaces (normalize strips them — documented gap)', async () => {
    await expect(
      service.create({ name: 'Bad', code: 'CV INVALID' }, 5),
    ).resolves.toBeDefined();
  });

  it('throws ConflictError on P2002 from prisma', async () => {
    const prismaError = Object.create(
      (jest.requireActual('@prisma/client') as any)
        .Prisma.PrismaClientKnownRequestError.prototype,
    );
    prismaError.code = 'P2002';
    prismaError.message = 'Unique constraint failed';
    prismaError.name = 'PrismaClientKnownRequestError';

    mockCreate.mockReset();
    mockCreate.mockRejectedValueOnce(prismaError);

    await expect(
      service.create({ name: 'Công văn', code: 'CV' }, 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('records a safe diagnostic on duplicate (no password / hash leak)', async () => {
    mockFindByCode.mockReset();
    mockFindByCode.mockResolvedValue({
      id: 1,
      code: 'CV',
    });

    const err = await service
      .create({ name: 'Other', code: 'CV' }, 5)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the duplicate path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockFindByCode.mockReset();
    mockFindByCode.mockResolvedValue({
      id: 1,
      code: 'CV',
    });

    await expect(
      service.create({ name: 'Other', code: 'CV' }, 5),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: unauthorized creator.
// Result : ConflictError when repo throws.
//          (No role check at the service layer — see notes.)
// ---------------------------------------------------------------------------
describe('[UTCID07] documentTypesService.create() – Abnormal 2: unauthorized creator', () => {
  it('throws when repository.create throws (e.g. permission revoked)', async () => {
    mockCreate.mockReset();
    mockCreate.mockRejectedValueOnce(
      new Error('Permission denied'),
    );

    await expect(
      service.create({ name: 'Công văn', code: 'CV' }, 5),
    ).rejects.toBeInstanceOf(Error);
  });

  it('throws when prisma.$transaction throws', async () => {
    mockedPrisma.$transaction.mockReset();
    mockedPrisma.$transaction.mockRejectedValueOnce(
      new Error('Transaction failed'),
    );

    await expect(
      service.create({ name: 'Công văn', code: 'CV' }, 5),
    ).rejects.toBeInstanceOf(Error);
  });

  it('throws when repository.create throws PrismaClientKnownRequestError (non-P2002)', async () => {
    const prismaError = Object.create(
      (jest.requireActual('@prisma/client') as any)
        .Prisma.PrismaClientKnownRequestError.prototype,
    );
    prismaError.code = 'P2003';
    prismaError.message = 'Some other prisma error';
    prismaError.name = 'PrismaClientKnownRequestError';

    mockCreate.mockReset();
    mockCreate.mockRejectedValueOnce(prismaError);

    await expect(
      service.create({ name: 'Công văn', code: 'CV' }, 5),
    ).rejects.toBeInstanceOf(Error);
  });

  it('records a safe diagnostic on unauthorized (no password / hash leak)', async () => {
    mockCreate.mockReset();
    mockCreate.mockRejectedValueOnce(
      new Error('Permission denied'),
    );

    const err = await service
      .create({ name: 'Công văn', code: 'CV' }, 5)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the unauthorized path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockCreate.mockReset();
    mockCreate.mockRejectedValueOnce(
      new Error('Permission denied'),
    );

    await expect(
      service.create({ name: 'Công văn', code: 'CV' }, 5),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: minimum/maximum code or name length.
// Result : boundary values accepted; validation only catches
//          patterns.
// ---------------------------------------------------------------------------
describe('[UTCID08] documentTypesService.create() – Boundary 1: minimum/maximum code or name length', () => {
  it('handles the boundary: code at exactly 1 char', async () => {
    await service.create({ name: 'Test', code: 'A' }, 5);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'A',
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: code at exactly 20 chars', async () => {
    const longCode = 'A'.repeat(20);
    await service.create({ name: 'Test', code: longCode }, 5);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        code: longCode,
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: name at exactly 1 char', async () => {
    await service.create({ name: 'A', code: 'X' }, 5);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'A',
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: name at exactly 100 chars', async () => {
    const longName = 'a'.repeat(100);
    await service.create({ name: longName, code: 'X' }, 5);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: longName,
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: name with hyphen in code (QĐ-CL)', async () => {
    await service.create({ name: 'Quyết định', code: 'QĐ-CL' }, 5);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'QĐ-CL',
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: code with Vietnamese characters', async () => {
    await service.create({ name: 'Quyết định', code: 'QĐ' }, 5);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'QĐ',
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: id = 1 (smallest valid id)', async () => {
    await expect(
      service.create({ name: 'Công văn', code: 'CV' }, 5),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: userId = 0 (system user)', async () => {
    await expect(
      service.create({ name: 'Công văn', code: 'CV' }, 0),
    ).resolves.toBeDefined();
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.create({ name: 'A', code: 'A' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.create({ name: 'A', code: 'A' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
