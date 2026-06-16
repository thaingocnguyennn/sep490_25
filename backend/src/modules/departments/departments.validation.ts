import { body, param, query } from 'express-validator';

export const listDepartmentsValidation = [
  query('search')
    .optional()
    .trim()
    .isString()
    .isLength({ max: 100 })
    .withMessage('Search must be at most 100 characters'),
  query('includeUserCount')
    .optional()
    .isBoolean()
    .withMessage('includeUserCount must be a boolean')
    .toBoolean(),
];

export const getDepartmentValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid department ID is required'),
];

export const createDepartmentValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Department name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Department name must be 1-100 characters'),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be at most 500 characters'),
  body('parentId')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('parentId must be a positive integer'),
];

export const updateDepartmentValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid department ID is required'),
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Department name cannot be empty')
    .isLength({ min: 1, max: 100 })
    .withMessage('Department name must be 1-100 characters'),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be at most 500 characters'),
  body('parentId')
    .optional({ values: 'falsy' })
    .custom((value) => {
      if (value === null) return true;
      if (Number.isInteger(value) && value >= 1) return true;
      throw new Error('parentId must be a positive integer or null');
    }),
];

export const deleteDepartmentValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid department ID is required'),
];
