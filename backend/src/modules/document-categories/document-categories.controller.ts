import { Request, Response } from 'express';
import { DocumentCategoriesService } from './document-categories.service';
import { DocumentCategoryFilterDto } from './document-categories.types';

export class DocumentCategoriesController {
  private service: DocumentCategoriesService;

  constructor() {
    this.service = new DocumentCategoriesService();
  }

  async findAll(req: Request, res: Response) {
    try {
      const filter: DocumentCategoryFilterDto = {
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        search: req.query.search as string,
        status: req.query.status as any,
        sortBy: req.query.sortBy as string,
        sortOrder: req.query.sortOrder as any,
      };

      const result = await this.service.findAll(filter);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async getActiveOptions(req: Request, res: Response) {
    try {
      const options = await this.service.getActiveOptions();
      res.json(options);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async findById(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid category ID' });
      }

      const category = await this.service.findById(id);
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.json(category);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
