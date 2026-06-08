import { Request, Response, NextFunction } from 'express';
import { AppError } from '../exceptions/app-error';
import { errorResponse } from '../utils/response.util';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[Error]', err);

  if (err instanceof AppError) {
    res.status(err.statusCode).json(errorResponse(err.message, err.errors));
    return;
  }

  if (err.name === 'PrismaClientKnownRequestError') {
    res.status(400).json(errorResponse('Database operation failed', err.message));
    return;
  }

  res.status(500).json(errorResponse('Internal server error'));
}
