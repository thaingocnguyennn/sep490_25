import { Router } from 'express';
import { outgoingDocumentsController } from './outgoing-documents.controller';
import { upload } from '../../shared/middlewares/upload.middleware';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import { requireRole } from '../../shared/middlewares/require-role.middleware';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { ROLES } from '../../shared/constants/roles';
import {
  createOutgoingDocumentValidation,
  updateOutgoingMetadataValidation,
  updateOutgoingStatusValidation,
  outgoingIdParamValidation,
  listOutgoingDocumentsValidation,
} from './outgoing-documents.validation';

const router = Router();

// ─── Routes danh sách ─────────────────────────────────────────────────────────

// GET /outgoing-documents — Danh sách văn bản đi
router.get(
  '/',
  authenticate,
  listOutgoingDocumentsValidation,
  validateRequest,
  outgoingDocumentsController.list.bind(outgoingDocumentsController),
);

// GET /outgoing-documents/trash — Danh sách văn bản đi trong thùng rác
router.get(
  '/trash',
  authenticate,
  requireRole(ROLES.DOCUMENT_CLERK, ROLES.ADMIN, ROLES.DEPARTMENT_HEAD, ROLES.SPECIALIST),
  outgoingDocumentsController.listTrashed.bind(outgoingDocumentsController),
);

// GET /outgoing-documents/:id — Chi tiết văn bản đi
router.get(
  '/:id',
  authenticate,
  outgoingIdParamValidation,
  validateRequest,
  outgoingDocumentsController.getById.bind(outgoingDocumentsController),
);

// ─── Routes tạo và chỉnh sửa ─────────────────────────────────────────────────

// POST /outgoing-documents — Tạo văn bản đi mới (#1)
router.post(
  '/',
  authenticate,
  requireRole(ROLES.SPECIALIST, ROLES.DOCUMENT_CLERK),
  createOutgoingDocumentValidation,
  validateRequest,
  outgoingDocumentsController.create.bind(outgoingDocumentsController),
);

// POST /outgoing-documents/:id/upload — Upload file nháp (#2)
router.post(
  '/:id/upload',
  authenticate,
  requireRole(ROLES.SPECIALIST, ROLES.DOCUMENT_CLERK),
  outgoingIdParamValidation,
  validateRequest,
  upload.single('file'),
  outgoingDocumentsController.uploadFile.bind(outgoingDocumentsController),
);

// POST /outgoing-documents/:id/ocr — Chạy OCR (#3)
// Dùng upload.single vì file đã được upload trước, OCR đọc từ disk
router.post(
  '/:id/ocr',
  authenticate,
  requireRole(ROLES.SPECIALIST, ROLES.DOCUMENT_CLERK),
  outgoingIdParamValidation,
  validateRequest,
  outgoingDocumentsController.runOcr.bind(outgoingDocumentsController),
);

// PATCH /outgoing-documents/:id/metadata — Cập nhật metadata (#4)
router.patch(
  '/:id/metadata',
  authenticate,
  requireRole(ROLES.SPECIALIST, ROLES.DOCUMENT_CLERK),
  updateOutgoingMetadataValidation,
  validateRequest,
  outgoingDocumentsController.updateMetadata.bind(outgoingDocumentsController),
);

// ─── Route cập nhật trạng thái (workflow) ────────────────────────────────────
// PATCH /outgoing-documents/:id/status — Cập nhật trạng thái (#5 → #16)
router.patch(
  '/:id/status',
  authenticate,
  requireRole(ROLES.SPECIALIST, ROLES.DOCUMENT_CLERK, ROLES.DEPARTMENT_HEAD),
  updateOutgoingStatusValidation,
  validateRequest,
  outgoingDocumentsController.updateStatus.bind(outgoingDocumentsController),
);

export default router;
