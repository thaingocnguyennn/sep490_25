import { Router } from 'express';
import { rolesController } from './roles.controller';
import { requireRole } from '../../shared/middlewares/require-role.middleware';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import { ROLES } from '../../shared/constants/roles';
import {
  createRoleValidation,
  updateRoleValidation,
  getRoleByIdValidation,
  deleteRoleValidation,
} from './roles.validation';

const router = Router();

router.get(
  '/',
  requireRole(ROLES.ADMIN),
  rolesController.getAll.bind(rolesController)
);

router.get(
  '/:id',
  requireRole(ROLES.ADMIN),
  getRoleByIdValidation,
  validateRequest,
  rolesController.getById.bind(rolesController)
);

router.post(
  '/',
  requireRole(ROLES.ADMIN),
  createRoleValidation,
  validateRequest,
  rolesController.create.bind(rolesController)
);

router.put(
  '/:id',
  requireRole(ROLES.ADMIN),
  updateRoleValidation,
  validateRequest,
  rolesController.update.bind(rolesController)
);

router.delete(
  '/:id',
  requireRole(ROLES.ADMIN),
  deleteRoleValidation,
  validateRequest,
  rolesController.delete.bind(rolesController)
);

export default router;
