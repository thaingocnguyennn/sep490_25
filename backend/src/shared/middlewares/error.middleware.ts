import { Request, Response, NextFunction } from 'express';
import { AppError } from '../exceptions/app-error';
import { errorResponse } from '../utils/response.util';

import multer from 'multer';

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

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json(errorResponse('Dung lượng tệp vượt quá giới hạn cho phép (tối đa 50MB)'));
      return;
    }
    res.status(400).json(errorResponse(`Lỗi tải tệp: ${err.message}`));
    return;
  }

  if (err.name === 'PrismaClientKnownRequestError') {
    res.status(400).json(errorResponse('Database operation failed', err.message));
    return;
  }

  res.status(500).json(errorResponse('Internal server error'));
}
