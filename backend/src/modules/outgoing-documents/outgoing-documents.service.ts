import { default as prisma } from '../../config/database';
import { outgoingDocumentsRepository } from './outgoing-documents.repository';
import { documentsRepository } from '../documents/documents.repository';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../shared/exceptions/app-error';
import { performOcr, extractFieldsFromOcrText } from '../../shared/services/ocr.service';
import { DocumentStatus } from '@prisma/client';
import { resolveConfidentialityIdWithDefault } from '../../shared/utils/confidentiality';
import { resolveUrgencyIdWithDefault } from '../../shared/utils/urgency';
import fs from 'fs';
import path from 'path';
import { config } from '../../config';

// ─── Helper: Map Urgency → Priority (legacy derivation) ──────────────────────

/**
 * Chuyển đổi giá trị Urgency (THUONG, KHAN, THUONG_KHAN, HOA_TOC)
 * thành Priority (NORMAL, HIGH, URGENT) để lưu vào bảng Document.
 * The Priority enum is retained as a denormalized hint for filtering and
 * the urgencyId is the new canonical source of truth.
 */
function mapUrgencyToPriority(urgency?: string | null): string | undefined {
  if (!urgency) return undefined;
  switch (urgency) {
    case 'KHAN':        return 'HIGH';
    case 'THUONG_KHAN': return 'URGENT';
    case 'THUONG_KHAU': return 'URGENT'; // legacy alias
    case 'HOA_TOC':     return 'URGENT';
    default:            return 'NORMAL'; // THUONG → NORMAL
  }
}

// ─── Kiểu chuyển đổi trạng thái hợp lệ ─────────────────────────────────────

/**
 * Định nghĩa các trạng thái kế tiếp hợp lệ từ mỗi trạng thái hiện tại.
 * Dùng để kiểm soát workflow nghiêm ngặt.
 */
/**
 * DESIGN NOTE – Register vs Issue (pending supervisor confirmation)
 * ----------------------------------------------------------------
 * Current: APPROVED → WAITING_FOR_ISSUE → ISSUED  (1 combined step)
 *
 * The Document Clerk enters dispatch number, issuance date, urgency,
 * confidentiality and recipient info all in a single "Issue" action.
 *
 * Alternative: APPROVED → WAITING_FOR_ISSUE → REGISTERED → ISSUED  (2 steps)
 *   - REGISTERED: clerk fills in the register book (vào sổ)
 *   - ISSUED:     clerk formally publishes the document (ban hành)
 *
 * If supervisor approves the 2-step approach, the following changes are needed:
 *   1. Add REGISTERED to DocumentStatus enum in schema.prisma
 *   2. Add registeredAt / registeredBy fields to OutgoingDocument
 *   3. Update VALID_TRANSITIONS below:
 *        WAITING_FOR_ISSUE: ['REGISTERED', 'TRASHED']
 *        REGISTERED:        ['ISSUED', 'TRASHED']
 *   4. Run `prisma migrate dev`
 *   5. Add "Vào sổ" button + modal in OutgoingDocumentDetailPage.tsx
 *
 * See DESIGN_NOTE.md in project root for full analysis.
 * ----------------------------------------------------------------
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED', 'TRASHED'],
  SUBMITTED: ['APPROVED', 'RETURNED', 'TRASHED'],
  RETURNED: ['SUBMITTED', 'TRASHED'],
  APPROVED: ['WAITING_FOR_ISSUE', 'TRASHED'],
  WAITING_FOR_ISSUE: ['ISSUED', 'TRASHED'],
  ISSUED: ['COMPLETED', 'RECALLED'],
  COMPLETED: [],
  RECALLED: ['DRAFT'],
  TRASHED: ['DRAFT'], // Khôi phục từ thùng rác về DRAFT
  REJECTED: ['DRAFT'],
  CANCELLED: [],
};


// ─── Service ─────────────────────────────────────────────────────────────────

export class OutgoingDocumentsService {
  /**
   * Lấy danh sách văn bản đi.
   */
  async list(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    urgency?: string;
    includeTrashed?: boolean;
    documentType?: string;
    dateFrom?: string;
    dateTo?: string;
    confidentialityLevel?: string;
    departmentId?: number;
  }) {
    return outgoingDocumentsRepository.findAll(params);
  }

  /**
   * Lấy danh sách văn bản đi trong thùng rác.
   */
  async listTrashed(params: { page: number; limit: number; search?: string }) {
    return outgoingDocumentsRepository.findTrashed(params);
  }

  /**
   * Lấy chi tiết văn bản đi theo ID.
   */
  async getById(id: number) {
    return outgoingDocumentsRepository.findById(id);
  }

  /**
   * Tạo văn bản đi mới (chức năng #1).
   * Tạo bản ghi Document + OutgoingDocument với trạng thái DRAFT.
   */
  async create(data: {
    title: string;
    description?: string;
    /** Seeded name (THUONG/KHAN/THUONG_KHAN/HOA_TOC), legacy alias, or numeric id */
    urgency?: string;
    /** Accepts a code ('A'/'B'/'C'), seeded name, numeric id, or legacy ConfidentialityLevel */
    confidentialityLevel?: string | number;
    departmentId?: number;
    documentType?: string;
    recipientName?: string;
    recipientAddress?: string;
    recipientEmail?: string;
    notes?: string;
    createdBy: number;
  }) {
    // Tự động sinh số văn bản nội bộ
    const documentNumber = await documentsRepository.generateDocumentNumber('OUTGOING');

    // Resolve urgencyId (canonical) from the request, or fall back to THUONG.
    const urgencyId = data.urgency !== undefined && data.urgency !== null && data.urgency !== ''
      ? await resolveUrgencyIdWithDefault(data.urgency)
      : await resolveUrgencyIdWithDefault(null);

    const result = await prisma.$transaction(async (tx) => {
      // Tạo bản ghi Document chính
      const document = await tx.document.create({
        data: {
          documentNumber,
          title: data.title,
          description: data.description,
          type: 'OUTGOING',
          status: DocumentStatus.DRAFT,
          // urgencyId is the new canonical source. urgencyLevel is kept as a
          // denormalized hint derived from the urgency for legacy filter code.
          urgencyId,
          urgencyLevel: mapUrgencyToPriority(data.urgency) as any || 'NORMAL',
          confidentialityId: await resolveConfidentialityIdWithDefault(data.confidentialityLevel),
          departmentId: data.departmentId,
          createdBy: data.createdBy,
        },
      });

      // Tạo bản ghi OutgoingDocument chi tiết
      const outgoing = await tx.outgoingDocument.create({
        data: {
          documentId: document.id,
          documentType: data.documentType,
          recipientName: data.recipientName,
          recipientAddress: data.recipientAddress,
          recipientEmail: data.recipientEmail,
          urgencyId,
          notes: data.notes,
        },
      });

      return { documentId: document.id, outgoingId: outgoing.id };
    });

    return outgoingDocumentsRepository.findById(result.outgoingId);
  }

  /**
   * Upload file nháp cho văn bản đi (chức năng #2).
   * Chỉ cho phép ở trạng thái DRAFT hoặc RETURNED.
   */
  async uploadDraftFile(
    id: number,
    file: Express.Multer.File,
    updatedBy: number,
  ) {
    const outgoing = await outgoingDocumentsRepository.findById(id);
    const allowedStatuses = ['DRAFT', 'RETURNED'];

    if (!allowedStatuses.includes(outgoing.document.status)) {
      throw new BadRequestError(
        `Không thể upload file ở trạng thái "${outgoing.document.status}". Chỉ cho phép: ${allowedStatuses.join(', ')}`,
      );
    }

    const fileUrl = `/uploads/${file.filename}`;

    await prisma.document.update({
      where: { id: outgoing.documentId },
      data: {
        fileUrl,
        originalFileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        updatedBy,
      },
    });

    return outgoingDocumentsRepository.findById(id);
  }

  /**
   * Chạy OCR cho văn bản đi đã upload file (chức năng #3).
   * Trả về text trích xuất và các trường đề xuất để người dùng xem xét.
   */
  async runOcr(id: number) {
    const outgoing = await outgoingDocumentsRepository.findById(id);

    if (!outgoing.document.fileUrl) {
      throw new BadRequestError('Văn bản chưa có file đính kèm. Hãy upload file trước khi chạy OCR.');
    }

    const allowedStatuses = ['DRAFT', 'RETURNED'];
    if (!allowedStatuses.includes(outgoing.document.status)) {
      throw new BadRequestError(
        `Không thể chạy OCR ở trạng thái "${outgoing.document.status}"`,
      );
    }

    // Đọc file từ disk
    const filename = path.basename(outgoing.document.fileUrl);
    const filePath = path.join(config.uploadDir, filename);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('File không tồn tại trên server. Hãy upload lại.');
    }

    const fileBuffer = fs.readFileSync(filePath);
    const mimeType = outgoing.document.mimeType || 'application/pdf';

    // Cập nhật trạng thái OCR thành PROCESSING
    await prisma.document.update({
      where: { id: outgoing.documentId },
      data: { ocrStatus: 'PROCESSING' },
    });

    try {
      const ocrResult = await performOcr(fileBuffer, mimeType);
      const extractedFields = extractFieldsFromOcrText(ocrResult.text);

      // Lưu kết quả OCR vào database
      await prisma.document.update({
        where: { id: outgoing.documentId },
        data: {
          ocrText: ocrResult.text,
          ocrStatus: 'COMPLETED',
        },
      });

      return {
        ocrText: ocrResult.text,
        confidence: ocrResult.confidence,
        extractedFields,
      };
    } catch (error) {
      await prisma.document.update({
        where: { id: outgoing.documentId },
        data: { ocrStatus: 'FAILED' },
      });
      throw error;
    }
  }

  /**
   * Cập nhật metadata văn bản đi (chức năng #4).
   * Cho phép ở trạng thái DRAFT hoặc RETURNED.
   */
  async updateMetadata(
    id: number,
    data: {
      title?: string;
      description?: string;
      urgency?: string;
      /** Accepts a code ('A'/'B'/'C'), seeded name, numeric id, legacy ConfidentialityLevel, or null to clear */
      confidentialityLevel?: string | number | null;
      departmentId?: number | null;
      documentType?: string;
      documentNumber?: string;
      signerName?: string;
      signerTitle?: string;
      recipientName?: string;
      recipientAddress?: string;
      recipientEmail?: string;
      pageCount?: number;
      notes?: string;
    },
    updatedBy: number,
  ) {
    const outgoing = await outgoingDocumentsRepository.findById(id);
    const allowedStatuses = ['DRAFT', 'RETURNED'];

    if (!allowedStatuses.includes(outgoing.document.status)) {
      throw new BadRequestError(
        `Không thể cập nhật metadata ở trạng thái "${outgoing.document.status}". Chỉ cho phép: ${allowedStatuses.join(', ')}`,
      );
    }

    const documentUpdate: Record<string, unknown> = {
      title: data.title,
      description: data.description,
      // Map Urgency → Priority trước khi lưu vào bảng Document
      ...(data.urgency !== undefined && { urgencyLevel: mapUrgencyToPriority(data.urgency) as any }),
      departmentId: data.departmentId,
      updatedBy,
    };
    if (data.confidentialityLevel !== undefined) {
      documentUpdate.confidentialityId =
        data.confidentialityLevel === null
          ? null
          : await resolveConfidentialityIdWithDefault(data.confidentialityLevel);
    }

    // Resolve urgencyId once if it was provided so we can set it on both
    // the parent Document and the child OutgoingDocument consistently.
    let outgoingUrgencyId: number | null | undefined = undefined;
    if (data.urgency !== undefined) {
      documentUpdate.urgencyId = data.urgency === null
        ? null
        : await resolveUrgencyIdWithDefault(data.urgency);
      outgoingUrgencyId = documentUpdate.urgencyId as number | null;
    }

    await prisma.$transaction(async (tx) => {
      // Cập nhật Document chính
      await tx.document.update({
        where: { id: outgoing.documentId },
        data: documentUpdate,
      });

      // Cập nhật OutgoingDocument chi tiết
      await tx.outgoingDocument.update({
        where: { id },
        data: {
          documentType: data.documentType,
          documentNumber: data.documentNumber,
          signerName: data.signerName,
          signerTitle: data.signerTitle,
          recipientName: data.recipientName,
          recipientAddress: data.recipientAddress,
          recipientEmail: data.recipientEmail,
          pageCount: data.pageCount,
          notes: data.notes,
          ...(outgoingUrgencyId !== undefined && { urgencyId: outgoingUrgencyId }),
        },
      });
    });

    return outgoingDocumentsRepository.findById(id);
  }

  /**
   * Cập nhật trạng thái văn bản đi và ghi lại lịch sử workflow.
   * Kiểm tra chuyển đổi trạng thái hợp lệ trước khi cập nhật.
   */
  async updateStatus(
    id: number,
    newStatus: string,
    userId: number,
    options?: {
      returnReason?: string;
      recallReason?: string;
      dispatchNumber?: string;
      issuanceDate?: string;
      sentDate?: string;
      recipientName?: string;
      recipientAddress?: string;
      /** Urgency name/id để cập nhật khi phát hành (THUONG, KHAN, THUONG_KHAN, HOA_TOC) */
      urgency?: string;
      /** Confidentiality name/code/id để cập nhật khi phát hành */
      confidentialityLevel?: string;
    },
  ) {
    const outgoing = await outgoingDocumentsRepository.findById(id);
    const currentStatus = outgoing.document.status;

    // Kiểm tra chuyển đổi hợp lệ
    const validNextStatuses = VALID_TRANSITIONS[currentStatus] || [];
    if (!validNextStatuses.includes(newStatus)) {
      throw new BadRequestError(
        `Không thể chuyển từ trạng thái "${currentStatus}" sang "${newStatus}". ` +
        `Các trạng thái hợp lệ: ${validNextStatuses.join(', ') || 'Không có'}`,
      );
    }

    const now = new Date();

    // Xây dựng dữ liệu cập nhật cho OutgoingDocument dựa trên trạng thái mới
    const outgoingUpdateData: Record<string, unknown> = {};

    switch (newStatus) {
      case 'SUBMITTED':
        outgoingUpdateData.submittedAt = now;
        outgoingUpdateData.submittedBy = userId;
        break;
      case 'APPROVED':
        outgoingUpdateData.approvedAt = now;
        outgoingUpdateData.approvedBy = userId;
        break;
      case 'RETURNED':
        outgoingUpdateData.returnedAt = now;
        outgoingUpdateData.returnedBy = userId;
        outgoingUpdateData.returnReason = options?.returnReason;
        break;
      case 'WAITING_FOR_ISSUE':
        outgoingUpdateData.forwardedAt = now;
        outgoingUpdateData.forwardedBy = userId;
        break;
      case 'ISSUED':
        outgoingUpdateData.issuedAt = now;
        outgoingUpdateData.issuedBy = userId;
        if (options?.dispatchNumber) outgoingUpdateData.dispatchNumber = options.dispatchNumber;
        if (options?.issuanceDate) outgoingUpdateData.issuanceDate = new Date(options.issuanceDate);
        if (options?.sentDate) outgoingUpdateData.sentDate = new Date(options.sentDate);
        if (options?.recipientName) outgoingUpdateData.recipientName = options.recipientName;
        if (options?.recipientAddress) outgoingUpdateData.recipientAddress = options.recipientAddress;
        // Cập nhật urgencyId trên OutgoingDocument nếu được cung cấp
        if (options?.urgency) {
          outgoingUpdateData.urgencyId = await resolveUrgencyIdWithDefault(options.urgency);
        }
        break;
      case 'RECALLED':
        outgoingUpdateData.recalledAt = now;
        outgoingUpdateData.recalledBy = userId;
        outgoingUpdateData.recallReason = options?.recallReason;
        break;
      case 'TRASHED':
        outgoingUpdateData.trashedAt = now;
        outgoingUpdateData.trashedBy = userId;
        break;
      case 'DRAFT':
        // Khôi phục từ RECALLED hoặc TRASHED về DRAFT — xóa các trường trạng thái
        if (currentStatus === 'TRASHED') {
          outgoingUpdateData.trashedAt = null;
          outgoingUpdateData.trashedBy = null;
        }
        break;
    }

    // Resolve confidentialityId nếu được cung cấp (dùng cho ISSUED)
    let newConfidentialityId: number | undefined;
    if (newStatus === 'ISSUED' && options?.confidentialityLevel) {
      newConfidentialityId = await resolveConfidentialityIdWithDefault(options.confidentialityLevel);
    }

    // Resolve urgencyId cho Document nếu được cung cấp (dùng cho ISSUED)
    let newUrgencyId: number | undefined;
    if (newStatus === 'ISSUED' && options?.urgency) {
      newUrgencyId = await resolveUrgencyIdWithDefault(options.urgency);
    }

    await prisma.$transaction(async (tx) => {
      // Cập nhật trạng thái Document (và urgency/confidentiality nếu được cung cấp)
      await tx.document.update({
        where: { id: outgoing.documentId },
        data: {
          status: newStatus as any,
          updatedBy: userId,
          ...(newConfidentialityId !== undefined && { confidentialityId: newConfidentialityId }),
          ...(newUrgencyId !== undefined && {
            urgencyId: newUrgencyId,
            urgencyLevel: mapUrgencyToPriority(options?.urgency) as any,
          }),
        },
      });

      // Cập nhật OutgoingDocument với thông tin workflow
      if (Object.keys(outgoingUpdateData).length > 0) {
        await tx.outgoingDocument.update({
          where: { id },
          data: outgoingUpdateData,
        });
      }

      // Ghi SystemLog
      await tx.systemLog.create({
        data: {
          userId,
          action: `OUTGOING_STATUS_CHANGE`,
          entityType: 'OutgoingDocument',
          entityId: id,
          details: `Chuyển trạng thái từ "${currentStatus}" sang "${newStatus}"${
            options?.returnReason ? `. Lý do: ${options.returnReason}` : ''
          }${options?.recallReason ? `. Lý do thu hồi: ${options.recallReason}` : ''}`,
        },
      });
    });

    return outgoingDocumentsRepository.findById(id);
  }

  /**
   * Gán Văn thư (DOCUMENT_CLERK) để xử lý văn bản đi.
   * Chỉ cho phép khi văn bản đang ở trạng thái APPROVED hoặc WAITING_FOR_ISSUE.
   * Người gán phải có role DEPARTMENT_HEAD hoặc ADMIN.
   */
  async assignClerk(id: number, clerkId: number, assignedBy: number) {
    const outgoing = await outgoingDocumentsRepository.findById(id);
    const allowedStatuses = ['APPROVED', 'WAITING_FOR_ISSUE'];

    if (!allowedStatuses.includes(outgoing.document.status)) {
      throw new BadRequestError(
        `Chỉ có thể gán Văn thư khi văn bản ở trạng thái: ${allowedStatuses.join(', ')}. ` +
        `Trạng thái hiện tại: ${outgoing.document.status}`,
      );
    }

    // Kiểm tra clerkId có tồn tại và có role DOCUMENT_CLERK không
    const clerk = await prisma.user.findUnique({
      where: { id: clerkId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!clerk) {
      throw new NotFoundError(`Không tìm thấy người dùng với ID ${clerkId}`);
    }

    const hasClerkRole = clerk.userRoles.some(
      (ur) => ur.role.name === 'DOCUMENT_CLERK',
    );

    if (!hasClerkRole) {
      throw new BadRequestError(
        `Người dùng "${clerk.fullName}" không có role DOCUMENT_CLERK. ` +
        `Chỉ có thể gán người có role Văn thư.`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.outgoingDocument.update({
        where: { id },
        data: { assignedClerkId: clerkId },
      });

      await tx.systemLog.create({
        data: {
          userId: assignedBy,
          action: 'OUTGOING_ASSIGN_CLERK',
          entityType: 'OutgoingDocument',
          entityId: id,
          details: `Gán Văn thư "${clerk.fullName}" (ID: ${clerkId}) để xử lý văn bản đi`,
        },
      });
    });

    return outgoingDocumentsRepository.findById(id);
  }
}

export const outgoingDocumentsService = new OutgoingDocumentsService();
