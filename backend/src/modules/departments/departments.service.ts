import { departmentsRepository, DepartmentListItem, DepartmentDetail, DepartmentMember } from './departments.repository';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/exceptions/app-error';
import { default as prisma } from '../../config/database';

export interface CreateDepartmentInput {
  name: string;
  description?: string | null;
  parentId?: number | null;
}

export interface UpdateDepartmentInput {
  name?: string;
  description?: string | null;
  parentId?: number | null;
}

export interface ListDepartmentsQuery {
  search?: string;
  includeUserCount?: boolean;
}

export interface AddMembersInput {
  userIds: number[];
}

export class DepartmentsService {
  async list(query: ListDepartmentsQuery = {}): Promise<DepartmentListItem[]> {
    return departmentsRepository.findAll({
      search: query.search,
      includeCounts: query.includeUserCount ?? true,
    });
  }

  async getById(id: number): Promise<DepartmentDetail> {
    return departmentsRepository.findById(id);
  }

  async create(input: CreateDepartmentInput) {
    const parentId = input.parentId ?? null;
    if (parentId !== null) {
      const exists = await departmentsRepository.existsById(parentId);
      if (!exists) {
        throw new NotFoundError(`Parent department with id ${parentId} not found`);
      }
    }

    const collision = await departmentsRepository.findByNameAndParent(input.name, parentId);
    if (collision) {
      throw new ConflictError('Department name already exists in this parent');
    }

    return departmentsRepository.create({
      name: input.name,
      description: input.description ?? null,
      parentId,
    });
  }

  async update(id: number, input: UpdateDepartmentInput) {
    const current = await prisma.department.findUnique({
      where: { id },
      select: { id: true, parentId: true, name: true },
    });
    if (!current) {
      throw new NotFoundError('Department not found');
    }

    if (input.parentId !== undefined) {
      const newParentId = input.parentId;
      if (newParentId === id) {
        throw new BadRequestError('A department cannot be its own parent');
      }
      if (newParentId !== null) {
        const parentExists = await departmentsRepository.existsById(newParentId);
        if (!parentExists) {
          throw new NotFoundError(`Parent department with id ${newParentId} not found`);
        }
        const descendants = await departmentsRepository.findDescendantIds(id);
        if (descendants.has(newParentId)) {
          throw new BadRequestError(
            'Cannot set parent to a descendant department (circular reference)'
          );
        }
      }
    }

    const effectiveParentId =
      input.parentId !== undefined ? input.parentId : current.parentId;
    const effectiveName = input.name !== undefined ? input.name : current.name;

    if (input.name !== undefined || input.parentId !== undefined) {
      const collision = await departmentsRepository.findByNameAndParent(
        effectiveName,
        effectiveParentId,
        id
      );
      if (collision) {
        throw new ConflictError('Department name already exists in this parent');
      }
    }

    return departmentsRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
    });
  }

  async delete(id: number) {
    const exists = await departmentsRepository.existsById(id);
    if (!exists) {
      throw new NotFoundError('Department not found');
    }

    // Block delete if there are child departments.
    const directChildren = await departmentsRepository.countDirectChildren(id);
    if (directChildren > 0) {
      throw new ConflictError(
        'Cannot delete a department that has child departments. Delete or reassign child departments first.'
      );
    }

    // Block delete if there are members.
    const directMembers = await departmentsRepository.countDirectMembers(id);
    if (directMembers > 0) {
      throw new ConflictError(
        `Cannot delete this department because it has ${directMembers} member(s). Remove members from this department first.`
      );
    }

    return departmentsRepository.delete(id);
  }

  // ---- Members (M2M) ----

  async getMembers(departmentId: number): Promise<DepartmentMember[]> {
    const exists = await departmentsRepository.existsById(departmentId);
    if (!exists) {
      throw new NotFoundError('Department not found');
    }
    return departmentsRepository.findMembers(departmentId);
  }

  async addMembers(departmentId: number, input: AddMembersInput) {
    const exists = await departmentsRepository.existsById(departmentId);
    if (!exists) {
      throw new NotFoundError('Department not found');
    }

    // Deduplicate input.
    const uniqueUserIds = Array.from(new Set(input.userIds));
    if (uniqueUserIds.length === 0) {
      throw new BadRequestError('No user IDs provided');
    }

    // Verify that all referenced users exist.
    const found = await prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: { id: true },
    });
    const foundIds = new Set(found.map((u) => u.id));
    const missing = uniqueUserIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new NotFoundError(
        `User(s) not found: ${missing.join(', ')}`
      );
    }

    return departmentsRepository.addMembers(departmentId, uniqueUserIds);
  }

  async removeMember(departmentId: number, userId: number) {
    const exists = await departmentsRepository.existsById(departmentId);
    if (!exists) {
      throw new NotFoundError('Department not found');
    }
    return departmentsRepository.removeMember(departmentId, userId);
  }
}

export const departmentsService = new DepartmentsService();
