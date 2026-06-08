import { body, param } from 'express-validator';

export const createRoleValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Role name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Role name must be 2-50 characters')
    .matches(/^[A-Z_]+$/)
    .withMessage('Role name must be uppercase letters and underscores only (e.g. ROLE_ADMIN, MANAGER)'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Description must be at most 255 characters'),
];

export const updateRoleValidation = [
  param('id').isInt({ min: 1 }).withMessage('Invalid role ID'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Role name must be 2-50 characters')
    .matches(/^[A-Z_]+$/)
    .withMessage('Role name must be uppercase letters and underscores only (e.g. ROLE_ADMIN, MANAGER)'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Description must be at most 255 characters'),
];

export const getRoleByIdValidation = [
  param('id').isInt({ min: 1 }).withMessage('Invalid role ID'),
];

export const deleteRoleValidation = [
  param('id').isInt({ min: 1 }).withMessage('Invalid role ID'),
];
