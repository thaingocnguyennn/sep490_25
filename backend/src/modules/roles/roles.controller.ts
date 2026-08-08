import { Request, Response, NextFunction } from 'express';
import { rolesService } from './roles.service';
import { successResponse } from '../../shared/utils/response.util';

export class RolesController {
  async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const roles = await rolesService.getAll();
      res.status(200).json(successResponse(roles, 'Roles retrieved'));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const role = await rolesService.getById(id);
      res.status(200).json(successResponse(role, 'Role retrieved'));
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const role = await rolesService.create(req.body);
      res.status(201).json(successResponse(role, 'Role created'));
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const role = await rolesService.update(id, req.body);
      res.status(200).json(successResponse(role, 'Role updated'));
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      await rolesService.delete(id);
      res.status(200).json(successResponse(null, 'Role deleted'));
    } catch (error) {
      next(error);
    }
  }
}

export const rolesController = new RolesController();
