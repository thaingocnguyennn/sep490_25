import bcrypt from 'bcrypt';
import prisma from '../../config/database';
import { config } from '../../config';
import { UserStatus } from '@prisma/client';
import { BadRequestError, UnauthorizedError } from '../../shared/exceptions/app-error';
import { generateToken } from '../../shared/utils/jwt.util';
import { authRepository, UserProfile } from './auth.repository';

export class AuthService {
  async login(username: string, password: string) {
    const user = await authRepository.findByUsername(username);

    if (!user) {
      throw new UnauthorizedError('Invalid username or password');
    }

    if (user.status === UserStatus.LOCKED) {
      throw new UnauthorizedError('Account is locked');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedError('Account is inactive');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid username or password');
    }

    await authRepository.updateLastLogin(user.id);

    const token = generateToken({ userId: user.id, username: user.username });
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

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string
  ) {
    if (newPassword.length < 8) {
      throw new BadRequestError('New password must be at least 8 characters');
    }

    if (!/[A-Z]/.test(newPassword)) {
      throw new BadRequestError('New password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(newPassword)) {
      throw new BadRequestError('New password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(newPassword)) {
      throw new BadRequestError('New password must contain at least one number');
    }

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

    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        isFirstLogin: false,
      },
    });

    return { message: 'Password changed successfully' };
  }

  async logout(userId: number) {
    await authRepository.updateLastLogin(userId);
    return { message: 'Logged out successfully' };
  }
}

export const authService = new AuthService();
