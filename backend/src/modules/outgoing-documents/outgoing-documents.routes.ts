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

// GET /outgoing-documents/statistics — Thống kê văn bản đi
// PHẢI đặt TRƯỚC /:id để tránh Express nhầm "statistics" là một :id
router.get(
  '/statistics',
  authenticate,
  outgoingDocumentsController.getStatistics.bind(outgoingDocumentsController),
);

// GET /outgoing-documents/export — Xuất danh sách ra Excel/PDF
// Đặt TRƯỚC /:id
router.get(
  '/export',
  authenticate,
  listOutgoingDocumentsValidation,
  validateRequest,
  outgoingDocumentsController.exportList.bind(outgoingDocumentsController),
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

// GET /outgoing-documents/:id/verify-signature — Kiểm tra chữ ký số
router.get(
  '/:id/verify-signature',
  authenticate,
  outgoingIdParamValidation,
  validateRequest,
  outgoingDocumentsController.verifySignature.bind(outgoingDocumentsController),
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

// ─── Route cập nhật trạng thái (workflow) & Xóa ────────────────────────────────────
// PATCH /outgoing-documents/:id/status — Cập nhật trạng thái (#5 → #16)
router.patch(
  '/:id/status',
  authenticate,
  requireRole(ROLES.SPECIALIST, ROLES.DOCUMENT_CLERK, ROLES.DEPARTMENT_HEAD),
  updateOutgoingStatusValidation,
  validateRequest,
  outgoingDocumentsController.updateStatus.bind(outgoingDocumentsController),
);

// DELETE /outgoing-documents/:id — Xóa mềm văn bản đi
router.delete(
  '/:id',
  authenticate,
  requireRole(ROLES.SPECIALIST, ROLES.DOCUMENT_CLERK, ROLES.DEPARTMENT_HEAD),
  outgoingIdParamValidation,
  validateRequest,
  outgoingDocumentsController.delete.bind(outgoingDocumentsController),
);

// POST /outgoing-documents/:id/send-email — Gửi văn bản qua email
router.post(
  '/:id/send-email',
  authenticate,
  requireRole(ROLES.SPECIALIST, ROLES.DOCUMENT_CLERK, ROLES.DEPARTMENT_HEAD, ROLES.ADMIN),
  outgoingIdParamValidation,
  validateRequest,
  outgoingDocumentsController.sendEmail.bind(outgoingDocumentsController),
);

export default router;
