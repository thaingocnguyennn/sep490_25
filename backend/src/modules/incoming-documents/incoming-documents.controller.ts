import { Request, Response, NextFunction } from 'express';
import { incomingDocumentsService } from './incoming-documents.service';
import { successResponse } from '../../shared/utils/response.util';
import { documentRegistrationService } from '../document-books/document-registration.service';

export class IncomingDocumentsController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = parseInt(req.params.id as string, 10);
      const { documentBookId, customArrivalDate } = req.body;
      const result = await documentRegistrationService.registerIncomingDocument(
        idParam,
        documentBookId,
        req.user!.userId,
        customArrivalDate ? new Date(customArrivalDate) : undefined
      );
      res.status(200).json(successResponse(result, 'Đăng ký văn bản đến thành công'));
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;
      const status = req.query.status as string;
      const documentTypeIdParam = req.query.documentTypeId as string | undefined;
      const parsedDocumentTypeId = documentTypeIdParam ? parseInt(documentTypeIdParam, 10) : NaN;
      const documentTypeId = Number.isInteger(parsedDocumentTypeId) && parsedDocumentTypeId > 0
        ? parsedDocumentTypeId
        : undefined;
      const urgency = (req.query.urgencyId ?? req.query.urgency) as string | undefined;

      const result = await incomingDocumentsService.list({
        page,
        limit,
        search,
        status,
        documentTypeId,
        urgency,
        userId: req.user!.userId,
        userRoles: req.user!.roles,
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
          'Danh sách văn bản đến'
        )
      );
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = req.params.id as string;
      const roles: string[] = req.user!.roles ?? [];
      const incoming = await incomingDocumentsService.getById(
        parseInt(idParam),
        req.user!.userId,
        roles
      );
      res.status(200).json(successResponse(incoming, 'Chi tiết văn bản đến'));
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const incoming = await incomingDocumentsService.create({
        ...req.body,
        createdBy: req.user!.userId,
      });
      res.status(201).json(successResponse(incoming, 'Văn bản đến đã được tạo và chuyển xử lý'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /incoming-documents/draft
   * Save an incoming document as a draft without requiring all fields or processors.
   * The document is saved with DRAFT status and can be edited/submitted later.
   */
  async saveDraft(req: Request, res: Response, next: NextFunction) {
    try {
      const draft = await incomingDocumentsService.saveDraft({
        ...req.body,
        createdBy: req.user!.userId,
      });
      res.status(201).json(successResponse(draft, 'Đã lưu bản nháp thành công'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /incoming-documents/draft/with-file
   * Save an incoming document as a draft with a file attached.
   * The file is persisted to disk; if the database transaction fails, the
   * uploaded file is cleaned up to avoid orphaned files on disk.
   *
   * The multer route handler uploads both `file` (the main PDF, used for OCR)
   * and `attachments` (additional "Tệp đính kèm" files).
   */
  async saveDraftWithFile(req: Request, res: Response, next: NextFunction) {
    try {
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;
      const file = files?.file?.[0];
      if (!file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }

      const attachmentFiles = files?.attachments ?? [];

      const result = await incomingDocumentsService.saveDraftWithFile(
        file,
        attachmentFiles,
        { ...req.body },
        req.user!.userId,
      );
      res.status(201).json(successResponse(result, 'Đã lưu bản nháp với tệp đính kèm'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /incoming-documents/:id/draft
   * Update an existing draft document.
   */
  async updateDraft(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = parseInt(req.params.id as string, 10);
      const result = await incomingDocumentsService.updateDraft(idParam, {
        ...req.body,
        updatedBy: req.user!.userId,
      });
      res.status(200).json(successResponse(result, 'Đã cập nhật bản nháp'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /incoming-documents/:id/draft/with-file
   * Update an existing draft document with a new file.
   *
   * The multer route handler uploads both `file` (the main PDF, used for OCR)
   * and `attachments` (additional "Tệp đính kèm" files).
   */
  async updateDraftWithFile(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = parseInt(req.params.id as string, 10);
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;
      const file = files?.file?.[0];
      if (!file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }

      const attachmentFiles = files?.attachments ?? [];

      const result = await incomingDocumentsService.updateDraftWithFile(
        idParam,
        file,
        attachmentFiles,
        { ...req.body },
        req.user!.userId,
      );
      res.status(200).json(successResponse(result, 'Đã cập nhật bản nháp với tệp đính kèm'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /incoming-documents/with-file
   * Accepts a file (PDF/image) and document metadata in a single multipart request.
   * The file is persisted to disk; if the database transaction fails, the
   * uploaded file is cleaned up to avoid orphaned files on disk.
   *
   * JSON-stringified fields (processorIds, attachments) are parsed by the
   * parseJsonFields middleware before this method is called.
   *
   * The multer route handler uploads both `file` (the main PDF, used for OCR)
   * and `attachments` (additional "Tệp đính kèm" files) — both end up on
   * disk before this handler runs.
   */
  async createWithFile(req: Request, res: Response, next: NextFunction) {
    try {
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;
      const file = files?.file?.[0];
      if (!file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }

      const attachmentFiles = files?.attachments ?? [];

      const result = await incomingDocumentsService.createWithFile(
        file,
        attachmentFiles,
        { ...req.body },
        req.user!.userId,
      );
      res.status(201).json(successResponse(result, 'Văn bản đến đã được tạo với tệp đính kèm'));
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = req.params.id as string;
      const { status, notes } = req.body;
      // Only ADMIN may reach this endpoint (route-level guard). We still
      // verify the document exists before mutating.
      const incoming = await incomingDocumentsService.updateStatus(
        parseInt(idParam),
        status,
        req.user!.userId,
        notes
      );
      res.status(200).json(successResponse(incoming, 'Cập nhật trạng thái thành công'));
    } catch (error) {
      next(error);
    }
  }

  async updateWorkflowStep(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = req.params.id as string;
      const workflowIdParam = req.params.workflowId as string;
      const { stepStatus, notes } = req.body;
      const incoming = await incomingDocumentsService.updateWorkflowStep(
        parseInt(idParam),
        parseInt(workflowIdParam),
        stepStatus,
        req.user!.userId,
        req.user!.roles ?? [],
        notes
      );
      res.status(200).json(successResponse(incoming, 'Cập nhật bước xử lý thành công'));
    } catch (error) {
      next(error);
    }
  }

  async completeProcessorTask(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = req.params.id as string;
      const userIdParam = req.params.userId as string;
      const { notes } = req.body as { notes?: string };
      const incoming = await incomingDocumentsService.completeProcessorTask(
        parseInt(idParam),
        parseInt(userIdParam),
        req.user!.userId,
        req.user!.roles ?? [],
        notes
      );
      res.status(200).json(successResponse(incoming, 'Đã hoàn thành nhiệm vụ'));
    } catch (error) {
      next(error);
    }
  }

  async listPendingForHead(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string | undefined;

      const result = await incomingDocumentsService.listPendingForHead({ page, limit, search });
      res.status(200).json(
        successResponse(
          {
            items: result.items,
            total: result.total,
            page,
            limit,
            totalPages: Math.ceil(result.total / limit),
          },
          'Danh sách văn bản chờ Trưởng phòng xử lý'
        )
      );
    } catch (error) {
      next(error);
    }
  }

  async listPendingForSpecialist(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string | undefined;

      const result = await incomingDocumentsService.listPendingForSpecialist({
        page,
        limit,
        search,
        userId: req.user!.userId,
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
          'Danh sách văn bản chờ Chuyên viên xử lý'
        )
      );
    } catch (error) {
      next(error);
    }
  }

  async processBySpecialist(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = req.params.id as string;
      const incoming = await incomingDocumentsService.processBySpecialist(
        parseInt(idParam),
        req.body.action,
        req.body,
        req.user!.userId,
        req.user!.roles ?? []
      );
      res.status(200).json(successResponse(incoming, 'Xử lý văn bản bởi Chuyên viên thành công'));
    } catch (error) {
      next(error);
    }
  }

  async processByHead(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = req.params.id as string;
      const incoming = await incomingDocumentsService.processByHead(
        parseInt(idParam),
        req.body.action,
        req.body,
        req.user!.userId,
        req.user!.roles ?? []
      );
      res.status(200).json(successResponse(incoming, 'Xử lý văn bản thành công'));
    } catch (error) {
      next(error);
    }
  }

  // ─── Thống kê Văn bản đến (thêm mới, không sửa code cũ) ──────────────────
  async getStatistics(req: Request, res: Response, next: NextFunction) {
    try {
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo   = req.query.dateTo   as string | undefined;

      // Phân quyền: SPECIALIST chỉ xem phòng ban mình
      let departmentId: number | undefined;
      const roles: string[] = req.user!.roles ?? [];
      const isSpecialistOnly =
        roles.includes('SPECIALIST') &&
        !roles.includes('ADMIN') &&
        !roles.includes('DEPARTMENT_HEAD') &&
        !roles.includes('DOCUMENT_CLERK');
      if (isSpecialistOnly) {
        departmentId = req.user!.departmentId || -1;
      }

      const data = await incomingDocumentsService.getStatistics({
        dateFrom,
        dateTo,
        departmentId,
      });
      res.status(200).json(successResponse(data, 'Lấy thống kê văn bản đến thành công'));
    } catch (error) {
      next(error);
    }
  }
}

export const incomingDocumentsController = new IncomingDocumentsController();
