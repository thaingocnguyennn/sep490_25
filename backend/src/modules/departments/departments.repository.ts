import { Prisma, Department } from '@prisma/client';
import { default as prisma } from '../../config/database';
import { NotFoundError, ConflictError } from '../../shared/exceptions/app-error';

export interface DepartmentListItem {
  id: number;
  name: string;
  description: string | null;
  parentId: number | null;
  parent: { id: number; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
  userCount: number;
  childCount: number;
}

export interface DepartmentDetail extends DepartmentListItem {
  children: { id: number; name: string }[];
}

export interface DepartmentMember {
  userId: number;
  departmentId: number;
  assignedAt: Date;
  user: {
    id: number;
    username: string;
    fullName: string;
    email: string;
    status: string;
    roles: string[];
  };
}

export interface FindAllOptions {
  search?: string;
  includeCounts?: boolean;
}

export class DepartmentsRepository {
  async findAll(options: FindAllOptions = {}): Promise<DepartmentListItem[]> {
    const { search, includeCounts = true } = options;

    const departments = await prisma.department.findMany({
      where: search
        ? { name: { contains: search, mode: 'insensitive' } }
        : undefined,
      orderBy: { name: 'asc' },
      include: {
        parent: { select: { id: true, name: true } },
        ...(includeCounts
          ? {
              _count: {
                select: { members: true, children: true },
              },
            }
          : {}),
      },
    });

    return departments.map((d) => this.toListItem(d));
  }

  async findById(id: number): Promise<DepartmentDetail> {
    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
        _count: { select: { members: true, children: true } },
      },
    });
    if (!department) throw new NotFoundError('Department not found');
    return this.toDetail(department);
  }

  async existsById(id: number): Promise<boolean> {
    const count = await prisma.department.count({ where: { id } });
    return count > 0;
  }

  /**
   * Returns the set of all descendant department ids of the given root id
   * (transitive closure of the children relation). The root id itself is
   * included in the returned set.
   */
  async findDescendantIds(rootId: number): Promise<Set<number>> {
    const result = new Set<number>([rootId]);
    let frontier: number[] = [rootId];

    while (frontier.length > 0) {
      const children: { id: number }[] = await prisma.department.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true },
      });
      const nextFrontier: number[] = [];
      for (const c of children) {
        if (!result.has(c.id)) {
          result.add(c.id);
          nextFrontier.push(c.id);
        }
      }
      frontier = nextFrontier;
    }

    return result;
  }

  async countDirectMembers(id: number): Promise<number> {
    return prisma.departmentMember.count({ where: { departmentId: id } });
  }

  async countDirectChildren(id: number): Promise<number> {
    return prisma.department.count({ where: { parentId: id } });
  }

  async findByNameAndParent(
    name: string,
    parentId: number | null,
    excludeId?: number
  ): Promise<Department | null> {
    return prisma.department.findFirst({
      where: {
        name,
        parentId: parentId === null ? null : parentId,
        ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}),
      },
    });
  }

  async create(data: { name: string; description?: string | null; parentId?: number | null }) {
    try {
      return await prisma.department.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          parentId: data.parentId ?? null,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictError('Department name already exists in this parent');
      }
      throw err;
    }
  }

  async update(
    id: number,
    data: { name?: string; description?: string | null; parentId?: number | null }
  ) {
    try {
      return await prisma.department.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') {
          throw new NotFoundError('Department not found');
        }
        if (err.code === 'P2002') {
          throw new ConflictError('Department name already exists in this parent');
        }
      }
      throw err;
    }
  }

  async delete(id: number): Promise<void> {
    try {
      await prisma.department.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') {
          throw new NotFoundError('Department not found');
        }
        if (err.code === 'P2003') {
          throw new ConflictError(
            'Cannot delete this department because it is referenced by other records (users, documents, or child departments).'
          );
        }
      }
      throw err;
    }
  }

  // ---- Members (M2M) ----

  async findMembers(departmentId: number): Promise<DepartmentMember[]> {
    const memberships = await prisma.departmentMember.findMany({
      where: { departmentId },
      orderBy: { assignedAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            email: true,
            status: true,
            userRoles: { select: { role: { select: { name: true } } } },
          },
        },
      },
    });

    return memberships.map((m) => ({
      userId: m.userId,
      departmentId: m.departmentId,
      assignedAt: m.assignedAt,
      user: {
        id: m.user.id,
        username: m.user.username,
        fullName: m.user.fullName,
        email: m.user.email,
        status: m.user.status,
        roles: m.user.userRoles.map((ur) => ur.role.name),
      },
    }));
  }

  /**
   * Add users to a department. Skips users that are already members (the
   * compound primary key (userId, departmentId) acts as a uniqueness guard).
   * Returns the list of newly-created memberships.
   */
  async addMembers(
    departmentId: number,
    userIds: number[]
  ): Promise<{ created: number; alreadyMembers: number[] }> {
    // Detect users that are already members so we can return a friendly result
    const existing = await prisma.departmentMember.findMany({
      where: { departmentId, userId: { in: userIds } },
      select: { userId: true },
    });
    const alreadyMembers = existing.map((e) => e.userId);
    const toCreate = userIds.filter((u) => !alreadyMembers.includes(u));

    if (toCreate.length === 0) {
      return { created: 0, alreadyMembers };
    }

    await prisma.departmentMember.createMany({
      data: toCreate.map((userId) => ({ userId, departmentId })),
    });

    return { created: toCreate.length, alreadyMembers };
  }

  async removeMember(departmentId: number, userId: number): Promise<void> {
    try {
      await prisma.departmentMember.delete({
        where: { userId_departmentId: { userId, departmentId } },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundError('User is not a member of this department');
      }
      throw err;
    }
  }

  private toListItem(d: any): DepartmentListItem {
    return {
      id: d.id,
      name: d.name,
      description: d.description,
      parentId: d.parentId,
      parent: d.parent ?? null,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      userCount: d._count?.members ?? 0,
      childCount: d._count?.children ?? 0,
    };
  }

  private toDetail(d: any): DepartmentDetail {
    return {
      ...this.toListItem(d),
      children: d.children ?? [],
    };
  }
}

export const departmentsRepository = new DepartmentsRepository();
