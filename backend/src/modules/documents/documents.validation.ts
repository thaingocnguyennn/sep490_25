import { body, query, param } from 'express-validator';

// ─── Validation for uploading a new document ─────────────────────────────────

export const uploadDocumentValidation = [
  body('documentNumber')
    .trim()
    .notEmpty()
    .withMessage('Document number is required')
    .isLength({ max: 100 })
    .withMessage('Document number must be at most 100 characters'),
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 500 })
    .withMessage('Title must be at most 500 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must be at most 2000 characters'),
  body('type')
    .notEmpty()
    .withMessage('Document type is required')
    .isIn(['INCOMING', 'OUTGOING', 'INTERNAL', 'ARCHIVAL'])
    .withMessage('Type must be INCOMING, OUTGOING, INTERNAL, or ARCHIVAL'),
  body('issuanceDate')
    .optional()
    .isISO8601()
    .withMessage('Issuance date must be a valid ISO 8601 date'),
  body('sendingAgency')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Sending agency must be at most 200 characters'),
  body('urgencyLevel')
    .optional()
    .isIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
    .withMessage('Urgency level must be LOW, NORMAL, HIGH, or URGENT'),
  body('confidentialityLevel')
    .optional()
    .isIn(['NORMAL', 'CONFIDENTIAL', 'TOP_SECRET'])
    .withMessage('Confidentiality must be NORMAL, CONFIDENTIAL, or TOP_SECRET'),
  body('category')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Category must be at most 100 characters'),
  body('departmentId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Invalid department ID'),
  body('processorId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Invalid processor ID'),
];

// ─── Validation for updating document metadata ──────────────────────────────

export const updateDocumentValidation = [
  param('id').isInt({ min: 1 }).withMessage('Invalid document ID'),
  body('documentNumber')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Document number must be 1-100 characters'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Title must be 1-500 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must be at most 2000 characters'),
  body('type')
    .optional()
    .isIn(['INCOMING', 'OUTGOING', 'INTERNAL', 'ARCHIVAL'])
    .withMessage('Type must be INCOMING, OUTGOING, INTERNAL, or ARCHIVAL'),
  body('issuanceDate')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('Issuance date must be a valid ISO 8601 date'),
  body('sendingAgency')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Sending agency must be at most 200 characters'),
  body('urgencyLevel')
    .optional()
    .isIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
    .withMessage('Urgency level must be LOW, NORMAL, HIGH, or URGENT'),
  body('confidentialityLevel')
    .optional()
    .isIn(['NORMAL', 'CONFIDENTIAL', 'TOP_SECRET'])
    .withMessage('Confidentiality must be NORMAL, CONFIDENTIAL, or TOP_SECRET'),
  body('category')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Category must be at most 100 characters'),
  body('departmentId')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage('Invalid department ID'),
  body('processorId')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage('Invalid processor ID'),
];

// ─── Validation for list/filter query parameters ────────────────────────────

export const getDocumentsValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Search term too long'),
  query('type')
    .optional()
    .isIn(['INCOMING', 'OUTGOING', 'INTERNAL', 'ARCHIVAL'])
    .withMessage('Invalid type filter'),
  query('status')
    .optional()
    .isIn(['ACTIVE', 'DELETED'])
    .withMessage('Invalid status filter'),
  query('urgencyLevel')
    .optional()
    .isIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
    .withMessage('Invalid urgency filter'),
  query('confidentialityLevel')
    .optional()
    .isIn(['NORMAL', 'CONFIDENTIAL', 'TOP_SECRET'])
    .withMessage('Invalid confidentiality filter'),
  query('departmentId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Invalid department ID'),
  query('processorId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Invalid processor ID'),
  query('dateFrom')
    .optional()
    .isISO8601()
    .withMessage('dateFrom must be a valid date'),
  query('dateTo')
    .optional()
    .isISO8601()
    .withMessage('dateTo must be a valid date'),
  query('format')
    .optional()
    .isIn(['excel', 'pdf'])
    .withMessage('Format must be excel or pdf'),
];

// ─── Validation for single document by ID ───────────────────────────────────

export const getDocumentByIdValidation = [
  param('id').isInt({ min: 1 }).withMessage('Invalid document ID'),
];

export const deleteDocumentValidation = [
  param('id').isInt({ min: 1 }).withMessage('Invalid document ID'),
];
