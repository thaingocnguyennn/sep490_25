import { body, param, query } from 'express-validator';
import { DocumentType, Priority, DocumentStatus, OcrStatus } from '@prisma/client';

export const createDocumentValidation = [
  body('title').notEmpty().trim().withMessage('Title is required'),
  body('type')
    .isIn(Object.values(DocumentType))
    .withMessage('Invalid document type'),
  body('description').optional().trim(),
  body('fileUrl').optional().isURL().withMessage('File URL must be a valid URL'),
  body('ocrText').optional().trim(),
  body('priority')
    .optional()
    .isIn(Object.values(Priority))
    .withMessage('Invalid priority'),
  body('deadline').optional().isISO8601().withMessage('Deadline must be a valid date'),
  body('status')
    .optional()
    .isIn(Object.values(DocumentStatus))
    .withMessage('Invalid status'),
];

export const updateDocumentValidation = [
  param('id').isInt({ min: 1 }).withMessage('Invalid document ID'),
  body('title').optional().notEmpty().trim().withMessage('Title cannot be empty'),
  body('description').optional().trim(),
  body('fileUrl').optional().isURL().withMessage('File URL must be a valid URL'),
  body('ocrText').optional().trim(),
  body('priority')
    .optional()
    .isIn(Object.values(Priority))
    .withMessage('Invalid priority'),
  body('deadline').optional().isISO8601().withMessage('Deadline must be a valid date'),
  body('status')
    .optional()
    .isIn(Object.values(DocumentStatus))
    .withMessage('Invalid status'),
];

export const ocrValidation = [
  body('mimeType')
    .optional()
    .isIn(['image/png', 'image/jpeg', 'image/jpg', 'image/tiff', 'image/bmp', 'image/webp', 'application/pdf'])
    .withMessage('Unsupported file type'),
];
