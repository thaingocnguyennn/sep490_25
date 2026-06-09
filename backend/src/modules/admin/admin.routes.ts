import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRole } from '../../shared/middlewares/require-role.middleware';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import { usersController } from '../users/users.controller';
import { rolesController } from '../roles/roles.controller';
import {
  createUserValidation,
  updateUserValidation,
  getUsersValidation,
  getUserByIdValidation,
  deleteUserValidation,
} from '../users/users.validation';
import {
  createRoleValidation,
  updateRoleValidation,
  getRoleByIdValidation,
  deleteRoleValidation,
} from '../roles/roles.validation';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN'));

// ── User management ─────────────────────────────────────────────────────────

router.get(
  '/users',
  getUsersValidation,
  validateRequest,
  usersController.getAll.bind(usersController)
);

router.get(
  '/users/:id',
  getUserByIdValidation,
  validateRequest,
  usersController.getById.bind(usersController)
);

router.post(
  '/users',
  createUserValidation,
  validateRequest,
  usersController.create.bind(usersController)
);

router.put(
  '/users/:id',
  updateUserValidation,
  validateRequest,
  usersController.update.bind(usersController)
);

router.delete(
  '/users/:id',
  deleteUserValidation,
  validateRequest,
  usersController.delete.bind(usersController)
);

router.patch(
  '/users/:id/lock',
  usersController.lock.bind(usersController)
);

router.patch(
  '/users/:id/unlock',
  usersController.unlock.bind(usersController)
);

router.get(
  '/roles',
  rolesController.getAll.bind(rolesController)
);

router.get(
  '/roles/:id',
  getRoleByIdValidation,
  validateRequest,
  rolesController.getById.bind(rolesController)
);

router.post(
  '/roles',
  createRoleValidation,
  validateRequest,
  rolesController.create.bind(rolesController)
);

router.put(
  '/roles/:id',
  updateRoleValidation,
  validateRequest,
  rolesController.update.bind(rolesController)
);

router.delete(
  '/roles/:id',
  deleteRoleValidation,
  validateRequest,
  rolesController.delete.bind(rolesController)
);

export default router;
