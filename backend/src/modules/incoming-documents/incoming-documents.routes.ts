import { Router } from 'express';
import { incomingDocumentsController } from './incoming-documents.controller';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRole } from '../../shared/middlewares/require-role.middleware';
import { ROLES } from '../../shared/constants/roles';
import {
  createIncomingDocumentValidation,
  processIncomingDocumentValidation,
} from './incoming-documents.validation';

const router = Router();

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

export default router;
