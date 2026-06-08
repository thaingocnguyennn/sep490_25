import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../exceptions/app-error';
import prisma from '../../config/database';

export function requireRole(...roleNames: string[]) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new ForbiddenError('Not authenticated');
      }

      const userWithRoles = await prisma.user.findUnique({
        where: { id: req.user.userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });

      if (!userWithRoles) {
        throw new ForbiddenError('User not found');
      }

      const userRoleNames = userWithRoles.userRoles.map((ur) => ur.role.name);
      const hasRole = roleNames.some((name) => userRoleNames.includes(name));

      if (!hasRole) {
        throw new ForbiddenError('Insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
