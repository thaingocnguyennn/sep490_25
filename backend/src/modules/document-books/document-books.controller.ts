import { Request, Response, NextFunction } from 'express';
import { documentBooksService } from './document-books.service';

export class DocumentBooksController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await documentBooksService.list(req.query as any);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string, 10);
      const book = await documentBooksService.getById(id);
      res.status(200).json(book);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /document-books/:id/entries?page=1&limit=20
   * Lấy danh sách văn bản đã đăng ký trong sổ.
   */
  async getEntries(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string, 10);
      const page = parseInt((req.query.page as string) || '1', 10);
      const limit = parseInt((req.query.limit as string) || '20', 10);
      const result = await documentBooksService.getEntries(id, page, limit);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      if (!req.body.year) {
        req.body.year = new Date().getFullYear();
      }
      const book = await documentBooksService.create(req.body, userId);
      res.status(201).json(book);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string, 10);
      const book = await documentBooksService.update(id, req.body);
      res.status(200).json(book);
    } catch (error) {
      next(error);
    }
  }

  async closeBook(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string, 10);
      const book = await documentBooksService.closeBook(id);
      res.status(200).json(book);
    } catch (error) {
      next(error);
    }
  }

  async reopenBook(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string, 10);
      const book = await documentBooksService.reopenBook(id);
      res.status(200).json(book);
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string, 10);
      const result = await documentBooksService.deleteOrInactive(id);
      // Nếu soft-delete (result có deletedAt) → 200 với message; nếu INACTIVE → 200 với book
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const documentBooksController = new DocumentBooksController();
