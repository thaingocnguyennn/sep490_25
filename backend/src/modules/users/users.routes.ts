import { Router } from 'express';
import { usersController } from './users.controller';
import { requireRole } from '../../shared/middlewares/require-role.middleware';
import { ROLES } from '../../shared/constants/roles';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import { updateProfileValidation } from '../auth/auth.validation';

const router = Router();

router.get(
  '/me',
  usersController.getMe.bind(usersController)
);

router.put(
  '/me',
  updateProfileValidation,
  validateRequest,
  usersController.updateMe.bind(usersController)
);

router.get(
  '/roles',
  requireRole(ROLES.ADMIN),
  usersController.getRoles.bind(usersController)
);

router.get(
  '/approvers',
  requireRole(ROLES.SPECIALIST, ROLES.DOCUMENT_CLERK),
  usersController.getApprovers.bind(usersController)
);

router.get(
  '/clerks',
  requireRole(ROLES.DEPARTMENT_HEAD, ROLES.SPECIALIST),
  usersController.getClerks.bind(usersController)
);

router.get(
  '/',
  usersController.getAllUsers.bind(usersController)
);

export default router;
