import prisma from '../../config/database';
import { UserStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface UserListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: UserStatus;
}

export interface UserListResult {
  users: UserSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface UserSummary {
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
}

export interface UserDetail extends UserSummary {
  department?: {
    id: number;
    name: string;
  } | null;
  createdBy?: {
    id: number;
    fullName: string;
  } | null;
  updatedBy?: {
    id: number;
    fullName: string;
  } | null;
}

export class UsersRepository {
  async findAll(params: UserListParams): Promise<UserListResult> {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (params.status) {
      where.status = params.status;
    }

    if (params.search) {
      where.OR = [
        { username: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { fullName: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users: users.map(this.formatSummary),
      total,
      page,
      limit,
    };
  }

  async findById(id: number): Promise<UserDetail | null> {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: {
          include: { role: true },
        },
        department: true,
        createdByUser: {
          select: { id: true, fullName: true },
        },
        updatedByUser: {
          select: { id: true, fullName: true },
        },
      },
    });

    if (!user) return null;
    return this.formatDetail(user);
  }

  async findByUsername(username: string): Promise<{ id: number } | null> {
    return prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
  }

  async findByEmail(email: string): Promise<{ id: number } | null> {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
  }

  async create(data: {
    username: string;
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    roleIds: number[];
    createdBy: number;
  }): Promise<UserDetail> {
    const user = await prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        password: data.password,
        fullName: data.fullName,
        phone: data.phone,
        createdBy: data.createdBy,
        userRoles: {
          create: data.roleIds.map((roleId) => ({ roleId })),
        },
      },
      include: {
        userRoles: {
          include: { role: true },
        },
        department: true,
        createdByUser: {
          select: { id: true, fullName: true },
        },
        updatedByUser: {
          select: { id: true, fullName: true },
        },
      },
    });

    return this.formatDetail(user);
  }

  async update(
    id: number,
    data: {
      username?: string;
      email?: string;
      fullName?: string;
      phone?: string;
      status?: UserStatus;
      roleIds?: number[];
      updatedBy: number;
    }
  ): Promise<UserDetail> {
    if (data.roleIds !== undefined) {
      await prisma.userRole.deleteMany({ where: { userId: id } });
      await prisma.userRole.createMany({
        data: data.roleIds.map((roleId) => ({ userId: id, roleId })),
      });
    }

    const { roleIds: _roleIds, ...updateData } = data;
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        userRoles: {
          include: { role: true },
        },
        department: true,
        createdByUser: {
          select: { id: true, fullName: true },
        },
        updatedByUser: {
          select: { id: true, fullName: true },
        },
      },
    });

    return this.formatDetail(user);
  }

  async delete(id: number): Promise<void> {
    await prisma.user.delete({ where: { id } });
  }

  async getAllRoles() {
    return prisma.role.findMany({
      orderBy: { name: 'asc' },
    });
  }

  private formatSummary(user: {
    id: number;
    username: string;
    email: string;
    fullName: string;
    phone: string | null;
    avatar: string | null;
    status: UserStatus;
    isFirstLogin: boolean;
    lastLogin: Date | null;
    createdAt: Date;
    updatedAt: Date;
    userRoles: { role: { name: string } }[];
  }): UserSummary {
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
    };
  }

  private formatDetail(user: {
    id: number;
    username: string;
    email: string;
    fullName: string;
    phone: string | null;
    avatar: string | null;
    status: UserStatus;
    isFirstLogin: boolean;
    lastLogin: Date | null;
    createdAt: Date;
    updatedAt: Date;
    userRoles: { role: { name: string } }[];
    department: { id: number; name: string } | null;
    createdByUser: { id: number; fullName: string } | null;
    updatedByUser: { id: number; fullName: string } | null;
  }): UserDetail {
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
      createdBy: user.createdByUser,
      updatedBy: user.updatedByUser,
    };
  }
}

export const usersRepository = new UsersRepository();
