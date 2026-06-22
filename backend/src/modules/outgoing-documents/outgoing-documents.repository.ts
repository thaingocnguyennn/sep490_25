import { default as prisma } from '../../config/database';
import { NotFoundError } from '../../shared/exceptions/app-error';
import { Prisma } from '@prisma/client';
import { resolveConfidentialityId } from '../../shared/utils/confidentiality';
import { resolveUrgencyId } from '../../shared/utils/urgency';

// ─── Kiểu dữ liệu trả về ─────────────────────────────────────────────────────

export interface OutgoingDocumentWithRelations {
  id: number;
  documentId: number;
  documentType: string | null;
  documentNumber: string | null;
  dispatchNumber: string | null;
  issuanceDate: Date | null;
  signerName: string | null;
  signerTitle: string | null;
  urgencyId: number | null;
  urgency: {
    id: number;
    name: string;
    description: string | null;
  } | null;
  recipientName: string | null;
  recipientAddress: string | null;
  recipientEmail: string | null;
  sentDate: Date | null;
  pageCount: number | null;
  submittedAt: Date | null;
  submittedBy: number | null;
  approvedAt: Date | null;
  approvedBy: number | null;
  returnedAt: Date | null;
  returnedBy: number | null;
  returnReason: string | null;
  forwardedAt: Date | null;
  forwardedBy: number | null;
  issuedAt: Date | null;
  issuedBy: number | null;
  recalledAt: Date | null;
  recalledBy: number | null;
  recallReason: string | null;
  trashedAt: Date | null;
  trashedBy: number | null;
  notes: string | null;
  assignedClerkId: number | null;
  assignedClerk: { id: number; fullName: string } | null;
  createdAt: Date;
  updatedAt: Date;
  document: {
    id: number;
    documentNumber: string;
    title: string;
    description: string | null;
    type: string;
    fileUrl: string | null;
    ocrText: string | null;
    ocrStatus: string;
    status: string;
    priority: string;
    urgencyLevel: string;
    confidentialityId: number | null;
    confidentiality: {
      id: number;
      code: string | null;
      name: string;
      description: string | null;
    } | null;
    documentStatus: string;
    isArchived: boolean;
    originalFileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdByUser: { id: number; fullName: string } | null;
    updatedByUser: { id: number; fullName: string } | null;
    department: { id: number; name: string } | null;
    attachments: {
      id: number;
      fileName: string;
      fileUrl: string;
      fileSize: number | null;
      mimeType: string | null;
    }[];
  };
  submittedByUser: { id: number; fullName: string } | null;
  approvedByUser: { id: number; fullName: string } | null;
  returnedByUser: { id: number; fullName: string } | null;
  forwardedByUser: { id: number; fullName: string } | null;
  issuedByUser: { id: number; fullName: string } | null;
  recalledByUser: { id: number; fullName: string } | null;
  trashedByUser: { id: number; fullName: string } | null;
}

// ─── Include helper (dùng chung cho list và getById) ─────────────────────────

const OUTGOING_INCLUDE = {
  document: {
    include: {
      createdByUser: { select: { id: true, fullName: true } },
      updatedByUser: { select: { id: true, fullName: true } },
      department: { select: { id: true, name: true } },
      confidentiality: { select: { id: true, code: true, name: true, description: true } },
      urgency: { select: { id: true, name: true, description: true } },
      attachments: {
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
          fileSize: true,
          mimeType: true,
        },
      },
    },
  },
  urgency: { select: { id: true, name: true, description: true } },
  submittedByUser: { select: { id: true, fullName: true } },
  approvedByUser: { select: { id: true, fullName: true } },
  returnedByUser: { select: { id: true, fullName: true } },
  forwardedByUser: { select: { id: true, fullName: true } },
  issuedByUser: { select: { id: true, fullName: true } },
  recalledByUser: { select: { id: true, fullName: true } },
  trashedByUser: { select: { id: true, fullName: true } },
  assignedClerk: { select: { id: true, fullName: true } },
} as const;

// ─── Repository ───────────────────────────────────────────────────────────────

export class OutgoingDocumentsRepository {
  /**
   * Lấy danh sách văn bản đi với filter và phân trang.
   */
  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    urgency?: string;
    documentType?: string;
    dateFrom?: string;
    dateTo?: string;
    /** Accepts a code ('A'/'B'/'C'), seeded name, numeric id, or legacy enum value */
    confidentialityLevel?: string | number;
    departmentId?: number;
    includeTrashed?: boolean;
  }) {
    const { page, limit, search, status, urgency, documentType, dateFrom, dateTo, confidentialityLevel, departmentId, includeTrashed } = params;
    const skip = (page - 1) * limit;

    // Mặc định chỉ hiện văn bản ACTIVE (không ở thùng rác)
    const where: Prisma.OutgoingDocumentWhereInput = {
      document: {
        documentStatus: 'ACTIVE',
        ...(includeTrashed ? {} : { status: { not: 'TRASHED' as any } }),
      },
    };

    if (search) {
      where.OR = [
        { document: { title: { contains: search, mode: 'insensitive' } } },
        { document: { documentNumber: { contains: search, mode: 'insensitive' } } },
        { document: { ocrText: { contains: search, mode: 'insensitive' } } },
        { signerName: { contains: search, mode: 'insensitive' } },
        { recipientName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.document = {
        ...(where.document as object),
        status: status as any,
      };
    }

    if (urgency) {
      const urgencyId = await resolveUrgencyId(urgency);
      if (urgencyId === null) {
        (where.document as Record<string, unknown>).id = -1;
      } else {
        where.urgencyId = urgencyId;
      }
    }

    if (documentType) {
      where.documentType = documentType;
    }

    if (dateFrom || dateTo) {
      where.issuanceDate = {};
      if (dateFrom) where.issuanceDate.gte = new Date(dateFrom);
      if (dateTo) where.issuanceDate.lte = new Date(dateTo);
    }

    if (confidentialityLevel !== undefined && confidentialityLevel !== null && confidentialityLevel !== '') {
      const confidentialityId = await resolveConfidentialityId(confidentialityLevel);
      if (confidentialityId === null) {
        (where.document as Record<string, unknown>).id = -1;
      } else {
        where.document = {
          ...(where.document as object),
          confidentialityId,
        };
      }
    }

    if (departmentId) {
      where.document = {
        ...(where.document as object),
        departmentId: departmentId,
      };
    }

    const [items, total] = await Promise.all([
      prisma.outgoingDocument.findMany({
        where,
        skip,
        take: limit,
        orderBy: { document: { createdAt: 'desc' } },
        include: OUTGOING_INCLUDE,
      }),
      prisma.outgoingDocument.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Lấy danh sách văn bản đi trong thùng rác.
   */
  async findTrashed(params: { page: number; limit: number; search?: string }) {
    const { page, limit, search } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.OutgoingDocumentWhereInput = {
      document: { status: 'TRASHED' as any, documentStatus: 'ACTIVE' },
    };

    if (search) {
      where.document = {
        ...(where.document as object),
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { documentNumber: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [items, total] = await Promise.all([
      prisma.outgoingDocument.findMany({
        where,
        skip,
        take: limit,
        orderBy: { trashedAt: 'desc' },
        include: OUTGOING_INCLUDE,
      }),
      prisma.outgoingDocument.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Lấy chi tiết một văn bản đi theo outgoing ID.
   * Throw NotFoundError nếu không tìm thấy.
   */
  async findById(id: number): Promise<OutgoingDocumentWithRelations> {
    const outgoing = await prisma.outgoingDocument.findUnique({
      where: { id },
      include: OUTGOING_INCLUDE,
    });

    if (!outgoing) throw new NotFoundError('Không tìm thấy văn bản đi');
    return outgoing as unknown as OutgoingDocumentWithRelations;
  }

  /**
   * Lấy chi tiết một văn bản đi theo Document ID.
   */
  async findByDocumentId(documentId: number): Promise<OutgoingDocumentWithRelations> {
    const outgoing = await prisma.outgoingDocument.findUnique({
      where: { documentId },
      include: OUTGOING_INCLUDE,
    });

    if (!outgoing) throw new NotFoundError('Không tìm thấy văn bản đi');
    return outgoing as unknown as OutgoingDocumentWithRelations;
  }
}

export const outgoingDocumentsRepository = new OutgoingDocumentsRepository();
