/**
 * Unit tests for DocumentTypesService.update() —
 * Function70 / Update Document Type.
 *
 * Step-by-step:
 *   1. `type = await repository.findById(id)`.
 *   2. If not found → throw `NotFoundError('Thể loại văn
 *      bản không tồn tại')`.
 *   3. Guard:
 *      - If `type.deletedAt` → throw `ConflictError('Thể
 *        loại văn bản đã bị xoá, không thể chỉnh sửa')`.
 *      - If `type.isSystem` → throw `ForbiddenError('Không
 *        thể chỉnh sửa thể loại văn bản của hệ thống')`.
 *   4. At least one field must be provided (name, code,
 *      description, or status). If none → throw
 *      `BadRequestError('Không có thông tin nào được cung
 *      cấp để cập nhật')`.
 *   5. If `dto.name` is provided:
 *      - Normalize: `name = dto.name.trim().replace(/\s+/g,
 *        ' ')`; `normalizedName = normalizeDocumentTypeName
 *        (name)`.
 *      - Check duplicate: `findByNormalizedName
 *        (normalizedName, id)`; if exists → throw
 *        `ConflictError('Tên thể loại văn bản đã tồn tại')`.
 *      - Set `updateData.name = name; updateData.normalized
 *        Name = normalizedName`.
 *   6. If `dto.code` is provided:
 *      - Normalize: `code = normalizeDocumentTypeCode
 *        (dto.code)`.
 *      - Validate pattern: if invalid → throw
 *        `BadRequestError`.
 *      - If `code !== type.code`:
 *        - `usage = repository.countUsage(id)`; if usage > 0
 *          → throw `ConflictError('Không thể thay đổi mã
 *          thể loại vì đang được sử dụng bởi văn bản')`.
 *        - `findByCode(code, id)`; if exists → throw
 *          `ConflictError`.
 *      - Set `updateData.code = code`.
 *   7. If `dto.description` is provided:
 *      - `description === null ? null : trim() || null`.
 *   8. If `dto.status` is provided:
 *      - Set `updateData.status = dto.status`.
 *   9. Update inside `prisma.$transaction(async (tx) =>
 *      repository.update(id, updateData, tx))`.
 *  10. On `Prisma.PrismaClientKnownRequestError.code ===
 *      'P2002'`, throw `ConflictError`.
 *
 * Coverage matrix (UTCID01 – UTCID08):
 *   UTCID01  N  – Valid update.
 *   UTCID02  N  – Partial update.
 *   UTCID03  N  – Status change.
 *   UTCID04  N  – Persistence/audit.
 *   UTCID05  N  – Response-to-database consistency.
 *   UTCID06  A  – Duplicate/invalid data.
 *   UTCID07  A  – Not found / forbidden / system type.
 *   UTCID08  B  – Maximum field-length boundary.
 */

import { DocumentTypeStatus } from '@prisma/client';
import { DocumentTypesService } from '../../../src/modules/document-types/document-types.service';
import { DocumentTypesRepository } from '../../../src/modules/document-types/document-types.repository';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
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
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
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
const mockFindById = mockedRepoModule._mocks.mockFindById;
const mockUpdate = mockedRepoModule._mocks.mockUpdate;
const mockCountUsage = mockedRepoModule._mocks.mockCountUsage;
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

  mockFindById.mockReset();
  mockFindById.mockImplementation(async () => buildType());

  mockFindByNormalizedName.mockReset();
  mockFindByNormalizedName.mockResolvedValue(null);

  mockFindByCode.mockReset();
  mockFindByCode.mockResolvedValue(null);

  mockCountUsage.mockReset();
  mockCountUsage.mockResolvedValue({ total: 0, incoming: 0, outgoing: 0 });

  mockUpdate.mockReset();
  mockUpdate.mockImplementation(async () => buildType());

  mockedPrisma.$transaction.mockReset();
  mockedPrisma.$transaction.mockImplementation(async (cb: any) =>
    cb({
      documentType: mockedPrisma.documentType,
    }),
  );

  service = new DocumentTypesService();
});

// ---------------------------------------------------------------------------
// UTCID01 – Normal 1: valid update.
// Result : update succeeds.
// ---------------------------------------------------------------------------
describe('[UTCID01] documentTypesService.update() – Normal 1: valid update', () => {
  it('updates a valid document type', async () => {
    const result = await service.update(
      1,
      { name: 'Quyết định', code: 'QD' },
      5,
    );

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('returns the updated id', async () => {
    const result = await service.update(
      1,
      { name: 'Quyết định' },
      5,
    );

    expect(result.id).toBe(1);
  });

  it('accepts update with only name', async () => {
    await service.update(1, { name: 'New Name' }, 5);

    expect(mockUpdate).toHaveBeenCalled();
  });

  it('accepts update with only code', async () => {
    await service.update(1, { code: 'NEW' }, 5);

    expect(mockUpdate).toHaveBeenCalled();
  });

  it('accepts update with only description', async () => {
    await service.update(1, { description: 'New description' }, 5);

    expect(mockUpdate).toHaveBeenCalled();
  });

  it('accepts update with only status', async () => {
    await service.update(
      1,
      { status: DocumentTypeStatus.INACTIVE },
      5,
    );

    expect(mockUpdate).toHaveBeenCalled();
  });

  it('does NOT throw on the valid-update path', async () => {
    await expect(
      service.update(1, { name: 'New Name' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the valid-update path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.update(1, { name: 'New Name' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID02 – Normal 2: partial update.
// Result : only specified fields updated.
// ---------------------------------------------------------------------------
describe('[UTCID02] documentTypesService.update() – Normal 2: partial update', () => {
  it('passes only name to repository when only name is provided', async () => {
    await service.update(1, { name: 'New Name' }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        name: 'New Name',
        normalizedName: 'new name',
        updatedBy: { connect: { id: 5 } },
      }),
      expect.anything(),
    );
  });

  it('passes only code to repository when only code is provided', async () => {
    await service.update(1, { code: 'newcode' }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        code: 'NEWCODE',
      }),
      expect.anything(),
    );
  });

  it('passes only description to repository when only description is provided', async () => {
    await service.update(1, { description: 'desc' }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        description: 'desc',
      }),
      expect.anything(),
    );
  });

  it('passes description = null when explicitly null', async () => {
    await service.update(1, { description: null }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        description: null,
      }),
      expect.anything(),
    );
  });

  it('passes only status to repository when only status is provided', async () => {
    await service.update(
      1,
      { status: DocumentTypeStatus.INACTIVE },
      5,
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        status: DocumentTypeStatus.INACTIVE,
      }),
      expect.anything(),
    );
  });

  it('does NOT throw on the partial-update path', async () => {
    await expect(
      service.update(1, { name: 'New' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the partial-update path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.update(1, { name: 'New' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID03 – Normal 3: direction/status change.
// Result : status change succeeds.
// ---------------------------------------------------------------------------
describe('[UTCID03] documentTypesService.update() – Normal 3: direction/status change', () => {
  it('changes status ACTIVE → INACTIVE', async () => {
    await service.update(
      1,
      { status: DocumentTypeStatus.INACTIVE },
      5,
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        status: DocumentTypeStatus.INACTIVE,
      }),
      expect.anything(),
    );
  });

  it('changes status INACTIVE → ACTIVE', async () => {
    mockFindById.mockReset();
    mockFindById.mockImplementation(async () =>
      buildType({ status: DocumentTypeStatus.INACTIVE }),
    );

    await service.update(
      1,
      { status: DocumentTypeStatus.ACTIVE },
      5,
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        status: DocumentTypeStatus.ACTIVE,
      }),
      expect.anything(),
    );
  });

  it('persists updatedAt (handled by prisma)', async () => {
    await service.update(
      1,
      { status: DocumentTypeStatus.INACTIVE },
      5,
    );

    expect(mockUpdate).toHaveBeenCalled();
  });

  it('handles multiple field updates together', async () => {
    await service.update(
      1,
      {
        name: 'New Name',
        status: DocumentTypeStatus.INACTIVE,
        description: 'New desc',
      },
      5,
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        name: 'New Name',
        normalizedName: 'new name',
        status: DocumentTypeStatus.INACTIVE,
        description: 'New desc',
      }),
      expect.anything(),
    );
  });

  it('does NOT throw on the direction/status-change path', async () => {
    await expect(
      service.update(
        1,
        { status: DocumentTypeStatus.INACTIVE },
        5,
      ),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the direction/status-change path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.update(
      1,
      { status: DocumentTypeStatus.INACTIVE },
      5,
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID04 – Normal 4: persistence/audit.
// Result : repository.update called within transaction.
// ---------------------------------------------------------------------------
describe('[UTCID04] documentTypesService.update() – Normal 4: persistence/audit', () => {
  it('persists within prisma.$transaction', async () => {
    await service.update(1, { name: 'New Name' }, 5);

    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('calls repository.update once', async () => {
    await service.update(1, { name: 'New Name' }, 5);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('passes updatedBy connect to repository', async () => {
    await service.update(1, { name: 'New Name' }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        updatedBy: { connect: { id: 5 } },
      }),
      expect.anything(),
    );
  });

  it('passes different updatedBy for different user', async () => {
    await service.update(1, { name: 'New Name' }, 7);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        updatedBy: { connect: { id: 7 } },
      }),
      expect.anything(),
    );
  });

  it('passes the transaction client to repository.update', async () => {
    await service.update(1, { name: 'New Name' }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.anything(),
      expect.anything(),
    );
  });

  it('does NOT throw on the persistence/audit path', async () => {
    await expect(
      service.update(1, { name: 'New Name' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the persistence/audit path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.update(1, { name: 'New Name' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID05 – Normal 5: response-to-database consistency.
// Result : returned type mirrors DB state.
// ---------------------------------------------------------------------------
describe('[UTCID05] documentTypesService.update() – Normal 5: response-to-database consistency', () => {
  it('matches DB id to response.id', async () => {
    const result = await service.update(1, { name: 'New' }, 5);

    expect(result.id).toBe(1);
  });

  it('matches DB name to response.name', async () => {
    mockUpdate.mockReset();
    mockUpdate.mockImplementation(async () =>
      buildType({ name: 'Updated Name' }),
    );

    const result = await service.update(1, { name: 'Updated' }, 5);

    expect(result.name).toBe('Updated Name');
  });

  it('matches DB code to response.code', async () => {
    mockUpdate.mockReset();
    mockUpdate.mockImplementation(async () =>
      buildType({ code: 'NEWCODE' }),
    );

    const result = await service.update(1, { code: 'NEWCODE' }, 5);

    expect(result.code).toBe('NEWCODE');
  });

  it('matches DB status to response.status', async () => {
    mockUpdate.mockReset();
    mockUpdate.mockImplementation(async () =>
      buildType({ status: DocumentTypeStatus.INACTIVE }),
    );

    const result = await service.update(
      1,
      { status: DocumentTypeStatus.INACTIVE },
      5,
    );

    expect(result.status).toBe(DocumentTypeStatus.INACTIVE);
  });

  it('matches DB createdBy to response.createdBy', async () => {
    const result = await service.update(1, { name: 'New' }, 5);

    expect(result.createdBy.id).toBe(5);
  });

  it('does NOT throw on the consistency path', async () => {
    await expect(
      service.update(1, { name: 'New' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the consistency path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.update(1, { name: 'New' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID06 – Abnormal 1: duplicate/invalid data.
// Result : ConflictError / BadRequestError on invalid input.
// ---------------------------------------------------------------------------
describe('[UTCID06] documentTypesService.update() – Abnormal 1: duplicate/invalid data', () => {
  it('throws ConflictError when name is duplicate', async () => {
    mockFindByNormalizedName.mockReset();
    mockFindByNormalizedName.mockResolvedValue({
      id: 2,
      name: 'Duplicate Name',
    });

    await expect(
      service.update(1, { name: 'Duplicate Name' }, 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws BadRequestError when code contains a slash', async () => {
    await expect(
      service.update(1, { code: 'CV/INVALID' }, 5),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when no fields provided', async () => {
    await expect(
      service.update(1, {}, 5),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws ConflictError when code is duplicate and not same as current', async () => {
    mockFindByCode.mockReset();
    mockFindByCode.mockResolvedValue({ id: 2, code: 'OTHER' });

    await expect(
      service.update(1, { code: 'OTHER' }, 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ConflictError when code is in use', async () => {
    mockCountUsage.mockReset();
    mockCountUsage.mockResolvedValue({ total: 5, incoming: 0, outgoing: 5 });

    await expect(
      service.update(1, { code: 'NEWCODE' }, 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ConflictError on P2002 from prisma', async () => {
    const prismaError = Object.create(
      (jest.requireActual('@prisma/client') as any)
        .Prisma.PrismaClientKnownRequestError.prototype,
    );
    prismaError.code = 'P2002';
    prismaError.message = 'Unique constraint failed';
    prismaError.name = 'PrismaClientKnownRequestError';

    mockUpdate.mockReset();
    mockUpdate.mockRejectedValueOnce(prismaError);

    await expect(
      service.update(1, { name: 'New' }, 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('records a safe diagnostic on duplicate (no password / hash leak)', async () => {
    mockFindByNormalizedName.mockReset();
    mockFindByNormalizedName.mockResolvedValue({
      id: 2,
      name: 'Duplicate',
    });

    const err = await service
      .update(1, { name: 'Duplicate' }, 5)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the duplicate path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockFindByNormalizedName.mockReset();
    mockFindByNormalizedName.mockResolvedValue({
      id: 2,
      name: 'Duplicate',
    });

    await expect(
      service.update(1, { name: 'Duplicate' }, 5),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID07 – Abnormal 2: not found / forbidden / system type.
// Result : NotFoundError / ForbiddenError.
// ---------------------------------------------------------------------------
describe('[UTCID07] documentTypesService.update() – Abnormal 2: not found / forbidden / system type', () => {
  it('throws NotFoundError when type does not exist', async () => {
    mockFindById.mockReset();
    mockFindById.mockResolvedValue(null);

    await expect(
      service.update(1, { name: 'New' }, 5),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ConflictError when type is soft-deleted', async () => {
    mockFindById.mockReset();
    mockFindById.mockImplementation(async () =>
      buildType({ deletedAt: new Date('2026-09-10T00:00:00.000Z') }),
    );

    await expect(
      service.update(1, { name: 'New' }, 5),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ForbiddenError when type is a system type', async () => {
    mockFindById.mockReset();
    mockFindById.mockImplementation(async () =>
      buildType({ isSystem: true }),
    );

    await expect(
      service.update(1, { name: 'New' }, 5),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws when repository.update throws', async () => {
    mockUpdate.mockReset();
    mockUpdate.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(
      service.update(1, { name: 'New' }, 5),
    ).rejects.toBeInstanceOf(Error);
  });

  it('throws when prisma.$transaction throws', async () => {
    mockedPrisma.$transaction.mockReset();
    mockedPrisma.$transaction.mockRejectedValueOnce(
      new Error('Transaction failed'),
    );

    await expect(
      service.update(1, { name: 'New' }, 5),
    ).rejects.toBeInstanceOf(Error);
  });

  it('records a safe diagnostic on not-found (no password / hash leak)', async () => {
    mockFindById.mockReset();
    mockFindById.mockResolvedValue(null);

    const err = await service
      .update(1, { name: 'New' }, 5)
      .catch((e) => e) as Error;

    expect(err.message).not.toMatch(/password|hash|secret/i);
  });

  it('does NOT log to console on the not-found / forbidden path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    mockFindById.mockReset();
    mockFindById.mockResolvedValue(null);

    await expect(
      service.update(1, { name: 'New' }, 5),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UTCID08 – Boundary 1: maximum field-length boundary.
// Result : boundary values accepted; validation only catches
//          patterns.
// ---------------------------------------------------------------------------
describe('[UTCID08] documentTypesService.update() – Boundary 1: maximum field-length boundary', () => {
  it('handles the boundary: name at exactly 100 chars', async () => {
    const longName = 'a'.repeat(100);
    await service.update(1, { name: longName }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        name: longName,
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: code at exactly 20 chars', async () => {
    const longCode = 'A'.repeat(20);
    await service.update(1, { code: longCode }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        code: longCode,
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: code with Vietnamese characters', async () => {
    await service.update(1, { code: 'QĐ-CL' }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        code: 'QĐ-CL',
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: id = 1 (smallest valid id)', async () => {
    await expect(
      service.update(1, { name: 'New' }, 5),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: userId = 0 (system user)', async () => {
    await expect(
      service.update(1, { name: 'New' }, 0),
    ).resolves.toBeDefined();
  });

  it('handles the boundary: description with 500 chars', async () => {
    const longDesc = 'a'.repeat(500);
    await service.update(1, { description: longDesc }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        description: longDesc,
      }),
      expect.anything(),
    );
  });

  it('handles the boundary: description with Vietnamese at 500 chars', async () => {
    const longDesc = 'Công'.repeat(125);
    await service.update(1, { description: longDesc }, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        description: longDesc,
      }),
      expect.anything(),
    );
  });

  it('does NOT throw on the boundary path', async () => {
    await expect(
      service.update(1, { name: 'a' }, 5),
    ).resolves.toBeDefined();
  });

  it('does NOT log to console on the boundary path', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    await service.update(1, { name: 'a' }, 5);

    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
