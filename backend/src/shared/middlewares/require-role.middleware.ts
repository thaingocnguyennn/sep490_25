import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../exceptions/app-error';
import { RoleName } from '../constants/roles';

export function requireRole(...roleNames: RoleName[]) {
  return (
    req: Request,
    _res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      return next(new ForbiddenError('Not authenticated'));
    }

    const hasRole = roleNames.some((name) => req.user!.roles.includes(name));

    if (!hasRole) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
}
