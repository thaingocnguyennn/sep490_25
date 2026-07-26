import { Router } from 'express';
import { DocumentTypesController } from './document-types.controller';
import { requireRole } from '../../shared/middlewares/require-role.middleware';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import { ROLES } from '../../shared/constants/roles';
import {
  createDocumentTypeValidation,
  updateDocumentTypeValidation,
  documentTypeIdParamValidation,
} from './document-types.validation';

const router = Router();
const controller = new DocumentTypesController();

// ──────────────────────────────────────────────────────────────────────────────
// All routes are protected by authenticate middleware from routes/index.ts
// ──────────────────────────────────────────────────────────────────────────────

// GET /options – Dropdown (must be before /:id to avoid 'options' being parsed as an id)
router.get(
  '/options',
  requireRole(ROLES.DOCUMENT_CLERK, ROLES.SPECIALIST, ROLES.DEPARTMENT_HEAD),
  controller.getActiveOptions.bind(controller),
);

// GET / – List all (DOCUMENT_CLERK – UC-72)
router.get(
  '/',
  requireRole(ROLES.DOCUMENT_CLERK),
  controller.findAll.bind(controller),
);

// POST / – Create (DOCUMENT_CLERK – UC-71)
router.post(
  '/',
  requireRole(ROLES.DOCUMENT_CLERK),
  createDocumentTypeValidation,
  validateRequest,
  controller.create.bind(controller),
);

// GET /:id – Detail (DOCUMENT_CLERK)
router.get(
  '/:id',
  requireRole(ROLES.DOCUMENT_CLERK),
  documentTypeIdParamValidation,
  validateRequest,
  controller.findById.bind(controller),
);

// PATCH /:id/reactivate – Reactivate (DOCUMENT_CLERK) — must be before /:id PATCH
router.patch(
  '/:id/reactivate',
  requireRole(ROLES.DOCUMENT_CLERK),
  documentTypeIdParamValidation,
  validateRequest,
  controller.reactivate.bind(controller),
);

// PATCH /:id – Update (DOCUMENT_CLERK – UC-73)
router.patch(
  '/:id',
  requireRole(ROLES.DOCUMENT_CLERK),
  updateDocumentTypeValidation,
  validateRequest,
  controller.update.bind(controller),
);

// DELETE /:id – Delete / deactivate (DOCUMENT_CLERK – UC-74)
router.delete(
  '/:id',
  requireRole(ROLES.DOCUMENT_CLERK),
  documentTypeIdParamValidation,
  validateRequest,
  controller.remove.bind(controller),
);

export default router;
