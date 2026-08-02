import { body, query, param } from 'express-validator';

export const createUserValidation = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Tên đăng nhập là bắt buộc')
    .isLength({ min: 3, max: 50 })
    .withMessage('Tên đăng nhập phải có từ 3 đến 50 ký tự')
    .matches(/^[a-zA-Z0-9_.-]+$/)
    .withMessage('Tên đăng nhập chỉ được chứa chữ cái, chữ số, dấu gạch dưới, dấu chấm và dấu gạch ngang'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email là bắt buộc')
    .isEmail()
    .withMessage('Định dạng email không hợp lệ')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Mật khẩu là bắt buộc')
    .isLength({ min: 8 })
    .withMessage('Mật khẩu phải có ít nhất 8 ký tự')
    .matches(/[A-Z]/)
    .withMessage('Mật khẩu phải chứa ít nhất một chữ cái viết hoa')
    .matches(/[a-z]/)
    .withMessage('Mật khẩu phải chứa ít nhất một chữ cái viết thường')
    .matches(/[0-9]/)
    .withMessage('Mật khẩu phải chứa ít nhất một chữ số'),
  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Họ và tên là bắt buộc')
    .isLength({ min: 2, max: 100 })
    .withMessage('Họ và tên phải có từ 2 đến 100 ký tự'),
  body('phone')
    .optional()
    .trim()
    .matches(/^[0-9]{10,15}$/)
    .withMessage('Số điện thoại phải có từ 10 đến 15 chữ số'),
  body('roleIds')
    .isArray({ min: 1 })
    .withMessage('Phải chỉ định ít nhất một vai trò'),
  body('roleIds.*')
    .isInt({ min: 1 })
    .withMessage('Mã vai trò không hợp lệ'),
];

export const updateUserValidation = [
  param('id').isInt({ min: 1 }).withMessage('Mã người dùng không hợp lệ'),
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Tên đăng nhập phải có từ 3 đến 50 ký tự')
    .matches(/^[a-zA-Z0-9_.-]+$/)
    .withMessage('Tên đăng nhập chỉ được chứa chữ cái, chữ số, dấu gạch dưới, dấu chấm và dấu gạch ngang'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Định dạng email không hợp lệ')
    .normalizeEmail(),
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Họ và tên phải có từ 2 đến 100 ký tự'),
  body('phone')
    .optional()
    .trim()
    .matches(/^[0-9]{10,15}$/)
    .withMessage('Số điện thoại phải có từ 10 đến 15 chữ số'),
  body('status')
    .optional()
    .isIn(['ACTIVE', 'INACTIVE', 'LOCKED'])
    .withMessage('Giá trị trạng thái không hợp lệ'),
  body('roleIds')
    .optional()
    .isArray({ min: 1 })
    .withMessage('Phải chỉ định ít nhất một vai trò'),
  body('roleIds.*')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Mã vai trò không hợp lệ'),
];

export const getUsersValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Trang phải là số nguyên dương'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Giới hạn phải nằm trong khoảng từ 1 đến 100'),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Từ khóa tìm kiếm quá dài'),
  query('status')
    .optional()
    .isIn(['ACTIVE', 'INACTIVE', 'LOCKED'])
    .withMessage('Bộ lọc trạng thái không hợp lệ'),
];

export const getUserByIdValidation = [
  param('id').isInt({ min: 1 }).withMessage('Mã người dùng không hợp lệ'),
];

export const deleteUserValidation = [
  param('id').isInt({ min: 1 }).withMessage('Mã người dùng không hợp lệ'),
];
