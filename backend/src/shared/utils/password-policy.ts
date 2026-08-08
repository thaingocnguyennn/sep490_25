import { body } from 'express-validator';
import { BadRequestError } from '../exceptions/app-error';

/**
 * Shared password policy used by:
 *  - Change password
 *  - Create user (initial password)
 *  - Reset password
 *
 * Rules:
 *  - At least 8 characters
 *  - At least one uppercase letter (A–Z)
 *  - At least one lowercase letter (a–z)
 *  - At least one number (0–9)
 *  - At least one special character from ! @ # $ % ^ & *
 */

export const PASSWORD_POLICY = {
  minLength: 8,
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  number: /[0-9]/,
  special: /[!@#$%^&*]/,
} as const;

export function ensurePasswordPolicy(password: string, label = 'Mật khẩu'): void {
  if (!password) {
    throw new BadRequestError(`${label} là bắt buộc`);
  }

  if (password.length < PASSWORD_POLICY.minLength) {
    throw new BadRequestError(`${label} phải có ít nhất ${PASSWORD_POLICY.minLength} ký tự`);
  }

  if (!PASSWORD_POLICY.uppercase.test(password)) {
    throw new BadRequestError(`${label} phải chứa ít nhất một chữ cái viết hoa (A–Z)`);
  }

  if (!PASSWORD_POLICY.lowercase.test(password)) {
    throw new BadRequestError(`${label} phải chứa ít nhất một chữ cái viết thường (a–z)`);
  }

  if (!PASSWORD_POLICY.number.test(password)) {
    throw new BadRequestError(`${label} phải chứa ít nhất một chữ số (0–9)`);
  }

  if (!PASSWORD_POLICY.special.test(password)) {
    throw new BadRequestError(`${label} phải chứa ít nhất một ký tự đặc biệt (ví dụ: ! @ # $ % ^ & *)`);
  }
}

/**
 * express-validator chain that asserts the password policy on a given field.
 * Uses the same regex set and Vietnamese messages as `ensurePasswordPolicy`.
 */
export const passwordPolicyValidation = (field: string, label = 'Mật khẩu') =>
  body(field)
    .isString()
    .withMessage(`${label} không được để trống`)
    .notEmpty()
    .withMessage(`${label} là bắt buộc`)
    .isLength({ min: PASSWORD_POLICY.minLength })
    .withMessage(`${label} phải có ít nhất ${PASSWORD_POLICY.minLength} ký tự`)
    .matches(PASSWORD_POLICY.uppercase)
    .withMessage(`${label} phải chứa ít nhất một chữ cái viết hoa (A–Z)`)
    .matches(PASSWORD_POLICY.lowercase)
    .withMessage(`${label} phải chứa ít nhất một chữ cái viết thường (a–z)`)
    .matches(PASSWORD_POLICY.number)
    .withMessage(`${label} phải chứa ít nhất một chữ số (0–9)`)
    .matches(PASSWORD_POLICY.special)
    .withMessage(`${label} phải chứa ít nhất một ký tự đặc biệt (ví dụ: ! @ # $ % ^ & *)`);
