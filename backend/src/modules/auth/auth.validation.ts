import { body } from 'express-validator';

export const loginValidation = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Vui lòng nhập tên đăng nhập'),
  body('password')
    .notEmpty()
    .withMessage('Vui lòng nhập mật khẩu'),
];

const passwordValidation = (field: string, label: string) =>
  body(field)
    .isString()
    .withMessage(`${label} không được để trống`)
    .isLength({ min: 8 })
    .withMessage(`${label} phải có ít nhất 8 ký tự`)
    .matches(/[A-Z]/)
    .withMessage(`${label} phải chứa ít nhất một chữ cái viết hoa`)
    .matches(/[a-z]/)
    .withMessage(`${label} phải chứa ít nhất một chữ cái viết thường`)
    .matches(/[0-9]/)
    .withMessage(`${label} phải chứa ít nhất một chữ số`);

export const requestPasswordResetValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Vui lòng nhập email')
    .isEmail()
    .withMessage('Định dạng email không hợp lệ')
    .normalizeEmail(),
];

export const resetPasswordValidation = [
  body('token')
    .isString()
    .withMessage('Thiếu mã đặt lại mật khẩu')
    .isHexadecimal()
    .withMessage('Mã đặt lại mật khẩu không hợp lệ')
    .isLength({ min: 64, max: 64 })
    .withMessage('Mã đặt lại mật khẩu không hợp lệ'),
  passwordValidation('newPassword', 'Mật khẩu mới'),
  body('confirmPassword')
    .notEmpty()
    .withMessage('Vui lòng nhập xác nhận mật khẩu'),
];

export const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Vui lòng nhập mật khẩu hiện tại'),
  passwordValidation('newPassword', 'Mật khẩu mới'),
  body('confirmPassword')
    .notEmpty()
    .withMessage('Vui lòng nhập xác nhận mật khẩu'),
  body('newPassword').custom((value, { req }) => {
    if (value && req.body?.currentPassword && value === req.body.currentPassword) {
      throw new Error('Mật khẩu mới phải khác mật khẩu hiện tại');
    }
    return true;
  }),
];
