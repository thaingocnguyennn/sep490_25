import { Request, Response, NextFunction } from 'express';
import { DocumentTypesService } from './document-types.service';
import { successResponse } from '../../shared/utils/response.util';

const service = new DocumentTypesService();

export class DocumentTypesController {
  // GET /document-types/options
  async getActiveOptions(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await service.getActiveOptions();
      res.status(200).json(successResponse(result, 'Danh sách thể loại văn bản'));
    } catch (error) {
      next(error);
    }
  }

  // GET /document-types
  async findAll(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string | undefined;
      const status = req.query.status as any;
      const sortBy = req.query.sortBy as string | undefined;
      const sortOrder = req.query.sortOrder as 'asc' | 'desc' | undefined;

      const result = await service.findAll({ page, limit, search, status, sortBy, sortOrder });

      res.status(200).json(
        successResponse(
          {
            items: result.data,
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
          },
          'Danh sách thể loại văn bản',
        ),
      );
    } catch (error) {
      next(error);
    }
  }

  // GET /document-types/:id
  async findById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const result = await service.findById(id);
      res.status(200).json(successResponse(result, 'Chi tiết thể loại văn bản'));
    } catch (error) {
      next(error);
    }
  }

  // POST /document-types
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await service.create(req.body, req.user!.userId);
      res.status(201).json(successResponse(result, 'Tạo thể loại văn bản thành công'));
    } catch (error) {
      next(error);
    }
  }

  // PATCH /document-types/:id
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const result = await service.update(id, req.body, req.user!.userId);
      res.status(200).json(successResponse(result, 'Cập nhật thể loại văn bản thành công'));
    } catch (error) {
      next(error);
    }
  }

  // DELETE /document-types/:id
  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const result = await service.delete(id, req.user!.userId);
      res.status(200).json(successResponse(result, 'Xoá thể loại văn bản thành công'));
    } catch (error) {
      next(error);
    }
  }

  // PATCH /document-types/:id/reactivate
  async reactivate(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const result = await service.reactivate(id, req.user!.userId);
      res.status(200).json(successResponse(result, 'Kích hoạt lại thể loại văn bản thành công'));
    } catch (error) {
      next(error);
    }
  }
}
