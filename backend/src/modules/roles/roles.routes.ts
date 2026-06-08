import { Router } from 'express';
import { rolesController } from './roles.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRole } from '../../shared/middlewares/require-role.middleware';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import {
  createRoleValidation,
  updateRoleValidation,
  getRoleByIdValidation,
  deleteRoleValidation,
} from './roles.validation';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requireRole('ADMIN'),
  rolesController.getAll.bind(rolesController)
);

router.get(
  '/:id',
  requireRole('ADMIN'),
  getRoleByIdValidation,
  validateRequest,
  rolesController.getById.bind(rolesController)
);

router.post(
  '/',
  requireRole('ADMIN'),
  createRoleValidation,
  validateRequest,
  rolesController.create.bind(rolesController)
);

router.put(
  '/:id',
  requireRole('ADMIN'),
  updateRoleValidation,
  validateRequest,
  rolesController.update.bind(rolesController)
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  deleteRoleValidation,
  validateRequest,
  rolesController.delete.bind(rolesController)
);

export default router;
