import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { JwtPayload } from '../types/auth.types';

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
  });
}
