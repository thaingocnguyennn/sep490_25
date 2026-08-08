import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRole } from '../../shared/middlewares/require-role.middleware';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import { ROLES } from '../../shared/constants/roles';
import { departmentsController } from './departments.controller';
import {
  listDepartmentsValidation,
  getDepartmentValidation,
  createDepartmentValidation,
  updateDepartmentValidation,
  deleteDepartmentValidation,
  getMembersValidation,
  addMembersValidation,
  removeMemberValidation,
} from './departments.validation';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  listDepartmentsValidation,
  validateRequest,
  departmentsController.list.bind(departmentsController)
);

router.get(
  '/:id',
  getDepartmentValidation,
  validateRequest,
  departmentsController.getById.bind(departmentsController)
);

router.post(
  '/',
  requireRole(ROLES.ADMIN),
  createDepartmentValidation,
  validateRequest,
  departmentsController.create.bind(departmentsController)
);

router.put(
  '/:id',
  requireRole(ROLES.ADMIN),
  updateDepartmentValidation,
  validateRequest,
  departmentsController.update.bind(departmentsController)
);

router.delete(
  '/:id',
  requireRole(ROLES.ADMIN),
  deleteDepartmentValidation,
  validateRequest,
  departmentsController.delete.bind(departmentsController)
);

// ---- Members (many-to-many User <-> Department) ----

router.get(
  '/:id/members',
  getMembersValidation,
  validateRequest,
  departmentsController.getMembers.bind(departmentsController)
);

router.post(
  '/:id/members',
  requireRole(ROLES.ADMIN),
  addMembersValidation,
  validateRequest,
  departmentsController.addMembers.bind(departmentsController)
);

router.delete(
  '/:id/members/:userId',
  requireRole(ROLES.ADMIN),
  removeMemberValidation,
  validateRequest,
  departmentsController.removeMember.bind(departmentsController)
);

export default router;
