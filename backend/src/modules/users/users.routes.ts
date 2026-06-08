import { Router } from 'express';
import { usersController } from './users.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRole } from '../../shared/middlewares/require-role.middleware';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import {
  createUserValidation,
  updateUserValidation,
  getUsersValidation,
  getUserByIdValidation,
  deleteUserValidation,
} from './users.validation';

const router = Router();

router.use(authenticate);

router.get('/roles', requireRole('ADMIN'), usersController.getRoles.bind(usersController));

router.get(
  '/',
  requireRole('ADMIN'),
  getUsersValidation,
  validateRequest,
  usersController.getAll.bind(usersController)
);

router.get(
  '/:id',
  requireRole('ADMIN'),
  getUserByIdValidation,
  validateRequest,
  usersController.getById.bind(usersController)
);

router.post(
  '/',
  requireRole('ADMIN'),
  createUserValidation,
  validateRequest,
  usersController.create.bind(usersController)
);

router.put(
  '/:id',
  requireRole('ADMIN'),
  updateUserValidation,
  validateRequest,
  usersController.update.bind(usersController)
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  deleteUserValidation,
  validateRequest,
  usersController.delete.bind(usersController)
);

router.patch(
  '/:id/lock',
  requireRole('ADMIN'),
  usersController.lock.bind(usersController)
);

export default router;
