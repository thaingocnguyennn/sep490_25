import { Router } from 'express';
import { authController, changePasswordValidation } from './auth.controller';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { loginValidation } from './auth.validation';

const router = Router();

router.post('/login', loginValidation, validateRequest, authController.login.bind(authController));
router.post('/logout', authenticate, authController.logout.bind(authController));
router.get('/profile', authenticate, authController.getProfile.bind(authController));
router.patch(
  '/change-password',
  authenticate,
  changePasswordValidation,
  validateRequest,
  authController.changePassword.bind(authController)
);

export default router;
