import { default as prisma } from '../../config/database';
import { outgoingDocumentsRepository } from './outgoing-documents.repository';
import { documentsRepository } from '../documents/documents.repository';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../shared/exceptions/app-error';
import { performOcr, extractFields } from '../../shared/services/ocr.service';
import { sendEmail } from '../../shared/services/email.service';
import { checkPdfSignature, extractSignaturesFromFile, isSupportedSignatureFile, getPdfSignatureDetail, buildSignatureSummary, buildVisualMarks } from '../../shared/utils/pdf-signature.util';
import { DocumentStatus } from '@prisma/client';
import { resolveConfidentialityIdWithDefault } from '../../shared/utils/confidentiality';
import { resolveUrgencyIdWithDefault } from '../../shared/utils/urgency';
import fs from 'fs';
import path from 'path';
import { config } from '../../config';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

// ─── Status-transition table ─────────────────────────────────────────────────

/**
 * Valid status transitions for outgoing documents.
 * Dùng để kiểm soát workflow nghiêm ngặt.
 *
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
    currentUser?: {
      id: number;
      roles: string[];
      departmentId?: number | null;
      departmentName?: string | null;
    };
  }) {
    return outgoingDocumentsRepository.findAll(params);
  }

  /**
   * Lấy danh sách văn bản đi trong thùng rác.
   */
  async listTrashed(params: {
    page: number;
    limit: number;
    search?: string;
    currentUser?: {
      id: number;
      roles: string[];
      departmentId?: number | null;
      departmentName?: string | null;
    };
  }) {
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
    documentTypeId?: number;
    /** ID lĩnh vực văn bản (DocumentCategory) - chỉ chấp nhận lĩnh vực ACTIVE */
    documentCategoryId?: number;
    recipientName?: string;
    recipientAddress?: string;
    recipientEmail?: string;
    notes?: string;
    createdBy: number;
    relatedIncomingDocumentId?: number;
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
          urgencyId,
          confidentialityId: await resolveConfidentialityIdWithDefault(data.confidentialityLevel),
          departmentId: data.departmentId,
          documentTypeId: data.documentTypeId,
          // Lĩnh vực văn bản (chỉ nhận ID hợp lệ, validation đã kiểm tra ACTIVE ở controller)
          categoryId: data.documentCategoryId,
          notes: data.notes,
          createdBy: data.createdBy,
        },
      });

      // Tạo bản ghi OutgoingDocument chi tiết
      const outgoing = await tx.outgoingDocument.create({
        data: {
          documentId: document.id,
          recipientName: data.recipientName,
          recipientAddress: data.recipientAddress,
          recipientEmail: data.recipientEmail,
          relatedIncomingDocumentId: data.relatedIncomingDocumentId,
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
      // Pass real per-page layout (bounding boxes for each line/word)
      // to the field extractor. extractFieldsFromOcrText() collapses
      // everything into a synthetic single-page and would cause the
      // layout-aware extractors to return undefined for every field
      // except pageCount.
      //
      // Combined embedded-text + OCR mode (July 2026): issuer /
      // documentType / summary route through the embedded-text
      // pages, while documentNumber / dateLetter stay on the OCR
      // pages for highest digit accuracy.
      const extractedFields = extractFields(ocrResult.pages, 'OUTGOING', {
        sources: {
          embeddedPages: ocrResult.embeddedPages,
          ocrPages: ocrResult.ocrPages,
        },
      });

      // Lưu kết quả OCR vào database
      await prisma.document.update({
        where: { id: outgoing.documentId },
        data: {
          ocrText: ocrResult.text,
          ocrStatus: 'COMPLETED',
        },
      });

      return {
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
   * Kiểm tra xem văn bản đã đính kèm có chứa chữ ký số hay không và tính toàn vẹn của nó.
   */
  async verifySignature(id: number) {
    const outgoing = await outgoingDocumentsRepository.findById(id);

    if (!outgoing.document.fileUrl) {
      throw new BadRequestError('Văn bản chưa có file đính kèm để kiểm tra chữ ký số.');
    }

    const filename = path.basename(outgoing.document.fileUrl);
    const filePath = path.join(config.uploadDir, filename);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('File không tồn tại trên server.');
    }

    return checkPdfSignature(filePath);
  }

  /**
   * UC-70: Lấy danh sách tất cả chữ ký số trong file PDF của văn bản đi.
   * Kiểm tra quyền truy cập, file tồn tại và định dạng PDF.
   */
  async getSignatures(
    id: number,
    currentUser: { id: number; roles: string[]; departmentId?: number | null },
  ) {
    // 1. Kiểm tra document tồn tại
    const outgoing = await outgoingDocumentsRepository.findById(id);

    // 2. Kiểm tra quyền truy cập
    const { roles } = currentUser;
    const isAdmin = roles.includes('ADMIN');
    const isClerk = roles.includes('DOCUMENT_CLERK');
    const isDeptHead = roles.includes('DEPARTMENT_HEAD');
    const isSpecialist = roles.includes('SPECIALIST');

    // Chuyên viên chỉ xem được văn bản của phòng mình
    if (!isAdmin && !isClerk && !isDeptHead && isSpecialist) {
      const docDeptId = outgoing.document.department?.id;
      if (
        docDeptId !== undefined &&
        currentUser.departmentId !== null &&
        currentUser.departmentId !== undefined &&
        docDeptId !== currentUser.departmentId
      ) {
        throw new ForbiddenError('FORBIDDEN_ACCESS: Bạn không có quyền xem chữ ký của văn bản này.');
      }
    }

    // 3. Kiểm tra file đính kèm
    if (!outgoing.document.fileUrl) {
      throw new BadRequestError('FILE_NOT_FOUND: Văn bản chưa có file đính kèm.');
    }

    const filename = path.basename(outgoing.document.fileUrl);
    const filePath = path.join(config.uploadDir, filename);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('FILE_NOT_FOUND: File không tồn tại trên server.');
    }

    // 4. Kiểm tra định dạng hỗ trợ
    const mimeType = outgoing.document.mimeType || '';
    if (!isSupportedSignatureFile(filePath, mimeType)) {
      throw new BadRequestError(
        'UNSUPPORTED_FILE_TYPE: Chỉ hỗ trợ kiểm tra chữ ký số cho file PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx).',
      );
    }

    // 5. Đọc và parse chữ ký
    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(filePath);
    } catch {
      throw new BadRequestError('CANNOT_READ_FILE: Không thể đọc file.');
    }

    let signatures;
    try {
      signatures = extractSignaturesFromFile(buffer, filePath, mimeType);
    } catch {
      throw new BadRequestError('SIGNATURE_PARSE_FAILED: Không thể phân tích cấu trúc chữ ký.');
    }

    return {
      documentId: id,
      fileName: filename,
      fileType: signatures.length > 0 ? signatures[0].fileType : (path.extname(filename).toLowerCase() === '.pdf' ? 'PDF' : 'WORD'),
      signatureCount: signatures.length,
      summary: buildSignatureSummary(signatures),
      signatures,
      visualMarks: buildVisualMarks(),
      warning: 'This result is based on digital signature structure inspection and does not confirm legal validity through a trusted CA/PKI validation process.',
    };
  }

  /**
   * UC-72: Lấy thông tin chi tiết của một chữ ký cụ thể theo index.
   */
  async getSignatureDetail(
    id: number,
    signatureIndex: number,
    currentUser: { id: number; roles: string[]; departmentId?: number | null },
  ) {
    // 1. Kiểm tra document tồn tại
    const outgoing = await outgoingDocumentsRepository.findById(id);

    // 2. Kiểm tra quyền truy cập (giống getSignatures)
    const { roles } = currentUser;
    const isAdmin = roles.includes('ADMIN');
    const isClerk = roles.includes('DOCUMENT_CLERK');
    const isDeptHead = roles.includes('DEPARTMENT_HEAD');
    const isSpecialist = roles.includes('SPECIALIST');

    if (!isAdmin && !isClerk && !isDeptHead && isSpecialist) {
      const docDeptId = outgoing.document.department?.id;
      if (
        docDeptId !== undefined &&
        currentUser.departmentId !== null &&
        currentUser.departmentId !== undefined &&
        docDeptId !== currentUser.departmentId
      ) {
        throw new ForbiddenError('FORBIDDEN_ACCESS: Bạn không có quyền xem chữ ký của văn bản này.');
      }
    }

    // 3. Kiểm tra file đính kèm
    if (!outgoing.document.fileUrl) {
      throw new BadRequestError('FILE_NOT_FOUND: Văn bản chưa có file đính kèm.');
    }

    const filename = path.basename(outgoing.document.fileUrl);
    const filePath = path.join(config.uploadDir, filename);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('FILE_NOT_FOUND: File không tồn tại trên server.');
    }

    // 4. Kiểm tra định dạng hỗ trợ
    const mimeType = outgoing.document.mimeType || '';
    if (!isSupportedSignatureFile(filePath, mimeType)) {
      throw new BadRequestError('UNSUPPORTED_FILE_TYPE: Chỉ hỗ trợ kiểm tra chữ ký số cho file PDF, Word (.docx, vv).');
    }

    // 5. Đọc file
    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(filePath);
    } catch {
      throw new BadRequestError('CANNOT_READ_FILE: Không thể đọc file.');
    }

    // 6. Lấy chi tiết chữ ký theo index
    try {
      const signatures = extractSignaturesFromFile(buffer, filePath, mimeType);
      if (signatureIndex < 0 || signatureIndex >= signatures.length) {
         throw new BadRequestError(`INVALID_SIGNATURE_INDEX: Index ${signatureIndex} không hợp lệ. File có ${signatures.length} chữ ký.`);
      }
      return signatures[signatureIndex];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.startsWith('INVALID_SIGNATURE_INDEX') || msg.startsWith('UNSUPPORTED_FILE_TYPE')) {
        throw new BadRequestError(msg);
      }
      throw new BadRequestError('SIGNATURE_PARSE_FAILED: Không thể đọc chi tiết chữ ký.');
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
      documentTypeId?: number;
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
      departmentId: data.departmentId,
      updatedBy,
    };
    if (data.confidentialityLevel !== undefined) {
      documentUpdate.confidentialityId =
        data.confidentialityLevel === null
          ? null
          : await resolveConfidentialityIdWithDefault(data.confidentialityLevel);
    }

    // Resolve urgencyId once if it was provided so we can set it on the
    // parent Document consistently.
    if (data.urgency !== undefined) {
      documentUpdate.urgencyId = data.urgency === null
        ? null
        : await resolveUrgencyIdWithDefault(data.urgency);
    }

    if (data.documentTypeId !== undefined) {
      documentUpdate.documentTypeId = data.documentTypeId;
    }
    if (data.signerName !== undefined) {
      documentUpdate.signerName = data.signerName;
    }
    if (data.signerTitle !== undefined) {
      documentUpdate.signerTitle = data.signerTitle;
    }
    if (data.notes !== undefined) {
      documentUpdate.notes = data.notes;
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
          documentNumber: data.documentNumber,
          recipientName: data.recipientName,
          recipientAddress: data.recipientAddress,
          recipientEmail: data.recipientEmail,
          pageCount: data.pageCount,
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
      assignedApproverId?: number;
      assignedClerkId?: number;
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
        if (!options?.assignedApproverId) {
          throw new BadRequestError('Vui lòng chọn người phê duyệt (assignedApproverId)');
        }
        outgoingUpdateData.assignedApproverId = options.assignedApproverId;
        outgoingUpdateData.submittedAt = now;
        outgoingUpdateData.submittedBy = userId;
        break;
      case 'APPROVED':
        if (outgoing.assignedApproverId && outgoing.assignedApproverId !== userId) {
          throw new BadRequestError('Bạn không được phân quyền để duyệt văn bản này');
        }
        if (options?.assignedClerkId) {
          outgoingUpdateData.assignedClerkId = options.assignedClerkId;
        }
        outgoingUpdateData.approvedAt = now;
        outgoingUpdateData.approvedBy = userId;
        break;
      case 'RETURNED':
        if (outgoing.assignedApproverId && outgoing.assignedApproverId !== userId) {
          throw new BadRequestError('Bạn không được phân quyền để trả lại văn bản này');
        }
        outgoingUpdateData.returnedAt = now;
        outgoingUpdateData.returnedBy = userId;
        outgoingUpdateData.returnReason = options?.returnReason;
        break;
      case 'WAITING_FOR_ISSUE': // Văn thư vào sổ
        if (outgoing.assignedClerkId && outgoing.assignedClerkId !== userId) {
          throw new BadRequestError('Bạn không được phân quyền để vào sổ văn bản này');
        }
        if (options?.dispatchNumber) outgoingUpdateData.dispatchNumber = options.dispatchNumber;
        if (options?.issuanceDate) outgoingUpdateData.issuanceDate = new Date(options.issuanceDate);
        outgoingUpdateData.forwardedAt = now;
        outgoingUpdateData.forwardedBy = userId;
        break;
      case 'ISSUED': // Văn thư phát hành
        if (outgoing.assignedClerkId && outgoing.assignedClerkId !== userId) {
          throw new BadRequestError('Bạn không được phân quyền để phát hành văn bản này');
        }
        outgoingUpdateData.issuedAt = now;
        outgoingUpdateData.issuedBy = userId;
        if (options?.sentDate) outgoingUpdateData.sentDate = new Date(options.sentDate);
        if (options?.recipientName) outgoingUpdateData.recipientName = options.recipientName;
        if (options?.recipientAddress) outgoingUpdateData.recipientAddress = options.recipientAddress;
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
          ...(newUrgencyId !== undefined && { urgencyId: newUrgencyId }),
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
   * Xóa mềm văn bản đi (chức năng #5 - Delete).
   * Chuyển trạng thái sang TRASHED.
   * Chỉ cho phép chuyên viên, văn thư hoặc trưởng phòng xóa văn bản chưa hoàn tất/hủy.
   */
  async softDelete(id: number, userId: number) {
    const outgoing = await outgoingDocumentsRepository.findById(id);
    const currentStatus = outgoing.document.status;
    const forbiddenStatuses = ['COMPLETED', 'TRASHED', 'CANCELLED'];

    if (forbiddenStatuses.includes(currentStatus)) {
      throw new BadRequestError(
        `Không thể xóa văn bản đang ở trạng thái "${currentStatus}".`,
      );
    }

    await prisma.$transaction(async (tx) => {
      // Đổi trạng thái document thành TRASHED
      await tx.document.update({
        where: { id: outgoing.documentId },
        data: {
          status: 'TRASHED',
          updatedBy: userId,
        },
      });

      // Cập nhật thông tin thùng rác trong outgoingDocument
      await tx.outgoingDocument.update({
        where: { id },
        data: {
          trashedAt: new Date(),
          trashedBy: userId,
        },
      });

      // Ghi log xóa mềm
      await tx.systemLog.create({
        data: {
          userId,
          action: 'OUTGOING_SOFT_DELETE',
          entityType: 'OutgoingDocument',
          entityId: id,
          details: `Xóa mềm (chuyển vào thùng rác) văn bản đi`,
        },
      });
    });

    return outgoingDocumentsRepository.findById(id);
  }

  /**
   * Gửi văn bản đi qua email cho một danh sách email cụ thể.
   * Chỉ cho phép gửi khi trạng thái là ISSUED.
   */
  async sendDocumentByEmail(
    id: number,
    recipients: string[], // danh sách email
    userId: number,
  ) {
    const outgoing = await outgoingDocumentsRepository.findById(id);
    const docStatus = outgoing.document.status;

    if (docStatus !== 'ISSUED') {
      throw new BadRequestError(
        `Chỉ có thể gửi email khi văn bản đã được Phát hành (ISSUED). Trạng thái hiện tại: ${docStatus}`,
      );
    }

    if (!recipients || recipients.length === 0) {
      throw new BadRequestError('Danh sách email người nhận không được để trống');
    }

    const title = outgoing.document.title;
    const docNumber = outgoing.dispatchNumber || outgoing.documentNumber || 'KHÔNG CÓ SỐ';
    const issuanceDate = outgoing.issuanceDate
      ? new Date(outgoing.issuanceDate).toLocaleDateString('vi-VN')
      : 'Chưa xác định';
    const signerName = outgoing.document.signerName || 'Chưa xác định';
    const signerTitle = outgoing.document.signerTitle || '';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 6px 6px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 20px;">&#128394; Văn bản chính thức</h1>
        </div>
        <div style="background: #f9f9f9; padding: 20px;">
          <p style="color: #333;">Kính gửi Quý đơn vị / Cá nhân,</p>
          <p style="color: #333;">Hệ thống quản lý văn bản trân trọng gửi đến Quý vị văn bản sau:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr style="background: #fff; border-bottom: 1px solid #eee;">
              <td style="padding: 10px; font-weight: bold; color: #555; width: 160px;">&#128204; Tiêu đề:</td>
              <td style="padding: 10px; color: #222;">${title}</td>
            </tr>
            <tr style="background: #f5f5f5; border-bottom: 1px solid #eee;">
              <td style="padding: 10px; font-weight: bold; color: #555;">&#128196; Số hiệu:</td>
              <td style="padding: 10px; color: #222;">${docNumber}</td>
            </tr>
            <tr style="background: #fff; border-bottom: 1px solid #eee;">
              <td style="padding: 10px; font-weight: bold; color: #555;">&#128197; Ngày ban hành:</td>
              <td style="padding: 10px; color: #222;">${issuanceDate}</td>
            </tr>
            <tr style="background: #f5f5f5;">
              <td style="padding: 10px; font-weight: bold; color: #555;">&#128100; Người ký:</td>
              <td style="padding: 10px; color: #222;">${signerName}${signerTitle ? ` &ndash; ${signerTitle}` : ''}</td>
            </tr>
          </table>
          <p style="color: #888; font-size: 13px;">Email này được gửi tự động từ Hệ thống Quản lý Văn bản. Vui lòng không trả lời email này.</p>
        </div>
      </div>
    `;

    // Tạo danh sách file đính kèm nếu có file
    const attachments: Array<{ filename: string; path: string }> = [];
    const fileUrl = outgoing.document.fileUrl;
    if (fileUrl) {
      const filePath = path.join(config.uploadDir || 'uploads', path.basename(fileUrl));
      if (fs.existsSync(filePath)) {
        attachments.push({
          filename: `${title}.${path.extname(fileUrl).slice(1) || 'pdf'}`,
          path: filePath,
        });
      }
    }

    // Gửi email
    const failedEmails: string[] = [];
    const sentEmails: string[] = [];

    for (const email of recipients) {
      try {
        await sendEmail({
          to: email,
          subject: `[Văn bản] ${title} - Số: ${docNumber}`,
          html,
          attachments,
        });
        sentEmails.push(email);
      } catch {
        failedEmails.push(email);
      }
    }

    // Ghi log
    await prisma.systemLog.create({
      data: {
        userId,
        action: 'OUTGOING_SEND_EMAIL',
        entityType: 'OutgoingDocument',
        entityId: id,
        details: `Gửi email văn bản đi. Thành công: [${sentEmails.join(', ')}]. Thất bại: [${failedEmails.join(', ')}]`,
      },
    });

    return {
      sentCount: sentEmails.length,
      failedCount: failedEmails.length,
      sentEmails,
      failedEmails,
    };
  }

  /**
   * Thống kê văn bản đi theo các chiều dữ liệu:
   *  - Tổng số văn bản đi
   *  - Phân bổ theo trạng thái (DRAFT, SUBMITTED, APPROVED, ISSUED, ...)
   *  - Phân bổ theo loại văn bản (documentType)
   *  - Phân bổ theo phòng ban soạn thảo
   *  - Xu hướng theo tháng (12 tháng gần nhất)
   *
   * @param params - Bộ lọc thời gian (dateFrom, dateTo) và phòng ban
   */
  async getStatistics(params: {
    dateFrom?: string;
    dateTo?: string;
    departmentId?: number;
    currentUser?: {
      id: number;
      roles: string[];
      departmentId?: number | null;
      departmentName?: string | null;
    };
  } = {}) {
    const { dateFrom, dateTo, departmentId, currentUser } = params;

    if (currentUser) {
      const isSpecialist = currentUser.roles.includes('SPECIALIST');
      const isDeptHead = currentUser.roles.includes('DEPARTMENT_HEAD');
      const isClerk = currentUser.roles.includes('DOCUMENT_CLERK');
      const isAdmin = currentUser.roles.includes('ADMIN');

      if (isAdmin && !isSpecialist && !isDeptHead && !isClerk) {
        return { totalCount: 0, issuedCount: 0, byStatus: [], byDocumentType: [], byDepartment: [], byMonth: [] };
      }
    }

    // ── Điều kiện chung áp dụng cho mọi truy vấn ───────────────────────────
    const baseDocumentFilter: Record<string, unknown> = {
      documentStatus: 'ACTIVE', // Chỉ đếm văn bản đang hoạt động
    };

    if (dateFrom || dateTo) {
      baseDocumentFilter.createdAt = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
      };
    }

    if (departmentId) {
      baseDocumentFilter.departmentId = departmentId;
    }

    const baseOutgoingFilter: Record<string, unknown> = {
      document: baseDocumentFilter,
    };

    // ── 1. Tổng số văn bản đi ─────────────────────────────────────────────
    const totalCount = await prisma.outgoingDocument.count({
      where: baseOutgoingFilter as any,
    });

    // ── 2. Phân bổ theo trạng thái ────────────────────────────────────────
    const rawByStatus = await prisma.outgoingDocument.groupBy({
      by: ['id'], // groupBy status thông qua document relation
      where: baseOutgoingFilter as any,
    });

    // Lấy trực tiếp từ bảng Document, join outgoing để giữ đúng phạm vi
    const byStatusRaw = await prisma.document.groupBy({
      by: ['status'],
      where: {
        ...baseDocumentFilter,
        type: 'OUTGOING',
      } as any,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const byStatus = byStatusRaw.map((row) => ({
      status: row.status as string,
      count: row._count.id,
    }));

    // ── 3. Phân bổ theo loại văn bản ──────────────────────────────────────
    const byDocumentTypeRaw = await prisma.outgoingDocument.groupBy({
      by: ['documentTypeId'],
      where: baseOutgoingFilter as any,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const documentTypeIds = byDocumentTypeRaw
      .map((row) => row.documentTypeId)
      .filter((id): id is number => id !== null);
    const documentTypeNames = await prisma.documentType.findMany({
      where: { id: { in: documentTypeIds } },
      select: { id: true, name: true },
    });
    const documentTypeNameMap = new Map(documentTypeNames.map((dt) => [dt.id, dt.name]));

    const byDocumentType = byDocumentTypeRaw.map((row) => ({
      documentType: row.documentTypeId
        ? (documentTypeNameMap.get(row.documentTypeId) ?? 'Chưa phân loại')
        : 'Chưa phân loại',
      count: (row._count as any).id ?? 0,
    }));

    // ── 4. Phân bổ theo phòng ban soạn thảo ──────────────────────────────
    const byDepartmentRaw = await prisma.document.groupBy({
      by: ['departmentId'],
      where: {
        ...baseDocumentFilter,
        type: 'OUTGOING',
        departmentId: { not: null },
      } as any,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10, // Giới hạn top 10 phòng ban
    });

    // Lấy tên phòng ban từ danh sách id
    const departmentIds = byDepartmentRaw
      .map((r) => r.departmentId)
      .filter((id): id is number => id !== null);

    const departments = await prisma.department.findMany({
      where: { id: { in: departmentIds } },
      select: { id: true, name: true },
    });

    const departmentMap = new Map(departments.map((d) => [d.id, d.name]));

    const byDepartment = byDepartmentRaw.map((row) => ({
      departmentId: row.departmentId,
      departmentName: row.departmentId ? (departmentMap.get(row.departmentId) ?? 'Không xác định') : 'Chưa gán phòng ban',
      count: row._count.id,
    }));

    // ── 5. Xu hướng theo 12 tháng gần nhất ───────────────────────────────
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const monthlyRaw = await prisma.outgoingDocument.findMany({
      where: {
        ...baseOutgoingFilter,
        createdAt: { gte: twelveMonthsAgo },
      } as any,
      select: { createdAt: true },
    });

    // Nhóm theo tháng trong JavaScript để tránh phụ thuộc DB-specific date funcs
    const monthlyMap = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(key, 0);
    }

    for (const doc of monthlyRaw) {
      const d = doc.createdAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyMap.has(key)) {
        monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1);
      }
    }

    const byMonth = Array.from(monthlyMap.entries()).map(([month, count]) => ({
      month,
      count,
    }));

    // ── 6. Số lượng đã phát hành trong kỳ ────────────────────────────────
    const issuedCount = await prisma.document.count({
      where: {
        ...baseDocumentFilter,
        status: 'ISSUED',
        type: 'OUTGOING',
      } as any,
    });

    return {
      totalCount,
      issuedCount,
      byStatus,
      byDocumentType,
      byDepartment,
      byMonth,
    };
  }

  /**
   * Export danh sách Văn bản đi ra file Excel.
   */
  async exportToExcel(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    urgency?: string;
    includeTrashed?: boolean;
    documentType?: string;
    dateFrom?: string;
    dateTo?: string;
    confidentialityLevel?: string;
    departmentId?: number;
    currentUser?: {
      id: number;
      roles: string[];
      departmentId?: number | null;
      departmentName?: string | null;
    };
  }): Promise<Buffer> {
    const listParams = { ...params, page: 1, limit: 10000 };
    const { items } = await outgoingDocumentsRepository.findAll(listParams as any);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'DMS System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Văn bản đi');

    sheet.columns = [
      { header: 'STT', key: 'index', width: 6 },
      { header: 'Số đi', key: 'dispatchNumber', width: 15 },
      { header: 'Số/Ký hiệu', key: 'documentNumber', width: 20 },
      { header: 'Nơi nhận', key: 'recipientName', width: 25 },
      { header: 'Trích yếu', key: 'title', width: 40 },
      { header: 'Người ký', key: 'signerName', width: 20 },
      { header: 'Loại VB', key: 'documentType', width: 15 },
      { header: 'Độ khẩn', key: 'urgencyName', width: 15 },
      { header: 'Ngày gửi', key: 'sentDate', width: 15 },
      { header: 'Ngày phát hành', key: 'issuedAt', width: 15 },
      { header: 'Trạng thái', key: 'status', width: 15 },
    ];

    sheet.getRow(1).font = { bold: true, size: 12 };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    items.forEach((item, index) => {
      sheet.addRow({
        index: index + 1,
        dispatchNumber: item.dispatchNumber || '—',
        documentNumber: item.document.documentNumber || '—',
        recipientName: item.recipientName || '—',
        title: item.document.title || '—',
        signerName: item.document.signerName || '—',
        documentType: item.documentTypeRef?.name || '—',
        urgencyName: item.document.urgency?.name || '—',
        sentDate: item.sentDate ? new Date(item.sentDate).toLocaleDateString('vi-VN') : '—',
        issuedAt: item.issuedAt ? new Date(item.issuedAt).toLocaleDateString('vi-VN') : '—',
        status: item.document.status,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }

  /**
   * Export danh sách Văn bản đi ra file PDF.
   */
  async exportToPdf(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    urgency?: string;
    includeTrashed?: boolean;
    documentType?: string;
    dateFrom?: string;
    dateTo?: string;
    confidentialityLevel?: string;
    departmentId?: number;
    currentUser?: {
      id: number;
      roles: string[];
      departmentId?: number | null;
      departmentName?: string | null;
    };
  }): Promise<Buffer> {
    const listParams = { ...params, page: 1, limit: 10000 };
    const { items } = await outgoingDocumentsRepository.findAll(listParams as any);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(16).text('BÁO CÁO VĂN BẢN ĐI', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Ngày xuất: ${new Date().toLocaleString('vi-VN')}`, { align: 'center' });
      doc.moveDown(1.5);

      const startX = 40;
      let y = doc.y;
      const colWidths = [30, 80, 80, 100, 250, 70, 70];
      const headers = ['STT', 'Số đi', 'Số/Ký hiệu', 'Nơi nhận', 'Trích yếu', 'Ngày gửi', 'Trạng thái'];

      doc.fontSize(9).font('Helvetica-Bold');
      headers.forEach((header, i) => {
        const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.text(header, x, y, { width: colWidths[i], align: 'left' });
      });

      y = doc.y + 4;
      doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();
      y += 6;

      doc.font('Helvetica').fontSize(8);
      items.forEach((item, index) => {
        if (y > doc.page.height - 60) {
          doc.addPage();
          y = 40;
        }

        const title = item.document.title.length > 50 ? item.document.title.substring(0, 50) + '...' : item.document.title;
        const recipient = (item.recipientName || '').length > 20 ? (item.recipientName || '').substring(0, 20) + '...' : (item.recipientName || '—');

        const row = [
          String(index + 1),
          item.dispatchNumber ? String(item.dispatchNumber) : '—',
          item.document.documentNumber || '—',
          recipient,
          title,
          item.sentDate ? new Date(item.sentDate).toLocaleDateString('vi-VN') : '—',
          item.document.status,
        ];

        row.forEach((cell, i) => {
          const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
          doc.text(cell, x, y, { width: colWidths[i], align: 'left' });
        });

        y = doc.y + 4;
      });

      doc.moveDown(2);
      doc.fontSize(8).text(`Tổng số: ${items.length} văn bản`, { align: 'right' });

      doc.end();
    });
  }
}

export const outgoingDocumentsService = new OutgoingDocumentsService();
