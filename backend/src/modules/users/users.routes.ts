import { Router } from 'express';
import { usersController } from './users.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRole } from '../../shared/middlewares/require-role.middleware';

const router = Router();

router.use(authenticate);

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
  requireRole('ADMIN'),
  usersController.getRoles.bind(usersController)
);

export default router;
