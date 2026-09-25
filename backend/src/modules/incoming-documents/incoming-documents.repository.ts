import { default as prisma } from '../../config/database';
import { NotFoundError } from '../../shared/exceptions/app-error';
import { Prisma, DocumentStatus } from '@prisma/client';
import { resolveUrgencyId } from '../../shared/utils/urgency';
import {
  resolveViewerStatus,
  type ViewerStatus,
  type ViewerStatusDocument,
  type ViewerParticipation,
} from '../../shared/access/viewer-status';

/**
 * Per-actor participation row shape after Prisma projection. The resolver
 * only reads these fields.
 */
type ParticipationProjection = ViewerParticipation;

/**
 * Augment the underlying Prisma Document with the per-actor `viewerStatus`
 * field used by the frontend to render the status badge.
 */
type DocumentWithViewerStatus = ViewerStatusDocument & {
  viewerStatus?: ViewerStatus;
  /** Viewer-scoped participations (only for the prism-augmented document). */
  participations?: ParticipationProjection[];
};

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
    /** Per-actor participations (only populated for the viewer). */
    participations?: ParticipationProjection[];
  };
}

/**
 * Prisma include shape used by both list and detail queries.
 */
const documentInclude = {
  createdByUser: { select: { id: true, fullName: true } },
  updatedByUser: { select: { id: true, fullName: true } },
  urgency: { select: { id: true, name: true, description: true } },
  confidentiality: { select: { id: true, code: true, name: true, description: true } },
  documentTypeRef: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  processors: {
    select: {
      id: true,
      processorType: true,
      completedAt: true,
      notes: true,
      user: { select: { id: true, fullName: true, email: true } },
    },
  },
  workflows: {
    include: {
      workflowStep: { select: { id: true, name: true, stepOrder: true, roleName: true } },
      user: { select: { id: true, fullName: true } },
    },
    orderBy: { workflowStep: { stepOrder: 'asc' } },
  },
  attachments: true,
} as const;

export class IncomingDocumentsRepository {
  /**
   * Build the where clause that filters documents by the caller's viewer
   * status. Each viewer status corresponds to a specific participation-row
   * shape, which we encode as a Prisma filter against `participations`.
   *
   * Mapping (matches `mapParticipationStatus`):
   *   DRAFT       → Document.status = DRAFT  AND  user has CLERK participation
   *   PENDING     → at least one participation status='PENDING' AND viewedAt IS NULL
   *   IN_PROGRESS → at least one participation status='IN_PROGRESS'
   *                  OR (status='PENDING' AND viewedAt IS NOT NULL)
   *   COMPLETED   → at least one participation status='COMPLETED'
   *                  (for clerks this also implies the clerk step is done;
   *                   Document.status will usually be a non-PENDING value)
   *   RETURNED    → at least one participation status in ('RETURNED','REJECTED','CANCELLED')
   *   REJECTED    → Document.status = REJECTED  (terminal global state)
   */
  private buildViewerStatusWhere(
    userId: number,
    status: ViewerStatus
  ): Prisma.DocumentWhereInput {
    switch (status) {
      case 'DRAFT':
        return {
          status: DocumentStatus.DRAFT,
          participations: {
            some: { userId, participationRole: 'CLERK' },
          },
        };
      case 'PENDING':
        return {
          participations: {
            some: {
              userId,
              status: 'PENDING',
              viewedAt: null,
            },
          },
        };
      case 'IN_PROGRESS':
        return {
          participations: {
            some: {
              userId,
              OR: [
                { status: 'IN_PROGRESS' },
                { status: 'PENDING', viewedAt: { not: null } },
              ],
            },
          },
        };
      case 'COMPLETED':
        return {
          participations: {
            some: {
              userId,
              status: 'COMPLETED',
            },
          },
        };
      case 'RETURNED':
        return {
          participations: {
            some: {
              userId,
              status: { in: ['RETURNED', 'REJECTED'] },
            },
          },
        };
      case 'REJECTED':
        return {
          status: DocumentStatus.REJECTED,
        };
      case 'CANCELLED':
        return {
          participations: {
            some: {
              userId,
              status: 'CANCELLED',
            },
          },
        };
    }
  }

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
      // Audit trail: a user keeps the document visible in their list even
      // after a FORWARD/RETURN re-assigns the processor set. We OR the
      // `participations` filter (covers any historical row — DEPT_HEAD /
      // XLC / PHXL / XDB / CLERK) with the live `processors` filter so a
      // Head who already forwarded the document still sees it under
      // "Hoàn thành" instead of having it silently disappear.
      const visibilityOr: Prisma.DocumentWhereInput[] = [
        {
          processors: {
            some: {
              userId: assignedToUserId,
              processorType: { in: assignedProcessorTypes as any },
            },
          },
        },
        {
          participations: {
            some: {
              userId: assignedToUserId,
              participationRole: {
                in: ['DEPARTMENT_HEAD', 'SPECIALIST', 'XLC', 'PHXL', 'XDB', 'CLERK'],
              },
            },
          },
        },
      ];
      // Splice the existing predicates (documentTypeId, urgency, search, …)
      // into the AND branch so they still apply alongside the visibility OR.
      // We move every non-AND key out of documentWhere and re-attach it
      // under the new AND clause.
      const existingKeys = Object.keys(documentWhere).filter((k) => k !== 'AND');
      if (existingKeys.length === 0) {
        documentWhere.OR = visibilityOr;
      } else {
        const lifted: Prisma.DocumentWhereInput = {};
        for (const k of existingKeys) {
          (lifted as Record<string, unknown>)[k] = (documentWhere as Record<string, unknown>)[k];
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete (documentWhere as Record<string, unknown>)[k];
        }
        documentWhere.AND = [
          ...(Array.isArray(documentWhere.AND) ? documentWhere.AND : []),
          lifted,
          { OR: visibilityOr },
        ];
      }
    }

    // Per-viewer status filter. The caller passes the literal enum value as
    // a query string; we translate it to the participation-row shape.
    if (status && viewerFor) {
      const upperStatus = status.toUpperCase() as ViewerStatus;
      const viewerWhere = this.buildViewerStatusWhere(viewerFor.userId, upperStatus);
      // Merge with any existing filters. We must avoid clobbering the
      // visibility OR set up above when both filters are present (e.g. a
      // user filtered by COMPLETED — the visibility OR must remain
      // intact or the audit-trail fix stops working). Wrap viewerWhere
      // under AND when needed.
      if (documentWhere.OR) {
        const liftedOr = documentWhere.OR;
        delete documentWhere.OR;
        documentWhere.AND = [
          ...(Array.isArray(documentWhere.AND) ? documentWhere.AND : []),
          { OR: Array.isArray(liftedOr) ? liftedOr : [liftedOr] },
          viewerWhere,
        ];
      } else {
        Object.assign(documentWhere, viewerWhere);
      }
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
        include: { document: { include: documentInclude } },
      }),
      prisma.incomingDocument.count({ where }),
    ]);

    if (viewerFor) {
      // Fetch the viewer-specific participations for the page. We do this
      // in a single query and bucket the rows per document id so we don't
      // N+1 across the page.
      const documentIds = items.map((i) => i.documentId);
      const myParticipations =
        documentIds.length === 0
          ? []
          : await prisma.documentWorkflowParticipation.findMany({
              where: {
                documentId: { in: documentIds },
                userId: viewerFor.userId,
              },
            });

      const participationsByDocumentId = new Map<number, ParticipationProjection[]>();
      for (const p of myParticipations) {
        const list = participationsByDocumentId.get(p.documentId) ?? [];
        list.push({
          id: p.id,
          status: p.status,
          participationRole: p.participationRole,
          viewedAt: p.viewedAt,
          completedAt: p.completedAt,
          returnedAt: p.returnedAt,
        });
        participationsByDocumentId.set(p.documentId, list);
      }

      const decorated = items.map((item) => {
        const participations = participationsByDocumentId.get(item.documentId) ?? [];
        const docWithStatus = {
          ...item.document,
          participations,
          viewerStatus: resolveViewerStatus(
            {
              ...item.document,
              participations,
            } as unknown as ViewerStatusDocument,
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
        document: { include: documentInclude },
      },
    });
    if (!incoming) throw new NotFoundError('Không tìm thấy văn bản đến');

    const incomingWithStatus = incoming as unknown as IncomingDocumentWithRelations;
    if (viewerFor) {
      const participations = await prisma.documentWorkflowParticipation.findMany({
        where: {
          documentId: incoming.documentId,
          userId: viewerFor.userId,
        },
      });
      const projected: ParticipationProjection[] = participations.map((p) => ({
        id: p.id,
        status: p.status,
        participationRole: p.participationRole,
        viewedAt: p.viewedAt,
        completedAt: p.completedAt,
        returnedAt: p.returnedAt,
      }));
      (incomingWithStatus.document as DocumentWithViewerStatus).participations = projected;
      (incomingWithStatus.document as DocumentWithViewerStatus).viewerStatus =
        resolveViewerStatus(
          {
            ...incomingWithStatus.document,
            participations: projected,
          } as unknown as ViewerStatusDocument,
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

    // For heads: "pending" means "the document has at least one PENDING /
    // unopened DEPARTMENT_HEAD or XLC participation for this viewer".
    // We additionally constrain to documents that are still active in
    // the workflow (not in a terminal global state).
    const documentWhere: Prisma.DocumentWhereInput = {
      status: { notIn: [DocumentStatus.RETURNED, DocumentStatus.REJECTED, DocumentStatus.CANCELLED] },
      participations: {
        some: {
          userId: viewerFor?.userId ?? -1,
          participationRole: { in: ['DEPARTMENT_HEAD', 'XLC'] },
          status: { in: ['PENDING', 'IN_PROGRESS'] },
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
        include: { document: { include: documentInclude } },
      }),
      prisma.incomingDocument.count({ where }),
    ]);

    if (viewerFor) {
      const documentIds = items.map((i) => i.documentId);
      const myParticipations =
        documentIds.length === 0
          ? []
          : await prisma.documentWorkflowParticipation.findMany({
              where: {
                documentId: { in: documentIds },
                userId: viewerFor.userId,
              },
            });
      const participationsByDocumentId = new Map<number, ParticipationProjection[]>();
      for (const p of myParticipations) {
        const list = participationsByDocumentId.get(p.documentId) ?? [];
        list.push({
          id: p.id,
          status: p.status,
          participationRole: p.participationRole,
          viewedAt: p.viewedAt,
          completedAt: p.completedAt,
          returnedAt: p.returnedAt,
        });
        participationsByDocumentId.set(p.documentId, list);
      }
      const decorated = items.map((item) => {
        const participations = participationsByDocumentId.get(item.documentId) ?? [];
        const docWithStatus = {
          ...item.document,
          participations,
          viewerStatus: resolveViewerStatus(
            {
              ...item.document,
              participations,
            } as unknown as ViewerStatusDocument,
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

    // For specialists: only documents where this specialist is an XLC
    // participant with a still-active participation row.
    const documentWhere: Prisma.DocumentWhereInput = {
      participations: {
        some: {
          userId,
          participationRole: 'XLC',
          status: { in: ['PENDING', 'IN_PROGRESS'] },
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
        include: { document: { include: documentInclude } },
      }),
      prisma.incomingDocument.count({ where }),
    ]);

    if (viewerFor) {
      const documentIds = items.map((i) => i.documentId);
      const myParticipations =
        documentIds.length === 0
          ? []
          : await prisma.documentWorkflowParticipation.findMany({
              where: {
                documentId: { in: documentIds },
                userId: viewerFor.userId,
              },
            });
      const participationsByDocumentId = new Map<number, ParticipationProjection[]>();
      for (const p of myParticipations) {
        const list = participationsByDocumentId.get(p.documentId) ?? [];
        list.push({
          id: p.id,
          status: p.status,
          participationRole: p.participationRole,
          viewedAt: p.viewedAt,
          completedAt: p.completedAt,
          returnedAt: p.returnedAt,
        });
        participationsByDocumentId.set(p.documentId, list);
      }
      const decorated = items.map((item) => {
        const participations = participationsByDocumentId.get(item.documentId) ?? [];
        const docWithStatus = {
          ...item.document,
          participations,
          viewerStatus: resolveViewerStatus(
            {
              ...item.document,
              participations,
            } as unknown as ViewerStatusDocument,
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
