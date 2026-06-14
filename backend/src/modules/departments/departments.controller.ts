import { Request, Response, NextFunction } from 'express';
import { departmentsService } from './departments.service';
import { successResponse } from '../../shared/utils/response.util';

export class DepartmentsController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const departments = await departmentsService.list();
      res.status(200).json(successResponse(departments, 'Danh sách phòng ban'));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const department = await departmentsService.getById(parseInt(id));
      res.status(200).json(successResponse(department, 'Chi tiết phòng ban'));
    } catch (error) {
      next(error);
    }
  }
}

export const departmentsController = new DepartmentsController();
