import { Request, Response, NextFunction } from 'express';
import { documentsService } from './documents.service';
import { successResponse } from '../../shared/utils/response.util';

export class DocumentsController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;
      const type = req.query.type as string;
      const status = req.query.status as string;

      const result = await documentsService.list({ page, limit, search, type, status });
      res.status(200).json(
        successResponse(
          {
            items: result.items,
            total: result.total,
            page,
            limit,
            totalPages: Math.ceil(result.total / limit),
          },
          'Documents retrieved'
        )
      );
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = req.params.id as string;
      const document = await documentsService.getById(parseInt(idParam));
      res.status(200).json(successResponse(document, 'Document retrieved'));
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const document = await documentsService.create({
        ...req.body,
        createdBy: req.user!.userId,
      });
      res.status(201).json(successResponse(document, 'Document created successfully'));
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = req.params.id as string;
      const document = await documentsService.update(
        parseInt(idParam),
        { ...req.body, updatedBy: req.user!.userId }
      );
      res.status(200).json(successResponse(document, 'Document updated successfully'));
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = req.params.id as string;
      await documentsService.delete(parseInt(idParam));
      res.status(200).json(successResponse(null, 'Document deleted successfully'));
    } catch (error) {
      next(error);
    }
  }

  async performOcr(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }
      const mimeType = req.body.mimeType || req.file.mimetype;
      const result = await documentsService.performOcr(req.file.buffer, mimeType);
      res.status(200).json(successResponse(result, 'OCR completed'));
    } catch (error) {
      next(error);
    }
  }
}

export const documentsController = new DocumentsController();
