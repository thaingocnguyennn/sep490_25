import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { documentsController } from './documents.controller';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRole } from '../../shared/middlewares/require-role.middleware';
import { ROLES } from '../../shared/constants/roles';
import {
  createDocumentValidation,
  updateDocumentValidation,
  ocrValidation,
} from './documents.validation';

const router = Router();

const upload = multer({
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

router.post(
  '/ocr',
  authenticate,
  upload.single('file'),
  ocrValidation,
  validateRequest,
  documentsController.performOcr.bind(documentsController)
);

router.post(
  '/',
  authenticate,
  requireRole(ROLES.DOCUMENT_CLERK, ROLES.ADMIN),
  createDocumentValidation,
  validateRequest,
  documentsController.create.bind(documentsController)
);

router.get(
  '/',
  authenticate,
  documentsController.list.bind(documentsController)
);

router.get(
  '/:id',
  authenticate,
  documentsController.getById.bind(documentsController)
);

router.put(
  '/:id',
  authenticate,
  requireRole(ROLES.DOCUMENT_CLERK, ROLES.ADMIN),
  updateDocumentValidation,
  validateRequest,
  documentsController.update.bind(documentsController)
);

router.delete(
  '/:id',
  authenticate,
  requireRole(ROLES.ADMIN),
  documentsController.delete.bind(documentsController)
);

export default router;
