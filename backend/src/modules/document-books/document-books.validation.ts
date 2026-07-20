import { body, param, query } from 'express-validator';
import { DocumentBookType, DocumentBookStatus } from '@prisma/client';

const currentYear = new Date().getFullYear();

export const listDocumentBooksValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1 }).toInt(),
  query('search').optional().isString().trim(),
  query('bookType').optional().isIn(Object.values(DocumentBookType)),
  query('year').optional().isInt().toInt(),
  query('departmentId').optional().isInt({ min: 1 }).toInt(),
  query('status').optional().isIn(Object.values(DocumentBookStatus)),
  query('isDefault').optional().isBoolean().toBoolean(),
];

export const getDocumentBookValidation = [
  param('id').isInt({ min: 1 }).toInt().withMessage('ID sổ văn bản không hợp lệ'),
];

export const createDocumentBookValidation = [
  body('name').trim().notEmpty().withMessage('Tên sổ là bắt buộc').isLength({ max: 255 }),
  body('code').optional({ values: 'falsy' }).trim().isLength({ max: 50 }),
  body('description').optional({ values: 'falsy' }).trim(),
  body('bookType').isIn(Object.values(DocumentBookType)).withMessage('Loại sổ không hợp lệ'),
  body('year').optional().isInt({ min: 2000, max: currentYear + 1 }).toInt(),
  body('isDefault').optional().isBoolean().toBoolean(),
  body('departmentId').isInt({ min: 1 }).toInt().withMessage('ID phòng ban là bắt buộc'),
];

export const updateDocumentBookValidation = [
  param('id').isInt({ min: 1 }).toInt().withMessage('ID sổ văn bản không hợp lệ'),
  body('name').optional().trim().notEmpty().withMessage('Tên sổ không được để trống').isLength({ max: 255 }),
  body('code').optional({ nullable: true }).trim().isLength({ max: 50 }),
  body('description').optional({ nullable: true }).trim(),
  body('isDefault').optional().isBoolean().toBoolean(),
  body('status').optional().isIn(Object.values(DocumentBookStatus)),
];

export const bookIdParamValidation = [
  param('id').isInt({ min: 1 }).toInt().withMessage('ID sổ văn bản không hợp lệ'),
];
