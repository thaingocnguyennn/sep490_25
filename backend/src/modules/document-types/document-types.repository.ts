import { DocumentKindStatus, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import {
  DocumentKindFilterDto,
  PaginatedDocumentKindResponse,
  DocumentKindResponse,
  DocumentKindOption,
  DocumentKindUsage,
} from './document-types.types';

// ──────────────────────────────────────────────────────────────────────────────
// Shared include clause
// ──────────────────────────────────────────────────────────────────────────────

const kindInclude = {
  createdBy: { select: { id: true, fullName: true } },
  _count: {
    select: {
      incomingDocuments: true,
      outgoingDocuments: true,
    },
  },
} as const satisfies Prisma.DocumentKindInclude;

type KindWithInclude = Prisma.DocumentKindGetPayload<{ include: typeof kindInclude }>;

function mapToResponse(kind: KindWithInclude): DocumentKindResponse {
  return {
    id: kind.id,
    name: kind.name,
    code: kind.code,
    description: kind.description,
    status: kind.status,
    isSystem: kind.isSystem,
    createdAt: kind.createdAt,
    updatedAt: kind.updatedAt,
    deletedAt: kind.deletedAt,
    createdBy: {
      id: kind.createdBy.id,
      fullName: kind.createdBy.fullName,
    },
    usageCount: kind._count.incomingDocuments + kind._count.outgoingDocuments,
    usageDetail: {
      incoming: kind._count.incomingDocuments,
      outgoing: kind._count.outgoingDocuments,
    },
  };
}

export class DocumentTypesRepository {
  // ────────────────────────────────────────────────────────────────────────────
  // READ
  // ────────────────────────────────────────────────────────────────────────────

  async findAll(filter: DocumentKindFilterDto): Promise<PaginatedDocumentKindResponse> {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filter;

    const skip = (page - 1) * limit;

    const where: Prisma.DocumentKindWhereInput = {
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

    const [kinds, total] = await Promise.all([
      prisma.documentKind.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: kindInclude,
      }),
      prisma.documentKind.count({ where }),
    ]);

    return {
      data: kinds.map(mapToResponse),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findActiveOptions(): Promise<DocumentKindOption[]> {
    return prisma.documentKind.findMany({
      where: {
        status: DocumentKindStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    });
  }

  async findById(id: number): Promise<DocumentKindResponse | null> {
    const kind = await prisma.documentKind.findUnique({
      where: { id },
      include: kindInclude,
    });

    if (!kind) return null;
    return mapToResponse(kind);
  }

  /** Find by code, optionally excluding a specific ID (for update duplicate check). */
  async findByCode(
    code: string,
    excludeId?: number,
  ): Promise<{ id: number; code: string } | null> {
    return prisma.documentKind.findFirst({
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
    return prisma.documentKind.findFirst({
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

  async countUsage(kindId: number): Promise<DocumentKindUsage> {
    const [incoming, outgoing] = await Promise.all([
      prisma.incomingDocument.count({ where: { documentTypeId: kindId } }),
      prisma.outgoingDocument.count({ where: { documentTypeId: kindId } }),
    ]);

    return { incoming, outgoing, total: incoming + outgoing };
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
      status: DocumentKindStatus;
      createdById: number;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentKindResponse> {
    const client = tx ?? prisma;
    const kind = await client.documentKind.create({
      data,
      include: kindInclude,
    });
    return mapToResponse(kind);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ────────────────────────────────────────────────────────────────────────────

  async update(
    id: number,
    data: Prisma.DocumentKindUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentKindResponse> {
    const client = tx ?? prisma;
    const kind = await client.documentKind.update({
      where: { id },
      data,
      include: kindInclude,
    });
    return mapToResponse(kind);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // SOFT DELETE / DEACTIVATE
  // ────────────────────────────────────────────────────────────────────────────

  async softDelete(
    id: number,
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentKindResponse> {
    const client = tx ?? prisma;
    const kind = await client.documentKind.update({
      where: { id },
      data: {
        status: DocumentKindStatus.INACTIVE,
        deletedAt: new Date(),
        updatedBy: { connect: { id: userId } },
      },
      include: kindInclude,
    });
    return mapToResponse(kind);
  }

  async deactivate(
    id: number,
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentKindResponse> {
    const client = tx ?? prisma;
    const kind = await client.documentKind.update({
      where: { id },
      data: {
        status: DocumentKindStatus.INACTIVE,
        deletedAt: null,
        updatedBy: { connect: { id: userId } },
      },
      include: kindInclude,
    });
    return mapToResponse(kind);
  }

  async reactivate(
    id: number,
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentKindResponse> {
    const client = tx ?? prisma;
    const kind = await client.documentKind.update({
      where: { id },
      data: {
        status: DocumentKindStatus.ACTIVE,
        deletedAt: null,
        updatedBy: { connect: { id: userId } },
      },
      include: kindInclude,
    });
    return mapToResponse(kind);
  }
}
