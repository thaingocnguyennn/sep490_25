import { Router } from 'express';
import { authenticate } from '../shared/middlewares/auth.middleware';
import authRoutes from '../modules/auth/auth.routes';
import usersRoutes from '../modules/users/users.routes';
import rolesRoutes from '../modules/roles/roles.routes';
import usersAdminRoutes from '../modules/users/users.admin.routes';

const router = Router();

router.use('/auth', authRoutes);

// All routes below this line require authentication.
// Global authenticate middleware is applied once here rather than per-module.
router.use(authenticate);

router.use('/users', usersRoutes);
router.use('/admin/users', usersAdminRoutes);
router.use('/admin/roles', rolesRoutes);

export default router;
