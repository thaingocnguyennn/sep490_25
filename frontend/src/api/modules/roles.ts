import api from '../axios';
import type { ApiResponse } from '../../types';

export interface Role {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  userCount: number;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
}

const rolesApi = {
  getAll: () =>
    api.get<ApiResponse<Role[]>>('/roles'),

  getById: (id: number) =>
    api.get<ApiResponse<Role>>(`/roles/${id}`),

  create: (data: CreateRoleRequest) =>
    api.post<ApiResponse<Role>>('/roles', data),

  update: (id: number, data: UpdateRoleRequest) =>
    api.put<ApiResponse<Role>>(`/roles/${id}`, data),

  delete: (id: number) =>
    api.delete<ApiResponse<null>>(`/roles/${id}`),
};

export { rolesApi };
