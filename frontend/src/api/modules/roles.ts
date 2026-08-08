import api from '../axios';
import type { ApiResponse, Role, CreateRoleRequest, UpdateRoleRequest } from '../../types';

const rolesApi = {
  getAll: () =>
    api.get<ApiResponse<Role[]>>('/admin/roles'),

  getById: (id: number) =>
    api.get<ApiResponse<Role>>(`/admin/roles/${id}`),

  create: (data: CreateRoleRequest) =>
    api.post<ApiResponse<Role>>('/admin/roles', data),

  update: (id: number, data: UpdateRoleRequest) =>
    api.put<ApiResponse<Role>>(`/admin/roles/${id}`, data),

  delete: (id: number) =>
    api.delete<ApiResponse<null>>(`/admin/roles/${id}`),
};

export { rolesApi };
