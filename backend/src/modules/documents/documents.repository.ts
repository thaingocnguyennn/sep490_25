import { default as prisma } from '../../config/database';
import { Prisma } from '@prisma/client';
import { NotFoundError } from '../../shared/exceptions/app-error';

export class DocumentsRepository {
  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    type?: string;
    status?: string;
  }) {
    const { page, limit, search, type, status } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.DocumentWhereInput = {};
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { documentNumber: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (type) where.type = type as any;
    if (status) where.status = status as any;

    const [items, total] = await Promise.all([
      prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdByUser: { select: { id: true, fullName: true } },
          incomingDocuments: { select: { signerName: true, dateReceived: true } },
          outgoingDocuments: { select: { recipientName: true, sentDate: true } },
        },
      }),
      prisma.document.count({ where }),
    ]);

    return { items, total };
  }

  async findById(id: number) {
    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        createdByUser: { select: { id: true, fullName: true } },
        updatedByUser: { select: { id: true, fullName: true } },
        incomingDocuments: true,
        outgoingDocuments: true,
        processors: { include: { user: { select: { id: true, fullName: true, email: true } } } },
        attachments: true,
      },
    });
    if (!document) throw new NotFoundError('Document not found');
    return document;
  }

  async create(data: Prisma.DocumentUncheckedCreateInput) {
    return prisma.document.create({ data: data as any });
  }

  async update(id: number, data: Prisma.DocumentUncheckedUpdateInput) {
    return prisma.document.update({ where: { id }, data: data as any });
  }

  async delete(id: number) {
    return prisma.document.delete({ where: { id } });
  }

  async countByType() {
    return prisma.document.groupBy({
      by: ['type'],
      _count: true,
    });
  }

  async generateDocumentNumber(type: string): Promise<string> {
    const prefix = type === 'INCOMING' ? 'IN' : type === 'OUTGOING' ? 'OUT' : 'INT';
    const year = new Date().getFullYear();
    const count = await prisma.document.count({
      where: {
        documentNumber: { startsWith: `${prefix}-${year}` },
      },
    });
    const seq = String(count + 1).padStart(4, '0');
    return `${prefix}-${year}-${seq}`;
  }
}

export const documentsRepository = new DocumentsRepository();
