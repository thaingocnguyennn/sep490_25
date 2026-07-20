import { body, param } from 'express-validator';

export const registerIncomingDocumentValidation = [
  param('id').isInt({ min: 1 }).withMessage('ID văn bản không hợp lệ'),
  body('documentBookId').isInt({ min: 1 }).withMessage('ID sổ văn bản là bắt buộc'),
  body('customArrivalDate').optional({ nullable: true }).isISO8601().withMessage('Ngày đến không hợp lệ'),
];
export const createIncomingDocumentValidation = [
  body('issuer').optional().trim(),
  body('documentType').optional().trim(),
  body('documentNumber').optional().trim(),
  body('arrivalNumber').optional().isInt({ min: 1 }).withMessage('Số đến phải là số nguyên dương'),
  body('signerName').optional().trim(),
  body('signerTitle').optional().trim(),
  body('dateLetter')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('Ngày ban hành phải là chuỗi ngày hợp lệ'),
  body('dateReceived').notEmpty().withMessage('Ngày đến là bắt buộc'),
  body('summary').optional().trim(),
  body('pageCount').optional().isInt({ min: 1 }).withMessage('Số trang phải là số nguyên dương'),
  body('urgency')
    .optional()
    .custom((value) => {
      const v = String(value).trim().toUpperCase();
      const allowed = ['THUONG', 'KHAN', 'THUONG_KHAN', 'THUONG_KHAU', 'HOA_TOC'];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Độ khẩn không hợp lệ. Các giá trị hợp lệ: THUONG, KHAN, THUONG_KHAN, HOA_TOC');
      }
      return true;
    }),
  body('urgencyId')
    .optional()
    .custom((value) => {
      const v = String(value).trim().toUpperCase();
      const allowed = ['THUONG', 'KHAN', 'THUONG_KHAN', 'THUONG_KHAU', 'HOA_TOC'];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Độ khẩn không hợp lệ');
      }
      return true;
    }),
  body('confidentialityLevel')
    .optional()
    .custom((value) => {
      const v = String(value).trim().toUpperCase();
      const allowed = ['THUONG', 'MAT', 'TOI_MAT', 'TUYET_MAT'];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Độ mật không hợp lệ. Các giá trị hợp lệ: THUONG, MAT, TOI_MAT, TUYET_MAT');
      }
      return true;
    }),
  body('confidentialityId')
    .optional()
    .custom((value) => {
      const v = String(value).trim().toUpperCase();
      const allowed = ['THUONG', 'MAT', 'TOI_MAT', 'TUYET_MAT'];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Độ mật không hợp lệ');
      }
      return true;
    }),
  body('notes').optional().trim(),
  body('processingInstructions').optional().trim(),
  body('processorIds').isArray({ min: 1 }).withMessage('Phải chọn ít nhất một người xử lý'),
  body('processorIds.*.userId').isInt({ min: 1 }).withMessage('ID người dùng không hợp lệ'),
  body('processorIds.*.processorType')
    .isIn(['XLC', 'PHXL', 'XDB'])
    .withMessage('Loại xử lý không hợp lệ'),
  body('attachments').optional().isArray().withMessage('Tệp đính kèm phải là một mảng'),
];

/**
 * Validation for POST /incoming-documents/with-file
 * Reuses the same field rules as createIncomingDocumentValidation,
 * but without role checks (handled by requireRole on the route).
 * File validation is done by multer middleware, not express-validator.
 */
export const createIncomingDocumentWithFileValidation = [
  body('issuer').optional().trim(),
  body('documentType').optional().trim(),
  body('documentNumber').optional().trim(),
  body('arrivalNumber').optional().isInt({ min: 1 }).withMessage('Số đến phải là số nguyên dương'),
  body('signerName').optional().trim(),
  body('signerTitle').optional().trim(),
  body('dateLetter')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('Ngày ban hành phải là chuỗi ngày hợp lệ'),
  body('dateReceived').notEmpty().withMessage('Ngày đến là bắt buộc'),
  body('summary').optional().trim(),
  body('pageCount').optional().isInt({ min: 1 }).withMessage('Số trang phải là số nguyên dương'),
  body('urgency')
    .optional()
    .custom((value) => {
      const v = String(value).trim().toUpperCase();
      const allowed = ['THUONG', 'KHAN', 'THUONG_KHAN', 'THUONG_KHAU', 'HOA_TOC'];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Độ khẩn không hợp lệ. Các giá trị hợp lệ: THUONG, KHAN, THUONG_KHAN, HOA_TOC');
      }
      return true;
    }),
  body('urgencyId')
    .optional()
    .custom((value) => {
      const v = String(value).trim().toUpperCase();
      const allowed = ['THUONG', 'KHAN', 'THUONG_KHAN', 'THUONG_KHAU', 'HOA_TOC'];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Độ khẩn không hợp lệ');
      }
      return true;
    }),
  body('confidentialityLevel')
    .optional()
    .custom((value) => {
      const v = String(value).trim().toUpperCase();
      const allowed = ['THUONG', 'MAT', 'TOI_MAT', 'TUYET_MAT'];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Độ mật không hợp lệ. Các giá trị hợp lệ: THUONG, MAT, TOI_MAT, TUYET_MAT');
      }
      return true;
    }),
  body('confidentialityId')
    .optional()
    .custom((value) => {
      const v = String(value).trim().toUpperCase();
      const allowed = ['THUONG', 'MAT', 'TOI_MAT', 'TUYET_MAT'];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Độ mật không hợp lệ');
      }
      return true;
    }),
  body('notes').optional().trim(),
  body('processingInstructions').optional().trim(),
  body('processorIds').isArray({ min: 1 }).withMessage('Phải chọn ít nhất một người xử lý'),
  body('processorIds.*.userId').isInt({ min: 1 }).withMessage('ID người dùng không hợp lệ'),
  body('processorIds.*.processorType')
    .isIn(['XLC', 'PHXL', 'XDB'])
    .withMessage('Loại xử lý không hợp lệ'),
  body('attachments').optional().isArray().withMessage('Tệp đính kèm phải là một mảng'),
];

export const processIncomingDocumentValidation = [
  body('action')
    .notEmpty()
    .withMessage('Hành động là bắt buộc')
    .isIn(['FINISH', 'FORWARD', 'RETURN'])
    .withMessage('Hành động không hợp lệ'),
  body('processorIds')
    .if(body('action').equals('FORWARD'))
    .isArray({ min: 1 })
    .withMessage('Phải chọn ít nhất một người xử lý'),
  body('processorIds.*.userId')
    .if(body('action').equals('FORWARD'))
    .isInt({ min: 1 })
    .withMessage('ID người dùng không hợp lệ'),
  body('processorIds.*.processorType')
    .if(body('action').equals('FORWARD'))
    .isIn(['XLC', 'PHXL', 'XDB'])
    .withMessage('Loại xử lý không hợp lệ'),
  body('processingInstructions')
    .optional({ values: 'falsy' })
    .isString()
    .isLength({ max: 2000 })
    .withMessage('Hướng dẫn xử lý tối đa 2000 ký tự'),
  body('deadline')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('Hạn xử lý phải là chuỗi ngày hợp lệ'),
  body('reason')
    .optional({ values: 'falsy' })
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Lý do trả lại tối đa 1000 ký tự'),
  body('attachments')
    .optional()
    .isArray()
    .withMessage('Tệp đính kèm phải là một mảng'),
];

export const processSpecialistDocumentValidation = [
  body('action')
    .notEmpty()
    .withMessage('Hành động là bắt buộc')
    .isIn(['COMPLETE', 'TRANSFER', 'RETURN_TO_HEAD'])
    .withMessage('Hành động không hợp lệ. Các giá trị hợp lệ: COMPLETE, TRANSFER, RETURN_TO_HEAD'),
  body('processorIds')
    .if(body('action').equals('TRANSFER'))
    .isArray({ min: 1 })
    .withMessage('Phải chọn ít nhất một người xử lý'),
  body('processorIds.*.userId')
    .if(body('action').equals('TRANSFER'))
    .isInt({ min: 1 })
    .withMessage('ID người dùng không hợp lệ'),
  body('processorIds.*.processorType')
    .if(body('action').equals('TRANSFER'))
    .isIn(['XLC', 'PHXL', 'XDB'])
    .withMessage('Loại xử lý không hợp lệ'),
  body('processingInstructions')
    .optional({ values: 'falsy' })
    .isString()
    .isLength({ max: 2000 })
    .withMessage('Hướng dẫn xử lý tối đa 2000 ký tự'),
  body('reason')
    .if(body('action').equals('RETURN_TO_HEAD'))
    .notEmpty()
    .withMessage('Lý do trả lại là bắt buộc')
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Lý do trả lại tối đa 1000 ký tự'),
];
