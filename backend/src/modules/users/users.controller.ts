import { Request, Response, NextFunction } from 'express';
import { usersService } from './users.service';
import { successResponse, paginatedResponse } from '../../shared/utils/response.util';

export class UsersController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, search, status, role } = req.query;
      const result = await usersService.getAll({
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 10,
        search: search as string,
        status: status as string,
        role: role as string,
      });

      res.status(200).json(
        paginatedResponse(result.users, result.total, result.page, result.limit, 'Users retrieved')
      );
    } catch (error) {
      next(error);
    }
  }

  async getAllUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, search, status, role } = req.query;
      const result = await usersService.getAll({
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 100,
        search: search as string,
        status: status as string,
        role: role as string,
      });

      res.status(200).json(
        paginatedResponse(result.users, result.total, result.page, result.limit, 'Users retrieved')
      );
    } catch (error) {
      next(error);
    }
  }

  async getApprovers(req: Request, res: Response, next: NextFunction) {
    try {
      const departmentId = req.user?.departmentId;
      if (!departmentId) {
        return res.status(400).json({ success: false, message: 'User does not belong to a department' });
      }
      const result = await usersService.getAll({
        limit: 100,
        role: 'DEPARTMENT_HEAD',
        status: 'ACTIVE',
        departmentId: departmentId,
      });
      res.status(200).json(successResponse(result.users, 'Approvers retrieved'));
    } catch (error) {
      next(error);
    }
  }

  async getClerks(req: Request, res: Response, next: NextFunction) {
    try {
      const departmentId = req.user?.departmentId;
      if (!departmentId) {
        return res.status(400).json({ success: false, message: 'User does not belong to a department' });
      }
      const result = await usersService.getAll({
        limit: 100,
        role: 'DOCUMENT_CLERK',
        status: 'ACTIVE',
        departmentId: departmentId,
      });
      res.status(200).json(successResponse(result.users, 'Clerks retrieved'));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const user = await usersService.getById(id);
      res.status(200).json(successResponse(user, 'User retrieved'));
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await usersService.create({
        ...req.body,
        createdBy: req.user!.userId,
      });
      res.status(201).json(successResponse(user, 'User created'));
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const user = await usersService.update(id, {
        ...req.body,
        updatedBy: req.user!.userId,
      });
      res.status(200).json(successResponse(user, 'User updated'));
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);

      if (id === req.user!.userId) {
        res.status(400).json({
          success: false,
          message: 'Cannot delete your own account',
        });
        return;
      }

      await usersService.delete(id);
      res.status(200).json(successResponse(null, 'User deleted'));
    } catch (error) {
      next(error);
    }
  }

  async getRoles(_req: Request, res: Response, next: NextFunction) {
    try {
      const roles = await usersService.getRoles();
      res.status(200).json(successResponse(roles, 'Roles retrieved'));
    } catch (error) {
      next(error);
    }
  }

  async lock(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);

      if (id === req.user!.userId) {
        res.status(400).json({
          success: false,
          message: 'Cannot lock your own account',
        });
        return;
      }

      await usersService.updateStatus(id, 'LOCKED', req.user!.userId);
      res.status(200).json(successResponse(null, 'User locked'));
    } catch (error) {
      next(error);
    }
  }
  async unlock(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      await usersService.updateStatus(id, 'ACTIVE', req.user!.userId);
      res.status(200).json(successResponse(null, 'User unlocked'));
    } catch (error) {
      next(error);
    }
  }

  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await usersService.getById(req.user!.userId);
      res.status(200).json(successResponse(user, 'Profile retrieved'));
    } catch (error) {
      next(error);
    }
  }

  async updateMe(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await usersService.updateMyProfile(req.user!.userId, req.body);
      res.status(200).json(successResponse(user, 'Profile updated'));
    } catch (error) {
      next(error);
    }
  }
}

export const usersController = new UsersController();
