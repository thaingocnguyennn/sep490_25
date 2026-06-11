import { Router } from 'express';
import { usersController } from './users.controller';
import { requireRole } from '../../shared/middlewares/require-role.middleware';
import { ROLES } from '../../shared/constants/roles';

const router = Router();

router.get(
  '/me',
  usersController.getMe.bind(usersController)
);

router.put(
  '/me',
  usersController.updateMe.bind(usersController)
);

router.get(
  '/roles',
  requireRole(ROLES.ADMIN),
  usersController.getRoles.bind(usersController)
);

export default router;
