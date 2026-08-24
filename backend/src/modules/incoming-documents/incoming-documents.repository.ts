import { default as prisma } from '../../config/database';
import { NotFoundError } from '../../shared/exceptions/app-error';
import { Prisma, DocumentStatus, WorkflowStatus } from '@prisma/client';
import { resolveUrgencyId } from '../../shared/utils/urgency';
import {
  resolveViewerStatus,
  type ViewerStatus,
  type ViewerStatusDocument,
} from '../../shared/access/viewer-status';

/**
 * Augment the underlying Prisma Document with the per-actor `viewerStatus`
 * field used by the frontend to render the status badge.
 */
type DocumentWithViewerStatus = ViewerStatusDocument & { viewerStatus?: ViewerStatus };

/**
 * Row shape returned by the list endpoints. The frontend only needs the
 * fields we project below; the full `IncomingDocumentWithRelations` shape is
 * reserved for `findById`.
 */
type IncomingDocumentListRow = {
  id: number;
  documentId: number;
  arrivalNumber: number | null;
  dateReceived: Date;
  pageCount: number | null;
  processingInstructions: string | null;
  documentBookId: number | null;
  documentBook?: {
    id: number;
    name: string;
    code: string | null;
  } | null;
  document: DocumentWithViewerStatus;
};

export interface IncomingDocumentWithRelations {
  id: number;
  documentId: number;
  arrivalNumber: number | null;
  dateReceived: Date;
  receivedDate: Date;
  pageCount: number | null;
  processingInstructions: string | null;
  documentBookId: number | null;
  documentBook: {
    id: number;
    name: string;
    code: string | null;
  } | null;
  document: {
    id: number;
    documentNumber: string;
    subject: string;
    type: string;
    fileUrl: string | null;
    status: string;
    urgencyId: number | null;
    urgency: {
      id: number;
      name: string;
      description: string | null;
    } | null;
    confidentialityId: number | null;
    confidentiality: {
      id: number;
      code: string | null;
      name: string;
      description: string | null;
    } | null;
    ocrText: string | null;
    documentTypeId: number | null;
    documentTypeRef: { id: number; name: string } | null;
    issuer: string | null;
    signerName: string | null;
    signerTitle: string | null;
    issuedDate: Date | null;
    categoryId: number | null;
    category: { id: number; name: string } | null;
    createdAt: Date;
    updatedAt: Date;
    createdByUser: { id: number; fullName: string } | null;
    createdBy?: number;
    updatedByUser: { id: number; fullName: string } | null;
    processors: {
      id: number;
      processorType: string;
      completedAt: Date | null;
      notes: string | null;
      user: { id: number; fullName: string; email: string };
    }[];
    attachments: {
      id: number;
      fileName: string;
      fileUrl: string;
      fileSize: number | null;
      mimeType: string | null;
    }[];
    workflows: {
      id: number;
      status: string;
      notes: string | null;
      completedAt: Date | null;
      workflowStep: { id: number; name: string; stepOrder: number; roleName: string | null };
      user: { id: number; fullName: string } | null;
    }[];
    /** Per-actor status. Populated when the caller supplied `viewerFor`,
     *  otherwise undefined. The frontend falls back to `status` in that case. */
    viewerStatus?: ViewerStatus;
  };
}

export class IncomingDocumentsRepository {
  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    documentTypeId?: number;
    /** Seeded name (THUONG/KHAN/THUONG_KHAN/HOA_TOC), legacy alias, or numeric id */
    urgency?: string;
    /** Filter by documentId for users with XLC/PHXL/XDB assignments */
    assignedToUserId?: number;
    /** Restrict to documents where the user has at least one XLC/PHXL/XDB processor record */
    assignedProcessorTypes?: string[];
    /** When supplied, each returned item is decorated with `viewerStatus`
     *  computed for this caller. Omit for callers that should see the raw
     *  global document status (e.g. internal service-layer callers). */
    viewerFor?: { userId: number; userRoles: string[] };
  }): Promise<{ items: IncomingDocumentListRow[]; total: number }> {
    const { page, limit, search, status, documentTypeId, urgency, assignedToUserId, assignedProcessorTypes, viewerFor } = params;
    const skip = (page - 1) * limit;

    const documentWhere: Prisma.DocumentWhereInput = {};
    const where: Prisma.IncomingDocumentWhereInput = {};
    if (search) {
      documentWhere.OR = [
        { documentNumber: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { issuer: { contains: search, mode: 'insensitive' } },
        { signerName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) documentWhere.status = status as any;
    if (documentTypeId !== undefined) {
      documentWhere.documentTypeId = documentTypeId;
    }
    if (urgency) {
      const urgencyId = await resolveUrgencyId(urgency);
      if (urgencyId === null) {
        documentWhere.id = -1;
      } else {
        documentWhere.urgencyId = urgencyId;
      }
    }

    if (assignedToUserId !== undefined && assignedProcessorTypes && assignedProcessorTypes.length > 0) {
      documentWhere.processors = {
        some: {
          userId: assignedToUserId,
          processorType: { in: assignedProcessorTypes as any },
        },
      };
    }

    if (Object.keys(documentWhere).length > 0) {
      where.document = documentWhere;
    }

    const [items, total] = await Promise.all([
      prisma.incomingDocument.findMany({
        where,
        skip,
        take: limit,
        orderBy: { document: { createdAt: 'desc' } },
        include: {
          document: {
            include: {
              createdByUser: { select: { id: true, fullName: true } },
              urgency: { select: { id: true, name: true, description: true } },
              confidentiality: { select: { id: true, code: true, name: true, description: true } },
              documentTypeRef: { select: { id: true, name: true } },
              category: { select: { id: true, name: true } },
              processors: {
                select: { id: true, processorType: true, completedAt: true, notes: true, user: { select: { id: true, fullName: true, email: true } } },
              },
              workflows: {
                include: {
                  workflowStep: { select: { id: true, name: true, stepOrder: true, roleName: true } },
                  user: { select: { id: true, fullName: true } },
                },
                orderBy: { workflowStep: { stepOrder: 'asc' } },
              },
              attachments: true,
            },
          },
        },
      }),
      prisma.incomingDocument.count({ where }),
    ]);

    if (viewerFor) {
      const decorated = items.map((item) => {
        const docWithStatus = {
          ...item.document,
          viewerStatus: resolveViewerStatus(
            item.document as unknown as ViewerStatusDocument,
            viewerFor.userId,
            viewerFor.userRoles
          ),
        } as unknown as DocumentWithViewerStatus;
        return {
          ...item,
          document: docWithStatus,
        };
      }) as unknown as IncomingDocumentListRow[];
      return { items: decorated, total };
    }

    return { items: items as unknown as IncomingDocumentListRow[], total };
  }

  async findById(
    id: number,
    viewerFor?: { userId: number; userRoles: string[] }
  ): Promise<IncomingDocumentWithRelations> {
    const incoming = await prisma.incomingDocument.findUnique({
      where: { id },
      include: {
        documentBook: { select: { id: true, name: true, code: true } },
        document: {
          include: {
            createdByUser: { select: { id: true, fullName: true } },
            updatedByUser: { select: { id: true, fullName: true } },
            urgency: { select: { id: true, name: true, description: true } },
            confidentiality: { select: { id: true, code: true, name: true, description: true } },
            documentTypeRef: { select: { id: true, name: true } },
            category: { select: { id: true, name: true } },
            processors: {
              select: { id: true, processorType: true, completedAt: true, notes: true, user: { select: { id: true, fullName: true, email: true } } },
            },
            workflows: {
              include: {
                workflowStep: { select: { id: true, name: true, stepOrder: true, roleName: true } },
                user: { select: { id: true, fullName: true } },
              },
              orderBy: { workflowStep: { stepOrder: 'asc' } },
            },
            attachments: true,
          },
        },
      },
    });
    if (!incoming) throw new NotFoundError('Không tìm thấy văn bản đến');

    const incomingWithStatus = incoming as unknown as IncomingDocumentWithRelations;
    if (viewerFor) {
      (incomingWithStatus.document as DocumentWithViewerStatus).viewerStatus =
        resolveViewerStatus(
          incomingWithStatus.document as unknown as ViewerStatusDocument,
          viewerFor.userId,
          viewerFor.userRoles
        );
    }
    return incomingWithStatus;
  }

  async findAllPendingForHead(
    params: { page: number; limit: number; search?: string; viewerFor?: { userId: number; userRoles: string[] } }
  ): Promise<{ items: IncomingDocumentListRow[]; total: number }> {
    const { page, limit, search, viewerFor } = params;
    const skip = (page - 1) * limit;

    const documentWhere: Prisma.DocumentWhereInput = {
      status: DocumentStatus.PENDING,
      workflows: {
        some: {
          status: WorkflowStatus.PENDING,
          workflowStep: { stepOrder: 2, roleName: 'DEPARTMENT_HEAD' },
        },
      },
    };

    if (search) {
      documentWhere.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { documentNumber: { contains: search, mode: 'insensitive' } },
        { issuer: { contains: search, mode: 'insensitive' } },
        { signerName: { contains: search, mode: 'insensitive' } },
        { documentTypeRef: { is: { name: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const where: Prisma.IncomingDocumentWhereInput = { document: documentWhere };

    const [items, total] = await Promise.all([
      prisma.incomingDocument.findMany({
        where,
        skip,
        take: limit,
        orderBy: { document: { createdAt: 'desc' } },
        include: {
          document: {
            include: {
              createdByUser: { select: { id: true, fullName: true } },
              urgency: { select: { id: true, name: true, description: true } },
              confidentiality: { select: { id: true, code: true, name: true, description: true } },
              documentTypeRef: { select: { id: true, name: true } },
              processors: {
                select: { id: true, processorType: true, completedAt: true, notes: true, user: { select: { id: true, fullName: true, email: true } } },
              },
              workflows: {
                include: {
                  workflowStep: { select: { id: true, name: true, stepOrder: true, roleName: true } },
                  user: { select: { id: true, fullName: true } },
                },
                orderBy: { workflowStep: { stepOrder: 'asc' } },
              },
              attachments: true,
            },
          },
        },
      }),
      prisma.incomingDocument.count({ where }),
    ]);

    if (viewerFor) {
      const decorated = items.map((item) => {
        const docWithStatus = {
          ...item.document,
          viewerStatus: resolveViewerStatus(
            item.document as unknown as ViewerStatusDocument,
            viewerFor.userId,
            viewerFor.userRoles
          ),
        } as unknown as DocumentWithViewerStatus;
        return {
          ...item,
          document: docWithStatus,
        };
      }) as unknown as IncomingDocumentListRow[];
      return { items: decorated, total };
    }

    return { items: items as unknown as IncomingDocumentListRow[], total };
  }

  async findAllPendingForSpecialist(params: {
    page: number;
    limit: number;
    search?: string;
    userId: number;
    viewerFor?: { userId: number; userRoles: string[] };
  }): Promise<{ items: IncomingDocumentListRow[]; total: number }> {
    const { page, limit, search, userId, viewerFor } = params;
    const skip = (page - 1) * limit;

    const documentWhere: Prisma.DocumentWhereInput = {
      status: DocumentStatus.IN_PROGRESS,
      processors: {
        some: {
          userId,
          processorType: 'XLC',
        },
      },
    };

    if (search) {
      documentWhere.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { documentNumber: { contains: search, mode: 'insensitive' } },
        { issuer: { contains: search, mode: 'insensitive' } },
        { signerName: { contains: search, mode: 'insensitive' } },
        { documentTypeRef: { is: { name: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const where: Prisma.IncomingDocumentWhereInput = { document: documentWhere };

    const [items, total] = await Promise.all([
      prisma.incomingDocument.findMany({
        where,
        skip,
        take: limit,
        orderBy: { document: { createdAt: 'desc' } },
        include: {
          document: {
            include: {
              createdByUser: { select: { id: true, fullName: true } },
              urgency: { select: { id: true, name: true, description: true } },
              confidentiality: { select: { id: true, code: true, name: true, description: true } },
              documentTypeRef: { select: { id: true, name: true } },
              processors: {
                select: { id: true, processorType: true, completedAt: true, notes: true, user: { select: { id: true, fullName: true, email: true } } },
              },
              workflows: {
                include: {
                  workflowStep: { select: { id: true, name: true, stepOrder: true, roleName: true } },
                  user: { select: { id: true, fullName: true } },
                },
                orderBy: { workflowStep: { stepOrder: 'asc' } },
              },
              attachments: true,
            },
          },
        },
      }),
      prisma.incomingDocument.count({ where }),
    ]);

    if (viewerFor) {
      const decorated = items.map((item) => {
        const docWithStatus = {
          ...item.document,
          viewerStatus: resolveViewerStatus(
            item.document as unknown as ViewerStatusDocument,
            viewerFor.userId,
            viewerFor.userRoles
          ),
        } as unknown as DocumentWithViewerStatus;
        return {
          ...item,
          document: docWithStatus,
        };
      }) as unknown as IncomingDocumentListRow[];
      return { items: decorated, total };
    }

    return { items: items as unknown as IncomingDocumentListRow[], total };
  }
}

export const incomingDocumentsRepository = new IncomingDocumentsRepository();