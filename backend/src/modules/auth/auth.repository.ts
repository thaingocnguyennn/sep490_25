import prisma from '../../config/database';
import { UserStatus } from '@prisma/client';

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatar: string | null;
  status: UserStatus;
  isFirstLogin: boolean;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
  roles: string[];
  department?: {
    id: number;
    name: string;
  } | null;
}

export class AuthRepository {
  async findByUsername(username: string) {
    return prisma.user.findUnique({
      where: { username },
      include: {
        userRoles: {
          include: { role: true },
        },
        department: true,
      },
    });
  }

  async findById(id: number) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: {
          include: { role: true },
        },
        department: true,
      },
    });
  }

  async findByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, fullName: true },
    });
  }

  async createPasswordResetToken(userId: number, tokenHash: string, expiresAt: Date) {
    return prisma.$transaction(async (transaction) => {
      await transaction.passwordResetToken.deleteMany({
        where: {
          OR: [{ userId }, { expiresAt: { lt: new Date() } }],
        },
      });
      return transaction.passwordResetToken.create({
        data: { userId, tokenHash, expiresAt },
      });
    });
  }

  async deletePasswordResetToken(tokenHash: string) {
    return prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
  }

  async resetPasswordWithToken(tokenHash: string, hashedPassword: string): Promise<boolean> {
    return prisma.$transaction(async (transaction) => {
      const now = new Date();
      const resetToken = await transaction.passwordResetToken.findFirst({
        where: { tokenHash, expiresAt: { gt: now } },
        select: { id: true, userId: true },
      });

      if (!resetToken) return false;

      const consumed = await transaction.passwordResetToken.deleteMany({
        where: {
          id: resetToken.id,
          tokenHash,
          expiresAt: { gt: now },
        },
      });

      if (consumed.count !== 1) return false;

      await transaction.user.update({
        where: { id: resetToken.userId },
        data: {
          password: hashedPassword,
          passwordChangedAt: new Date(),
          isFirstLogin: false,
        },
      });

      await transaction.passwordResetToken.deleteMany({
        where: { userId: resetToken.userId },
      });

      return true;
    });
  }

  async updatePassword(userId: number, hashedPassword: string) {
    return prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id: userId },
        data: {
          password: hashedPassword,
          passwordChangedAt: new Date(),
          isFirstLogin: false,
        },
      });

      await transaction.passwordResetToken.deleteMany({ where: { userId } });
      return user;
    });
  }

  async updateLastLogin(userId: number) {
    return prisma.user.update({
      where: { id: userId },
      data: { lastLogin: new Date() },
    });
  }

  formatProfile(user: {
    id: number;
    username: string;
    email: string;
    fullName: string;
    phone: string | null;
    avatar: string | null;
    status: import('@prisma/client').UserStatus;
    isFirstLogin: boolean;
    lastLogin: Date | null;
    createdAt: Date;
    updatedAt: Date;
    userRoles: { role: { name: string } }[];
    department: { id: number; name: string } | null;
  }): UserProfile {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      avatar: user.avatar,
      status: user.status,
      isFirstLogin: user.isFirstLogin,
      lastLogin: user.lastLogin?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      roles: user.userRoles.map((ur) => ur.role.name),
      department: user.department,
    };
  }
}

export const authRepository = new AuthRepository();
