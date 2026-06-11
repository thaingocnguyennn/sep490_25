import { Request } from 'express';
import { RoleName } from '../constants/roles';

export interface JwtPayload {
  userId: number;
  username: string;
  roles: RoleName[];
}

export interface AuthenticatedUser {
  userId: number;
  username: string;
  roles: RoleName[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
