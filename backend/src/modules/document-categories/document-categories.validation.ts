import { body, param } from 'express-validator';
import { DocumentCategoryStatus } from '@prisma/client';
import { normalizeDocumentCategoryCode } from './document-categories.helpers';

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const NAME_MAX_LENGTH = 100;
const CODE_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 500;
const CODE_PATTERN = /^[A-Z0-9_]+$/;

// ──────────────────────────────────────────────────────────────────────────────
// Create validation
// ──────────────────────────────────────────────────────────────────────────────

export const createDocumentCategoryValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Tên lĩnh vực văn bản là bắt buộc')
    .isLength({ max: NAME_MAX_LENGTH })
    .withMessage(`Tên lĩnh vực văn bản không được vượt quá ${NAME_MAX_LENGTH} ký tự`),

  body('code')
    .trim()
    .notEmpty()
    .withMessage('Mã lĩnh vực văn bản là bắt buộc')
    .isLength({ max: CODE_MAX_LENGTH })
    .withMessage(`Mã lĩnh vực văn bản không được vượt quá ${CODE_MAX_LENGTH} ký tự`)
    .customSanitizer((value: string) => normalizeDocumentCategoryCode(value))
    .custom((value: string) => {
      if (!CODE_PATTERN.test(value)) {
        throw new Error(
          'Mã lĩnh vực văn bản chỉ được chứa chữ hoa (A-Z), số (0-9) và dấu gạch dưới (_)',
        );
      }
      return true;
    }),

  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: DESCRIPTION_MAX_LENGTH })
    .withMessage(`Mô tả không được vượt quá ${DESCRIPTION_MAX_LENGTH} ký tự`),

  body('status')
    .optional()
    .isIn(Object.values(DocumentCategoryStatus))
    .withMessage('Trạng thái không hợp lệ'),
];

// ──────────────────────────────────────────────────────────────────────────────
// Update validation
// ──────────────────────────────────────────────────────────────────────────────

export const updateDocumentCategoryValidation = [
  param('id')
    .isInt({ min: 1 })
    .toInt()
    .withMessage('ID lĩnh vực văn bản không hợp lệ'),

  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Tên lĩnh vực văn bản không được để trống')
    .isLength({ max: NAME_MAX_LENGTH })
    .withMessage(`Tên lĩnh vực văn bản không được vượt quá ${NAME_MAX_LENGTH} ký tự`),

  body('code')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Mã lĩnh vực văn bản không được để trống')
    .isLength({ max: CODE_MAX_LENGTH })
    .withMessage(`Mã lĩnh vực văn bản không được vượt quá ${CODE_MAX_LENGTH} ký tự`)
    .customSanitizer((value: string) => normalizeDocumentCategoryCode(value))
    .custom((value: string) => {
      if (!CODE_PATTERN.test(value)) {
        throw new Error(
          'Mã lĩnh vực văn bản chỉ được chứa chữ hoa (A-Z), số (0-9) và dấu gạch dưới (_)',
        );
      }
      return true;
    }),

  body('description')
    .optional({ nullable: true })
    .custom((value) => {
      if (value !== null && typeof value === 'string' && value.length > DESCRIPTION_MAX_LENGTH) {
        throw new Error(`Mô tả không được vượt quá ${DESCRIPTION_MAX_LENGTH} ký tự`);
      }
      return true;
    }),

  body('status')
    .optional()
    .isIn(Object.values(DocumentCategoryStatus))
    .withMessage('Trạng thái không hợp lệ'),
];

// ──────────────────────────────────────────────────────────────────────────────
// ID param validation (dùng cho delete và findById)
// ──────────────────────────────────────────────────────────────────────────────

export const documentCategoryIdParamValidation = [
  param('id')
    .isInt({ min: 1 })
    .toInt()
    .withMessage('ID lĩnh vực văn bản không hợp lệ'),
];
