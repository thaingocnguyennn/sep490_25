import { Router } from 'express';
import { DocumentCategoriesController } from './document-categories.controller';
import { requireRole } from '../../shared/middlewares/require-role.middleware';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import { ROLES } from '../../shared/constants/roles';
import {
  createDocumentCategoryValidation,
  updateDocumentCategoryValidation,
  documentCategoryIdParamValidation,
} from './document-categories.validation';

const router = Router();
const controller = new DocumentCategoriesController();

// ──────────────────────────────────────────────────────────────────────────────
// Tất cả routes đã được bảo vệ bởi authenticate middleware từ routes/index.ts
// ──────────────────────────────────────────────────────────────────────────────

// GET /options – Dropdown (trước /:id để tránh 'options' bị parse thành id)
router.get(
  '/options',
  requireRole(ROLES.DOCUMENT_CLERK, ROLES.SPECIALIST, ROLES.DEPARTMENT_HEAD),
  controller.getActiveOptions.bind(controller),
);

// GET / – Danh sách (DOCUMENT_CLERK)
router.get(
  '/',
  requireRole(ROLES.DOCUMENT_CLERK),
  controller.findAll.bind(controller),
);

// POST / – Tạo mới (UC-75, DOCUMENT_CLERK)
router.post(
  '/',
  requireRole(ROLES.DOCUMENT_CLERK),
  createDocumentCategoryValidation,
  validateRequest,
  controller.create.bind(controller),
);

// GET /:id – Chi tiết (DOCUMENT_CLERK)
router.get(
  '/:id',
  requireRole(ROLES.DOCUMENT_CLERK),
  documentCategoryIdParamValidation,
  validateRequest,
  controller.findById.bind(controller),
);

// PATCH /:id – Cập nhật (UC-77, DOCUMENT_CLERK)
router.patch(
  '/:id',
  requireRole(ROLES.DOCUMENT_CLERK),
  updateDocumentCategoryValidation,
  validateRequest,
  controller.update.bind(controller),
);

// DELETE /:id – Xoá / deactivate (UC-78, DOCUMENT_CLERK)
router.delete(
  '/:id',
  requireRole(ROLES.DOCUMENT_CLERK),
  documentCategoryIdParamValidation,
  validateRequest,
  controller.remove.bind(controller),
);

export default router;
