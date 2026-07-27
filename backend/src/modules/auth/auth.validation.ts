import { body } from 'express-validator';

export const loginValidation = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

const passwordValidation = (field: string, label: string) =>
  body(field)
    .isString()
    .withMessage(`${label} is required`)
    .isLength({ min: 8 })
    .withMessage(`${label} must be at least 8 characters`)
    .matches(/[A-Z]/)
    .withMessage(`${label} must contain at least one uppercase letter`)
    .matches(/[a-z]/)
    .withMessage(`${label} must contain at least one lowercase letter`)
    .matches(/[0-9]/)
    .withMessage(`${label} must contain at least one number`);

export const requestPasswordResetValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
];

export const resetPasswordValidation = [
  body('token')
    .isString()
    .withMessage('Reset token is required')
    .isHexadecimal()
    .withMessage('Invalid reset token')
    .isLength({ min: 64, max: 64 })
    .withMessage('Invalid reset token'),
  passwordValidation('newPassword', 'New password'),
  body('confirmPassword')
    .notEmpty()
    .withMessage('Confirm password is required'),
];

export const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  passwordValidation('newPassword', 'New password'),
  body('confirmPassword').notEmpty().withMessage('Confirm password is required'),
];
