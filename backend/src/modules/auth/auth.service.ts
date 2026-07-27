import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { config } from '../../config';
import { UserStatus } from '@prisma/client';
import { BadRequestError, UnauthorizedError } from '../../shared/exceptions/app-error';
import { generateToken } from '../../shared/utils/jwt.util';
import { authRepository, UserProfile } from './auth.repository';
import { sendEmail } from '../../shared/services/email.service';
import type { RoleName } from '../../shared/constants/roles';

const PASSWORD_RESET_RESPONSE =
  'If an account with that email exists, a password reset link has been sent.';

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class AuthService {
  private validateNewPassword(password: string): void {
    if (password.length < 8) {
      throw new BadRequestError('New password must be at least 8 characters');
    }

    if (!/[A-Z]/.test(password)) {
      throw new BadRequestError('New password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      throw new BadRequestError('New password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      throw new BadRequestError('New password must contain at least one number');
    }
  }

  async login(username: string, password: string) {
    const user = await authRepository.findByUsername(username);

    if (!user) {
      throw new UnauthorizedError('Sai tên đăng nhập hoặc mật khẩu');
    }

    if (user.status === UserStatus.LOCKED) {
      throw new UnauthorizedError('Account is locked');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedError('Account is inactive');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Sai tên đăng nhập hoặc mật khẩu');
    }

    await authRepository.updateLastLogin(user.id);

    const roles = user.userRoles.map((ur) => ur.role.name) as RoleName[];

    const token = generateToken({
      userId: user.id,
      username: user.username,
      roles,
    });
    const profile = authRepository.formatProfile(user);

    return { token, user: profile };
  }

  async getProfile(userId: number): Promise<UserProfile> {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }
    return authRepository.formatProfile(user);
  }

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await authRepository.findByEmail(normalizedEmail);

    if (!user) {
      return { message: PASSWORD_RESET_RESPONSE };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(
      Date.now() + config.passwordReset.tokenTtlMinutes * 60 * 1000,
    );

    await authRepository.createPasswordResetToken(user.id, tokenHash, expiresAt);

    const resetUrl = `${config.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const safeResetUrl = escapeHtml(resetUrl);
    const safeName = escapeHtml(user.fullName);

    try {
      await sendEmail({
        to: user.email,
        subject: 'Reset your DMS password',
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #2d3436;">
            <h2>Password reset request</h2>
            <p>Hello ${safeName},</p>
            <p>Use the button below to set a new password for your DMS account.</p>
            <p>
              <a href="${safeResetUrl}" style="display:inline-block;padding:10px 18px;background:#667eea;color:#fff;text-decoration:none;border-radius:6px;">
                Reset password
              </a>
            </p>
            <p>This link expires in ${config.passwordReset.tokenTtlMinutes} minutes and can only be used once.</p>
            <p>If you did not request this, you can safely ignore this email.</p>
          </div>
        `,
      });
    } catch (error) {
      await authRepository.deletePasswordResetToken(tokenHash);
      console.error('[auth] password reset email delivery failed', error);
    }

    return { message: PASSWORD_RESET_RESPONSE };
  }

  async resetPassword(token: string, newPassword: string) {
    this.validateNewPassword(newPassword);

    const hashedPassword = await bcrypt.hash(newPassword, config.bcrypt.saltRounds);
    const reset = await authRepository.resetPasswordWithToken(hashResetToken(token), hashedPassword);

    if (!reset) {
      throw new BadRequestError('This password reset link is invalid or has expired');
    }

    return { message: 'Password reset successfully' };
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string
  ) {
    this.validateNewPassword(newPassword);

    const user = await authRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentValid) {
      throw new BadRequestError('Current password is incorrect');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestError('New password must be different from current password');
    }

    const hashedPassword = await bcrypt.hash(newPassword, config.bcrypt.saltRounds);

    await authRepository.updatePassword(userId, hashedPassword);

    return { message: 'Password changed successfully' };
  }

  async logout(userId: number) {
    await authRepository.updateLastLogin(userId);
    return { message: 'Logged out successfully' };
  }
}

export const authService = new AuthService();
