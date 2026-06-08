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
