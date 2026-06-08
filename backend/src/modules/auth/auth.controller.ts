import { Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { authService } from './auth.service';
import { successResponse, errorResponse } from '../../shared/utils/response.util';

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, password } = req.body;
      const result = await authService.login(username, password);
      res.status(200).json(successResponse(result, 'Login successful'));
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.logout(req.user!.userId);
      res.status(200).json(successResponse(result, 'Logout successful'));
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await authService.getProfile(req.user!.userId);
      res.status(200).json(successResponse(profile, 'Profile retrieved'));
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body;

      if (newPassword !== confirmPassword) {
        res.status(400).json(errorResponse('New password and confirm password do not match'));
        return;
      }

      const result = await authService.changePassword(
        req.user!.userId,
        currentPassword,
        newPassword
      );
      res.status(200).json(successResponse(result, 'Password changed successfully'));
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();

export const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters'),
  body('confirmPassword').notEmpty().withMessage('Confirm password is required'),
];
