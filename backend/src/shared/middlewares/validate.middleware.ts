import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationError } from 'express-validator';
import { AppError } from '../exceptions/app-error';

export function validateRequest(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err: ValidationError) => ({
      field: 'path' in err ? err.path : 'unknown',
      message: String(err.msg),
    }));
    return next(new AppError(400, 'Validation failed', formattedErrors));
  }
  next();
}
