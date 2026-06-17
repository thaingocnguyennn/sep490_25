import { Request, Response, NextFunction } from 'express';
import { incomingDocumentsService } from './incoming-documents.service';
import { successResponse } from '../../shared/utils/response.util';

export class IncomingDocumentsController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;
      const status = req.query.status as string;
      const priority = req.query.priority as string;

      const result = await incomingDocumentsService.list({ page, limit, search, status, priority });
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
      const incoming = await incomingDocumentsService.getById(parseInt(idParam));
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
}

export const incomingDocumentsController = new IncomingDocumentsController();
