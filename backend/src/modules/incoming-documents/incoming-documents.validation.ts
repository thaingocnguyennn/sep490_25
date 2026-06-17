import { body } from 'express-validator';

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
  body('urgency').optional().isIn(['THUONG', 'KHAN', 'THUONG_KHAU', 'HOA_TOC']).withMessage('Độ khẩn không hợp lệ'),
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
