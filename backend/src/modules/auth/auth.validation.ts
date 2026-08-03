import { body } from 'express-validator';
import { passwordPolicyValidation } from '../../shared/utils/password-policy';

export const loginValidation = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Vui lòng nhập tên đăng nhập'),
  body('password')
    .notEmpty()
    .withMessage('Vui lòng nhập mật khẩu'),
];

export const updateProfileValidation = [
  body().custom((value) => {
    const allowedFields = ['fullName', 'phone'];
    const fields = Object.keys(value ?? {});

    if (!allowedFields.some((field) => value?.[field] !== undefined)) {
      throw new Error('Vui lòng cung cấp thông tin cần cập nhật');
    }

    if (fields.some((field) => !allowedFields.includes(field))) {
      throw new Error('Chỉ có thể cập nhật họ tên và số điện thoại');
    }

    return true;
  }),
  body('fullName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Họ và tên là bắt buộc')
    .isLength({ min: 2, max: 100 })
    .withMessage('Họ và tên phải có từ 2 đến 100 ký tự'),
  body('phone')
    .optional({ nullable: true })
    .trim()
    .matches(/^[0-9]{10,15}$/)
    .withMessage('Số điện thoại phải có từ 10 đến 15 chữ số'),
];

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
  passwordPolicyValidation('newPassword', 'Mật khẩu mới'),
  body('confirmPassword')
    .notEmpty()
    .withMessage('Vui lòng nhập xác nhận mật khẩu'),
];

export const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Vui lòng nhập mật khẩu hiện tại'),
  passwordPolicyValidation('newPassword', 'Mật khẩu mới'),
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
