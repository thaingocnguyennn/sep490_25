import { Prisma, DocumentCategoryStatus } from '@prisma/client';
import prisma from '../../config/database';
import { DocumentCategoriesRepository } from './document-categories.repository';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  BadRequestError,
} from '../../shared/exceptions/app-error';
import {
  DocumentCategoryFilterDto,
  CreateDocumentCategoryDto,
  UpdateDocumentCategoryDto,
  DocumentCategoryResponse,
  PaginatedDocumentCategoryResponse,
  DocumentCategoryOption,
  DeleteDocumentCategoryResult,
} from './document-categories.types';
import {
  normalizeDocumentCategoryName,
  normalizeDocumentCategoryCode,
} from './document-categories.helpers';

const repository = new DocumentCategoriesRepository();

export class DocumentCategoriesService {
  // ──────────────────────────────────────────────────────────────────────────
  // READ
  // ──────────────────────────────────────────────────────────────────────────

  async findAll(filter: DocumentCategoryFilterDto): Promise<PaginatedDocumentCategoryResponse> {
    return repository.findAll(filter);
  }

  async getActiveOptions(): Promise<DocumentCategoryOption[]> {
    return repository.findActiveOptions();
  }

  async findById(id: number): Promise<DocumentCategoryResponse> {
    const category = await repository.findById(id);
    if (!category) {
      throw new NotFoundError('Lĩnh vực văn bản không tồn tại');
    }
    return category;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CREATE (UC-75)
  // ──────────────────────────────────────────────────────────────────────────

  async create(
    dto: CreateDocumentCategoryDto,
    userId: number,
  ): Promise<DocumentCategoryResponse> {
    // 1. Chuẩn hoá dữ liệu
    const name = dto.name.trim().replace(/\s+/g, ' ');
    const normalizedName = normalizeDocumentCategoryName(name);
    const code = normalizeDocumentCategoryCode(dto.code);
    const description = dto.description?.trim() || null;
    const status = dto.status ?? DocumentCategoryStatus.ACTIVE;

    // 2. Kiểm tra trùng lặp (parallel)
    const [duplicateName, duplicateCode] = await Promise.all([
      repository.findByNormalizedName(normalizedName),
      repository.findByCode(code),
    ]);

    if (duplicateName) {
      throw new ConflictError('Tên lĩnh vực văn bản đã tồn tại');
    }

    if (duplicateCode) {
      throw new ConflictError('Mã lĩnh vực văn bản đã tồn tại');
    }

    // 3. Tạo mới trong transaction.
    return prisma.$transaction(async (tx) => {
      const category = await repository.create(
        { name, normalizedName, code, description, status, createdById: userId },
        tx,
      );

      return category;
    }).catch((error) => {
      // Bảo vệ khỏi race-condition (hai request cùng vượt qua bước check)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError('Tên hoặc mã lĩnh vực văn bản đã tồn tại');
      }
      throw error;
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // UPDATE (UC-77)
  // ──────────────────────────────────────────────────────────────────────────

  async update(
    id: number,
    dto: UpdateDocumentCategoryDto,
    userId: number,
  ): Promise<DocumentCategoryResponse> {
    // 1. Tìm category hiện tại
    const category = await repository.findById(id);
    if (!category) {
      throw new NotFoundError('Lĩnh vực văn bản không tồn tại');
    }

    // 2. Kiểm tra các điều kiện chặn
    if (category.deletedAt) {
      throw new ConflictError('Lĩnh vực văn bản đã bị xoá, không thể chỉnh sửa');
    }

    if (category.isSystem) {
      throw new ForbiddenError('Không thể chỉnh sửa lĩnh vực văn bản của hệ thống');
    }

    // 3. Kiểm tra xem có field nào được cập nhật không
    const hasUpdate =
      dto.name !== undefined ||
      dto.code !== undefined ||
      dto.description !== undefined ||
      dto.status !== undefined;

    if (!hasUpdate) {
      throw new BadRequestError('Không có thông tin nào được cung cấp để cập nhật');
    }

    // 4. Chuẩn hoá và kiểm tra trùng lặp
    const updateData: Prisma.DocumentCategoryUpdateInput = {
      updatedBy: { connect: { id: userId } },
    };

    if (dto.name !== undefined) {
      const name = dto.name.trim().replace(/\s+/g, ' ');
      const normalizedName = normalizeDocumentCategoryName(name);

      const duplicateName = await repository.findByNormalizedName(normalizedName, id);
      if (duplicateName) {
        throw new ConflictError('Tên lĩnh vực văn bản đã tồn tại');
      }

      updateData.name = name;
      updateData.normalizedName = normalizedName;
    }

    if (dto.code !== undefined) {
      const code = normalizeDocumentCategoryCode(dto.code);

      // Kiểm tra nếu đang cố đổi mã trong khi đã có văn bản sử dụng
      if (code !== category.code) {
        const usage = await repository.countUsage(id);
        if (usage.total > 0) {
          throw new ConflictError(
            'Không thể thay đổi mã lĩnh vực vì đang được sử dụng bởi văn bản',
          );
        }

        const duplicateCode = await repository.findByCode(code, id);
        if (duplicateCode) {
          throw new ConflictError('Mã lĩnh vực văn bản đã tồn tại');
        }
      }

      updateData.code = code;
    }

    if (dto.description !== undefined) {
      updateData.description = dto.description === null ? null : dto.description.trim() || null;
    }

    if (dto.status !== undefined) {
      updateData.status = dto.status;
    }

    // 5. Cập nhật trong transaction.
    return prisma.$transaction(async (tx) => {
      const updated = await repository.update(id, updateData, tx);

      return updated;
    }).catch((error) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError('Tên hoặc mã lĩnh vực văn bản đã tồn tại');
      }
      throw error;
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE (UC-78)
  // ──────────────────────────────────────────────────────────────────────────

  async delete(
    id: number,
    userId: number,
  ): Promise<DeleteDocumentCategoryResult> {
    // 1. Tìm category
    const category = await repository.findById(id);
    if (!category) {
      throw new NotFoundError('Lĩnh vực văn bản không tồn tại');
    }

    // 2. Kiểm tra các điều kiện chặn
    if (category.deletedAt) {
      throw new ConflictError('Lĩnh vực văn bản đã được xoá trước đó');
    }

    if (category.isSystem) {
      throw new ForbiddenError('Không thể xoá lĩnh vực văn bản của hệ thống');
    }

    // 3. Đếm usage để quyết định soft delete hay deactivate
    const usage = await repository.countUsage(id);

    return prisma.$transaction(async (tx) => {
      let updatedCategory: DocumentCategoryResponse;
      let operation: 'SOFT_DELETED' | 'DEACTIVATED';

      if (usage.total > 0) {
        // Đang được sử dụng → chỉ deactivate (không đặt deletedAt)
        updatedCategory = await repository.deactivate(id, userId, tx);
        operation = 'DEACTIVATED';
      } else {
        // Chưa được sử dụng → soft delete
        updatedCategory = await repository.softDelete(id, userId, tx);
        operation = 'SOFT_DELETED';
      }

      return { category: updatedCategory, operation, usage };
    });
  }
}
