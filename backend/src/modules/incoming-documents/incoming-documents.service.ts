import { default as prisma } from '../../config/database';
import { incomingDocumentsRepository } from './incoming-documents.repository';
import { documentsRepository } from '../documents/documents.repository';
import { NotFoundError, BadRequestError } from '../../shared/exceptions/app-error';
import { DocumentStatus, WorkflowStatus } from '@prisma/client';
import { resolveUrgencyIdWithDefault } from '../../shared/utils/urgency';

function parseDateOrNull(input: string): Date | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dmy = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    const iso = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

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
  async list(params: { page: number; limit: number; search?: string; status?: string; priority?: string; urgency?: string }) {
    return incomingDocumentsRepository.findAll(params);
  }

  async getById(id: number) {
    return incomingDocumentsRepository.findById(id);
  }

  async listPendingForHead(params: { page: number; limit: number; search?: string }) {
    return incomingDocumentsRepository.findAllPendingForHead(params);
  }

  async processByHead(
    id: number,
    action: 'FINISH' | 'FORWARD' | 'RETURN',
    payload: {
      processorIds?: ProcessorInput[];
      processingInstructions?: string;
      deadline?: string;
      reason?: string;
      attachments?: AttachmentInput[];
    },
    userId: number
  ) {
    const incoming = await incomingDocumentsRepository.findById(id);
    const documentId = incoming.documentId;

    const headStep = await prisma.documentWorkflow.findFirst({
      where: {
        documentId,
        workflowStep: { stepOrder: 2, roleName: 'DEPARTMENT_HEAD' },
      },
    });
    if (!headStep) {
      throw new BadRequestError('Văn bản này không có bước xử lý của Trưởng phòng');
    }
    if (headStep.status !== 'PENDING') {
      throw new BadRequestError('Bước xử lý của Trưởng phòng không ở trạng thái chờ xử lý');
    }

    if (action === 'FORWARD') {
      const processorIds = payload.processorIds || [];
      if (processorIds.length === 0) {
        throw new BadRequestError('Phải chọn ít nhất một người xử lý');
      }
      const userIds = processorIds.map((p) => p.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true },
      });
      if (users.length !== userIds.length) {
        throw new BadRequestError('Một hoặc nhiều người dùng được chỉ định không tồn tại');
      }
      const hasPrimary = processorIds.some((p) => p.processorType === 'XLC');
      if (!hasPrimary) {
        throw new BadRequestError('Phải chọn ít nhất một Người xử lý chính (XLC)');
      }

      const deadlineDate = payload.deadline ? parseDateOrNull(payload.deadline) : null;

      await prisma.$transaction(async (tx) => {
        await tx.documentProcessor.deleteMany({ where: { documentId } });
        await tx.documentProcessor.createMany({
          data: processorIds.map((p) => ({
            documentId,
            userId: p.userId,
            processorType: p.processorType,
          })),
        });

        await tx.documentWorkflow.update({
          where: { id: headStep.id },
          data: {
            status: WorkflowStatus.COMPLETED,
            userId,
            completedAt: new Date(),
            notes:
              payload.processingInstructions ||
              'Trưởng phòng chuyển xử lý cho chuyên viên',
          },
        });

        await tx.incomingDocument.update({
          where: { id },
          data: {
            processingInstructions: payload.processingInstructions,
          },
        });

        await tx.document.update({
          where: { id: documentId },
          data: {
            status: DocumentStatus.IN_PROGRESS,
            ...(deadlineDate ? { deadline: deadlineDate } : {}),
          },
        });

        if (payload.attachments && payload.attachments.length > 0) {
          await tx.documentAttachment.createMany({
            data: payload.attachments.map((a) => ({
              documentId,
              fileName: a.fileName,
              fileUrl: a.fileUrl,
              fileSize: a.fileSize,
              mimeType: a.mimeType,
            })),
          });
        }
      });
    } else if (action === 'FINISH') {
      await prisma.$transaction(async (tx) => {
        await tx.documentWorkflow.update({
          where: { id: headStep.id },
          data: {
            status: WorkflowStatus.COMPLETED,
            userId,
            completedAt: new Date(),
            notes: payload.processingInstructions || 'Trưởng phòng hoàn thành xử lý',
          },
        });

        const allWorkflows = await tx.documentWorkflow.findMany({
          where: { documentId },
          orderBy: { workflowStep: { stepOrder: 'asc' } },
        });
        const remaining = allWorkflows.filter((w) => w.id !== headStep.id);
        for (const wf of remaining) {
          await tx.documentWorkflow.update({
            where: { id: wf.id },
            data: {
              status: WorkflowStatus.CANCELLED,
              completedAt: new Date(),
              notes: 'Bỏ qua do Trưởng phòng đã hoàn thành xử lý',
            },
          });
        }

        await tx.document.update({
          where: { id: documentId },
          data: { status: DocumentStatus.COMPLETED },
        });
      });
    } else if (action === 'RETURN') {
      await prisma.$transaction(async (tx) => {
        await tx.documentWorkflow.update({
          where: { id: headStep.id },
          data: {
            status: WorkflowStatus.REJECTED,
            userId,
            completedAt: new Date(),
            notes: payload.reason || 'Trả lại cho văn thư',
          },
        });

        await tx.document.update({
          where: { id: documentId },
          data: { status: DocumentStatus.RETURNED },
        });

        await tx.documentProcessor.deleteMany({ where: { documentId } });
      });
    } else {
      throw new BadRequestError('Hành động không hợp lệ');
    }

    return this.getById(id);
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
    /** Seeded name (THUONG/KHAN/THUONG_KHAN/HOA_TOC), legacy alias, or numeric id */
    urgency?: string;
    notes?: string;
    processingInstructions?: string;
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

    // Resolve urgencyId (canonical) from the request, or fall back to THUONG.
    const urgencyId = data.urgency !== undefined && data.urgency !== null && data.urgency !== ''
      ? await resolveUrgencyIdWithDefault(data.urgency)
      : await resolveUrgencyIdWithDefault(null);

    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          documentNumber,
          title: data.summary
            ? `${data.documentType || ''} ${data.summary}`.trim()
            : data.issuer || `Văn bản đến số ${documentNumber}`,
          type: 'INCOMING',
          status: DocumentStatus.PENDING,
          urgencyId,
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
          dateLetter: data.dateLetter ? parseDateOrNull(data.dateLetter) : undefined,
          dateReceived: new Date(data.dateReceived),
          summary: data.summary,
          pageCount: data.pageCount,
          urgencyId,
          notes: data.notes,
          processingInstructions: data.processingInstructions,
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

  // ─── Thống kê Văn bản đến (thêm mới, không sửa code cũ) ──────────────────
  async getStatistics(params: {
    dateFrom?: string;
    dateTo?: string;
    departmentId?: number;
  } = {}) {
    const { dateFrom, dateTo, departmentId } = params;

    const baseDocFilter: Record<string, unknown> = {
      documentStatus: 'ACTIVE',
      type: 'INCOMING',
    };

    if (dateFrom || dateTo) {
      baseDocFilter.createdAt = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
      };
    }

    if (departmentId !== undefined) {
      baseDocFilter.departmentId = departmentId;
    }

    const baseFilter: Record<string, unknown> = { document: baseDocFilter };

    const totalCount = await prisma.incomingDocument.count({
      where: baseFilter as any,
    });

    const byStatusRaw = await prisma.document.groupBy({
      by: ['status'],
      where: baseDocFilter as any,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    const byStatus = byStatusRaw.map((r) => ({
      status: r.status as string,
      count: r._count.id,
    }));

    const byDocTypeRaw = await prisma.incomingDocument.groupBy({
      by: ['documentType'],
      where: baseFilter as any,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    const byDocumentType = byDocTypeRaw.map((r) => ({
      documentType: r.documentType ?? 'Chưa phân loại',
      count: r._count.id,
    }));

    const byDeptRaw = await prisma.document.groupBy({
      by: ['departmentId'],
      where: { ...baseDocFilter, departmentId: { not: null } } as any,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });
    const deptIds = byDeptRaw
      .map((r) => r.departmentId)
      .filter((id): id is number => id !== null);
    const depts = await prisma.department.findMany({
      where: { id: { in: deptIds } },
      select: { id: true, name: true },
    });
    const deptMap = new Map(depts.map((d) => [d.id, d.name]));
    const byDepartment = byDeptRaw.map((r) => ({
      departmentId: r.departmentId,
      departmentName: r.departmentId
        ? (deptMap.get(r.departmentId) ?? 'Không xác định')
        : 'Chưa gán phòng ban',
      count: r._count.id,
    }));

    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const monthlyDocs = await prisma.incomingDocument.findMany({
      where: {
        ...baseFilter,
        dateReceived: { gte: twelveMonthsAgo },
      } as any,
      select: { dateReceived: true },
    });
    const monthlyMap = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(key, 0);
    }
    for (const doc of monthlyDocs) {
      if (doc.dateReceived) {
        const key = `${doc.dateReceived.getFullYear()}-${String(doc.dateReceived.getMonth() + 1).padStart(2, '0')}`;
        if (monthlyMap.has(key)) monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1);
      }
    }
    const byMonth = Array.from(monthlyMap.entries()).map(([month, count]) => ({
      month,
      count,
    }));

    return { totalCount, byStatus, byDocumentType, byDepartment, byMonth };
  }
}

export const incomingDocumentsService = new IncomingDocumentsService();
