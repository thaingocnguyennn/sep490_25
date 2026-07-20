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
      const urgency = (req.query.urgencyId ?? req.query.urgency) as string | undefined;

      const result = await incomingDocumentsService.list({
        page,
        limit,
        search,
        status,
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
   * POST /incoming-documents/with-file
   * Accepts a file (PDF/image) and document metadata in a single multipart request.
   * The file is persisted to disk; if the database transaction fails, the
   * uploaded file is cleaned up to avoid orphaned files on disk.
   *
   * JSON-stringified fields (processorIds, attachments) are parsed by the
   * parseJsonFields middleware before this method is called.
   */
  async createWithFile(req: Request, res: Response, next: NextFunction) {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }

      const result = await incomingDocumentsService.createWithFile(
        file,
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
        notes
      );
      res.status(200).json(successResponse(incoming, 'Cập nhật bước xử lý thành công'));
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
        req.user!.userId
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
        req.user!.userId
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
