import { Prisma, DocumentTypeStatus } from '@prisma/client';
import prisma from '../../config/database';
import { DocumentTypesRepository } from './document-types.repository';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  BadRequestError,
} from '../../shared/exceptions/app-error';
import {
  DocumentTypeFilterDto,
  CreateDocumentTypeDto,
  UpdateDocumentTypeDto,
  DocumentTypeResponse,
  PaginatedDocumentTypeResponse,
  DocumentTypeOption,
  DeleteDocumentTypeResult,
} from './document-types.types';
import {
  normalizeDocumentTypeName,
  normalizeDocumentTypeCode,
  DOCUMENT_TYPE_CODE_PATTERN,
} from './document-types.helpers';

const repository = new DocumentTypesRepository();

export class DocumentTypesService {
  // ──────────────────────────────────────────────────────────────────────────
  // READ
  // ──────────────────────────────────────────────────────────────────────────

  async findAll(filter: DocumentTypeFilterDto): Promise<PaginatedDocumentTypeResponse> {
    return repository.findAll(filter);
  }

  async getActiveOptions(): Promise<DocumentTypeOption[]> {
    return repository.findActiveOptions();
  }

  async findById(id: number): Promise<DocumentTypeResponse> {
    const type = await repository.findById(id);
    if (!type) {
      throw new NotFoundError('Thể loại văn bản không tồn tại');
    }
    return type;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CREATE (UC-71)
  // ──────────────────────────────────────────────────────────────────────────

  async create(dto: CreateDocumentTypeDto, userId: number): Promise<DocumentTypeResponse> {
    // 1. Normalise
    const name = dto.name.trim().replace(/\s+/g, ' ');
    const normalizedName = normalizeDocumentTypeName(name);
    const code = normalizeDocumentTypeCode(dto.code);
    const description = dto.description?.trim() || null;
    const status = dto.status ?? DocumentTypeStatus.ACTIVE;

    // 2. Validate code pattern (no slash allowed)
    if (!DOCUMENT_TYPE_CODE_PATTERN.test(code)) {
      throw new BadRequestError(
        'Mã thể loại chỉ được chứa chữ cái, chữ số và dấu gạch ngang (-). Không được chứa dấu /.',
      );
    }

    // 3. Check duplicates in parallel
    const [duplicateName, duplicateCode] = await Promise.all([
      repository.findByNormalizedName(normalizedName),
      repository.findByCode(code),
    ]);

    if (duplicateName) throw new ConflictError('Tên thể loại văn bản đã tồn tại');
    if (duplicateCode) throw new ConflictError('Mã thể loại văn bản đã tồn tại');

    // 4. Create inside transaction.
    return prisma.$transaction(async (tx) => {
      const type = await repository.create(
        { name, normalizedName, code, description, status, createdById: userId },
        tx,
      );

      return type;
    }).catch((error) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError('Tên hoặc mã thể loại văn bản đã tồn tại');
      }
      throw error;
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // UPDATE (UC-73)
  // ──────────────────────────────────────────────────────────────────────────

  async update(
    id: number,
    dto: UpdateDocumentTypeDto,
    userId: number,
  ): Promise<DocumentTypeResponse> {
    // 1. Find current type
    const type = await repository.findById(id);
    if (!type) throw new NotFoundError('Thể loại văn bản không tồn tại');

    // 2. Guard conditions
    if (type.deletedAt) throw new ConflictError('Thể loại văn bản đã bị xoá, không thể chỉnh sửa');
    if (type.isSystem) throw new ForbiddenError('Không thể chỉnh sửa thể loại văn bản của hệ thống');

    // 3. At least one field must be provided
    const hasUpdate =
      dto.name !== undefined ||
      dto.code !== undefined ||
      dto.description !== undefined ||
      dto.status !== undefined;

    if (!hasUpdate) throw new BadRequestError('Không có thông tin nào được cung cấp để cập nhật');

    // 4. Normalise and check duplicates
    const updateData: Prisma.DocumentTypeUpdateInput = {
      updatedBy: { connect: { id: userId } },
    };

    if (dto.name !== undefined) {
      const name = dto.name.trim().replace(/\s+/g, ' ');
      const normalizedName = normalizeDocumentTypeName(name);

      const duplicateName = await repository.findByNormalizedName(normalizedName, id);
      if (duplicateName) throw new ConflictError('Tên thể loại văn bản đã tồn tại');

      updateData.name = name;
      updateData.normalizedName = normalizedName;
    }

    if (dto.code !== undefined) {
      const code = normalizeDocumentTypeCode(dto.code);

      if (!DOCUMENT_TYPE_CODE_PATTERN.test(code)) {
        throw new BadRequestError(
          'Mã thể loại chỉ được chứa chữ cái, chữ số và dấu gạch ngang (-). Không được chứa dấu /.',
        );
      }

      // Block code change if already in use
      if (code !== type.code) {
        const usage = await repository.countUsage(id);
        if (usage.total > 0) {
          throw new ConflictError(
            'Không thể thay đổi mã thể loại vì đang được sử dụng bởi văn bản',
          );
        }

        const duplicateCode = await repository.findByCode(code, id);
        if (duplicateCode) throw new ConflictError('Mã thể loại văn bản đã tồn tại');
      }

      updateData.code = code;
    }

    if (dto.description !== undefined) {
      updateData.description = dto.description === null ? null : dto.description.trim() || null;
    }

    if (dto.status !== undefined) {
      updateData.status = dto.status;
    }

    // 5. Update in transaction.
    return prisma.$transaction(async (tx) => {
      const updated = await repository.update(id, updateData, tx);

      return updated;
    }).catch((error) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError('Tên hoặc mã thể loại văn bản đã tồn tại');
      }
      throw error;
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE (UC-74)
  // ──────────────────────────────────────────────────────────────────────────

  async delete(id: number, userId: number): Promise<DeleteDocumentTypeResult> {
    const type = await repository.findById(id);
    if (!type) throw new NotFoundError('Thể loại văn bản không tồn tại');

    if (type.deletedAt) throw new ConflictError('Thể loại văn bản đã được xoá trước đó');
    if (type.isSystem) throw new ForbiddenError('Không thể xoá thể loại văn bản của hệ thống');

    const usage = await repository.countUsage(id);

    return prisma.$transaction(async (tx) => {
      let updatedType: DocumentTypeResponse;
      let operation: 'SOFT_DELETED' | 'DEACTIVATED';

      if (usage.total > 0) {
        updatedType = await repository.deactivate(id, userId, tx);
        operation = 'DEACTIVATED';
      } else {
        updatedType = await repository.softDelete(id, userId, tx);
        operation = 'SOFT_DELETED';
      }

      return { kind: updatedType, operation, usage };
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REACTIVATE
  // ──────────────────────────────────────────────────────────────────────────

  async reactivate(id: number, userId: number): Promise<DocumentTypeResponse> {
    const type = await repository.findById(id);
    if (!type) throw new NotFoundError('Thể loại văn bản không tồn tại');

    if (type.isSystem) throw new ForbiddenError('Không thể thay đổi trạng thái thể loại hệ thống');
    if (type.status === DocumentTypeStatus.ACTIVE && !type.deletedAt) {
      throw new ConflictError('Thể loại văn bản đang ở trạng thái ACTIVE');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await repository.reactivate(id, userId, tx);

      return updated;
    });
  }
}
