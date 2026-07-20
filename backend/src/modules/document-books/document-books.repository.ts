import { default as prisma } from '../../config/database';
import { Prisma, DocumentBookStatus, DocumentBookType } from '@prisma/client';
import { CreateDocumentBookInput, UpdateDocumentBookInput, ListDocumentBooksQuery, DocumentBookDto } from './document-books.types';

export class DocumentBooksRepository {
  async findById(id: number): Promise<DocumentBookDto | null> {
    return prisma.documentBook.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } }
      }
    });
  }

  async findAll(query: ListDocumentBooksQuery) {
    const { page = 1, limit = 10, search, bookType, year, departmentId, status, isDefault } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DocumentBookWhereInput = {
      ...(bookType && { bookType }),
      ...(year && { year }),
      ...(departmentId && { departmentId }),
      ...(status && { status }),
      ...(isDefault !== undefined && { isDefault }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ]
      })
    };

    const [items, total] = await Promise.all([
      prisma.documentBook.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
        include: {
          department: { select: { id: true, name: true } },
          createdBy: { select: { id: true, fullName: true } }
        }
      }),
      prisma.documentBook.count({ where })
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async create(data: CreateDocumentBookInput, createdById: number) {
    return prisma.documentBook.create({
      data: {
        ...data,
        createdById
      }
    });
  }

  async update(id: number, data: UpdateDocumentBookInput) {
    return prisma.documentBook.update({
      where: { id },
      data
    });
  }

  async updateStatus(id: number, status: DocumentBookStatus) {
    const updateData: Prisma.DocumentBookUpdateInput = { status };
    if (status === 'CLOSED') {
      updateData.closedAt = new Date();
    } else if (status === 'ACTIVE') {
      updateData.closedAt = null;
    }
    return prisma.documentBook.update({
      where: { id },
      data: updateData
    });
  }

  async unsetDefaultBook(departmentId: number, bookType: DocumentBookType, year: number) {
    await prisma.documentBook.updateMany({
      where: { departmentId, bookType, year, isDefault: true },
      data: { isDefault: false }
    });
  }

  async hasEntries(id: number): Promise<boolean> {
    const book = await prisma.documentBook.findUnique({
      where: { id },
      include: {
        _count: {
          select: { incomingEntries: true, outgoingEntries: true }
        }
      }
    });
    if (!book) return false;
    return (book._count.incomingEntries > 0 || book._count.outgoingEntries > 0);
  }

  async countByNameAndDepartmentAndYearAndType(
    name: string,
    departmentId: number,
    year: number,
    bookType: DocumentBookType,
    excludeId?: number
  ): Promise<number> {
    return prisma.documentBook.count({
      where: {
        name,
        departmentId,
        year,
        bookType,
        id: excludeId ? { not: excludeId } : undefined
      }
    });
  }
}

export const documentBooksRepository = new DocumentBooksRepository();
