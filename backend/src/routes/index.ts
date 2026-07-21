import { Router } from 'express';
import { authenticate } from '../shared/middlewares/auth.middleware';
import authRoutes from '../modules/auth/auth.routes';
import usersRoutes from '../modules/users/users.routes';
import rolesRoutes from '../modules/roles/roles.routes';
import usersAdminRoutes from '../modules/users/users.admin.routes';
import documentsRoutes from '../modules/documents/documents.routes';
import incomingDocumentsRoutes from '../modules/incoming-documents/incoming-documents.routes';
import outgoingDocumentsRoutes from '../modules/outgoing-documents/outgoing-documents.routes';
import departmentsRoutes from '../modules/departments/departments.routes';
import documentBooksRoutes from '../modules/document-books/document-books.routes';
import documentCategoriesRoutes from '../modules/document-categories/document-categories.routes';

const router = Router();

router.use('/auth', authRoutes);

// All routes below this line require authentication.
router.use(authenticate);

router.use('/users', usersRoutes);
router.use('/admin/users', usersAdminRoutes);
router.use('/admin/roles', rolesRoutes);
router.use('/documents', documentsRoutes);
router.use('/incoming-documents', incomingDocumentsRoutes);
router.use('/outgoing-documents', outgoingDocumentsRoutes);
router.use('/departments', departmentsRoutes);
router.use('/document-books', documentBooksRoutes);
router.use('/document-categories', documentCategoriesRoutes);


export default router;
