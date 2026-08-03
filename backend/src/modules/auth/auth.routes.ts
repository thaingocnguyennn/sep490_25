import { Router } from 'express';
import { authController } from './auth.controller';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import {
  changePasswordValidation,
  loginValidation,
  requestPasswordResetValidation,
  resetPasswordValidation,
  updateProfileValidation,
} from './auth.validation';

const router = Router();

router.post('/login', loginValidation, validateRequest, authController.login.bind(authController));
router.post(
  '/forgot-password',
  requestPasswordResetValidation,
  validateRequest,
  authController.requestPasswordReset.bind(authController),
);
router.post(
  '/reset-password',
  resetPasswordValidation,
  validateRequest,
  authController.resetPassword.bind(authController),
);
router.post('/logout', authenticate, authController.logout.bind(authController));
router.get('/profile', authenticate, authController.getProfile.bind(authController));
router.patch(
  '/profile',
  authenticate,
  updateProfileValidation,
  validateRequest,
  authController.updateProfile.bind(authController)
);
router.patch(
  '/change-password',
  authenticate,
  changePasswordValidation,
  validateRequest,
  authController.changePassword.bind(authController)
);

export default router;
