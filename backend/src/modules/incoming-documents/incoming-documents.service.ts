import { default as prisma } from '../../config/database';
import { incomingDocumentsRepository } from './incoming-documents.repository';
import { documentsRepository } from '../documents/documents.repository';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
} from '../../shared/exceptions/app-error';
import { DocumentStatus, WorkflowStatus, ProcessorType, OcrStatus } from '@prisma/client';
import { resolveUrgencyIdWithDefault } from '../../shared/utils/urgency';
import { resolveConfidentialityIdWithDefault } from '../../shared/utils/confidentiality';
import {
  checkIncomingDocumentAccess,
  checkWorkflowStepAccess,
  resolveStageFromRoleName,
  resolveDocumentId,
} from '../../shared/access/document-access';
import {
  emitNotificationToUser,
  emitNotificationToUsers,
} from '../../shared/services/notification.service';
import { logSystemAction } from '../../shared/services/system-log.service';
import fs from 'fs';
import path from 'path';
import { config } from '../../config';

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
  async list(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    documentTypeId?: number;
    urgency?: string;
    userId?: number;
    userRoles?: string[];
  }) {
    const { userId, userRoles } = params;

    let assignedToUserId: number | undefined;
    let assignedProcessorTypes: string[] | undefined;

    if (userId !== undefined && userRoles !== undefined) {
      const isAdmin = userRoles.includes('ADMIN');
      const isDepartmentHead = userRoles.includes('DEPARTMENT_HEAD');
      const isSpecialist = userRoles.includes('SPECIALIST');

      if (!isAdmin && (isDepartmentHead || isSpecialist)) {
        assignedToUserId = userId;
        assignedProcessorTypes = ['XLC', 'PHXL', 'XDB'];
      }
    }

    return incomingDocumentsRepository.findAll({
      ...params,
      assignedToUserId,
      assignedProcessorTypes,
    });
  }

  async getById(id: number, userId?: number, userRoles?: string[]) {
    const incoming = await incomingDocumentsRepository.findById(id);

    if (userId !== undefined && userRoles !== undefined) {
      await checkIncomingDocumentAccess(id, userId, userRoles);
    }

    return incoming;
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
    userId: number,
    userRoles: string[] = []
  ) {
    const incoming = await incomingDocumentsRepository.findById(id);
    const documentId = incoming.documentId;

    // XLC stage gating: callers without DEPT_HEAD (or ADMIN) cannot act at the
    // head stage. This complements the route-level requireRole guard by
    // pinning to the assigned XLC for non-admins.
    if (!userRoles.includes('ADMIN') && !userRoles.includes('DEPARTMENT_HEAD')) {
      throw new ForbiddenError(
        'Chỉ Trưởng phòng hoặc Quản trị viên mới có thể xử lý văn bản ở giai đoạn này'
      );
    }

    const headStep = await prisma.documentWorkflow.findFirst({
      where: {
        documentId,
        workflowStep: { stepOrder: 2, roleName: 'DEPARTMENT_HEAD' },
      },
      include: { workflowStep: true },
    });
    if (!headStep) {
      throw new BadRequestError('Văn bản này không có bước xử lý của Trưởng phòng');
    }
    if (headStep.status !== 'PENDING') {
      throw new BadRequestError('Bước xử lý của Trưởng phòng không ở trạng thái chờ xử lý');
    }

    // Access check — make sure the document is visible to the caller.
    await checkIncomingDocumentAccess(id, userId, userRoles);

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

      const forwardedUserIds: number[] = [];
      await prisma.$transaction(async (tx) => {
        // Capture the previous set for history
        const previous = await tx.documentProcessor.findMany({
          where: { documentId },
          select: { userId: true, processorType: true },
        });
        await tx.documentProcessor.deleteMany({ where: { documentId } });
        await tx.documentProcessor.createMany({
          data: processorIds.map((p) => ({
            documentId,
            userId: p.userId,
            processorType: p.processorType,
          })),
        });
        if (previous.length > 0) {
          await tx.documentProcessorHistory.createMany({
            data: previous.map((p) => ({
              documentId,
              userId: p.userId,
              processorType: p.processorType as ProcessorType,
              action: 'TRANSFERRED',
              actorId: userId,
            })),
          });
        }
        await tx.documentProcessorHistory.createMany({
          data: processorIds.map((p) => ({
            documentId,
            userId: p.userId,
            processorType: p.processorType as ProcessorType,
            action: 'ASSIGNED',
            actorId: userId,
          })),
        });
        forwardedUserIds.push(...processorIds.map((p) => p.userId));

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

      await emitNotificationToUsers(
        forwardedUserIds,
        'Văn bản đến được chuyển xử lý',
        `Trưởng phòng đã chuyển văn bản ${incoming.document.documentNumber} cho bạn`
      );
      await logSystemAction({
        userId,
        action: 'INCOMING_FORWARDED',
        entityType: 'IncomingDocument',
        entityId: id,
        details: `Forwarded to ${processorIds.length} processor(s)`,
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
      await logSystemAction({
        userId,
        action: 'INCOMING_FINISHED_BY_HEAD',
        entityType: 'IncomingDocument',
        entityId: id,
      });
    } else if (action === 'RETURN') {
      if (!payload.reason?.trim()) {
        throw new BadRequestError('Phải nhập lý do trả lại');
      }
      const previous = await prisma.documentProcessor.findMany({
        where: { documentId },
      });
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
        if (previous.length > 0) {
          await tx.documentProcessorHistory.createMany({
            data: previous.map((p) => ({
              documentId,
              userId: p.userId,
              processorType: p.processorType as ProcessorType,
              action: 'REMOVED',
              reason: payload.reason,
              actorId: userId,
            })),
          });
        }
      });
      // Notify the clerk who created the document so they can act.
      if (incoming.document.createdBy && incoming.document.createdByUser) {
        await emitNotificationToUser(
          incoming.document.createdBy,
          'Văn bản đến bị trả lại',
          `Trưởng phòng trả lại văn bản ${incoming.document.documentNumber}: ${payload.reason}`
        );
      }
      await logSystemAction({
        userId,
        action: 'INCOMING_RETURNED',
        entityType: 'IncomingDocument',
        entityId: id,
        details: payload.reason,
      });
    } else {
      throw new BadRequestError('Hành động không hợp lệ');
    }

    return this.getById(id);
  }

  async create(data: {
    issuer?: string;
    documentTypeId?: number;
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
    /** Seeded name (THUONG/MAT/TOI_MAT/TUYET_MAT) or numeric id */
    confidentialityLevel?: string;
    confidentialityId?: string;
    documentBookId?: number;
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

    // Resolve confidentialityId from the request, or fall back to THUONG.
    const confidentialityInput = data.confidentialityId ?? data.confidentialityLevel ?? null;
    const confidentialityId = await resolveConfidentialityIdWithDefault(confidentialityInput);

    // Parse documentBookId if provided as string (defensive parsing)
    const documentBookId = data.documentBookId !== undefined && data.documentBookId !== null
      ? typeof data.documentBookId === 'string'
        ? parseInt(data.documentBookId, 10)
        : data.documentBookId
      : undefined;

    // Fetch document kind name for title if documentTypeId is provided
    let documentKindName = '';
    if (data.documentTypeId) {
      const typeDoc = await prisma.documentKind.findUnique({ where: { id: data.documentTypeId }, select: { name: true } });
      if (typeDoc) documentKindName = typeDoc.name;
    }

    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          documentNumber,
          title: data.summary
            ? `${documentKindName} ${data.summary}`.trim()
            : data.issuer || `Văn bản đến số ${documentNumber}`,
          type: 'INCOMING',
          status: DocumentStatus.PENDING,
          urgencyId,
          confidentialityId,
          createdBy: data.createdBy,
        },
      });

      const incoming = await tx.incomingDocument.create({
        data: {
          documentId: document.id,
          issuer: data.issuer,
          documentTypeId: data.documentTypeId,
          documentNumber: data.documentNumber,
          arrivalNumber: data.arrivalNumber,
          signerName: data.signerName,
          signerTitle: data.signerTitle,
          dateLetter: data.dateLetter ? parseDateOrNull(data.dateLetter) : undefined,
          dateReceived: new Date(data.dateReceived),
          summary: data.summary,
          pageCount: data.pageCount,
          notes: data.notes,
          processingInstructions: data.processingInstructions,
          createdByClerkId: data.createdBy,
          documentBookId,
        },
      });

      // If a document book is selected, create the book entry
      if (documentBookId && data.arrivalNumber) {
        await tx.incomingBookEntry.create({
          data: {
            documentBookId,
            incomingDocumentId: incoming.id,
            arrivalNumber: data.arrivalNumber,
            arrivalDate: new Date(data.dateReceived),
            senderSnapshot: data.issuer || '',
            documentNumberSnapshot: data.documentNumber || null,
            summarySnapshot: data.summary || '',
            registeredById: data.createdBy,
          },
        });

        // Update the document book's currentNumber
        await tx.documentBook.update({
          where: { id: documentBookId },
          data: { currentNumber: { increment: 1 } },
        });
      }

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

  /**
   * Save an incoming document as a draft.
   * Unlike create(), this does not require processors and allows partial data.
   * The document is created with DRAFT status so it can be edited/submitted later.
   */
  async saveDraft(data: {
    issuer?: string;
    documentTypeId?: number;
    documentNumber?: string;
    arrivalNumber?: number;
    signerName?: string;
    signerTitle?: string;
    dateLetter?: string;
    dateReceived?: string;
    summary?: string;
    pageCount?: number;
    urgency?: string;
    notes?: string;
    processingInstructions?: string;
    attachments?: AttachmentInput[];
    createdBy: number;
    confidentialityLevel?: string;
    confidentialityId?: string;
    documentBookId?: number;
  }) {
    const documentNumber = await documentsRepository.generateDocumentNumber('INCOMING');

    // Resolve urgencyId and confidentialityId (use defaults if not provided)
    const urgencyId = data.urgency !== undefined && data.urgency !== null && data.urgency !== ''
      ? await resolveUrgencyIdWithDefault(data.urgency)
      : await resolveUrgencyIdWithDefault(null);

    const confidentialityInput = data.confidentialityId ?? data.confidentialityLevel ?? null;
    const confidentialityId = await resolveConfidentialityIdWithDefault(confidentialityInput);

    // Parse documentBookId if provided as string (defensive parsing)
    const documentBookId = data.documentBookId !== undefined && data.documentBookId !== null
      ? typeof data.documentBookId === 'string'
        ? parseInt(data.documentBookId, 10)
        : data.documentBookId
      : undefined;

    // Fetch document kind name for title if documentTypeId is provided
    let documentKindName = '';
    if (data.documentTypeId) {
      const typeDoc = await prisma.documentKind.findUnique({ where: { id: data.documentTypeId }, select: { name: true } });
      if (typeDoc) documentKindName = typeDoc.name;
    }

    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          documentNumber,
          title: data.summary
            ? `${documentKindName} ${data.summary}`.trim()
            : data.issuer || `Văn bản đến số ${documentNumber}`,
          type: 'INCOMING',
          status: DocumentStatus.DRAFT, // Draft status - not processed yet
          urgencyId,
          confidentialityId,
          createdBy: data.createdBy,
        },
      });

      const incoming = await tx.incomingDocument.create({
        data: {
          documentId: document.id,
          issuer: data.issuer,
          documentTypeId: data.documentTypeId,
          documentNumber: data.documentNumber,
          arrivalNumber: data.arrivalNumber,
          signerName: data.signerName,
          signerTitle: data.signerTitle,
          dateLetter: data.dateLetter ? parseDateOrNull(data.dateLetter) : undefined,
          dateReceived: data.dateReceived ? new Date(data.dateReceived) : new Date(),
          summary: data.summary,
          pageCount: data.pageCount,
          notes: data.notes,
          processingInstructions: data.processingInstructions,
          createdByClerkId: data.createdBy,
          documentBookId,
        },
      });

      // If a document book is selected and draft is being submitted later,
      // we don't create the book entry yet - it will be created when the document is finalized

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

      return { documentId: document.id, incomingId: incoming.id };
    });

    return this.getById(result.incomingId);
  }

  /**
   * Save an incoming document as a draft with a file attached.
   * The file is saved to disk by multer before this method is called. If the
   * Prisma transaction fails, the uploaded file is deleted to avoid orphaned
   * files on disk.
   *
   * @param file  - Multer file object from the multipart upload
   * @param data  - Document metadata
   * @param userId - Authenticated user id (passed separately instead of in data)
   */
  async saveDraftWithFile(
    file: Express.Multer.File,
    data: {
      issuer?: string;
      documentTypeId?: number;
      documentNumber?: string;
      arrivalNumber?: number;
      signerName?: string;
      signerTitle?: string;
      dateLetter?: string;
      dateReceived?: string;
      summary?: string;
      pageCount?: number;
      urgency?: string;
      notes?: string;
      processingInstructions?: string;
      attachments?: AttachmentInput[];
      confidentialityLevel?: string;
      confidentialityId?: string;
      documentBookId?: number;
    },
    userId: number,
  ) {
    const fileUrl = `/uploads/${file.filename}`;
    let resultDocId: number | null = null;

    const documentTypeId = data.documentTypeId
      ? typeof data.documentTypeId === 'string'
        ? parseInt(data.documentTypeId, 10)
        : data.documentTypeId
      : undefined;

    const documentBookId = data.documentBookId
      ? typeof data.documentBookId === 'string'
        ? parseInt(data.documentBookId, 10)
        : data.documentBookId
      : undefined;

    try {
      // Fetch document kind name for title if documentTypeId is provided
      let documentKindName = '';
      if (documentTypeId) {
        const typeDoc = await prisma.documentKind.findUnique({ where: { id: documentTypeId }, select: { name: true } });
        if (typeDoc) documentKindName = typeDoc.name;
      }

      const result = await prisma.$transaction(async (tx) => {
        const documentNumber = await documentsRepository.generateDocumentNumber('INCOMING');

        const document = await tx.document.create({
          data: {
            documentNumber,
            title: data.summary
              ? `${documentKindName} ${data.summary}`.trim()
              : data.issuer || `Văn bản đến số ${documentNumber}`,
            type: 'INCOMING',
            status: DocumentStatus.DRAFT, // Draft status
            fileUrl,
            originalFileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            urgencyId: data.urgency !== undefined && data.urgency !== null && data.urgency !== ''
              ? await resolveUrgencyIdWithDefault(data.urgency)
              : await resolveUrgencyIdWithDefault(null),
            confidentialityId: await resolveConfidentialityIdWithDefault(
              data.confidentialityId ?? data.confidentialityLevel ?? null,
            ),
            createdBy: userId,
          },
        });

        const incoming = await tx.incomingDocument.create({
          data: {
            documentId: document.id,
            issuer: data.issuer,
            documentTypeId,
            documentNumber: data.documentNumber,
            arrivalNumber: data.arrivalNumber,
            signerName: data.signerName,
            signerTitle: data.signerTitle,
            dateLetter: data.dateLetter ? parseDateOrNull(data.dateLetter) : undefined,
            dateReceived: data.dateReceived ? new Date(data.dateReceived) : new Date(),
            summary: data.summary,
            pageCount: data.pageCount,
            notes: data.notes,
            processingInstructions: data.processingInstructions,
            createdByClerkId: userId,
            documentBookId,
          },
        });

        // Add additional attachments if any
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

        return { documentId: document.id, incomingId: incoming.id };
      });

      resultDocId = result.documentId;
      return this.getById(result.incomingId);
    } catch (error) {
      const conflict = (error as { code?: string }).code === 'P2002';
      if (conflict) {
        throw new ConflictError('Mã văn bản đã tồn tại, vui lòng thử lại');
      }
      // Transaction failed — delete the uploaded file to avoid orphaned files
      const filePath = path.join(config.uploadDir, file.filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // best-effort cleanup; log but don't throw
        }
      }
      throw error;
    } finally {
      void resultDocId;
    }
  }

  /**
   * Update an existing draft document.
   */
  async updateDraft(
    id: number,
    data: {
      issuer?: string;
      documentTypeId?: number;
      documentNumber?: string;
      arrivalNumber?: number;
      signerName?: string;
      signerTitle?: string;
      dateLetter?: string;
      dateReceived?: string;
      summary?: string;
      pageCount?: number;
      urgency?: string;
      notes?: string;
      processingInstructions?: string;
      attachments?: AttachmentInput[];
      confidentialityLevel?: string;
      confidentialityId?: string;
      updatedBy: number;
      documentBookId?: number;
    }
  ) {
    // Verify the document is a draft
    const incoming = await incomingDocumentsRepository.findById(id);
    if (incoming.document.status !== DocumentStatus.DRAFT) {
      throw new BadRequestError('Chỉ có thể cập nhật bản nháp');
    }

    // Resolve urgencyId and confidentialityId
    const urgencyId = data.urgency !== undefined && data.urgency !== null && data.urgency !== ''
      ? await resolveUrgencyIdWithDefault(data.urgency)
      : await resolveUrgencyIdWithDefault(null);

    const confidentialityInput = data.confidentialityId ?? data.confidentialityLevel ?? null;
    const confidentialityId = await resolveConfidentialityIdWithDefault(confidentialityInput);

    // Fetch document kind name for title if documentTypeId is provided
    let documentKindName = '';
    if (data.documentTypeId) {
      const typeDoc = await prisma.documentKind.findUnique({ where: { id: data.documentTypeId }, select: { name: true } });
      if (typeDoc) documentKindName = typeDoc.name;
    }

    const title = data.summary
      ? `${documentKindName} ${data.summary}`.trim()
      : data.issuer || incoming.document.title;

    await prisma.$transaction(async (tx) => {
      // Update the document
      await tx.document.update({
        where: { id: incoming.documentId },
        data: {
          title,
          urgencyId,
          confidentialityId,
          updatedBy: data.updatedBy,
        },
      });

      // Update the incoming document
      await tx.incomingDocument.update({
        where: { id },
        data: {
          issuer: data.issuer,
          documentTypeId: data.documentTypeId,
          documentNumber: data.documentNumber,
          arrivalNumber: data.arrivalNumber,
          signerName: data.signerName,
          signerTitle: data.signerTitle,
          dateLetter: data.dateLetter ? parseDateOrNull(data.dateLetter) : undefined,
          dateReceived: data.dateReceived ? new Date(data.dateReceived) : undefined,
          summary: data.summary,
          pageCount: data.pageCount,
          notes: data.notes,
          processingInstructions: data.processingInstructions,
          documentBookId: data.documentBookId,
        },
      });
    });

    return this.getById(id);
  }

  /**
   * Update an existing draft document with a new file.
   */
  async updateDraftWithFile(
    id: number,
    file: Express.Multer.File,
    data: {
      issuer?: string;
      documentTypeId?: number;
      documentNumber?: string;
      arrivalNumber?: number;
      signerName?: string;
      signerTitle?: string;
      dateLetter?: string;
      dateReceived?: string;
      summary?: string;
      pageCount?: number;
      urgency?: string;
      notes?: string;
      processingInstructions?: string;
      attachments?: AttachmentInput[];
      confidentialityLevel?: string;
      confidentialityId?: string;
      updatedBy: number;
      documentBookId?: number;
    },
    userId: number,
  ) {
    // Verify the document is a draft
    const incoming = await incomingDocumentsRepository.findById(id);
    if (incoming.document.status !== DocumentStatus.DRAFT) {
      throw new BadRequestError('Chỉ có thể cập nhật bản nháp');
    }

    const fileUrl = `/uploads/${file.filename}`;

    // Resolve urgencyId and confidentialityId
    const urgencyId = data.urgency !== undefined && data.urgency !== null && data.urgency !== ''
      ? await resolveUrgencyIdWithDefault(data.urgency)
      : await resolveUrgencyIdWithDefault(null);

    const confidentialityInput = data.confidentialityId ?? data.confidentialityLevel ?? null;
    const confidentialityId = await resolveConfidentialityIdWithDefault(confidentialityInput);

    const documentTypeId = data.documentTypeId
      ? typeof data.documentTypeId === 'string'
        ? parseInt(data.documentTypeId, 10)
        : data.documentTypeId
      : undefined;

    const documentBookId = data.documentBookId
      ? typeof data.documentBookId === 'string'
        ? parseInt(data.documentBookId, 10)
        : data.documentBookId
      : undefined;

    // Fetch document kind name for title if documentTypeId is provided
    let documentKindName = '';
    if (documentTypeId) {
      const typeDoc = await prisma.documentKind.findUnique({ where: { id: documentTypeId }, select: { name: true } });
      if (typeDoc) documentKindName = typeDoc.name;
    }

    const title = data.summary
      ? `${documentKindName} ${data.summary}`.trim()
      : data.issuer || incoming.document.title;

    try {
      await prisma.$transaction(async (tx) => {
        // Update the document with new file
        await tx.document.update({
          where: { id: incoming.documentId },
          data: {
            title,
            fileUrl,
            originalFileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            urgencyId,
            confidentialityId,
            updatedBy: userId,
          },
        });

        // Update the incoming document
        await tx.incomingDocument.update({
          where: { id },
          data: {
            issuer: data.issuer,
            documentTypeId,
            documentNumber: data.documentNumber,
            arrivalNumber: data.arrivalNumber,
            signerName: data.signerName,
            signerTitle: data.signerTitle,
            dateLetter: data.dateLetter ? parseDateOrNull(data.dateLetter) : undefined,
            dateReceived: data.dateReceived ? new Date(data.dateReceived) : undefined,
            summary: data.summary,
            pageCount: data.pageCount,
            notes: data.notes,
            processingInstructions: data.processingInstructions,
            documentBookId,
          },
        });
      });

      return this.getById(id);
    } catch (error) {
      // Transaction failed — delete the uploaded file to avoid orphaned files
      const filePath = path.join(config.uploadDir, file.filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // best-effort cleanup; log but don't throw
        }
      }
      throw error;
    }
  }

  /**
   * Create an incoming document with a file attached in a single request.
   *
   * The file is saved to disk by multer before this method is called. If the
   * Prisma transaction fails, the uploaded file is deleted to avoid orphaned
   * files on disk.
   *
   * @param file  - Multer file object from the multipart upload
   * @param data  - Document metadata (same fields as create(), but without createdBy)
   * @param userId - Authenticated user id (passed separately instead of in data)
   */
  async createWithFile(
    file: Express.Multer.File,
    data: Omit<Parameters<typeof this.create>[0], 'createdBy'>,
    userId: number,
  ) {
    const fileUrl = `/uploads/${file.filename}`;
    let resultDocId: number | null = null;

    const documentTypeId = data.documentTypeId
      ? typeof data.documentTypeId === 'string'
        ? parseInt(data.documentTypeId, 10)
        : data.documentTypeId
      : undefined;

    const documentBookId = data.documentBookId
      ? typeof data.documentBookId === 'string'
        ? parseInt(data.documentBookId, 10)
        : data.documentBookId
      : undefined;

    try {
      // Fetch document kind name for title if documentTypeId is provided
      let documentKindName = '';
      if (documentTypeId) {
        const typeDoc = await prisma.documentKind.findUnique({ where: { id: documentTypeId }, select: { name: true } });
        if (typeDoc) documentKindName = typeDoc.name;
      }

      const result = await prisma.$transaction(async (tx) => {
        const documentNumber = await documentsRepository.generateDocumentNumber('INCOMING');

        const document = await tx.document.create({
          data: {
            documentNumber,
            title: data.summary
              ? `${documentKindName} ${data.summary}`.trim()
              : data.issuer || `Văn bản đến số ${documentNumber}`,
            type: 'INCOMING',
            status: DocumentStatus.PENDING,
            fileUrl,
            originalFileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            urgencyId: data.urgency !== undefined && data.urgency !== null && data.urgency !== ''
              ? await resolveUrgencyIdWithDefault(data.urgency)
              : await resolveUrgencyIdWithDefault(null),
            confidentialityId: await resolveConfidentialityIdWithDefault(
              data.confidentialityId ?? data.confidentialityLevel ?? null,
            ),
            createdBy: userId,
          },
        });

        const incoming = await tx.incomingDocument.create({
          data: {
            documentId: document.id,
            issuer: data.issuer,
            documentTypeId,
            documentNumber: data.documentNumber,
            arrivalNumber: data.arrivalNumber,
            signerName: data.signerName,
            signerTitle: data.signerTitle,
            dateLetter: data.dateLetter ? parseDateOrNull(data.dateLetter) : undefined,
            dateReceived: new Date(data.dateReceived),
            summary: data.summary,
            pageCount: data.pageCount,
            notes: data.notes,
            processingInstructions: data.processingInstructions,
            createdByClerkId: userId,
            documentBookId,
          },
        });

        // If a document book is selected, create the book entry
        if (documentBookId && data.arrivalNumber) {
          await tx.incomingBookEntry.create({
            data: {
              documentBookId,
              incomingDocumentId: incoming.id,
              arrivalNumber: data.arrivalNumber,
              arrivalDate: new Date(data.dateReceived),
              senderSnapshot: data.issuer || '',
              documentNumberSnapshot: data.documentNumber || null,
              summarySnapshot: data.summary || '',
              registeredById: userId,
            },
          });

          // Update the document book's currentNumber
          await tx.documentBook.update({
            where: { id: documentBookId },
            data: { currentNumber: { increment: 1 } },
          });
        }

        await tx.documentProcessor.createMany({
          data: data.processorIds.map((p) => ({
            documentId: document.id,
            userId: p.userId,
            processorType: p.processorType,
          })),
        });

        // Record the initial processor assignments in history.
        if (data.processorIds.length > 0) {
          await tx.documentProcessorHistory.createMany({
            data: data.processorIds.map((p) => ({
              documentId: document.id,
              userId: p.userId,
              processorType: p.processorType as ProcessorType,
              action: 'ASSIGNED',
              actorId: userId,
            })),
          });
        }

        const workflowSteps = await tx.workflowStep.findMany({
          orderBy: { stepOrder: 'asc' },
        });
        await tx.documentWorkflow.createMany({
          data: workflowSteps.map((step: { id: number }) => ({
            documentId: document.id,
            workflowStepId: step.id,
            status: WorkflowStatus.PENDING,
          })),
        });

        return { documentId: document.id, incomingId: incoming.id };
      });

      resultDocId = result.documentId;

      // Kick off OCR asynchronously so we don't block the create response.
      // The HTTP client does not need to wait for the result; the clerk sees
      // the extracted fields on the next page load.
      const filePath = path.join(config.uploadDir, file.filename);
      this.persistOcrAsync(result.documentId, filePath, file.mimetype)
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[ocr] background ocr failed', err);
        });

      return this.getById(result.incomingId);
    } catch (error) {
      const conflict = (error as { code?: string }).code === 'P2002';
      if (conflict) {
        throw new ConflictError('Mã văn bản đã tồn tại, vui lòng thử lại');
      }
      // Transaction failed — delete the uploaded file to avoid orphaned files
      const filePath = path.join(config.uploadDir, file.filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // best-effort cleanup; log but don't throw
        }
      }
      throw error;
    } finally {
      // nothing — placeholder to keep lint happy
      void resultDocId;
    }
  }

  /**
   * Persist OCR result after the document is committed. Runs in the
   * background so the create response can return immediately. Marks the
   * row PROCESSING while in flight, COMPLETED on success, FAILED on error.
   */
  private async persistOcrAsync(
    documentId: number,
    filePath: string,
    mimeType: string
  ): Promise<void> {
    try {
      await prisma.document.update({
        where: { id: documentId },
        data: { ocrStatus: OcrStatus.PROCESSING },
      });

      if (!fs.existsSync(filePath)) {
        await prisma.document.update({
          where: { id: documentId },
          data: { ocrStatus: OcrStatus.FAILED },
        });
        return;
      }

      const buffer = await fs.promises.readFile(filePath);
      // Lazy-import the OCR service to avoid loading Tesseract.js when
      // running unit tests that don't exercise OCR.
      const { performOcr } = await import('../../shared/services/ocr.service');
      const result = await performOcr(buffer, mimeType);
      const text = (result.text ?? '').toString();

      await prisma.document.update({
        where: { id: documentId },
        data: {
          ocrText: text,
          ocrStatus: text.trim() ? OcrStatus.COMPLETED : OcrStatus.FAILED,
        },
      });
    } catch (error) {
      try {
        await prisma.document.update({
          where: { id: documentId },
          data: { ocrStatus: OcrStatus.FAILED },
        });
      } catch {
        // ignore — we cannot recover from a failed failure update
      }
      // eslint-disable-next-line no-console
      console.warn('[ocr] failed', error);
    }
  }

  async updateStatus(id: number, status: string, userId: number, notes?: string) {
    const incoming = await incomingDocumentsRepository.findById(id);

    const allowedNextStatuses = new Set<DocumentStatus>([
      DocumentStatus.PENDING,
      DocumentStatus.IN_PROGRESS,
      DocumentStatus.RETURNED,
      DocumentStatus.COMPLETED,
      DocumentStatus.REJECTED,
      DocumentStatus.CANCELLED,
    ]);
    if (!allowedNextStatuses.has(status as DocumentStatus)) {
      throw new BadRequestError('Trạng thái không hợp lệ');
    }

    await prisma.document.update({
      where: { id: incoming.documentId },
      data: { status: status as DocumentStatus },
    });

    await logSystemAction({
      userId,
      action: 'INCOMING_DOCUMENT_STATUS_OVERRIDE',
      entityType: 'IncomingDocument',
      entityId: id,
      details: notes || `Status set to ${status}`,
    });

    return this.getById(id);
  }

  async updateWorkflowStep(
    id: number,
    workflowId: number,
    stepStatus: string,
    userId: number,
    userRoles: string[],
    notes?: string
  ) {
    const incoming = await incomingDocumentsRepository.findById(id);

    // Guard rails: caller must have access to the document AND the role
    // required to act on the step's stage.
    await checkIncomingDocumentAccess(id, userId, userRoles);
    await checkWorkflowStepAccess(workflowId, userRoles);

    const workflow = await prisma.documentWorkflow.findUnique({ where: { id: workflowId } });
    if (!workflow) throw new NotFoundError('Không tìm thấy bước xử lý');

    // Repeat-call guard: cannot re-act on a terminal step.
    if (
      workflow.status === WorkflowStatus.COMPLETED ||
      workflow.status === WorkflowStatus.CANCELLED ||
      workflow.status === WorkflowStatus.REJECTED
    ) {
      throw new ConflictError('Bước xử lý này đã được hoàn tất');
    }

    // The SKIPPED option was removed — only APPROVED and REJECTED are
    // accepted at this endpoint.
    const stepStatusEnum = stepStatus as 'APPROVED' | 'REJECTED';
    if (stepStatusEnum !== 'APPROVED' && stepStatusEnum !== 'REJECTED') {
      throw new BadRequestError('Trạng thái bước xử lý không hợp lệ');
    }
    const stage = resolveStageFromRoleName(
      (await prisma.workflowStep.findUnique({ where: { id: workflow.workflowStepId } }))
        ?.roleName ?? null
    );

    await prisma.$transaction(async (tx) => {
      await tx.documentWorkflow.update({
        where: { id: workflowId },
        data: {
          status:
            stepStatusEnum === 'REJECTED'
              ? WorkflowStatus.REJECTED
              : WorkflowStatus.COMPLETED,
          notes: notes || undefined,
          completedAt: new Date(),
          userId,
        },
      });

      if (stepStatusEnum === 'REJECTED') {
        await tx.document.update({
          where: { id: incoming.documentId },
          data: { status: DocumentStatus.REJECTED },
        });
      } else {
        const allWorkflows = await tx.documentWorkflow.findMany({
          where: { documentId: incoming.documentId },
          orderBy: { workflowStep: { stepOrder: 'asc' } },
        });
        const allDone = allWorkflows.every(
          (w) =>
            w.id === workflowId ||
            w.status === WorkflowStatus.COMPLETED ||
            w.status === WorkflowStatus.CANCELLED ||
            w.status === WorkflowStatus.REJECTED
        );
        if (allDone) {
          await tx.document.update({
            where: { id: incoming.documentId },
            data: { status: DocumentStatus.COMPLETED },
          });
        } else {
          await tx.document.update({
            where: { id: incoming.documentId },
            data: { status: DocumentStatus.IN_PROGRESS },
          });
        }
      }
    });

    await logSystemAction({
      userId,
      action: `INCOMING_WORKFLOW_STEP_${stepStatusEnum}`,
      entityType: 'DocumentWorkflow',
      entityId: workflowId,
      details: `${stage} step updated to ${stepStatusEnum}`,
    });

    if (stepStatusEnum === 'APPROVED' || stepStatusEnum === 'REJECTED') {
      await emitNotificationToUser(
        incoming.document.createdBy ?? 0,
        `Bước xử lý ${stepStatusEnum === 'APPROVED' ? 'đã duyệt' : 'bị từ chối'}`,
        `Văn bản ${incoming.document.documentNumber} — bước đã được cập nhật`
      ).catch(() => undefined);
    }

    return this.getById(id);
  }

  /**
   * POST /incoming-documents/:id/comments — append a comment to the thread.
   * Author is the authenticated user. Access must be allowed via
   * checkIncomingDocumentAccess.
   */
  /**
   * POST /incoming-documents/:id/processors/:userId/complete — mark a PHXL
   * processor's supporting task as complete. Only the assigned PHXL user (or
   * ADMIN) can call this; XDB is read-only.
   */
  async completeProcessorTask(
    incomingId: number,
    processorUserId: number,
    actorId: number,
    actorRoles: string[],
    notes?: string
  ) {
    await checkIncomingDocumentAccess(incomingId, actorId, actorRoles);

    const incoming = await incomingDocumentsRepository.findById(incomingId);
    const isAdmin = actorRoles.includes('ADMIN');
    const isSelf = actorId === processorUserId;
    if (!isAdmin && !isSelf) {
      throw new ForbiddenError(
        'Chỉ có thể đánh dấu hoàn thành nhiệm vụ của chính bạn'
      );
    }

    const processor = incoming.document.processors.find(
      (p) => p.user.id === processorUserId
    );
    if (!processor) {
      throw new NotFoundError('Không tìm thấy người xử lý');
    }
    if (processor.processorType !== 'PHXL') {
      throw new BadRequestError(
        'Chỉ có thể đánh dấu hoàn thành cho Người phối hợp (PHXL)'
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.documentProcessor.update({
        where: { id: processor.id },
        data: {
          completedAt: new Date(),
          notes: notes ?? null,
        },
      });
      await tx.documentProcessorHistory.create({
        data: {
          documentId: incoming.documentId,
          userId: processorUserId,
          processorType: ProcessorType.PHXL,
          action: 'COMPLETED',
          actorId,
          reason: notes ?? null,
        },
      });
    });

    await logSystemAction({
      userId: actorId,
      action: 'INCOMING_PROCESSOR_COMPLETED',
      entityType: 'IncomingDocument',
      entityId: incomingId,
      details: `PHXL processor ${processorUserId} marked complete`,
    });

    return this.getById(incomingId);
  }

  // ─── SPECIALIST workflow ────────────────────────────────────────────────────
  //
  // The specialist flow mirrors the department head flow (FORWARD / FINISH /
  // RETURN) so the UI and API surface are identical for both roles. The only
  // differences are:
  //   • the step is constrained to stepOrder=3 (SPECIALIST),
  //   • the caller must be the assigned XLC (or ADMIN),
  //   • the RETURN action rolls the document back to the DEPT_HEAD step
  //     instead of back to the document clerk,
  //   • FORWARD does not accept deadline / attachments (kept simple).

  async listPendingForSpecialist(params: { page: number; limit: number; search?: string; userId: number }) {
    return incomingDocumentsRepository.findAllPendingForSpecialist(params);
  }

  async processBySpecialist(
    id: number,
    action: 'FINISH' | 'FORWARD' | 'RETURN',
    payload: {
      processorIds?: ProcessorInput[];
      processingInstructions?: string;
      reason?: string;
    },
    userId: number,
    userRoles: string[] = []
  ) {
    const incoming = await incomingDocumentsRepository.findById(id);
    const documentId = incoming.documentId;

    // Specialist stage gating — route already enforces SPECIALIST/ADMIN
    // membership; here we additionally require the caller to be the assigned
    // XLC on the document (or ADMIN).
    if (!userRoles.includes('ADMIN') && !userRoles.includes('SPECIALIST')) {
      throw new ForbiddenError(
        'Chỉ Chuyên viên hoặc Quản trị viên mới có thể xử lý văn bản ở giai đoạn này'
      );
    }
    const isXlc = incoming.document.processors.some(
      (p) => p.user.id === userId && p.processorType === 'XLC'
    );
    if (!isXlc && !userRoles.includes('ADMIN')) {
      throw new ForbiddenError('Bạn không phải là Người xử lý chính (XLC) của văn bản này');
    }

    const specialistStep = await prisma.documentWorkflow.findFirst({
      where: {
        documentId,
        workflowStep: { stepOrder: 3, roleName: 'SPECIALIST' },
      },
    });
    if (!specialistStep) {
      throw new BadRequestError('Văn bản này không có bước xử lý của Chuyên viên');
    }
    if (specialistStep.status !== 'PENDING') {
      throw new BadRequestError('Bước xử lý của Chuyên viên không ở trạng thái chờ xử lý');
    }

    await checkIncomingDocumentAccess(id, userId, userRoles);

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

      const forwardedUserIds: number[] = [];
      await prisma.$transaction(async (tx) => {
        const previous = await tx.documentProcessor.findMany({
          where: { documentId },
          select: { userId: true, processorType: true },
        });
        await tx.documentProcessor.deleteMany({ where: { documentId } });
        await tx.documentProcessor.createMany({
          data: processorIds.map((p) => ({
            documentId,
            userId: p.userId,
            processorType: p.processorType,
          })),
        });
        if (previous.length > 0) {
          await tx.documentProcessorHistory.createMany({
            data: previous.map((p) => ({
              documentId,
              userId: p.userId,
              processorType: p.processorType as ProcessorType,
              action: 'TRANSFERRED',
              actorId: userId,
            })),
          });
        }
        await tx.documentProcessorHistory.createMany({
          data: processorIds.map((p) => ({
            documentId,
            userId: p.userId,
            processorType: p.processorType as ProcessorType,
            action: 'ASSIGNED',
            actorId: userId,
          })),
        });
        forwardedUserIds.push(...processorIds.map((p) => p.userId));

        await tx.documentWorkflow.update({
          where: { id: specialistStep.id },
          data: {
            status: WorkflowStatus.COMPLETED,
            userId,
            completedAt: new Date(),
            notes:
              payload.processingInstructions ||
              'Chuyên viên chuyển xử lý',
          },
        });

        await tx.incomingDocument.update({
          where: { id },
          data: {
            processingInstructions: payload.processingInstructions || undefined,
          },
        });

        await tx.document.update({
          where: { id: documentId },
          data: { status: DocumentStatus.IN_PROGRESS },
        });
      });

      await emitNotificationToUsers(
        forwardedUserIds,
        'Văn bản được chuyển xử lý',
        `Chuyên viên đã chuyển văn bản ${incoming.document.documentNumber} cho bạn`
      );
      await logSystemAction({
        userId,
        action: 'INCOMING_FORWARDED_BY_SPECIALIST',
        entityType: 'IncomingDocument',
        entityId: id,
        details: `Forwarded to ${processorIds.length} processor(s)`,
      });
    } else if (action === 'FINISH') {
      // Mirror the head flow: complete the specialist step, cancel any
      // remaining workflow steps (e.g. DOCUMENT_CLERK / ARCHIVE rows that
      // never get acted on), and flip the document to COMPLETED. Without
      // the cancel-loop the allDone check would keep returning false
      // because the unreached steps stay PENDING forever.
      await prisma.$transaction(async (tx) => {
        await tx.documentWorkflow.update({
          where: { id: specialistStep.id },
          data: {
            status: WorkflowStatus.COMPLETED,
            userId,
            completedAt: new Date(),
            notes: payload.processingInstructions || 'Chuyên viên hoàn thành xử lý',
          },
        });

        const remaining = await tx.documentWorkflow.findMany({
          where: {
            documentId,
            id: { not: specialistStep.id },
            status: { in: [WorkflowStatus.PENDING, WorkflowStatus.IN_PROGRESS] },
          },
        });
        for (const wf of remaining) {
          await tx.documentWorkflow.update({
            where: { id: wf.id },
            data: {
              status: WorkflowStatus.CANCELLED,
              completedAt: new Date(),
              notes: 'Bỏ qua do Chuyên viên đã hoàn thành xử lý',
            },
          });
        }

        await tx.document.update({
          where: { id: documentId },
          data: { status: DocumentStatus.COMPLETED },
        });
      });
      await logSystemAction({
        userId,
        action: 'INCOMING_FINISHED_BY_SPECIALIST',
        entityType: 'IncomingDocument',
        entityId: id,
      });
      await emitNotificationToUser(
        incoming.document.createdBy ?? 0,
        'Văn bản được chuyên viên hoàn thành',
        `Văn bản ${incoming.document.documentNumber} đã hoàn thành xử lý`
      ).catch(() => undefined);
    } else if (action === 'RETURN') {
      // RETURN here means "send back to the department head" — we cancel
      // the specialist step, reopen the DEPT_HEAD step, and clear the
      // processor assignments so the head can re-forward.
      if (!payload.reason?.trim()) {
        throw new BadRequestError('Phải nhập lý do trả lại Trưởng phòng');
      }
      const previous = await prisma.documentProcessor.findMany({
        where: { documentId },
        select: { userId: true, processorType: true },
      });
      await prisma.$transaction(async (tx) => {
        await tx.documentWorkflow.update({
          where: { id: specialistStep.id },
          data: {
            status: WorkflowStatus.CANCELLED,
            userId,
            completedAt: new Date(),
            notes: payload.reason || 'Chuyên viên trả lại cho Trưởng phòng',
          },
        });

        const headStep = await tx.documentWorkflow.findFirst({
          where: {
            documentId,
            workflowStep: { stepOrder: 2, roleName: 'DEPARTMENT_HEAD' },
          },
        });

        if (headStep) {
          await tx.documentWorkflow.update({
            where: { id: headStep.id },
            data: {
              status: WorkflowStatus.PENDING,
              userId: null,
              completedAt: null,
              notes: 'Chuyên viên trả lại — đang chờ Trưởng phòng xem xét',
            },
          });
        }

        if (previous.length > 0) {
          await tx.documentProcessorHistory.createMany({
            data: previous.map((p) => ({
              documentId,
              userId: p.userId,
              processorType: p.processorType as ProcessorType,
              action: 'REMOVED',
              reason: payload.reason,
              actorId: userId,
            })),
          });
        }

        await tx.documentProcessor.deleteMany({ where: { documentId } });

        await tx.document.update({
          where: { id: documentId },
          data: { status: DocumentStatus.PENDING },
        });
      });

      // Notify department heads (anyone with the role) about the return.
      const heads = await prisma.user.findMany({
        where: { userRoles: { some: { role: { name: 'DEPARTMENT_HEAD' } } } },
        select: { id: true },
      });
      await emitNotificationToUsers(
        heads.map((h) => h.id),
        'Văn bản được trả lại Trưởng phòng',
        `Chuyên viên đã trả lại văn bản ${incoming.document.documentNumber}: ${payload.reason}`
      );
      await logSystemAction({
        userId,
        action: 'INCOMING_RETURNED_TO_HEAD',
        entityType: 'IncomingDocument',
        entityId: id,
        details: payload.reason,
      });
    } else {
      throw new BadRequestError('Hành động không hợp lệ');
    }

    return this.getById(id);
  }

  // ─── Access control ─────────────────────────────────────────────────────────
  // Note: shared `checkIncomingDocumentAccess` lives in
  // `src/shared/access/document-access.ts`. We keep the local alias to
  // preserve call sites that expected `this.checkDocumentAccess`.
  private async checkDocumentAccess(
    incomingId: number,
    userId: number,
    userRoles: string[]
  ): Promise<void> {
    return checkIncomingDocumentAccess(incomingId, userId, userRoles);
  }

  // Re-export of the shared helpers so any test that imports the service class
  // can use them without pulling additional files.
  static sharedAccess = {
    checkIncomingDocumentAccess,
    checkWorkflowStepAccess,
    resolveDocumentId,
    resolveStageFromRoleName,
  };

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
      by: ['documentTypeId'],
      where: baseFilter as any,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    
    // fetch document kind names
    const typeIds = byDocTypeRaw.map(r => r.documentTypeId).filter((id): id is number => id !== null);
    const typeDocs = await prisma.documentKind.findMany({
      where: { id: { in: typeIds } },
      select: { id: true, name: true },
    });
    const typeMap = new Map(typeDocs.map(d => [d.id, d.name]));

    const byDocumentType = byDocTypeRaw.map((r) => ({
      documentType: r.documentTypeId ? (typeMap.get(r.documentTypeId) ?? 'Chưa phân loại') : 'Chưa phân loại',
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
