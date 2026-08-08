import { Prisma } from '@prisma/client';
import prisma from '../../config/database';

export interface RoleSummary {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  userCount: number;
}

export class RolesRepository {
  async findAll(): Promise<RoleSummary[]> {
    const roles = await prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { userRoles: true },
        },
      },
    });

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
      userCount: role._count.userRoles,
    }));
  }

  async findById(id: number): Promise<RoleSummary | null> {
    const role = await prisma.role.findUnique({
      where: { id },
      include: {
        _count: {
          select: { userRoles: true },
        },
      },
    });

    if (!role) return null;

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
      userCount: role._count.userRoles,
    };
  }

  async findByName(name: string): Promise<{ id: number } | null> {
    return prisma.role.findUnique({
      where: { name },
      select: { id: true },
    });
  }

  async create(data: { name: string; description?: string }): Promise<RoleSummary> {
    const role = await prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
      },
      include: {
        _count: {
          select: { userRoles: true },
        },
      },
    });

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
      userCount: role._count.userRoles,
    };
  }

  async update(
    id: number,
    data: { name?: string; description?: string }
  ): Promise<RoleSummary> {
    const role = await prisma.role.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
      },
      include: {
        _count: {
          select: { userRoles: true },
        },
      },
    });

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
      userCount: role._count.userRoles,
    };
  }

  async delete(id: number): Promise<void> {
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { roleId: id } }),
      prisma.role.delete({ where: { id } }),
    ]);
  }
}

export const rolesRepository = new RolesRepository();
