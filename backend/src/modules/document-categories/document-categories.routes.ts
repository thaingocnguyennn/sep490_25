import { Router } from 'express';
import { DocumentCategoriesController } from './document-categories.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRole } from '../../shared/middlewares/require-role.middleware';
import { ROLES } from '../../shared/constants/roles';

const router = Router();
const controller = new DocumentCategoriesController();

// Protect all routes with authentication
router.use(authenticate);

// Options endpoint - accessible to anyone involved in document processing
// Must be defined before /:id to prevent 'options' being parsed as an id
router.get(
  '/options',
  requireRole(ROLES.DOCUMENT_CLERK, ROLES.SPECIALIST, ROLES.DEPARTMENT_HEAD),
  controller.getActiveOptions.bind(controller)
);

// CRUD endpoints - restricted to DOCUMENT_CLERK
router.get(
  '/',
  requireRole(ROLES.DOCUMENT_CLERK),
  controller.findAll.bind(controller)
);

router.get(
  '/:id',
  requireRole(ROLES.DOCUMENT_CLERK),
  controller.findById.bind(controller)
);

export default router;
