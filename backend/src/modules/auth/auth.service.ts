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
  'Nếu tài khoản với email này tồn tại, đường dẫn đặt lại mật khẩu đã được gửi.';

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
      throw new BadRequestError('Mật khẩu mới phải có ít nhất 8 ký tự');
    }

    if (!/[A-Z]/.test(password)) {
      throw new BadRequestError('Mật khẩu mới phải chứa ít nhất một chữ cái viết hoa');
    }

    if (!/[a-z]/.test(password)) {
      throw new BadRequestError('Mật khẩu mới phải chứa ít nhất một chữ cái viết thường');
    }

    if (!/[0-9]/.test(password)) {
      throw new BadRequestError('Mật khẩu mới phải chứa ít nhất một chữ số');
    }
  }

  async login(username: string, password: string) {
    const user = await authRepository.findByUsername(username);

    if (!user) {
      throw new UnauthorizedError('Sai tên đăng nhập hoặc mật khẩu');
    }

    if (user.status === UserStatus.LOCKED) {
      throw new UnauthorizedError('Tài khoản đã bị khoá');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedError('Tài khoản chưa được kích hoạt');
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
      throw new UnauthorizedError('Không tìm thấy người dùng');
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

    const ttlMinutes = config.passwordReset.tokenTtlMinutes;

    try {
      await sendEmail({
        to: user.email,
        subject: 'Đặt lại mật khẩu DMS của bạn',
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #2d3436;">
            <h2>Yêu cầu đặt lại mật khẩu</h2>
            <p>Xin chào ${safeName},</p>
            <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản DMS của bạn. Nhấn vào nút bên dưới để thiết lập mật khẩu mới.</p>
            <p>
              <a href="${safeResetUrl}" style="display:inline-block;padding:10px 18px;background:#667eea;color:#fff;text-decoration:none;border-radius:6px;">
                Đặt lại mật khẩu
              </a>
            </p>
            <p>Đường dẫn có hiệu lực trong vòng ${ttlMinutes} phút và chỉ có thể sử dụng một lần.</p>
            <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.</p>
            <p>Trân trọng,<br/>Đội ngũ DMS</p>
          </div>
        `,
      });
    } catch (error) {
      await authRepository.deletePasswordResetToken(tokenHash);
      console.error('[auth] gửi email đặt lại mật khẩu thất bại', error);
    }

    return { message: PASSWORD_RESET_RESPONSE };
  }

  async resetPassword(token: string, newPassword: string) {
    this.validateNewPassword(newPassword);

    const hashedPassword = await bcrypt.hash(newPassword, config.bcrypt.saltRounds);
    const reset = await authRepository.resetPasswordWithToken(hashResetToken(token), hashedPassword);

    if (!reset) {
      throw new BadRequestError('Đường dẫn đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    }

    return { message: 'Đặt lại mật khẩu thành công' };
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string
  ) {
    this.validateNewPassword(newPassword);

    const user = await authRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError('Không tìm thấy người dùng');
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentValid) {
      throw new BadRequestError('Mật khẩu hiện tại không chính xác');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestError('Mật khẩu mới phải khác mật khẩu hiện tại');
    }

    const hashedPassword = await bcrypt.hash(newPassword, config.bcrypt.saltRounds);

    await authRepository.updatePassword(userId, hashedPassword);

    return { message: 'Đổi mật khẩu thành công' };
  }

  async logout(userId: number) {
    await authRepository.updateLastLogin(userId);
    return { message: 'Đăng xuất thành công' };
  }
}

export const authService = new AuthService();
