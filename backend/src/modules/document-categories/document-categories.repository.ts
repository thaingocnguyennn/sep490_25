import { PrismaClient, DocumentCategoryStatus, Prisma } from '@prisma/client';
import { DocumentCategoryFilterDto, PaginatedDocumentCategoryResponse, DocumentCategoryResponse, DocumentCategoryOption } from './document-categories.types';

const prisma = new PrismaClient();

export class DocumentCategoriesRepository {
  async findAll(filter: DocumentCategoryFilterDto): Promise<PaginatedDocumentCategoryResponse> {
    const { page = 1, limit = 10, search, status, sortBy = 'createdAt', sortOrder = 'desc' } = filter;
    
    const skip = (page - 1) * limit;

    const where: Prisma.DocumentCategoryWhereInput = {
      deletedAt: null, // Only fetch non-deleted categories
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
        include: {
          createdBy: {
            select: { id: true, fullName: true },
          },
          _count: {
            select: {
              incomingDocuments: true,
              outgoingDocuments: true,
            },
          },
        },
      }),
      prisma.documentCategory.count({ where }),
    ]);

    const data: DocumentCategoryResponse[] = categories.map(category => ({
      id: category.id,
      name: category.name,
      code: category.code,
      description: category.description,
      status: category.status,
      isSystem: category.isSystem,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      createdBy: category.createdBy,
      usageCount: category._count.incomingDocuments + category._count.outgoingDocuments,
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findActiveOptions(): Promise<DocumentCategoryOption[]> {
    const categories = await prisma.documentCategory.findMany({
      where: {
        status: DocumentCategoryStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
      },
    });

    return categories;
  }

  async findById(id: number): Promise<DocumentCategoryResponse | null> {
    const category = await prisma.documentCategory.findUnique({
      where: { id, deletedAt: null },
      include: {
        createdBy: {
          select: { id: true, fullName: true },
        },
        _count: {
          select: {
            incomingDocuments: true,
            outgoingDocuments: true,
          },
        },
      },
    });

    if (!category) return null;

    return {
      id: category.id,
      name: category.name,
      code: category.code,
      description: category.description,
      status: category.status,
      isSystem: category.isSystem,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      createdBy: category.createdBy,
      usageCount: category._count.incomingDocuments + category._count.outgoingDocuments,
    };
  }
}
