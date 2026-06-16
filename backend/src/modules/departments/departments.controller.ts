import { Request, Response, NextFunction } from 'express';
import { departmentsService } from './departments.service';
import { successResponse } from '../../shared/utils/response.util';

export class DepartmentsController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const includeUserCount = req.query.includeUserCount !== 'false';
      const departments = await departmentsService.list({ search, includeUserCount });
      res.status(200).json(successResponse(departments, 'Departments retrieved'));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string, 10);
      const department = await departmentsService.getById(id);
      res.status(200).json(successResponse(department, 'Department retrieved'));
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const department = await departmentsService.create(req.body);
      res.status(201).json(successResponse(department, 'Department created'));
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string, 10);
      const department = await departmentsService.update(id, req.body);
      res.status(200).json(successResponse(department, 'Department updated'));
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string, 10);
      await departmentsService.delete(id);
      res.status(200).json(successResponse(null, 'Department deleted'));
    } catch (error) {
      next(error);
    }
  }
}

export const departmentsController = new DepartmentsController();
