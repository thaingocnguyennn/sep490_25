import prisma from '../../config/database';
import { DocumentType, DocumentLifecycleStatus, Priority, ConfidentialityLevel, Prisma } from '@prisma/client';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/** Query parameters for filtering & paginating the document list */
export interface DocumentListParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: DocumentType;
  status?: DocumentLifecycleStatus;
  urgencyLevel?: Priority;
  confidentialityLevel?: ConfidentialityLevel;
  departmentId?: number;
  processorId?: number;
  dateFrom?: string; // ISO date string
  dateTo?: string;   // ISO date string
}

/** Paginated result returned by findAll() */
export interface DocumentListResult {
  documents: DocumentSummary[];
  total: number;
  page: number;
  limit: number;
}

/** Lightweight document for list views */
export interface DocumentSummary {
  id: number;
  documentNumber: string;
  title: string;
  type: DocumentType;
  status: string;               // Workflow status: DRAFT, PENDING, IN_PROGRESS, COMPLETED, REJECTED, CANCELLED
  documentStatus: DocumentLifecycleStatus;  // Lifecycle: ACTIVE or DELETED (soft-delete)
  urgencyLevel: Priority;
  confidentialityLevel: ConfidentialityLevel;
  sendingAgency: string | null;
  issuanceDate: string | null;
  originalFileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUser: { id: number; fullName: string } | null;
  department: { id: number; name: string } | null;
  processor: { id: number; fullName: string } | null;
}

/** Full document details including description, file URL, etc. */
export interface DocumentDetail extends DocumentSummary {
  description: string | null;
  fileUrl: string | null;
  category: string | null;
  updatedByUser: { id: number; fullName: string } | null;
}

// ─── Shared select/include helpers ───────────────────────────────────────────

const summaryInclude = {
  createdByUser: { select: { id: true, fullName: true } },
  department: { select: { id: true, name: true } },
  processor: { select: { id: true, fullName: true } },
};

const detailInclude = {
  ...summaryInclude,
  updatedByUser: { select: { id: true, fullName: true } },
};

// ─── Repository ──────────────────────────────────────────────────────────────

export class DocumentsRepository {
  /**
   * Fetch a paginated & filtered list of documents.
   * By default, only ACTIVE documents are returned (soft-deleted ones are hidden).
   */
  async findAll(params: DocumentListParams): Promise<DocumentListResult> {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.DocumentWhereInput = {};

    // Default: show only ACTIVE documents unless explicitly filtering
    where.documentStatus = params.status || 'ACTIVE';

    if (params.type) {
      where.type = params.type;
    }
    if (params.urgencyLevel) {
      where.urgencyLevel = params.urgencyLevel;
    }
    if (params.confidentialityLevel) {
      where.confidentialityLevel = params.confidentialityLevel;
    }
    if (params.departmentId) {
      where.departmentId = params.departmentId;
    }
    if (params.processorId) {
      where.processorId = params.processorId;
    }

    // Date range filter on issuanceDate
    if (params.dateFrom || params.dateTo) {
      where.issuanceDate = {};
      if (params.dateFrom) {
        where.issuanceDate.gte = new Date(params.dateFrom);
      }
      if (params.dateTo) {
        where.issuanceDate.lte = new Date(params.dateTo);
      }
    }

    // Full-text search across documentNumber, title, description, sendingAgency
    if (params.search) {
      where.OR = [
        { documentNumber: { contains: params.search, mode: 'insensitive' } },
        { title: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
        { sendingAgency: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: summaryInclude,
      }),
      prisma.document.count({ where }),
    ]);

    return {
      documents: documents.map(this.formatSummary),
      total,
      page,
      limit,
    };
  }

  /** Fetch a single document by ID (including full details) */
  async findById(id: number): Promise<DocumentDetail | null> {
    const doc = await prisma.document.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!doc) return null;
    return this.formatDetail(doc);
  }

  /** Create a new document record */
  async create(data: {
    documentNumber: string;
    title: string;
    description?: string;
    type: DocumentType;
    fileUrl?: string;
    issuanceDate?: Date;
    sendingAgency?: string;
    urgencyLevel?: Priority;
    confidentialityLevel?: ConfidentialityLevel;
    category?: string;
    originalFileName?: string;
    fileSize?: number;
    mimeType?: string;
    departmentId?: number;
    processorId?: number;
    createdBy: number;
  }): Promise<DocumentDetail> {
    const doc = await prisma.document.create({
      data: {
        documentNumber: data.documentNumber,
        title: data.title,
        description: data.description,
        type: data.type,
        fileUrl: data.fileUrl,
        issuanceDate: data.issuanceDate,
        sendingAgency: data.sendingAgency,
        urgencyLevel: data.urgencyLevel || 'NORMAL',
        confidentialityLevel: data.confidentialityLevel || 'NORMAL',
        category: data.category,
        originalFileName: data.originalFileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        departmentId: data.departmentId,
        processorId: data.processorId,
        createdBy: data.createdBy,
      },
      include: detailInclude,
    });
    return this.formatDetail(doc);
  }

  /** Update document metadata (does not change the physical file) */
  async update(
    id: number,
    data: {
      documentNumber?: string;
      title?: string;
      description?: string;
      type?: DocumentType;
      issuanceDate?: Date | null;
      sendingAgency?: string;
      urgencyLevel?: Priority;
      confidentialityLevel?: ConfidentialityLevel;
      category?: string;
      departmentId?: number | null;
      processorId?: number | null;
      updatedBy: number;
    }
  ): Promise<DocumentDetail> {
    const { updatedBy, ...updateFields } = data;
    const doc = await prisma.document.update({
      where: { id },
      data: {
        ...updateFields,
        updatedBy,
      },
      include: detailInclude,
    });
    return this.formatDetail(doc);
  }

  /** Soft-delete a document by setting its status to DELETED */
  async softDelete(id: number, updatedBy: number): Promise<void> {
    await prisma.document.update({
      where: { id },
      data: {
        documentStatus: 'DELETED',
        updatedBy,
      },
    });
  }

  /** Check if a document number already exists */
  async existsByDocumentNumber(documentNumber: string): Promise<boolean> {
    const count = await prisma.document.count({ where: { documentNumber } });
    return count > 0;
  }

  /**
   * Fetch all documents matching the given filters (no pagination).
   * Used for export to Excel/PDF.
   */
  async findForExport(params: DocumentListParams): Promise<DocumentSummary[]> {
    const where: Prisma.DocumentWhereInput = {};

    where.documentStatus = params.status || 'ACTIVE';

    if (params.type) where.type = params.type;
    if (params.urgencyLevel) where.urgencyLevel = params.urgencyLevel;
    if (params.confidentialityLevel) where.confidentialityLevel = params.confidentialityLevel;
    if (params.departmentId) where.departmentId = params.departmentId;
    if (params.processorId) where.processorId = params.processorId;

    if (params.dateFrom || params.dateTo) {
      where.issuanceDate = {};
      if (params.dateFrom) where.issuanceDate.gte = new Date(params.dateFrom);
      if (params.dateTo) where.issuanceDate.lte = new Date(params.dateTo);
    }

    if (params.search) {
      where.OR = [
        { documentNumber: { contains: params.search, mode: 'insensitive' } },
        { title: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
        { sendingAgency: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const documents = await prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: summaryInclude,
    });

    return documents.map(this.formatSummary);
  }

  /** Generate a unique document number based on type */
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

  // ─── Private formatters ──────────────────────────────────────────────────

  private formatSummary(doc: {
    id: number;
    documentNumber: string;
    title: string;
    type: DocumentType;
    documentStatus: DocumentLifecycleStatus;
    urgencyLevel: Priority;
    confidentialityLevel: ConfidentialityLevel;
    sendingAgency: string | null;
    issuanceDate: Date | null;
    originalFileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdByUser: { id: number; fullName: string } | null;
    department: { id: number; name: string } | null;
    processor: { id: number; fullName: string } | null;
  }): DocumentSummary {
    return {
      id: doc.id,
      documentNumber: doc.documentNumber,
      title: doc.title,
      type: doc.type,
      status: (doc as any).status ?? 'DRAFT',  // Workflow status from Document model
      documentStatus: doc.documentStatus,
      urgencyLevel: doc.urgencyLevel,
      confidentialityLevel: doc.confidentialityLevel,
      sendingAgency: doc.sendingAgency,
      issuanceDate: doc.issuanceDate?.toISOString() ?? null,
      originalFileName: doc.originalFileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      createdByUser: doc.createdByUser,
      department: doc.department,
      processor: doc.processor,
    };
  }

  private formatDetail(doc: {
    id: number;
    documentNumber: string;
    title: string;
    description: string | null;
    type: DocumentType;
    fileUrl: string | null;
    documentStatus: DocumentLifecycleStatus;
    urgencyLevel: Priority;
    confidentialityLevel: ConfidentialityLevel;
    sendingAgency: string | null;
    issuanceDate: Date | null;
    category: string | null;
    originalFileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdByUser: { id: number; fullName: string } | null;
    updatedByUser: { id: number; fullName: string } | null;
    department: { id: number; name: string } | null;
    processor: { id: number; fullName: string } | null;
  }): DocumentDetail {
    return {
      ...this.formatSummary(doc),
      description: doc.description,
      fileUrl: doc.fileUrl,
      category: doc.category,
      updatedByUser: doc.updatedByUser,
    };
  }
}

export const documentsRepository = new DocumentsRepository();
