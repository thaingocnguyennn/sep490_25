import { NotFoundError, ConflictError, BadRequestError } from '../../shared/exceptions/app-error';
import { rolesRepository, RoleSummary } from './roles.repository';

export class RolesService {
  async getAll(): Promise<RoleSummary[]> {
    return rolesRepository.findAll();
  }

  async getById(id: number): Promise<RoleSummary> {
    const role = await rolesRepository.findById(id);
    if (!role) {
      throw new NotFoundError('Role not found');
    }
    return role;
  }

  async create(data: { name: string; description?: string }): Promise<RoleSummary> {
    const existing = await rolesRepository.findByName(data.name);
    if (existing) {
      throw new ConflictError('Role name already exists');
    }

    return rolesRepository.create(data);
  }

  async update(
    id: number,
    data: { name?: string; description?: string }
  ): Promise<RoleSummary> {
    const existing = await rolesRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Role not found');
    }

    if (data.name && data.name !== existing.name) {
      const conflict = await rolesRepository.findByName(data.name);
      if (conflict) {
        throw new ConflictError('Role name already exists');
      }
    }

    return rolesRepository.update(id, data);
  }

  async delete(id: number): Promise<void> {
    const existing = await rolesRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Role not found');
    }

    if (existing.userCount > 0) {
      throw new BadRequestError(
        `Cannot delete role "${existing.name}" because it is assigned to ${existing.userCount} user(s). Remove all users from this role first.`
      );
    }

    await rolesRepository.delete(id);
  }
}

export const rolesService = new RolesService();
