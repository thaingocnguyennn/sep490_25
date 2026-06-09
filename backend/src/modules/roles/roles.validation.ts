import { body, param } from 'express-validator';

export const createRoleValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Role name is required')
    .matches(/^[A-Z][A-Z0-9_]*$/)
    .withMessage(
      'Role name must be uppercase letters, numbers and underscores only (e.g. ADMIN, DEPARTMENT_HEAD, SPECIALIST)'
    ),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Description must be at most 255 characters'),
];

export const updateRoleValidation = [
  body('name')
    .optional()
    .trim()
    .matches(/^[A-Z][A-Z0-9_]*$/)
    .withMessage(
      'Role name must be uppercase letters, numbers and underscores only (e.g. ADMIN, DEPARTMENT_HEAD, SPECIALIST)'
    ),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Description must be at most 255 characters'),
];

export const getRoleByIdValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid role ID is required'),
];

export const deleteRoleValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid role ID is required'),
];
