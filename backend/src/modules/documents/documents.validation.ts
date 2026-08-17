import { body, query, param } from 'express-validator';
import { DocumentDirection, DocumentLifecycleStatus } from '@prisma/client';

// Allowed urgency lookup values (seeded names, legacy aliases, numeric ids)
const URGENCY_ALLOWED = ['THUONG', 'KHAN', 'THUONG_KHAN', 'THUONG_KHAU', 'HOA_TOC'];
const isValidUrgency = (v: string) => URGENCY_ALLOWED.includes(v) || /^\d+$/.test(v);

// ─── Validation for uploading a new document ─────────────────────────────────

export const uploadDocumentValidation = [
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
  body('urgency')
    .optional()
    .custom((value) => {
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error('Urgency must be a string or number');
      }
      if (!isValidUrgency(String(value).trim().toUpperCase())) {
        throw new Error('Invalid urgency value');
      }
      return true;
    }),
  body('urgencyId')
    .optional()
    .custom((value) => {
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error('Urgency id must be a string or number');
      }
      if (!isValidUrgency(String(value).trim().toUpperCase())) {
        throw new Error('Invalid urgency id');
      }
      return true;
    }),
  body('confidentialityLevel')
    .optional()
    // Accept legacy enum values (NORMAL/CONFIDENTIAL/TOP_SECRET), seeded names
    // (THUONG/MAT/TOI_MAT/TUYET_MAT), codes (A/B/C), or a numeric id.
    .custom((value) => {
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error('Confidentiality must be a string or number');
      }
      const v = String(value).trim().toUpperCase();
      const allowed = [
        'NORMAL', 'CONFIDENTIAL', 'TOP_SECRET',
        'THUONG', 'MAT', 'TOI_MAT', 'TUYET_MAT',
        'A', 'B', 'C',
      ];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Invalid confidentiality value');
      }
      return true;
    }),
  body('confidentialityId')
    .optional()
    .custom((value) => {
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error('Confidentiality id must be a string or number');
      }
      const v = String(value).trim().toUpperCase();
      const allowed = ['A', 'B', 'C', 'THUONG', 'MAT', 'TOI_MAT', 'TUYET_MAT'];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Invalid confidentiality id');
      }
      return true;
    }),
  body('category')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Category must be at most 100 characters'),
  body('categoryId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Invalid category ID'),
  body('documentTypeId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Invalid document type ID'),
  body('documentTypeRef')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Invalid document type ref ID'),
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
  body('issuer')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 200 })
    .withMessage('Issuer must be at most 200 characters'),
  body('signerName')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 200 })
    .withMessage('Signer name must be at most 200 characters'),
  body('signerTitle')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 200 })
    .withMessage('Signer title must be at most 200 characters'),
  body('notes')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Notes must be at most 2000 characters'),
  body('urgency')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null) return true;
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error('Urgency must be a string or number');
      }
      if (!isValidUrgency(String(value).trim().toUpperCase())) {
        throw new Error('Invalid urgency value');
      }
      return true;
    }),
  body('urgencyId')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null) return true;
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error('Urgency id must be a string or number');
      }
      if (!isValidUrgency(String(value).trim().toUpperCase())) {
        throw new Error('Invalid urgency id');
      }
      return true;
    }),
  body('confidentialityLevel')
    .optional()
    .custom((value) => {
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error('Confidentiality must be a string or number');
      }
      const v = String(value).trim().toUpperCase();
      const allowed = [
        'NORMAL', 'CONFIDENTIAL', 'TOP_SECRET',
        'THUONG', 'MAT', 'TOI_MAT', 'TUYET_MAT',
        'A', 'B', 'C',
      ];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Invalid confidentiality value');
      }
      return true;
    }),
  body('confidentialityId')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null) return true;
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error('Confidentiality id must be a string or number');
      }
      const v = String(value).trim().toUpperCase();
      const allowed = ['A', 'B', 'C', 'THUONG', 'MAT', 'TOI_MAT', 'TUYET_MAT'];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Invalid confidentiality id');
      }
      return true;
    }),
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
  query('urgency')
    .optional()
    .custom((value) => {
      if (!isValidUrgency(String(value).trim().toUpperCase())) {
        throw new Error('Invalid urgency filter');
      }
      return true;
    }),
  query('urgencyId')
    .optional()
    .custom((value) => {
      if (!isValidUrgency(String(value).trim().toUpperCase())) {
        throw new Error('Invalid urgency id filter');
      }
      return true;
    }),
  query('confidentialityLevel')
    .optional()
    .custom((value) => {
      const v = String(value).trim().toUpperCase();
      const allowed = [
        'NORMAL', 'CONFIDENTIAL', 'TOP_SECRET',
        'THUONG', 'MAT', 'TOI_MAT', 'TUYET_MAT',
        'A', 'B', 'C',
      ];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Invalid confidentiality filter');
      }
      return true;
    }),
  query('confidentialityId')
    .optional()
    .custom((value) => {
      const v = String(value).trim().toUpperCase();
      const allowed = ['A', 'B', 'C', 'THUONG', 'MAT', 'TOI_MAT', 'TUYET_MAT'];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Invalid confidentiality id filter');
      }
      return true;
    }),
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
  param('id').isInt().withMessage('Mã tài liệu phải là số nguyên'),
];

export const reopenDocumentValidation = [
  param('id').isInt().withMessage('Mã tài liệu phải là số nguyên'),
  body('reason').notEmpty().withMessage('Lý do mở lại không được để trống'),
];

export const updateDocumentStatusValidation = [
  param('id').isInt().withMessage('Mã tài liệu phải là số nguyên'),
  body('status').notEmpty().withMessage('Trạng thái không được để trống'),
];

// ─── Validation for OCR ─────────────────────────────────────────────────────

export const ocrValidation = [
  body('mimeType')
    .optional()
    .isIn(['image/png', 'image/jpeg', 'image/jpg', 'image/tiff', 'image/bmp', 'image/webp', 'application/pdf'])
    .withMessage('Unsupported file type'),
  body('mode')
    .optional()
    .isIn(['INCOMING', 'OUTGOING'])
    .withMessage('Mode must be either INCOMING or OUTGOING'),
];
