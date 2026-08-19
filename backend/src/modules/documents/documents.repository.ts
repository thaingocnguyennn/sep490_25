import prisma from '../../config/database';
import { DocumentDirection, DocumentLifecycleStatus, Prisma } from '@prisma/client';
import { resolveConfidentialityId, resolveConfidentialityIdWithDefault } from '../../shared/utils/confidentiality';
import { resolveUrgencyIdWithDefault } from '../../shared/utils/urgency';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/** Query parameters for filtering & paginating the document list */
export interface DocumentListParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: DocumentDirection;
  status?: DocumentLifecycleStatus;
  /** Accepts a seeded name (THUONG/KHAN/THUONG_KHAN/HOA_TOC), legacy alias, or numeric id */
  urgencyId?: number | string;
  /** Accepts a code ('A'/'B'/'C'), seeded name ('THUONG', 'MAT', ...), or numeric id */
  confidentialityId?: number | string;
  departmentId?: number;
  /** Filter documents where the given user is any processor (XLC/PHXL/XDB) */
  processorId?: number;
  dateFrom?: string; // ISO date string
  dateTo?: string;   // ISO date string
  isArchived?: boolean; // Filter by archive status
}

/** Paginated result returned by findAll() */
export interface DocumentListResult {
  documents: DocumentSummary[];
  total: number;
  page: number;
  limit: number;
}

/** Confidentiality classification attached to a document (or null when unset) */
export interface DocumentConfidentiality {
  id: number;
  code: string | null;
  name: string;
  description: string | null;
}

/** Urgency level attached to a document (or null when unset) */
export interface DocumentUrgency {
  id: number;
  name: string;
  description: string | null;
}

/** Lightweight document for list views */
export interface DocumentSummary {
  id: number;
  documentNumber: string;
  title: string;
  type: DocumentDirection;
  status: string;               // Workflow status: DRAFT, PENDING, IN_PROGRESS, COMPLETED, REJECTED, CANCELLED
  documentStatus: DocumentLifecycleStatus;  // Lifecycle: ACTIVE or DELETED (soft-delete)
  urgencyId: number | null;
  urgency: DocumentUrgency | null;
  confidentialityId: number | null;
  confidentiality: DocumentConfidentiality | null;
  issuer: string | null;
  signerName: string | null;
  signerTitle: string | null;
  notes: string | null;
  dateOnLetter: string | null;
  originalFileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUser: { id: number; fullName: string } | null;
  department: { id: number; name: string } | null;
  isArchived: boolean;
}

/** Full document details including description, file URL, etc. */
export interface DocumentDetail extends DocumentSummary {
  description: string | null;
  fileUrl: string | null;
  categoryId: number | null;
  category: { id: number; name: string; code: string } | null;
  documentTypeId: number | null;
  documentTypeRef: { id: number; name: string; code: string } | null;
  updatedByUser: { id: number; fullName: string } | null;
}

// ─── Shared select/include helpers ───────────────────────────────────────────

const summaryInclude = {
  createdByUser: { select: { id: true, fullName: true } },
  department: { select: { id: true, name: true } },
  confidentiality: { select: { id: true, code: true, name: true, description: true } },
  urgency: { select: { id: true, name: true, description: true } },
  documentTypeRef: { select: { id: true, name: true, code: true } },
  category: { select: { id: true, name: true, code: true } },
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

    // Default: show only non-archived documents unless explicitly filtering
    where.isArchived = params.isArchived !== undefined ? params.isArchived : false;

    // Double-check protection: if fetching archived documents, strictly enforce valid statuses
    if (where.isArchived === true) {
      where.status = {
        in: ['COMPLETED', 'ISSUED', 'APPROVED'],
      };
    }

    if (params.type) {
      where.type = params.type;
    }
    if (params.urgencyId !== undefined && params.urgencyId !== null && params.urgencyId !== '') {
      const urgencyId = await resolveUrgencyIdWithDefault(params.urgencyId);
      where.urgencyId = urgencyId;
    }
    if (params.confidentialityId !== undefined && params.confidentialityId !== null && params.confidentialityId !== '') {
      const confidentialityId = await resolveConfidentialityId(params.confidentialityId);
      if (confidentialityId === null) {
        // Filter references an unknown code/name → return no rows.
        where.id = -1;
      } else {
        where.confidentialityId = confidentialityId;
      }
    }
    if (params.departmentId) {
      where.departmentId = params.departmentId;
    }
    if (params.processorId) {
      // Filter by users assigned as a processor (any role) via DocumentProcessor table.
      where.processors = { some: { userId: params.processorId } };
    }

    // Date range filter on dateOnLetter
    if (params.dateFrom || params.dateTo) {
      where.dateOnLetter = {};
      if (params.dateFrom) {
        where.dateOnLetter.gte = new Date(params.dateFrom);
      }
      if (params.dateTo) {
        where.dateOnLetter.lte = new Date(params.dateTo);
      }
    }

    // Full-text search across documentNumber, title, description, issuer, signerName
    if (params.search) {
      where.OR = [
        { documentNumber: { contains: params.search, mode: 'insensitive' } },
        { title: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
        { issuer: { contains: params.search, mode: 'insensitive' } },
        { signerName: { contains: params.search, mode: 'insensitive' } },
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
    type: DocumentDirection;
    fileUrl?: string;
    dateOnLetter?: Date;
    issuer?: string;
    signerName?: string;
    signerTitle?: string;
    notes?: string;
    /** Accepts a seeded name (THUONG/KHAN/THUONG_KHAN/HOA_TOC), legacy alias, or numeric id */
    urgencyId?: number | string;
    /** Accepts a code ('A'/'B'/'C'), seeded name, or numeric id */
    confidentialityId?: number | string;
    categoryId?: number;
    documentTypeId?: number;
    originalFileName?: string;
    fileSize?: number;
    mimeType?: string;
    departmentId?: number;
    createdBy: number;
  }): Promise<DocumentDetail> {
    const confidentialityId = data.confidentialityId !== undefined && data.confidentialityId !== null && data.confidentialityId !== ''
      ? await resolveConfidentialityIdWithDefault(data.confidentialityId)
      : await resolveConfidentialityIdWithDefault(null);

    const urgencyId = await resolveUrgencyIdWithDefault(data.urgencyId);

    const doc = await prisma.document.create({
      data: {
        documentNumber: data.documentNumber,
        title: data.title,
        description: data.description,
        type: data.type,
        fileUrl: data.fileUrl,
        dateOnLetter: data.dateOnLetter,
        issuer: data.issuer,
        signerName: data.signerName,
        signerTitle: data.signerTitle,
        notes: data.notes,
        urgencyId,
        confidentialityId,
        categoryId: data.categoryId,
        documentTypeId: data.documentTypeId,
        originalFileName: data.originalFileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        departmentId: data.departmentId,
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
      type?: DocumentDirection;
      dateOnLetter?: Date | null;
      issuer?: string | null;
      signerName?: string | null;
      signerTitle?: string | null;
      notes?: string | null;
      /** Accepts a seeded name, legacy alias, numeric id, or null to clear */
      urgencyId?: number | string | null;
      /** Accepts a code ('A'/'B'/'C'), seeded name, numeric id, or null to clear */
      confidentialityId?: number | string | null;
      categoryId?: number | null;
      documentTypeId?: number | null;
      departmentId?: number | null;
      updatedBy: number;
    }
  ): Promise<DocumentDetail> {
    const { updatedBy, confidentialityId, urgencyId, ...rest } = data;
    const updateData: Record<string, unknown> = { ...rest, updatedBy };
    if (confidentialityId !== undefined) {
      updateData.confidentialityId =
        confidentialityId === null
          ? null
          : await resolveConfidentialityIdWithDefault(confidentialityId);
    }
    if (urgencyId !== undefined) {
      updateData.urgencyId =
        urgencyId === null
          ? null
          : await resolveUrgencyIdWithDefault(urgencyId);
    }
    const doc = await prisma.document.update({
      where: { id },
      data: updateData,
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

  /** Restore a soft-deleted document by setting its status back to ACTIVE */
  async restore(id: number, updatedBy: number): Promise<void> {
    await prisma.document.update({
      where: { id },
      data: {
        documentStatus: 'ACTIVE',
        updatedBy,
      },
    });
  }

  /** Hard-delete a document permanently */
  async hardDelete(id: number): Promise<void> {
    await prisma.document.delete({
      where: { id },
    });
  }

  /** Get basic stats for dashboard */
  async getStats(): Promise<{ total: number; incoming: number; outgoing: number }> {
    const [total, incoming, outgoing] = await Promise.all([
      prisma.document.count({ where: { documentStatus: { not: 'DELETED' } } }),
      prisma.document.count({ where: { type: 'INCOMING', documentStatus: { not: 'DELETED' } } }),
      prisma.document.count({ where: { type: 'OUTGOING', documentStatus: { not: 'DELETED' } } }),
    ]);
    return { total, incoming, outgoing };
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
    if (params.urgencyId !== undefined && params.urgencyId !== null && params.urgencyId !== '') {
      const urgencyId = await resolveUrgencyIdWithDefault(params.urgencyId);
      where.urgencyId = urgencyId;
    }
    if (params.confidentialityId !== undefined && params.confidentialityId !== null && params.confidentialityId !== '') {
      const confidentialityId = await resolveConfidentialityId(params.confidentialityId);
      if (confidentialityId === null) {
        where.id = -1;
      } else {
        where.confidentialityId = confidentialityId;
      }
    }
    if (params.departmentId) where.departmentId = params.departmentId;
    if (params.processorId) {
      where.processors = { some: { userId: params.processorId } };
    }

    if (params.dateFrom || params.dateTo) {
      where.dateOnLetter = {};
      if (params.dateFrom) where.dateOnLetter.gte = new Date(params.dateFrom);
      if (params.dateTo) where.dateOnLetter.lte = new Date(params.dateTo);
    }

    if (params.search) {
      where.OR = [
        { documentNumber: { contains: params.search, mode: 'insensitive' } },
        { title: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
        { issuer: { contains: params.search, mode: 'insensitive' } },
        { signerName: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const documents = await prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: summaryInclude,
    });

    return documents.map(this.formatSummary);
  }

  /**
   * Generate a unique document number based on type. Uses a generation retry
   * loop to absorb concurrent inserts (Postgres serial/unique collision).
   */
  async generateDocumentNumber(type: string): Promise<string> {
    const prefix = type === 'INCOMING' ? 'IN' : type === 'OUTGOING' ? 'OUT' : 'INT';
    const year = new Date().getFullYear();

    for (let attempt = 0; attempt < 8; attempt++) {
      const count = await prisma.document.count({
        where: {
          documentNumber: { startsWith: `${prefix}-${year}` },
        },
      });
      const seq = String(count + attempt + 1).padStart(4, '0');
      const candidate = `${prefix}-${year}-${seq}`;

      const exists = await prisma.document.count({
        where: { documentNumber: candidate },
      });
      if (exists === 0) {
        return candidate;
      }
    }
    // Fallback: append a millisecond timestamp to guarantee uniqueness
    return `${prefix}-${year}-${Date.now()}`;
  }

  // ─── Private formatters ──────────────────────────────────────────────────

  private formatSummary(doc: {
    id: number;
    documentNumber: string;
    title: string;
    type: DocumentDirection;
    documentStatus: DocumentLifecycleStatus;
    urgencyId: number | null;
    urgency: DocumentUrgency | null;
    confidentialityId: number | null;
    confidentiality: DocumentConfidentiality | null;
    issuer: string | null;
    signerName: string | null;
    signerTitle: string | null;
    notes: string | null;
    dateOnLetter: Date | null;
    originalFileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    isArchived: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdByUser: { id: number; fullName: string } | null;
    department: { id: number; name: string } | null;
  }): DocumentSummary {
    return {
      id: doc.id,
      documentNumber: doc.documentNumber,
      title: doc.title,
      type: doc.type,
      status: (doc as any).status ?? 'DRAFT',  // Workflow status from Document model
      documentStatus: doc.documentStatus,
      urgencyId: doc.urgencyId,
      urgency: doc.urgency,
      confidentialityId: doc.confidentialityId,
      confidentiality: doc.confidentiality,
      issuer: doc.issuer,
      signerName: doc.signerName,
      signerTitle: doc.signerTitle,
      notes: doc.notes,
      dateOnLetter: doc.dateOnLetter?.toISOString() ?? null,
      originalFileName: doc.originalFileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      createdByUser: doc.createdByUser,
      department: doc.department,
      isArchived: doc.isArchived,
    };
  }

  private formatDetail(doc: {
    id: number;
    documentNumber: string;
    title: string;
    description: string | null;
    type: DocumentDirection;
    fileUrl: string | null;
    documentStatus: DocumentLifecycleStatus;
    urgencyId: number | null;
    urgency: DocumentUrgency | null;
    confidentialityId: number | null;
    confidentiality: DocumentConfidentiality | null;
    issuer: string | null;
    signerName: string | null;
    signerTitle: string | null;
    notes: string | null;
    dateOnLetter: Date | null;
    categoryId: number | null;
    category: { id: number; name: string; code: string } | null;
    documentTypeId: number | null;
    documentTypeRef: { id: number; name: string; code: string } | null;
    originalFileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    isArchived: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdByUser: { id: number; fullName: string } | null;
    updatedByUser: { id: number; fullName: string } | null;
    department: { id: number; name: string } | null;
  }): DocumentDetail {
    return {
      ...this.formatSummary(doc),
      description: doc.description,
      fileUrl: doc.fileUrl,
      categoryId: doc.categoryId,
      category: doc.category,
      documentTypeId: doc.documentTypeId,
      documentTypeRef: doc.documentTypeRef,
      updatedByUser: doc.updatedByUser,
    };
  }
}

export const documentsRepository = new DocumentsRepository();
