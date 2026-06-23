import { body, param, query } from 'express-validator';

// ─── Validation tạo văn bản đi ────────────────────────────────────────────────

export const createOutgoingDocumentValidation = [
  body('title')
    .trim()
    .notEmpty().withMessage('Tiêu đề văn bản không được để trống')
    .isLength({ max: 500 }).withMessage('Tiêu đề tối đa 500 ký tự'),

  body('description')
    .optional()
    .trim()
    .isString().withMessage('Mô tả phải là chuỗi ký tự'),

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

  body('confidentialityLevel')
    .optional()
    .custom((value) => {
      const v = String(value).trim().toUpperCase();
      const allowed = [
        'NORMAL', 'CONFIDENTIAL', 'TOP_SECRET',
        'THUONG', 'MAT', 'TOI_MAT', 'TUYET_MAT',
        'A', 'B', 'C',
      ];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Mức độ mật không hợp lệ');
      }
      return true;
    }),

  body('confidentialityId')
    .optional()
    .custom((value) => {
      const v = String(value).trim().toUpperCase();
      const allowed = ['A', 'B', 'C', 'THUONG', 'MAT', 'TOI_MAT', 'TUYET_MAT'];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Mức độ mật không hợp lệ');
      }
      return true;
    }),

  body('departmentId')
    .optional()
    .isInt({ min: 1 }).withMessage('ID phòng ban phải là số nguyên dương'),

  body('documentType')
    .optional()
    .trim()
    .isString().withMessage('Loại văn bản phải là chuỗi ký tự'),

  body('recipientName')
    .optional()
    .trim()
    .isString().withMessage('Tên người nhận phải là chuỗi ký tự'),

  body('recipientAddress')
    .optional()
    .trim()
    .isString().withMessage('Địa chỉ người nhận phải là chuỗi ký tự'),

  body('recipientEmail')
    .optional()
    .trim()
    .isEmail().withMessage('Email người nhận không hợp lệ'),

  body('notes')
    .optional()
    .trim()
    .isString().withMessage('Ghi chú phải là chuỗi ký tự'),
];

// ─── Validation cập nhật metadata ────────────────────────────────────────────

export const updateOutgoingMetadataValidation = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID văn bản phải là số nguyên dương'),

  body('title')
    .optional()
    .trim()
    .notEmpty().withMessage('Tiêu đề không được rỗng nếu được cung cấp')
    .isLength({ max: 500 }).withMessage('Tiêu đề tối đa 500 ký tự'),

  body('description')
    .optional()
    .trim()
    .isString(),

  body('urgency')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null) return true;
      const v = String(value).trim().toUpperCase();
      const allowed = ['THUONG', 'KHAN', 'THUONG_KHAN', 'THUONG_KHAU', 'HOA_TOC'];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Độ khẩn không hợp lệ');
      }
      return true;
    }),

  body('confidentialityLevel')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null) return true;
      const v = String(value).trim().toUpperCase();
      const allowed = [
        'NORMAL', 'CONFIDENTIAL', 'TOP_SECRET',
        'THUONG', 'MAT', 'TOI_MAT', 'TUYET_MAT',
        'A', 'B', 'C',
      ];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Mức độ mật không hợp lệ');
      }
      return true;
    }),

  body('confidentialityId')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null) return true;
      const v = String(value).trim().toUpperCase();
      const allowed = ['A', 'B', 'C', 'THUONG', 'MAT', 'TOI_MAT', 'TUYET_MAT'];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Mức độ mật không hợp lệ');
      }
      return true;
    }),

  body('departmentId')
    .optional({ nullable: true })
    .isInt({ min: 1 }).withMessage('ID phòng ban phải là số nguyên dương'),

  body('documentType')
    .optional()
    .trim()
    .isString(),

  body('documentNumber')
    .optional()
    .trim()
    .isString(),

  body('signerName')
    .optional()
    .trim()
    .isString(),

  body('signerTitle')
    .optional()
    .trim()
    .isString(),

  body('recipientName')
    .optional()
    .trim()
    .isString(),

  body('recipientAddress')
    .optional()
    .trim()
    .isString(),

  body('recipientEmail')
    .optional()
    .isEmail().withMessage('Email người nhận không hợp lệ'),

  body('pageCount')
    .optional()
    .isInt({ min: 1 }).withMessage('Số trang phải là số nguyên dương'),

  body('notes')
    .optional()
    .isString(),
];

// ─── Validation cập nhật trạng thái ─────────────────────────────────────────

const VALID_STATUSES = [
  'DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED',
  'WAITING_FOR_ISSUE', 'ISSUED', 'COMPLETED',
  'RECALLED', 'TRASHED', 'REJECTED', 'CANCELLED',
];

export const updateOutgoingStatusValidation = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID văn bản phải là số nguyên dương'),

  body('status')
    .notEmpty().withMessage('Trạng thái không được để trống')
    .isIn(VALID_STATUSES).withMessage(`Trạng thái không hợp lệ. Hợp lệ: ${VALID_STATUSES.join(', ')}`),

  body('returnReason')
    .if(body('status').equals('RETURNED'))
    .notEmpty().withMessage('Lý do trả lại bắt buộc khi trả lại văn bản'),

  body('recallReason')
    .if(body('status').equals('RECALLED'))
    .notEmpty().withMessage('Lý do thu hồi bắt buộc khi thu hồi văn bản'),

  body('dispatchNumber')
    .optional()
    .isString(),

  body('issuanceDate')
    .optional()
    .isISO8601().withMessage('Ngày ban hành không đúng định dạng ISO8601'),

  body('sentDate')
    .optional()
    .isISO8601().withMessage('Ngày gửi không đúng định dạng ISO8601'),

  // Độ khẩn và độ mật tùy chọn khi phát hành (status = ISSUED)
  body('urgency')
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
      const allowed = [
        'NORMAL', 'CONFIDENTIAL', 'TOP_SECRET',
        'THUONG', 'MAT', 'TOI_MAT', 'TUYET_MAT',
        'A', 'B', 'C',
      ];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Mức độ mật không hợp lệ');
      }
      return true;
    }),
];

// ─── Validation params ID chung ───────────────────────────────────────────────

export const outgoingIdParamValidation = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID văn bản phải là số nguyên dương'),
];

// ─── Validation query danh sách ───────────────────────────────────────────────

export const listOutgoingDocumentsValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Số trang phải là số nguyên dương'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Giới hạn mỗi trang từ 1 đến 100'),

  query('status')
    .optional()
    .isIn(VALID_STATUSES).withMessage('Trạng thái lọc không hợp lệ'),

  query('urgency')
    .optional()
    .custom((value) => {
      const v = String(value).trim().toUpperCase();
      const allowed = ['THUONG', 'KHAN', 'THUONG_KHAN', 'THUONG_KHAU', 'HOA_TOC'];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Độ khẩn không hợp lệ');
      }
      return true;
    }),
  query('urgencyId')
    .optional()
    .custom((value) => {
      const v = String(value).trim().toUpperCase();
      const allowed = ['THUONG', 'KHAN', 'THUONG_KHAN', 'THUONG_KHAU', 'HOA_TOC'];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Độ khẩn không hợp lệ');
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
        throw new Error('Mức độ mật không hợp lệ');
      }
      return true;
    }),

  query('confidentialityId')
    .optional()
    .custom((value) => {
      const v = String(value).trim().toUpperCase();
      const allowed = ['A', 'B', 'C', 'THUONG', 'MAT', 'TOI_MAT', 'TUYET_MAT'];
      if (!allowed.includes(v) && !/^\d+$/.test(v)) {
        throw new Error('Mức độ mật không hợp lệ');
      }
      return true;
    }),
];
