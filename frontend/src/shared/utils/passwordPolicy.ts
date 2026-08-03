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

export const PASSWORD_POLICY_HINT =
  'Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt (ví dụ: ! @ # $ % ^ & *).';

/**
 * Returns a Vietnamese error message describing the first failed rule,
 * or null when the password satisfies the policy.
 */
export function validatePasswordPolicy(password: string): string | null {
  if (!password) {
    return 'Vui lòng nhập mật khẩu';
  }

  if (password.length < PASSWORD_POLICY.minLength) {
    return `Mật khẩu phải có ít nhất ${PASSWORD_POLICY.minLength} ký tự`;
  }

  if (!PASSWORD_POLICY.uppercase.test(password)) {
    return 'Mật khẩu phải chứa ít nhất một chữ cái viết hoa (A–Z)';
  }

  if (!PASSWORD_POLICY.lowercase.test(password)) {
    return 'Mật khẩu phải chứa ít nhất một chữ cái viết thường (a–z)';
  }

  if (!PASSWORD_POLICY.number.test(password)) {
    return 'Mật khẩu phải chứa ít nhất một chữ số (0–9)';
  }

  if (!PASSWORD_POLICY.special.test(password)) {
    return 'Mật khẩu phải chứa ít nhất một ký tự đặc biệt (ví dụ: ! @ # $ % ^ & *)';
  }

  return null;
}

export function isPasswordValid(password: string): boolean {
  return validatePasswordPolicy(password) === null;
}
