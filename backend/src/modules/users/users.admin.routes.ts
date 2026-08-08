import { Router } from 'express';
import { validateRequest } from '../../shared/middlewares/validate.middleware';
import { usersController } from './users.controller';
import {
  createUserValidation,
  updateUserValidation,
  getUsersValidation,
  getUserByIdValidation,
  deleteUserValidation,
} from './users.validation';

const router = Router();

router.get(
  '/',
  getUsersValidation,
  validateRequest,
  usersController.getAll.bind(usersController)
);

router.get(
  '/:id',
  getUserByIdValidation,
  validateRequest,
  usersController.getById.bind(usersController)
);

router.post(
  '/',
  createUserValidation,
  validateRequest,
  usersController.create.bind(usersController)
);

router.put(
  '/:id',
  updateUserValidation,
  validateRequest,
  usersController.update.bind(usersController)
);

router.delete(
  '/:id',
  deleteUserValidation,
  validateRequest,
  usersController.delete.bind(usersController)
);

router.patch(
  '/:id/lock',
  usersController.lock.bind(usersController)
);

router.patch(
  '/:id/unlock',
  usersController.unlock.bind(usersController)
);

export default router;
