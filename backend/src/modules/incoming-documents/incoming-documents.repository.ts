import { default as prisma } from '../../config/database';
import { NotFoundError } from '../../shared/exceptions/app-error';
import { Prisma, DocumentStatus, WorkflowStatus } from '@prisma/client';
import { resolveUrgencyId } from '../../shared/utils/urgency';

export interface IncomingDocumentWithRelations {
  id: number;
  documentId: number;
  issuer: string | null;
  documentType: string | null;
  documentTypeId: number | null;
  documentTypeRef: { id: number; name: string } | null;
  documentNumber: string | null;
  arrivalNumber: number | null;
  signerName: string | null;
  signerTitle: string | null;
  dateLetter: Date | null;
  dateReceived: Date;
  receivedDate: Date;
  summary: string | null;
  pageCount: number | null;
  notes: string | null;
  processingInstructions: string | null;
  createdByClerkId: number | null;
  createdByClerk: { id: number; fullName: string } | null;
  document: {
    id: number;
    documentNumber: string;
    title: string;
    description: string | null;
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
    deadline: Date | null;
    ocrText: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdByUser: { id: number; fullName: string } | null;
    createdBy?: number;
    updatedByUser: { id: number; fullName: string } | null;
    processors: {
      id: number;
      processorType: string;
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
  };
}

export class IncomingDocumentsRepository {
  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    /** Seeded name (THUONG/KHAN/THUONG_KHAN/HOA_TOC), legacy alias, or numeric id */
    urgency?: string;
    /** Filter by documentId for users with XLC/PHXL/XDB assignments */
    assignedToUserId?: number;
    /** Restrict to documents where the user has at least one XLC/PHXL/XDB processor record */
    assignedProcessorTypes?: string[];
  }) {
    const { page, limit, search, status, urgency, assignedToUserId, assignedProcessorTypes } = params;
    const skip = (page - 1) * limit;

    const documentWhere: Prisma.DocumentWhereInput = {};
    const where: Prisma.IncomingDocumentWhereInput = {};
    if (search) {
      documentWhere.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { documentNumber: { contains: search, mode: 'insensitive' } },
        { incomingDocuments: { some: { issuer: { contains: search, mode: 'insensitive' } } } },
        { incomingDocuments: { some: { documentType: { contains: search, mode: 'insensitive' } } } },
        { incomingDocuments: { some: { documentTypeRef: { name: { contains: search, mode: 'insensitive' } } } } },
        { incomingDocuments: { some: { summary: { contains: search, mode: 'insensitive' } } } },
      ];
    }
    if (status) documentWhere.status = status as any;
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
          createdByClerk: { select: { id: true, fullName: true } },
          documentTypeRef: { select: { id: true, name: true } },
          document: {
            include: {
              createdByUser: { select: { id: true, fullName: true } },
              urgency: { select: { id: true, name: true, description: true } },
              confidentiality: { select: { id: true, code: true, name: true, description: true } },
              processors: {
                include: { user: { select: { id: true, fullName: true, email: true } } },
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

    return { items, total };
  }

  async findById(id: number): Promise<IncomingDocumentWithRelations> {
    const incoming = await prisma.incomingDocument.findUnique({
      where: { id },
      include: {
        createdByClerk: { select: { id: true, fullName: true } },
        documentTypeRef: { select: { id: true, name: true } },
        document: {
          include: {
            createdByUser: { select: { id: true, fullName: true } },
            updatedByUser: { select: { id: true, fullName: true } },
            urgency: { select: { id: true, name: true, description: true } },
            confidentiality: { select: { id: true, code: true, name: true, description: true } },
            processors: {
              include: { user: { select: { id: true, fullName: true, email: true } } },
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
    return incoming as unknown as IncomingDocumentWithRelations;
  }

  async findAllPendingForHead(params: { page: number; limit: number; search?: string }) {
    const { page, limit, search } = params;
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
        { title: { contains: search, mode: 'insensitive' } },
        { documentNumber: { contains: search, mode: 'insensitive' } },
        { incomingDocuments: { some: { issuer: { contains: search, mode: 'insensitive' } } } },
        { incomingDocuments: { some: { documentType: { contains: search, mode: 'insensitive' } } } },
        { incomingDocuments: { some: { documentTypeRef: { name: { contains: search, mode: 'insensitive' } } } } },
        { incomingDocuments: { some: { summary: { contains: search, mode: 'insensitive' } } } },
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
          createdByClerk: { select: { id: true, fullName: true } },
          documentTypeRef: { select: { id: true, name: true } },
          document: {
            include: {
              createdByUser: { select: { id: true, fullName: true } },
              urgency: { select: { id: true, name: true, description: true } },
              confidentiality: { select: { id: true, code: true, name: true, description: true } },
              processors: {
                include: { user: { select: { id: true, fullName: true, email: true } } },
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

    return { items, total };
  }

  async findAllPendingForSpecialist(params: { page: number; limit: number; search?: string; userId: number }) {
    const { page, limit, search, userId } = params;
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
        { title: { contains: search, mode: 'insensitive' } },
        { documentNumber: { contains: search, mode: 'insensitive' } },
        { incomingDocuments: { some: { issuer: { contains: search, mode: 'insensitive' } } } },
        { incomingDocuments: { some: { documentType: { contains: search, mode: 'insensitive' } } } },
        { incomingDocuments: { some: { documentTypeRef: { name: { contains: search, mode: 'insensitive' } } } } },
        { incomingDocuments: { some: { summary: { contains: search, mode: 'insensitive' } } } },
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
          createdByClerk: { select: { id: true, fullName: true } },
          documentTypeRef: { select: { id: true, name: true } },
          document: {
            include: {
              createdByUser: { select: { id: true, fullName: true } },
              urgency: { select: { id: true, name: true, description: true } },
              confidentiality: { select: { id: true, code: true, name: true, description: true } },
              processors: {
                include: { user: { select: { id: true, fullName: true, email: true } } },
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

    return { items, total };
  }
}

export const incomingDocumentsRepository = new IncomingDocumentsRepository();
