import { Request, Response, NextFunction } from 'express';
import { outgoingDocumentsService } from './outgoing-documents.service';
import { successResponse } from '../../shared/utils/response.util';
import { UnauthorizedError } from '../../shared/exceptions/app-error';
import prisma from '../../config/database';

async function buildCurrentUserContext(user: any) {
  if (!user) return undefined;
  let departmentName = null;
  if (user.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: user.departmentId } });
    departmentName = dept?.name;
  }
  return {
    id: user.userId,
    roles: user.roles,
    departmentId: user.departmentId,
    departmentName,
  };
}
import { documentRegistrationService } from '../document-books/document-registration.service';

export class OutgoingDocumentsController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = parseInt(req.params.id as string, 10);
      const { documentBookId, customIssuanceDate } = req.body;
      const result = await documentRegistrationService.registerOutgoingDocument(
        idParam,
        documentBookId,
        req.user!.userId,
        customIssuanceDate ? new Date(customIssuanceDate) : undefined
      );
      res.status(200).json(successResponse(result, 'Cấp số văn bản đi thành công'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /outgoing-documents
   * Lấy danh sách văn bản đi với phân trang và filter.
   */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;
      const urgency = (req.query.urgencyId ?? req.query.urgency) as string | undefined;
      const documentType = req.query.documentType as string | undefined;
      const documentTypeIdParam = req.query.documentTypeId as string | undefined;
      const parsedDocumentTypeId = documentTypeIdParam ? parseInt(documentTypeIdParam, 10) : NaN;
      const documentTypeId = Number.isInteger(parsedDocumentTypeId) && parsedDocumentTypeId > 0
        ? parsedDocumentTypeId
        : undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const confidentialityLevel = req.query.confidentialityLevel as string | undefined;
      const departmentId = req.query.departmentId ? parseInt(req.query.departmentId as string) : undefined;

      const currentUser = await buildCurrentUserContext(req.user);

      const result = await outgoingDocumentsService.list({ 
        page, limit, search, status, urgency, 
        documentType, documentTypeId, dateFrom, dateTo, confidentialityLevel, departmentId, currentUser 
      });

      res.status(200).json(
        successResponse(
          {
            items: result.items,
            total: result.total,
            page,
            limit,
            totalPages: Math.ceil(result.total / limit),
          },
          'Danh sách văn bản đi',
        ),
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /outgoing-documents/export?format=excel|pdf
   * Xuất danh sách văn bản đi ra Excel/PDF.
   */
  async exportList(req: Request, res: Response, next: NextFunction) {
    try {
      const format = (req.query.format as string) || 'excel';
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;
      const urgency = (req.query.urgencyId ?? req.query.urgency) as string | undefined;
      const documentType = req.query.documentType as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const confidentialityLevel = req.query.confidentialityLevel as string | undefined;
      let departmentId = req.query.departmentId ? parseInt(req.query.departmentId as string) : undefined;

      const currentUser = await buildCurrentUserContext(req.user);
      const params = { search, status, urgency, documentType, dateFrom, dateTo, confidentialityLevel, departmentId, currentUser };

      if (format === 'pdf') {
        const buffer = await outgoingDocumentsService.exportToPdf(params);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="outgoing_documents.pdf"');
        res.send(buffer);
      } else {
        const buffer = await outgoingDocumentsService.exportToExcel(params);
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', 'attachment; filename="outgoing_documents.xlsx"');
        res.send(buffer);
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /outgoing-documents/trash
   * Lấy danh sách văn bản đi trong thùng rác.
   */
  async listTrashed(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string | undefined;

      const currentUser = await buildCurrentUserContext(req.user);

      const result = await outgoingDocumentsService.listTrashed({ page, limit, search, currentUser });

      res.status(200).json(
        successResponse(
          {
            items: result.items,
            total: result.total,
            page,
            limit,
            totalPages: Math.ceil(result.total / limit),
          },
          'Danh sách văn bản đi trong thùng rác',
        ),
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /outgoing-documents/:id
   * Lấy chi tiết văn bản đi.
   */
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const currentUser = await buildCurrentUserContext(req.user);
      const result = await outgoingDocumentsService.getById(id, currentUser);
      res.status(200).json(successResponse(result, 'Chi tiết văn bản đi'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /outgoing-documents
   * Tạo văn bản đi mới (chức năng #1).
   */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await outgoingDocumentsService.create({
        ...req.body,
        createdBy: req.user!.userId,
      });
      res.status(201).json(successResponse(result, 'Tạo văn bản đi thành công'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /outgoing-documents/:id/upload
   * Upload file nháp (chức năng #2).
   */
  async uploadFile(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const file = req.file;

      if (!file) {
        res.status(400).json({ success: false, message: 'Không có file nào được upload' });
        return;
      }

      const result = await outgoingDocumentsService.uploadDraftFile(
        id,
        file,
        req.user!.userId,
      );

      res.status(200).json(successResponse(result, 'Upload file nháp thành công'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /outgoing-documents/:id/ocr
   * Chạy OCR để trích xuất thông tin (chức năng #3).
   */
  async runOcr(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const result = await outgoingDocumentsService.runOcr(id);
      res.status(200).json(successResponse(result, 'Trích xuất OCR thành công'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /outgoing-documents/:id/verify-signature
   * Kiểm tra chữ ký số của tệp đính kèm.
   */
  async verifySignature(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const result = await outgoingDocumentsService.verifySignature(id);
      res.status(200).json(successResponse(result, 'Kiểm tra chữ ký số thành công'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /outgoing-documents/:id/signatures
   * UC-70: Lấy danh sách chữ ký số trong file PDF.
   */
  async getSignatures(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const currentUser = await buildCurrentUserContext(req.user);
      const result = await outgoingDocumentsService.getSignatures(id, currentUser!);
      res.status(200).json(successResponse(result, 'Lấy danh sách chữ ký số thành công'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /outgoing-documents/:id/signatures/:signatureIndex
   * UC-72: Lấy chi tiết một chữ ký theo index.
   */
  async getSignatureDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const signatureIndex = parseInt(req.params.signatureIndex as string);

      if (isNaN(signatureIndex) || signatureIndex < 0) {
        res.status(400).json({
          success: false,
          message: 'INVALID_SIGNATURE_INDEX: signatureIndex phải là số nguyên không âm.',
        });
        return;
      }

      const currentUser = await buildCurrentUserContext(req.user);
      const result = await outgoingDocumentsService.getSignatureDetail(
        id,
        signatureIndex,
        currentUser!,
      );
      res.status(200).json(successResponse(result, 'Chi tiết chữ ký số'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /outgoing-documents/:id/metadata
   * Cập nhật metadata văn bản đi (chức năng #4).
   */
  async updateMetadata(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const result = await outgoingDocumentsService.updateMetadata(
        id,
        req.body,
        req.user!.userId,
      );
      res.status(200).json(successResponse(result, 'Cập nhật thông tin văn bản đi thành công'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /outgoing-documents/:id/status
   * Cập nhật trạng thái workflow (dùng cho nhiều chức năng: submit, approve, return, issue, recall, trash...).
   */
  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const { status, returnReason, recallReason, dispatchNumber, issuanceDate, sentDate, recipientName, recipientAddress, urgency, confidentialityLevel, assignedApproverId, assignedClerkId } = req.body;

      const result = await outgoingDocumentsService.updateStatus(
        id,
        status as string,
        req.user!.userId,
        { returnReason, recallReason, dispatchNumber, issuanceDate, sentDate, recipientName, recipientAddress, urgency, confidentialityLevel, assignedApproverId: assignedApproverId ? Number(assignedApproverId) : undefined, assignedClerkId: assignedClerkId ? Number(assignedClerkId) : undefined },
      );

      res.status(200).json(successResponse(result, 'Cập nhật trạng thái thành công'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /outgoing-documents/:id
   * Xóa mềm văn bản đi (chức năng #5 - Delete).
   */
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const result = await outgoingDocumentsService.softDelete(id, req.user!.userId);
      res.status(200).json(successResponse(result, 'Đã đưa văn bản đi vào thùng rác'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /outgoing-documents/:id/send-email
   * Gửi văn bản đi qua email cho danh sách người nhận.
   */
  async sendEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const recipients: string[] = req.body.recipients;

      const result = await outgoingDocumentsService.sendDocumentByEmail(
        id,
        recipients,
        req.user!.userId,
      );
      res.status(200).json(successResponse(result, `Đã gửi email thành công cho ${result.sentCount} người nhận`));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /outgoing-documents/statistics
   * Trả về số liệu thống kê văn bản đi.
   * Query params: dateFrom, dateTo, departmentId
   */
  async getStatistics(req: Request, res: Response, next: NextFunction) {
    try {
      const dateFrom    = req.query.dateFrom    as string | undefined;
      const dateTo      = req.query.dateTo      as string | undefined;
      let departmentId = req.query.departmentId
        ? parseInt(req.query.departmentId as string)
        : undefined;

      const currentUser = await buildCurrentUserContext(req.user);

      const data = await outgoingDocumentsService.getStatistics({
        dateFrom,
        dateTo,
        departmentId,
        currentUser,
      });

      res.status(200).json(successResponse(data, 'Lấy thống kê văn bản đi thành công'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /outgoing-documents/unprocessed-count
   * Lấy số lượng văn bản đi chưa xử lý (Lãnh đạo chưa duyệt, Văn thư chưa vào sổ)
   */
  async getUnprocessedCount(req: Request, res: Response, next: NextFunction) {
    try {
      const currentUser = await buildCurrentUserContext(req.user);
      if (!currentUser) {
        return res.status(200).json(successResponse({ count: 0 }));
      }
      const data = await outgoingDocumentsService.getUnprocessedCount(currentUser);
      res.status(200).json(successResponse(data, 'Lấy số lượng văn bản đi chưa xử lý thành công'));
    } catch (error) {
      next(error);
    }
  }
}

export const outgoingDocumentsController = new OutgoingDocumentsController();
