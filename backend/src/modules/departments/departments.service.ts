import { departmentsRepository, DepartmentListItem, DepartmentDetail } from './departments.repository';
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
    // Ensure the target department exists (also gives us its current parent).
    const current = await prisma.department.findUnique({
      where: { id },
      select: { id: true, parentId: true, name: true },
    });
    if (!current) {
      throw new NotFoundError('Department not found');
    }

    // Cycle / self-parent check
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
        // Reject if newParentId is a descendant of `id`
        const descendants = await departmentsRepository.findDescendantIds(id);
        if (descendants.has(newParentId)) {
          throw new BadRequestError(
            'Cannot set parent to a descendant department (circular reference)'
          );
        }
      }
    }

    // Uniqueness check when name or parentId changes
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

    // Check for direct children first
    const directChildren = await departmentsRepository.countDirectChildren(id);
    if (directChildren > 0) {
      throw new ConflictError(
        'Cannot delete a department that has child departments. Delete or reassign child departments first.'
      );
    }

    // Check for direct users
    const directUsers = await departmentsRepository.countDirectUsers(id);
    if (directUsers > 0) {
      throw new ConflictError(
        `Cannot delete this department because it has ${directUsers} user(s) assigned. Reassign the users to another department first.`
      );
    }

    return departmentsRepository.delete(id);
  }
}

export const departmentsService = new DepartmentsService();
