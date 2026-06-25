import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { UnauthorizedError } from '../exceptions/app-error';
import { JwtPayload } from '../types/auth.types';
import prisma from '../../config/database';
import { UserStatus } from '@prisma/client';

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, status: true, departmentId: true },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (user.status === UserStatus.LOCKED) {
      throw new UnauthorizedError('Account is locked');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedError('Account is inactive');
    }

    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      roles: decoded.roles,
      departmentId: user.departmentId,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
    } else {
      next(error);
    }
  }
}
