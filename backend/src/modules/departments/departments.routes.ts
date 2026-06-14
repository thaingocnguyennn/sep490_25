import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { departmentsController } from './departments.controller';

const router = Router();

router.use(authenticate);

router.get('/', departmentsController.list.bind(departmentsController));
router.get('/:id', departmentsController.getById.bind(departmentsController));

export default router;
