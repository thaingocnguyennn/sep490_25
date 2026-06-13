import { body } from 'express-validator';

export const createIncomingDocumentValidation = [
  body('issuer').optional().trim(),
  body('documentType').optional().trim(),
  body('documentNumber').optional().trim(),
  body('arrivalNumber').optional().isInt({ min: 1 }).withMessage('Số đến phải là số nguyên dương'),
  body('signerName').optional().trim(),
  body('signerTitle').optional().trim(),
  body('dateLetter').optional().isISO8601().withMessage('Ngày ban hành phải là ngày hợp lệ'),
  body('dateReceived').notEmpty().withMessage('Ngày đến là bắt buộc'),
  body('summary').optional().trim(),
  body('pageCount').optional().isInt({ min: 1 }).withMessage('Số trang phải là số nguyên dương'),
  body('urgency').optional().isIn(['THUONG', 'KHAN', 'THUONG_KHAU', 'HOA_TOC']).withMessage('Độ khẩn không hợp lệ'),
  body('notes').optional().trim(),
  body('processingInstructions').optional().trim(),
  body('departmentId').optional().isInt({ min: 1 }).withMessage('ID phòng ban không hợp lệ'),
  body('processorIds').isArray({ min: 1 }).withMessage('Phải chọn ít nhất một người xử lý'),
  body('processorIds.*.userId').isInt({ min: 1 }).withMessage('ID người dùng không hợp lệ'),
  body('processorIds.*.processorType')
    .isIn(['XLC', 'PHXL', 'XDB'])
    .withMessage('Loại xử lý không hợp lệ'),
  body('attachments').optional().isArray().withMessage('Tệp đính kèm phải là một mảng'),
];
