import { Router } from 'express';
import multer from 'multer';
import { documentsController } from './documents.controller';
import { upload } from '../../shared/middlewares/upload.middleware';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import { requireRole } from '../../shared/middlewares/require-role.middleware';
import {
  uploadDocumentValidation,
  updateDocumentValidation,
  getDocumentsValidation,
  getDocumentByIdValidation,
  deleteDocumentValidation,
  reopenDocumentValidation,
  updateDocumentStatusValidation,
  ocrValidation,
} from './documents.validation';

const router = Router();

// Multer for OCR (memory storage, accepts images and PDF)
const ocrUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/tiff', 'image/bmp', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

// ─── Export must be defined BEFORE /:id to avoid route conflicts ────────────

// GET /documents/stats — Get basic document stats
router.get(
  '/stats',
  documentsController.getStats.bind(documentsController)
);

// GET /documents/dashboard-stats?year=2025 — Thống kê tổng hợp đến/đi theo Nghị định 30
router.get(
  '/dashboard-stats',
  documentsController.getDashboardStats.bind(documentsController)
);

// GET /documents/export — Export document list to Excel or PDF
router.get(
  '/export',
  getDocumentsValidation,
  validateRequest,
  documentsController.exportList.bind(documentsController)
);

// POST /documents/ocr — Perform OCR on uploaded file
router.post(
  '/ocr',
  requireRole('DOCUMENT_CLERK', 'SPECIALIST'),
  ocrUpload.single('file'),
  ocrValidation,
  validateRequest,
  documentsController.performOcr.bind(documentsController)
);

// ─── CRUD Routes ────────────────────────────────────────────────────────────

// GET /documents — List documents with filters and pagination
router.get(
  '/',
  getDocumentsValidation,
  validateRequest,
  documentsController.getAll.bind(documentsController)
);

// POST /documents/upload — Upload a new document (file + metadata)
router.post(
  '/upload',
  requireRole('DOCUMENT_CLERK'),
  upload.single('file'),
  uploadDocumentValidation,
  validateRequest,
  documentsController.upload.bind(documentsController)
);

// POST /documents — Create a document (without file)
router.post(
  '/',
  requireRole('DOCUMENT_CLERK'),
  uploadDocumentValidation,
  validateRequest,
  documentsController.create.bind(documentsController)
);

// GET /documents/:id — Get document details
router.get(
  '/:id',
  getDocumentByIdValidation,
  validateRequest,
  documentsController.getById.bind(documentsController)
);

// PUT /documents/:id — Update document metadata
router.put(
  '/:id',
  requireRole('DOCUMENT_CLERK'),
  updateDocumentValidation,
  validateRequest,
  documentsController.update.bind(documentsController)
);

// DELETE /documents/:id — Soft-delete a document
router.delete(
  '/:id',
  requireRole('DOCUMENT_CLERK'),
  deleteDocumentValidation,
  validateRequest,
  documentsController.delete.bind(documentsController)
);

// PATCH /documents/:id/status — Update the status of a document
router.patch(
  '/:id/status',
  requireRole('DOCUMENT_CLERK'),
  updateDocumentStatusValidation,
  validateRequest,
  documentsController.updateStatus.bind(documentsController)
);

// PATCH /documents/:id/archive — Archive a document
router.patch(
  '/:id/archive',
  requireRole('DOCUMENT_CLERK'),
  getDocumentByIdValidation,
  validateRequest,
  documentsController.archive.bind(documentsController)
);

// PATCH /documents/:id/reopen — Reopen an archived document
router.patch(
  '/:id/reopen',
  requireRole('DOCUMENT_CLERK'),
  reopenDocumentValidation,
  validateRequest,
  documentsController.reopen.bind(documentsController)
);

// PATCH /documents/:id/restore — Restore a soft-deleted document
router.patch(
  '/:id/restore',
  requireRole('DOCUMENT_CLERK'),
  getDocumentByIdValidation,
  validateRequest,
  documentsController.restore.bind(documentsController)
);

// DELETE /documents/:id/permanent — Hard-delete a document
router.delete(
  '/:id/permanent',
  requireRole('DOCUMENT_CLERK'),
  deleteDocumentValidation,
  validateRequest,
  documentsController.hardDelete.bind(documentsController)
);

// GET /documents/:id/preview — View PDF inline in browser
router.get(
  '/:id/preview',
  getDocumentByIdValidation,
  validateRequest,
  documentsController.preview.bind(documentsController)
);

// GET /documents/:id/download — Download the original file
router.get(
  '/:id/download',
  getDocumentByIdValidation,
  validateRequest,
  documentsController.download.bind(documentsController)
);

export default router;
