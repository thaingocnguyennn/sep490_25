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
                select: { users: true, children: true },
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
        _count: { select: { users: true, children: true } },
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
   * Returns the ancestor chain (parent, grandparent, ...) for the given
   * department id, ordered from closest to root. Excludes the department itself.
   */
  async findAncestry(id: number): Promise<number[]> {
    const ancestry: number[] = [];
    const visited = new Set<number>([id]);
    let currentId: number | null = id;

    while (currentId !== null) {
      const dept: { parentId: number | null } | null = await prisma.department.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      if (!dept || dept.parentId === null) break;
      if (visited.has(dept.parentId)) break;
      visited.add(dept.parentId);
      ancestry.push(dept.parentId);
      currentId = dept.parentId;
    }

    return ancestry;
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

  async countDirectUsers(id: number): Promise<number> {
    return prisma.user.count({ where: { departmentId: id } });
  }

  async countUsersInSubtree(rootId: number, descendantIds: Set<number>): Promise<number> {
    if (descendantIds.size === 0) return 0;
    return prisma.user.count({ where: { departmentId: { in: Array.from(descendantIds) } } });
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

  private toListItem(d: any): DepartmentListItem {
    return {
      id: d.id,
      name: d.name,
      description: d.description,
      parentId: d.parentId,
      parent: d.parent ?? null,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      userCount: d._count?.users ?? 0,
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
