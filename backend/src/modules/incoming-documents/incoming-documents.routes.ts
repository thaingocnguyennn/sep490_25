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
router.post(
  '/with-file',
  authenticate,
  requireRole(ROLES.DOCUMENT_CLERK, ROLES.ADMIN),
  incomingUpload.single('file'),
  parseJsonFields(['processorIds', 'attachments']),
  createIncomingDocumentWithFileValidation,
  validateRequest,
  incomingDocumentsController.createWithFile.bind(incomingDocumentsController)
);

router.get(
  '/:id',
  authenticate,
  incomingDocumentsController.getById.bind(incomingDocumentsController)
);

router.patch(
  '/:id/status',
  authenticate,
  incomingDocumentsController.updateStatus.bind(incomingDocumentsController)
);

router.patch(
  '/:id/workflow/:workflowId',
  authenticate,
  incomingDocumentsController.updateWorkflowStep.bind(incomingDocumentsController)
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
