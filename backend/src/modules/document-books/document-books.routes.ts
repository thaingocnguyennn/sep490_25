import { Router } from 'express';
import { documentBooksController } from './document-books.controller';
import { requireRole } from '../../shared/middlewares/require-role.middleware';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import { ROLES } from '../../shared/constants/roles';
import {
  listDocumentBooksValidation,
  getDocumentBookValidation,
  createDocumentBookValidation,
  updateDocumentBookValidation,
  bookIdParamValidation,
} from './document-books.validation';

const router = Router();

// Phân quyền: Đa số các thao tác CRUD sổ văn bản được thực hiện bởi Văn thư (DOCUMENT_CLERK) hoặc ADMIN
router.use(requireRole(ROLES.DOCUMENT_CLERK, ROLES.ADMIN));

router.get(
  '/',
  listDocumentBooksValidation,
  validateRequest,
  documentBooksController.list
);

router.post(
  '/',
  createDocumentBookValidation,
  validateRequest,
  documentBooksController.create
);

router.get(
  '/:id',
  getDocumentBookValidation,
  validateRequest,
  documentBooksController.getById
);

router.get(
  '/:id/entries',
  bookIdParamValidation,
  validateRequest,
  documentBooksController.getEntries
);

router.patch(
  '/:id',
  updateDocumentBookValidation,
  validateRequest,
  documentBooksController.update
);

router.delete(
  '/:id',
  bookIdParamValidation,
  validateRequest,
  documentBooksController.delete
);

router.post(
  '/:id/close',
  bookIdParamValidation,
  validateRequest,
  documentBooksController.closeBook
);

router.post(
  '/:id/reopen',
  bookIdParamValidation,
  validateRequest,
  documentBooksController.reopenBook
);

export default router;
