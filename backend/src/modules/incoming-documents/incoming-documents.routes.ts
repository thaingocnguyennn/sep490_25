import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { incomingDocumentsController } from './incoming-documents.controller';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRole } from '../../shared/middlewares/require-role.middleware';
import { ROLES } from '../../shared/constants/roles';
import {
  createIncomingDocumentValidation,
  createIncomingDocumentWithFileValidation,
  processIncomingDocumentValidation,
  processSpecialistDocumentValidation,
  registerIncomingDocumentValidation,
} from './incoming-documents.validation';

const router = Router();

// ─── Disk storage for incoming-document file uploads ─────────────────────────
// Matches the upload directory and filename pattern used by the shared upload
// middleware so that uploaded files can be served by the same static routes.
const uploadDir = path.resolve(__dirname, '../../../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const incomingStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});
const incomingUpload = multer({
  storage: incomingStorage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/tiff', 'image/bmp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB — same as general upload limit
});

router.post(
  '/',
  authenticate,
  requireRole(ROLES.DOCUMENT_CLERK, ROLES.ADMIN),
  createIncomingDocumentValidation,
  validateRequest,
  incomingDocumentsController.create.bind(incomingDocumentsController)
);

router.get(
  '/pending-for-head',
  authenticate,
  requireRole(ROLES.DEPARTMENT_HEAD, ROLES.ADMIN),
  incomingDocumentsController.listPendingForHead.bind(incomingDocumentsController)
);

router.get(
  '/pending-for-specialist',
  authenticate,
  requireRole(ROLES.SPECIALIST, ROLES.ADMIN),
  incomingDocumentsController.listPendingForSpecialist.bind(incomingDocumentsController)
);

router.get(
  '/',
  authenticate,
  incomingDocumentsController.list.bind(incomingDocumentsController)
);

// Thống kê Văn bản đến (thêm mới, phải đặt trước /:id)
router.get(
  '/statistics',
  authenticate,
  incomingDocumentsController.getStatistics.bind(incomingDocumentsController)
);

/**
 * Middleware to parse JSON-stringified and numeric fields from multipart/form-data requests.
 * Express-validator's `isArray()` only works on actual arrays; multipart/form-data
 * sends arrays as JSON strings, so we parse them first.
 * Numeric fields like pageCount and arrivalNumber also arrive as strings.
 */
function parseJsonFields(
  fields: string[],
): (req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction) => void {
  return (req, _res, next) => {
    for (const field of fields) {
      const raw = req.body[field];
      if (typeof raw === 'string' && raw.trimStart().startsWith('[')) {
        try {
          req.body[field] = JSON.parse(raw);
        } catch {
          // leave as-is and let validation report the error
        }
      }
    }
    // Parse integer fields that arrive as strings from multipart/form-data
    for (const field of ['pageCount', 'arrivalNumber']) {
      const raw = req.body[field];
      if (typeof raw === 'string' && raw.trim() !== '') {
        const parsed = Number(raw);
        if (!Number.isNaN(parsed) && Number.isInteger(parsed)) {
          req.body[field] = parsed;
        }
      }
    }
    next();
  };
}

// POST /incoming-documents/with-file — Create + upload file in one request
// Must be defined before /:id to avoid Express treating "with-file" as an id
//
// Accepts:
//   • file         — the main PDF/image used for OCR (maxCount: 1)
//   • attachments  — additional "Tệp đính kèm" files (maxCount: 20)
router.post(
  '/with-file',
  authenticate,
  requireRole(ROLES.DOCUMENT_CLERK, ROLES.ADMIN),
  incomingUpload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'attachments', maxCount: 20 },
  ]),
  parseJsonFields(['processorIds', 'attachments']),
  createIncomingDocumentWithFileValidation,
  validateRequest,
  incomingDocumentsController.createWithFile.bind(incomingDocumentsController)
);

// POST /incoming-documents/draft — Save a draft document (no processors required)
// Must be defined before /:id to avoid Express treating "draft" as an id
router.post(
  '/draft',
  authenticate,
  requireRole(ROLES.DOCUMENT_CLERK, ROLES.ADMIN),
  incomingDocumentsController.saveDraft.bind(incomingDocumentsController)
);

// POST /incoming-documents/draft/with-file — Save a draft document with file attachment
// Must be defined before /:id to avoid Express treating "with-file" as an id
//
// Accepts:
//   • file         — the main PDF/image used for OCR (maxCount: 1)
//   • attachments  — additional "Tệp đính kèm" files (maxCount: 20)
router.post(
  '/draft/with-file',
  authenticate,
  requireRole(ROLES.DOCUMENT_CLERK, ROLES.ADMIN),
  incomingUpload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'attachments', maxCount: 20 },
  ]),
  parseJsonFields(['attachments']),
  incomingDocumentsController.saveDraftWithFile.bind(incomingDocumentsController)
);

router.get(
  '/:id',
  authenticate,
  incomingDocumentsController.getById.bind(incomingDocumentsController)
);

// PUT /incoming-documents/:id/draft — Update an existing draft document
router.put(
  '/:id/draft',
  authenticate,
  requireRole(ROLES.DOCUMENT_CLERK, ROLES.ADMIN),
  incomingDocumentsController.updateDraft.bind(incomingDocumentsController)
);

// PUT /incoming-documents/:id/draft/with-file — Update draft with new file
//
// Accepts:
//   • file         — the main PDF/image used for OCR (maxCount: 1)
//   • attachments  — additional "Tệp đính kèm" files (maxCount: 20)
router.put(
  '/:id/draft/with-file',
  authenticate,
  requireRole(ROLES.DOCUMENT_CLERK, ROLES.ADMIN),
  incomingUpload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'attachments', maxCount: 20 },
  ]),
  parseJsonFields(['attachments']),
  incomingDocumentsController.updateDraftWithFile.bind(incomingDocumentsController)
);

router.patch(
  '/:id/status',
  authenticate,
  requireRole(ROLES.DOCUMENT_CLERK, ROLES.ADMIN),
  incomingDocumentsController.updateStatus.bind(incomingDocumentsController)
);

router.post(
  '/:id/register',
  authenticate,
  requireRole(ROLES.DOCUMENT_CLERK, ROLES.ADMIN),
  registerIncomingDocumentValidation,
  validateRequest,
  incomingDocumentsController.register.bind(incomingDocumentsController)
);

router.post(
  '/:id/view',
  authenticate,
  incomingDocumentsController.markViewed.bind(incomingDocumentsController)
);

router.post(
  '/:id/resubmit',
  authenticate,
  requireRole(ROLES.DOCUMENT_CLERK, ROLES.ADMIN),
  incomingDocumentsController.resubmit.bind(incomingDocumentsController)
);

router.post(
  '/:id/submit-draft',
  authenticate,
  requireRole(ROLES.DOCUMENT_CLERK, ROLES.ADMIN),
  incomingDocumentsController.submitDraft.bind(incomingDocumentsController)
);

router.patch(
  '/:id/workflow/:workflowId',
  authenticate,
  incomingDocumentsController.updateWorkflowStep.bind(incomingDocumentsController)
);

router.post(
  '/:id/processors/:userId/complete',
  authenticate,
  requireRole(ROLES.SPECIALIST, ROLES.ADMIN),
  incomingDocumentsController.completeProcessorTask.bind(incomingDocumentsController)
);

router.post(
  '/:id/process',
  authenticate,
  requireRole(ROLES.DEPARTMENT_HEAD, ROLES.ADMIN),
  processIncomingDocumentValidation,
  validateRequest,
  incomingDocumentsController.processByHead.bind(incomingDocumentsController)
);

router.post(
  '/:id/process-specialist',
  authenticate,
  requireRole(ROLES.SPECIALIST, ROLES.ADMIN),
  processSpecialistDocumentValidation,
  validateRequest,
  incomingDocumentsController.processBySpecialist.bind(incomingDocumentsController)
);

export default router;
