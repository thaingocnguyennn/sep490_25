import { body, param } from 'express-validator';

// ──────────────────────────────────────────────────────────────────────────────
// ID param
// ──────────────────────────────────────────────────────────────────────────────

export const documentTypeIdParamValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID thể loại văn bản phải là số nguyên dương'),
];

// ──────────────────────────────────────────────────────────────────────────────
// CREATE (UC-71)
// ──────────────────────────────────────────────────────────────────────────────

export const createDocumentTypeValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Tên thể loại văn bản không được để trống')
    .isLength({ max: 100 }).withMessage('Tên thể loại văn bản tối đa 100 ký tự'),

  body('code')
    .trim()
    .notEmpty().withMessage('Mã thể loại văn bản không được để trống')
    .isLength({ max: 20 }).withMessage('Mã thể loại văn bản tối đa 20 ký tự')
    .custom((value: string) => {
      if (/\s/.test(value)) {
        throw new Error('Mã thể loại không được chứa khoảng trắng');
      }
      if (value.includes('/')) {
        throw new Error('Mã thể loại không được chứa dấu /');
      }
      return true;
    }),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Mô tả tối đa 500 ký tự'),

  body('status')
    .optional()
    .isIn(['ACTIVE', 'INACTIVE']).withMessage('Trạng thái phải là ACTIVE hoặc INACTIVE'),
];

// ──────────────────────────────────────────────────────────────────────────────
// UPDATE (UC-73)
// ──────────────────────────────────────────────────────────────────────────────

export const updateDocumentTypeValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID thể loại văn bản phải là số nguyên dương'),

  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('Tên thể loại không được chỉ chứa khoảng trắng')
    .isLength({ max: 100 }).withMessage('Tên thể loại văn bản tối đa 100 ký tự'),

  body('code')
    .optional()
    .trim()
    .notEmpty().withMessage('Mã thể loại không được chỉ chứa khoảng trắng')
    .isLength({ max: 20 }).withMessage('Mã thể loại văn bản tối đa 20 ký tự')
    .custom((value: string) => {
      if (/\s/.test(value)) {
        throw new Error('Mã thể loại không được chứa khoảng trắng');
      }
      if (value.includes('/')) {
        throw new Error('Mã thể loại không được chứa dấu /');
      }
      return true;
    }),

  body('description')
    .optional({ nullable: true })
    .custom((value) => {
      if (value !== null && typeof value === 'string' && value.length > 500) {
        throw new Error('Mô tả tối đa 500 ký tự');
      }
      return true;
    }),

  body('status')
    .optional()
    .isIn(['ACTIVE', 'INACTIVE']).withMessage('Trạng thái phải là ACTIVE hoặc INACTIVE'),

  // Block fields that must not come from client
  body('normalizedName').not().exists().withMessage('Không được phép truyền normalizedName'),
  body('isSystem').not().exists().withMessage('Không được phép truyền isSystem'),
  body('deletedAt').not().exists().withMessage('Không được phép truyền deletedAt'),
  body('createdById').not().exists().withMessage('Không được phép truyền createdById'),
  body('updatedById').not().exists().withMessage('Không được phép truyền updatedById'),
];
