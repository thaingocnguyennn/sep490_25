import { default as prisma } from '../../config/database';
import { NotFoundError } from '../../shared/exceptions/app-error';
import { Prisma } from '@prisma/client';

export interface IncomingDocumentWithRelations {
  id: number;
  documentId: number;
  issuer: string | null;
  documentType: string | null;
  documentNumber: string | null;
  arrivalNumber: number | null;
  signerName: string | null;
  signerTitle: string | null;
  dateLetter: Date | null;
  dateReceived: Date;
  receivedDate: Date;
  summary: string | null;
  pageCount: number | null;
  urgency: string | null;
  notes: string | null;
  processingInstructions: string | null;
  departmentId: number | null;
  document: {
    id: number;
    documentNumber: string;
    title: string;
    description: string | null;
    type: string;
    fileUrl: string | null;
    status: string;
    priority: string;
    deadline: Date | null;
    ocrText: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdByUser: { id: number; fullName: string } | null;
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
  department: { id: number; name: string } | null;
}

export class IncomingDocumentsRepository {
  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    priority?: string;
  }) {
    const { page, limit, search, status, priority } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.IncomingDocumentWhereInput = {};
    if (search) {
      where.document = {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { documentNumber: { contains: search, mode: 'insensitive' } },
          { incomingDocuments: { some: { issuer: { contains: search, mode: 'insensitive' } } } },
          { incomingDocuments: { some: { documentType: { contains: search, mode: 'insensitive' } } } },
          { incomingDocuments: { some: { summary: { contains: search, mode: 'insensitive' } } } },
        ],
      };
    }
    if (status) where.document = { ...((where.document as object) || {}), status: status as any };
    if (priority) where.document = { ...((where.document as object) || {}), priority: priority as any };

    const [items, total] = await Promise.all([
      prisma.incomingDocument.findMany({
        where,
        skip,
        take: limit,
        orderBy: { document: { createdAt: 'desc' } },
        include: {
          department: { select: { id: true, name: true } },
          document: {
            include: {
              createdByUser: { select: { id: true, fullName: true } },
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
        department: { select: { id: true, name: true } },
        document: {
          include: {
            createdByUser: { select: { id: true, fullName: true } },
            updatedByUser: { select: { id: true, fullName: true } },
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
}

export const incomingDocumentsRepository = new IncomingDocumentsRepository();
