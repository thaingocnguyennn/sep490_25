import { Request, Response, NextFunction } from 'express';
import { DocumentCategoriesService } from './document-categories.service';
import { DocumentCategoryFilterDto } from './document-categories.types';
import { successResponse, paginatedResponse } from '../../shared/utils/response.util';

const service = new DocumentCategoriesService();

export class DocumentCategoriesController {
  // ──────────────────────────────────────────────────────────────────────────
  // GET / – Danh sách lĩnh vực văn bản (có phân trang + lọc)
  // ──────────────────────────────────────────────────────────────────────────
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filter: DocumentCategoryFilterDto = {
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        search: req.query.search as string,
        status: req.query.status as any,
        sortBy: req.query.sortBy as string,
        sortOrder: req.query.sortOrder as any,
      };

      const result = await service.findAll(filter);
      res.status(200).json(
        paginatedResponse(result.data, result.total, result.page, result.limit, 'Lấy danh sách lĩnh vực văn bản thành công'),
      );
    } catch (error) {
      next(error);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /options – Danh sách rút gọn cho dropdown
  // ──────────────────────────────────────────────────────────────────────────
  async getActiveOptions(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const options = await service.getActiveOptions();
      res.status(200).json(successResponse(options, 'Lấy danh sách lựa chọn lĩnh vực văn bản thành công'));
    } catch (error) {
      next(error);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /:id – Chi tiết một lĩnh vực
  // ──────────────────────────────────────────────────────────────────────────
  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id as string, 10);
      const category = await service.findById(id);
      res.status(200).json(successResponse(category, 'Lấy thông tin lĩnh vực văn bản thành công'));
    } catch (error) {
      next(error);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST / – Tạo mới lĩnh vực văn bản (UC-75)
  // ──────────────────────────────────────────────────────────────────────────
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const category = await service.create(req.body, userId);
      res.status(201).json(successResponse(category, 'Tạo lĩnh vực văn bản thành công'));
    } catch (error) {
      next(error);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /:id – Cập nhật lĩnh vực văn bản (UC-77)
  // ──────────────────────────────────────────────────────────────────────────
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id as string, 10);
      const userId = req.user!.userId;
      const category = await service.update(id, req.body, userId);
      res.status(200).json(successResponse(category, 'Cập nhật lĩnh vực văn bản thành công'));
    } catch (error) {
      next(error);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /:id – Xoá / deactivate lĩnh vực văn bản (UC-78)
  // ──────────────────────────────────────────────────────────────────────────
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id as string, 10);
      const userId = req.user!.userId;
      const result = await service.delete(id, userId);

      const message =
        result.operation === 'DEACTIVATED'
          ? 'Lĩnh vực văn bản đang được sử dụng và đã được vô hiệu hóa'
          : 'Xoá lĩnh vực văn bản thành công';

      res.status(200).json(successResponse(result, message));
    } catch (error) {
      next(error);
    }
  }
}
