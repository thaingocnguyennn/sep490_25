import { DocumentTypeStatus, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import {
  DocumentTypeFilterDto,
  PaginatedDocumentTypeResponse,
  DocumentTypeResponse,
  DocumentTypeOption,
  DocumentTypeUsage,
} from './document-types.types';

// ──────────────────────────────────────────────────────────────────────────────
// Shared include clause
// ──────────────────────────────────────────────────────────────────────────────

const typeInclude = {
  createdBy: { select: { id: true, fullName: true } },
  _count: {
    select: {
      outgoingDocuments: true,
    },
  },
} as const satisfies Prisma.DocumentTypeInclude;

type TypeWithInclude = Prisma.DocumentTypeGetPayload<{ include: typeof typeInclude }>;

function mapToResponse(type: TypeWithInclude): DocumentTypeResponse {
  return {
    id: type.id,
    name: type.name,
    code: type.code,
    description: type.description,
    status: type.status,
    isSystem: type.isSystem,
    createdAt: type.createdAt,
    updatedAt: type.updatedAt,
    deletedAt: type.deletedAt,
    createdBy: {
      id: type.createdBy.id,
      fullName: type.createdBy.fullName,
    },
    usageCount: type._count.outgoingDocuments,
    usageDetail: {
      incoming: 0,
      outgoing: type._count.outgoingDocuments,
    },
  };
}

export class DocumentTypesRepository {
  // ────────────────────────────────────────────────────────────────────────────
  // READ
  // ────────────────────────────────────────────────────────────────────────────

  async findAll(filter: DocumentTypeFilterDto): Promise<PaginatedDocumentTypeResponse> {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filter;

    const skip = (page - 1) * limit;

    const where: Prisma.DocumentTypeWhereInput = {
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

    const [types, total] = await Promise.all([
      prisma.documentType.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: typeInclude,
      }),
      prisma.documentType.count({ where }),
    ]);

    return {
      data: types.map(mapToResponse),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findActiveOptions(): Promise<DocumentTypeOption[]> {
    return prisma.documentType.findMany({
      where: {
        status: DocumentTypeStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    });
  }

  async findById(id: number): Promise<DocumentTypeResponse | null> {
    const type = await prisma.documentType.findUnique({
      where: { id },
      include: typeInclude,
    });

    if (!type) return null;
    return mapToResponse(type);
  }

  /** Find by code, optionally excluding a specific ID (for update duplicate check). */
  async findByCode(
    code: string,
    excludeId?: number,
  ): Promise<{ id: number; code: string } | null> {
    return prisma.documentType.findFirst({
      where: {
        code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, code: true },
    });
  }

  /** Find by normalizedName, optionally excluding a specific ID. */
  async findByNormalizedName(
    normalizedName: string,
    excludeId?: number,
  ): Promise<{ id: number; name: string } | null> {
    return prisma.documentType.findFirst({
      where: {
        normalizedName,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // USAGE COUNT
  // ────────────────────────────────────────────────────────────────────────────

  async countUsage(typeId: number): Promise<DocumentTypeUsage> {
    const outgoing = await prisma.outgoingDocument.count({
      where: { documentTypeId: typeId },
    });

    return { incoming: 0, outgoing, total: outgoing };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CREATE
  // ────────────────────────────────────────────────────────────────────────────

  async create(
    data: {
      name: string;
      normalizedName: string;
      code: string;
      description?: string | null;
      status: DocumentTypeStatus;
      createdById: number;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentTypeResponse> {
    const client = tx ?? prisma;
    const type = await client.documentType.create({
      data,
      include: typeInclude,
    });
    return mapToResponse(type);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ────────────────────────────────────────────────────────────────────────────

  async update(
    id: number,
    data: Prisma.DocumentTypeUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentTypeResponse> {
    const client = tx ?? prisma;
    const type = await client.documentType.update({
      where: { id },
      data,
      include: typeInclude,
    });
    return mapToResponse(type);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // SOFT DELETE / DEACTIVATE
  // ────────────────────────────────────────────────────────────────────────────

  async softDelete(
    id: number,
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentTypeResponse> {
    const client = tx ?? prisma;
    const type = await client.documentType.update({
      where: { id },
      data: {
        status: DocumentTypeStatus.INACTIVE,
        deletedAt: new Date(),
        updatedBy: { connect: { id: userId } },
      },
      include: typeInclude,
    });
    return mapToResponse(type);
  }

  async deactivate(
    id: number,
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentTypeResponse> {
    const client = tx ?? prisma;
    const type = await client.documentType.update({
      where: { id },
      data: {
        status: DocumentTypeStatus.INACTIVE,
        deletedAt: null,
        updatedBy: { connect: { id: userId } },
      },
      include: typeInclude,
    });
    return mapToResponse(type);
  }

  async reactivate(
    id: number,
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentTypeResponse> {
    const client = tx ?? prisma;
    const type = await client.documentType.update({
      where: { id },
      data: {
        status: DocumentTypeStatus.ACTIVE,
        deletedAt: null,
        updatedBy: { connect: { id: userId } },
      },
      include: typeInclude,
    });
    return mapToResponse(type);
  }
}
