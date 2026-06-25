import bcrypt from 'bcrypt';
import { config } from '../../config';
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/exceptions/app-error';
import {
  usersRepository,
  UserDetail,
  UserListResult,
} from './users.repository';

export class UsersService {
  async getAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    role?: string;
    departmentId?: number;
  }): Promise<UserListResult> {
    return usersRepository.findAll({
      page: params.page ? Number(params.page) : 1,
      limit: params.limit ? Number(params.limit) : 10,
      search: params.search,
      status: params.status as any,
      role: params.role,
      departmentId: params.departmentId,
    });
  }

  async getById(id: number): Promise<UserDetail> {
    const user = await usersRepository.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
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
    const existingUsername = await usersRepository.findByUsername(data.username);
    if (existingUsername) {
      throw new ConflictError('Username already exists');
    }

    const existingEmail = await usersRepository.findByEmail(data.email);
    if (existingEmail) {
      throw new ConflictError('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(data.password, config.bcrypt.saltRounds);

    return usersRepository.create({
      ...data,
      password: hashedPassword,
    });
  }

  async update(
    id: number,
    data: {
      username?: string;
      email?: string;
      fullName?: string;
      phone?: string;
      status?: string;
      roleIds?: number[];
      updatedBy: number;
    }
  ): Promise<UserDetail> {
    const existing = await usersRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('User not found');
    }

    if (data.username && data.username !== existing.username) {
      const conflict = await usersRepository.findByUsername(data.username);
      if (conflict) {
        throw new ConflictError('Username already exists');
      }
    }

    if (data.email && data.email !== existing.email) {
      const conflict = await usersRepository.findByEmail(data.email);
      if (conflict) {
        throw new ConflictError('Email already exists');
      }
    }

    return usersRepository.update(id, {
      ...data,
      status: data.status as any,
    });
  }

  async delete(id: number): Promise<void> {
    const existing = await usersRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('User not found');
    }
    await usersRepository.delete(id);
  }

  async getRoles() {
    return usersRepository.getAllRoles();
  }

  async updateStatus(id: number, status: 'ACTIVE' | 'INACTIVE' | 'LOCKED', updatedBy?: number) {
    const existing = await usersRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('User not found');
    }
    return usersRepository.update(id, { status, updatedBy: updatedBy ?? 0 });
  }

  async updateMyProfile(id: number, data: { fullName?: string; phone?: string }) {
    const existing = await usersRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('User not found');
    }
    return usersRepository.update(id, {
      fullName: data.fullName,
      phone: data.phone,
      updatedBy: id,
    });
  }
}

export const usersService = new UsersService();
