import { Router } from 'express';
import { documentsController } from './documents.controller';
import { upload } from '../../shared/middlewares/upload.middleware';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import {
  uploadDocumentValidation,
  updateDocumentValidation,
  getDocumentsValidation,
  getDocumentByIdValidation,
  deleteDocumentValidation,
} from './documents.validation';

const router = Router();

// ─── Export must be defined BEFORE /:id to avoid route conflicts ────────────

// GET /documents/export — Export document list to Excel or PDF
router.get(
  '/export',
  getDocumentsValidation,
  validateRequest,
  documentsController.exportList.bind(documentsController)
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
  upload.single('file'),
  uploadDocumentValidation,
  validateRequest,
  documentsController.upload.bind(documentsController)
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
  updateDocumentValidation,
  validateRequest,
  documentsController.update.bind(documentsController)
);

// DELETE /documents/:id — Soft-delete a document
router.delete(
  '/:id',
  deleteDocumentValidation,
  validateRequest,
  documentsController.delete.bind(documentsController)
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
