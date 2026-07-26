import { Prisma, DocumentKindStatus } from '@prisma/client';
import prisma from '../../config/database';
import { DocumentTypesRepository } from './document-types.repository';
import { logSystemAction } from '../../shared/services/system-log.service';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  BadRequestError,
} from '../../shared/exceptions/app-error';
import {
  DocumentKindFilterDto,
  CreateDocumentKindDto,
  UpdateDocumentKindDto,
  DocumentKindResponse,
  PaginatedDocumentKindResponse,
  DocumentKindOption,
  DeleteDocumentKindResult,
} from './document-types.types';
import {
  normalizeDocumentKindName,
  normalizeDocumentKindCode,
  DOCUMENT_KIND_CODE_PATTERN,
} from './document-types.helpers';

const repository = new DocumentTypesRepository();

export class DocumentTypesService {
  // ──────────────────────────────────────────────────────────────────────────
  // READ
  // ──────────────────────────────────────────────────────────────────────────

  async findAll(filter: DocumentKindFilterDto): Promise<PaginatedDocumentKindResponse> {
    return repository.findAll(filter);
  }

  async getActiveOptions(): Promise<DocumentKindOption[]> {
    return repository.findActiveOptions();
  }

  async findById(id: number): Promise<DocumentKindResponse> {
    const kind = await repository.findById(id);
    if (!kind) {
      throw new NotFoundError('Thể loại văn bản không tồn tại');
    }
    return kind;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CREATE (UC-71)
  // ──────────────────────────────────────────────────────────────────────────

  async create(dto: CreateDocumentKindDto, userId: number): Promise<DocumentKindResponse> {
    // 1. Normalise
    const name = dto.name.trim().replace(/\s+/g, ' ');
    const normalizedName = normalizeDocumentKindName(name);
    const code = normalizeDocumentKindCode(dto.code);
    const description = dto.description?.trim() || null;
    const status = dto.status ?? DocumentKindStatus.ACTIVE;

    // 2. Validate code pattern (no slash allowed)
    if (!DOCUMENT_KIND_CODE_PATTERN.test(code)) {
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

    // 4. Create inside transaction + SystemLog
    return prisma.$transaction(async (tx) => {
      const kind = await repository.create(
        { name, normalizedName, code, description, status, createdById: userId },
        tx,
      );

      await logSystemAction({
        userId,
        action: 'CREATE_DOCUMENT_TYPE',
        entityType: 'DocumentKind',
        entityId: kind.id,
        details: `Tạo thể loại văn bản: ${kind.code} - ${kind.name}`,
      });

      return kind;
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
    dto: UpdateDocumentKindDto,
    userId: number,
  ): Promise<DocumentKindResponse> {
    // 1. Find current kind
    const kind = await repository.findById(id);
    if (!kind) throw new NotFoundError('Thể loại văn bản không tồn tại');

    // 2. Guard conditions
    if (kind.deletedAt) throw new ConflictError('Thể loại văn bản đã bị xoá, không thể chỉnh sửa');
    if (kind.isSystem) throw new ForbiddenError('Không thể chỉnh sửa thể loại văn bản của hệ thống');

    // 3. At least one field must be provided
    const hasUpdate =
      dto.name !== undefined ||
      dto.code !== undefined ||
      dto.description !== undefined ||
      dto.status !== undefined;

    if (!hasUpdate) throw new BadRequestError('Không có thông tin nào được cung cấp để cập nhật');

    // 4. Normalise and check duplicates
    const updateData: Prisma.DocumentKindUpdateInput = {
      updatedBy: { connect: { id: userId } },
    };

    if (dto.name !== undefined) {
      const name = dto.name.trim().replace(/\s+/g, ' ');
      const normalizedName = normalizeDocumentKindName(name);

      const duplicateName = await repository.findByNormalizedName(normalizedName, id);
      if (duplicateName) throw new ConflictError('Tên thể loại văn bản đã tồn tại');

      updateData.name = name;
      updateData.normalizedName = normalizedName;
    }

    if (dto.code !== undefined) {
      const code = normalizeDocumentKindCode(dto.code);

      if (!DOCUMENT_KIND_CODE_PATTERN.test(code)) {
        throw new BadRequestError(
          'Mã thể loại chỉ được chứa chữ cái, chữ số và dấu gạch ngang (-). Không được chứa dấu /.',
        );
      }

      // Block code change if already in use
      if (code !== kind.code) {
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

    // 5. Update in transaction + SystemLog
    return prisma.$transaction(async (tx) => {
      const updated = await repository.update(id, updateData, tx);

      await logSystemAction({
        userId,
        action: 'UPDATE_DOCUMENT_TYPE',
        entityType: 'DocumentKind',
        entityId: id,
        details: `Cập nhật thể loại văn bản: ${updated.code} - ${updated.name}`,
      });

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

  async delete(id: number, userId: number): Promise<DeleteDocumentKindResult> {
    const kind = await repository.findById(id);
    if (!kind) throw new NotFoundError('Thể loại văn bản không tồn tại');

    if (kind.deletedAt) throw new ConflictError('Thể loại văn bản đã được xoá trước đó');
    if (kind.isSystem) throw new ForbiddenError('Không thể xoá thể loại văn bản của hệ thống');

    const usage = await repository.countUsage(id);

    return prisma.$transaction(async (tx) => {
      let updatedKind: DocumentKindResponse;
      let operation: 'SOFT_DELETED' | 'DEACTIVATED';

      if (usage.total > 0) {
        updatedKind = await repository.deactivate(id, userId, tx);
        operation = 'DEACTIVATED';

        await logSystemAction({
          userId,
          action: 'DEACTIVATE_DOCUMENT_TYPE',
          entityType: 'DocumentKind',
          entityId: id,
          details: `Vô hiệu hóa thể loại văn bản ${kind.code} (đang được sử dụng bởi ${usage.total} văn bản)`,
        });
      } else {
        updatedKind = await repository.softDelete(id, userId, tx);
        operation = 'SOFT_DELETED';

        await logSystemAction({
          userId,
          action: 'DELETE_DOCUMENT_TYPE',
          entityType: 'DocumentKind',
          entityId: id,
          details: `Xoá mềm thể loại văn bản: ${kind.code} - ${kind.name}`,
        });
      }

      return { kind: updatedKind, operation, usage };
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REACTIVATE
  // ──────────────────────────────────────────────────────────────────────────

  async reactivate(id: number, userId: number): Promise<DocumentKindResponse> {
    const kind = await repository.findById(id);
    if (!kind) throw new NotFoundError('Thể loại văn bản không tồn tại');

    if (kind.isSystem) throw new ForbiddenError('Không thể thay đổi trạng thái thể loại hệ thống');
    if (kind.status === DocumentKindStatus.ACTIVE && !kind.deletedAt) {
      throw new ConflictError('Thể loại văn bản đang ở trạng thái ACTIVE');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await repository.reactivate(id, userId, tx);

      await logSystemAction({
        userId,
        action: 'REACTIVATE_DOCUMENT_TYPE',
        entityType: 'DocumentKind',
        entityId: id,
        details: `Kích hoạt lại thể loại văn bản: ${updated.code} - ${updated.name}`,
      });

      return updated;
    });
  }
}
