import { DocumentCategoryStatus, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import {
  DocumentCategoryFilterDto,
  PaginatedDocumentCategoryResponse,
  DocumentCategoryResponse,
  DocumentCategoryOption,
  DocumentCategoryUsage,
} from './document-categories.types';

// ──────────────────────────────────────────────────────────────────────────────
// Helper: Shared include clause
// ──────────────────────────────────────────────────────────────────────────────

const categoryInclude = {
  createdBy: { select: { id: true, fullName: true } },
  _count: {
    select: {
      incomingDocuments: true,
      outgoingDocuments: true,
    },
  },
} as const satisfies Prisma.DocumentCategoryInclude;

// Infer the exact return type from Prisma using the include clause
type CategoryWithInclude = Prisma.DocumentCategoryGetPayload<{
  include: typeof categoryInclude;
}>;

function mapToResponse(category: CategoryWithInclude): DocumentCategoryResponse {
  return {
    id: category.id,
    name: category.name,
    code: category.code,
    description: category.description,
    status: category.status,
    isSystem: category.isSystem,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
    deletedAt: category.deletedAt,
    createdBy: {
      id: category.createdBy.id,
      fullName: category.createdBy.fullName,
    },
    usageCount: category._count.incomingDocuments + category._count.outgoingDocuments,
  };
}

export class DocumentCategoriesRepository {
  // ──────────────────────────────────────────────────────────────────────────
  // READ
  // ──────────────────────────────────────────────────────────────────────────

  async findAll(filter: DocumentCategoryFilterDto): Promise<PaginatedDocumentCategoryResponse> {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filter;

    const skip = (page - 1) * limit;

    const where: Prisma.DocumentCategoryWhereInput = {
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    const [categories, total] = await Promise.all([
      prisma.documentCategory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: categoryInclude,
      }),
      prisma.documentCategory.count({ where }),
    ]);

    return {
      data: categories.map(mapToResponse),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findActiveOptions(): Promise<DocumentCategoryOption[]> {
    return prisma.documentCategory.findMany({
      where: {
        status: DocumentCategoryStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    });
  }

  async findById(id: number): Promise<DocumentCategoryResponse | null> {
    const category = await prisma.documentCategory.findUnique({
      where: { id },
      include: categoryInclude,
    });

    if (!category) return null;
    return mapToResponse(category);
  }

  /**
   * Tìm theo mã (code), có thể bỏ qua một ID cụ thể khi kiểm tra trùng lặp trong quá trình update.
   * Không bỏ qua category đã soft-delete: mã cũ không được phép tái sử dụng.
   */
  async findByCode(
    code: string,
    excludeId?: number,
  ): Promise<{ id: number; code: string } | null> {
    return prisma.documentCategory.findFirst({
      where: {
        code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, code: true },
    });
  }

  /**
   * Tìm theo normalizedName, có thể bỏ qua một ID khi update.
   * Không bỏ qua category đã soft-delete: tên cũ không được phép tái sử dụng.
   */
  async findByNormalizedName(
    normalizedName: string,
    excludeId?: number,
  ): Promise<{ id: number; name: string } | null> {
    return prisma.documentCategory.findFirst({
      where: {
        normalizedName,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // USAGE COUNT
  // ──────────────────────────────────────────────────────────────────────────

  async countUsage(categoryId: number): Promise<DocumentCategoryUsage> {
    const [incoming, outgoing] = await Promise.all([
      prisma.incomingDocument.count({ where: { categoryId } }),
      prisma.outgoingDocument.count({ where: { categoryId } }),
    ]);

    return { incoming, outgoing, total: incoming + outgoing };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CREATE
  // ──────────────────────────────────────────────────────────────────────────

  async create(
    data: {
      name: string;
      normalizedName: string;
      code: string;
      description?: string | null;
      status: DocumentCategoryStatus;
      createdById: number;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentCategoryResponse> {
    const client = tx ?? prisma;
    const category = await client.documentCategory.create({
      data,
      include: categoryInclude,
    });
    return mapToResponse(category);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ──────────────────────────────────────────────────────────────────────────

  async update(
    id: number,
    data: Prisma.DocumentCategoryUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentCategoryResponse> {
    const client = tx ?? prisma;
    const category = await client.documentCategory.update({
      where: { id },
      data,
      include: categoryInclude,
    });
    return mapToResponse(category);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SOFT DELETE / DEACTIVATE
  // ──────────────────────────────────────────────────────────────────────────

  async softDelete(
    id: number,
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentCategoryResponse> {
    const client = tx ?? prisma;
    const category = await client.documentCategory.update({
      where: { id },
      data: {
        status: DocumentCategoryStatus.INACTIVE,
        deletedAt: new Date(),
        updatedBy: { connect: { id: userId } },
      },
      include: categoryInclude,
    });
    return mapToResponse(category);
  }

  async deactivate(
    id: number,
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentCategoryResponse> {
    const client = tx ?? prisma;
    const category = await client.documentCategory.update({
      where: { id },
      data: {
        status: DocumentCategoryStatus.INACTIVE,
        deletedAt: null,
        updatedBy: { connect: { id: userId } },
      },
      include: categoryInclude,
    });
    return mapToResponse(category);
  }
}
