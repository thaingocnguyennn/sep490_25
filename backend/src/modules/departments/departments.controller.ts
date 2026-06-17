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

  // ---- Members ----

  async getMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string, 10);
      const members = await departmentsService.getMembers(id);
      res.status(200).json(successResponse(members, 'Department members retrieved'));
    } catch (error) {
      next(error);
    }
  }

  async addMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string, 10);
      const result = await departmentsService.addMembers(id, req.body);
      const message =
        result.created > 0
          ? `Added ${result.created} member(s) to the department${
              result.alreadyMembers.length > 0
                ? ` (${result.alreadyMembers.length} were already members)`
                : ''
            }`
          : 'All selected users are already members of this department';
      res.status(201).json(successResponse(result, message));
    } catch (error) {
      next(error);
    }
  }

  async removeMember(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string, 10);
      const userId = parseInt(req.params.userId as string, 10);
      await departmentsService.removeMember(id, userId);
      res.status(200).json(successResponse(null, 'Member removed from department'));
    } catch (error) {
      next(error);
    }
  }
}

export const departmentsController = new DepartmentsController();
