import { default as prisma } from '../../config/database';
import { Prisma, DocumentBookStatus, DocumentBookType } from '@prisma/client';
import { CreateDocumentBookInput, UpdateDocumentBookInput, ListDocumentBooksQuery, DocumentBookDto } from './document-books.types';

export class DocumentBooksRepository {
  async findById(id: number): Promise<DocumentBookDto | null> {
    return prisma.documentBook.findFirst({
      where: { id, deletedAt: null },
      include: {
        department: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
        _count: {
          select: { incomingEntries: true, outgoingEntries: true },
        },
      },
    });
  }

  async findAll(query: ListDocumentBooksQuery) {
    const { page = 1, limit = 10, search, bookType, year, departmentId, status, isDefault } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DocumentBookWhereInput = {
      deletedAt: null, // ẩn các sổ đã soft-delete
      ...(bookType && { bookType }),
      ...(year && { year }),
      ...(departmentId && { departmentId }),
      ...(status && { status }),
      ...(isDefault !== undefined && { isDefault }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.documentBook.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
        include: {
          department: { select: { id: true, name: true } },
          createdBy: { select: { id: true, fullName: true } },
          _count: {
            select: { incomingEntries: true, outgoingEntries: true },
          },
        },
      }),
      prisma.documentBook.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async create(data: CreateDocumentBookInput, createdById: number) {
    return prisma.documentBook.create({
      data: {
        ...data,
        createdById,
      },
    });
  }

  async update(id: number, data: UpdateDocumentBookInput) {
    return prisma.documentBook.update({
      where: { id },
      data,
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
      data: updateData,
    });
  }

  /**
   * Soft-delete: sổ chưa có văn bản, ẩn khỏi danh sách nhưng giữ dữ liệu
   */
  async softDelete(id: number) {
    return prisma.documentBook.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isDefault: false, // bỏ cờ mặc định khi xóa
      },
    });
  }

  async unsetDefaultBook(departmentId: number, bookType: DocumentBookType, year: number) {
    await prisma.documentBook.updateMany({
      where: { departmentId, bookType, year, isDefault: true, deletedAt: null },
      data: { isDefault: false },
    });
  }

  async countEntries(id: number): Promise<{ incoming: number; outgoing: number }> {
    const book = await prisma.documentBook.findUnique({
      where: { id },
      include: {
        _count: {
          select: { incomingEntries: true, outgoingEntries: true },
        },
      },
    });
    if (!book) return { incoming: 0, outgoing: 0 };
    return {
      incoming: book._count.incomingEntries,
      outgoing: book._count.outgoingEntries,
    };
  }

  async hasEntries(id: number): Promise<boolean> {
    const count = await this.countEntries(id);
    return count.incoming > 0 || count.outgoing > 0;
  }

  /**
   * Lấy danh sách văn bản đã đăng ký trong sổ (phân trang).
   * Trả về incoming entries hoặc outgoing entries tùy bookType.
   */
  async findEntriesByBookId(
    id: number,
    bookType: DocumentBookType,
    page: number = 1,
    limit: number = 20,
  ) {
    const skip = (page - 1) * limit;

    if (bookType === 'INCOMING') {
      const [items, total] = await Promise.all([
        prisma.incomingBookEntry.findMany({
          where: { documentBookId: id },
          skip,
          take: limit,
          orderBy: { arrivalNumber: 'asc' },
          include: {
            incomingDocument: {
              include: {
                document: {
                  include: {
                    urgency: { select: { name: true } },
                  },
                },
                documentTypeRef: { select: { name: true } },
              },
            },
          },
        }),
        prisma.incomingBookEntry.count({ where: { documentBookId: id } }),
      ]);
      return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
    } else {
      const [items, total] = await Promise.all([
        prisma.outgoingBookEntry.findMany({
          where: { documentBookId: id },
          skip,
          take: limit,
          orderBy: { sequenceNumber: 'asc' },
          include: {
            outgoingDocument: {
              include: {
                document: {
                  include: {
                    urgency: { select: { name: true } },
                  },
                },
                documentTypeRef: { select: { name: true } },
              },
            },
          },
        }),
        prisma.outgoingBookEntry.count({ where: { documentBookId: id } }),
      ]);
      return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
    }
  }

  async countByNameAndDepartmentAndYearAndType(
    name: string,
    departmentId: number,
    year: number,
    bookType: DocumentBookType,
    excludeId?: number,
  ): Promise<number> {
    return prisma.documentBook.count({
      where: {
        name,
        departmentId,
        year,
        bookType,
        deletedAt: null,
        id: excludeId ? { not: excludeId } : undefined,
      },
    });
  }
}

export const documentBooksRepository = new DocumentBooksRepository();
