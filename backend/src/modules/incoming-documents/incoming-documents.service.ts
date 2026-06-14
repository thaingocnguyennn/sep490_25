import { default as prisma } from '../../config/database';
import { incomingDocumentsRepository } from './incoming-documents.repository';
import { documentsRepository } from '../documents/documents.repository';
import { NotFoundError, BadRequestError } from '../../shared/exceptions/app-error';
import { DocumentStatus, WorkflowStatus } from '@prisma/client';

interface ProcessorInput {
  userId: number;
  processorType: 'XLC' | 'PHXL' | 'XDB';
}

interface AttachmentInput {
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
}

export class IncomingDocumentsService {
  async list(params: { page: number; limit: number; search?: string; status?: string; priority?: string }) {
    return incomingDocumentsRepository.findAll(params);
  }

  async getById(id: number) {
    return incomingDocumentsRepository.findById(id);
  }

  async create(data: {
    issuer?: string;
    documentType?: string;
    documentNumber?: string;
    arrivalNumber?: number;
    signerName?: string;
    signerTitle?: string;
    dateLetter?: string;
    dateReceived: string;
    summary?: string;
    pageCount?: number;
    urgency?: string;
    notes?: string;
    processingInstructions?: string;
    departmentId?: number;
    processorIds: ProcessorInput[];
    attachments?: AttachmentInput[];
    createdBy: number;
  }) {
    const userIds = data.processorIds.map((p) => p.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });
    if (users.length !== userIds.length) {
      throw new BadRequestError('Một hoặc nhiều người dùng được chỉ định không tồn tại');
    }

    const hasPrimary = data.processorIds.some((p) => p.processorType === 'XLC');
    if (!hasPrimary) {
      throw new BadRequestError('Phải chọn ít nhất một Người xử lý chính (XLC)');
    }

    const documentNumber = await documentsRepository.generateDocumentNumber('INCOMING');
    const workflowSteps = await prisma.workflowStep.findMany({
      orderBy: { stepOrder: 'asc' },
    });

    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          documentNumber,
          title: data.summary
            ? `${data.documentType || ''} ${data.summary}`.trim()
            : data.issuer || `Văn bản đến số ${documentNumber}`,
          type: 'INCOMING',
          status: DocumentStatus.PENDING,
          createdBy: data.createdBy,
        },
      });

      const incoming = await tx.incomingDocument.create({
        data: {
          documentId: document.id,
          issuer: data.issuer,
          documentType: data.documentType,
          documentNumber: data.documentNumber,
          arrivalNumber: data.arrivalNumber,
          signerName: data.signerName,
          signerTitle: data.signerTitle,
          dateLetter: data.dateLetter ? new Date(data.dateLetter) : undefined,
          dateReceived: new Date(data.dateReceived),
          summary: data.summary,
          pageCount: data.pageCount,
          urgency: data.urgency as any,
          notes: data.notes,
          processingInstructions: data.processingInstructions,
          departmentId: data.departmentId,
        },
      });

      await tx.documentProcessor.createMany({
        data: data.processorIds.map((p) => ({
          documentId: document.id,
          userId: p.userId,
          processorType: p.processorType,
        })),
      });

      if (data.attachments && data.attachments.length > 0) {
        await tx.documentAttachment.createMany({
          data: data.attachments.map((a) => ({
            documentId: document.id,
            fileName: a.fileName,
            fileUrl: a.fileUrl,
            fileSize: a.fileSize,
            mimeType: a.mimeType,
          })),
        });
      }

      await tx.documentWorkflow.createMany({
        data: workflowSteps.map((step: { id: number }) => ({
          documentId: document.id,
          workflowStepId: step.id,
          status: WorkflowStatus.PENDING,
        })),
      });

      return { documentId: document.id, incomingId: incoming.id };
    });

    return this.getById(result.incomingId);
  }

  async updateStatus(id: number, status: string, userId: number, notes?: string) {
    const incoming = await incomingDocumentsRepository.findById(id);

    await prisma.document.update({
      where: { id: incoming.documentId },
      data: { status: status as any },
    });

    return this.getById(id);
  }

  async updateWorkflowStep(id: number, workflowId: number, stepStatus: string, userId: number, notes?: string) {
    const incoming = await incomingDocumentsRepository.findById(id);

    const workflow = await prisma.documentWorkflow.findUnique({ where: { id: workflowId } });
    if (!workflow) throw new NotFoundError('Không tìm thấy bước xử lý');

    const stepStatusEnum = stepStatus as 'APPROVED' | 'REJECTED' | 'SKIPPED';

    await prisma.$transaction(async (tx) => {
      await tx.documentWorkflow.update({
        where: { id: workflowId },
        data: {
          status: stepStatusEnum === 'REJECTED' ? 'REJECTED' : 'COMPLETED',
          notes: notes || undefined,
          completedAt: new Date(),
          userId,
        },
      });

      if (stepStatusEnum === 'REJECTED') {
        await tx.document.update({
          where: { id: incoming.documentId },
          data: { status: 'REJECTED' },
        });
      } else if (stepStatusEnum === 'APPROVED') {
        const allWorkflows = await tx.documentWorkflow.findMany({
          where: { documentId: incoming.documentId },
          orderBy: { workflowStep: { stepOrder: 'asc' } },
        });
        const allDone = allWorkflows.every(
          (w) => w.id === workflowId || w.status === 'COMPLETED' || (w.status as string) === 'SKIPPED'
        );
        if (allDone) {
          await tx.document.update({
            where: { id: incoming.documentId },
            data: { status: 'COMPLETED' },
          });
        } else {
          await tx.document.update({
            where: { id: incoming.documentId },
            data: { status: 'IN_PROGRESS' },
          });
        }
      }
    });

    return this.getById(id);
  }
}

export const incomingDocumentsService = new IncomingDocumentsService();
