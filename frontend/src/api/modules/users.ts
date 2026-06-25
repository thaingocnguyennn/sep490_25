import api from '../axios';
import type {
  ApiResponse,
  User,
  Role,
  CreateUserRequest,
  UpdateUserRequest,
  PaginationParams,
  PaginatedResponse,
} from '../../types';

export const usersApi = {
  // Admin-only: user management
  getAll: (params?: PaginationParams) =>
    api.get<ApiResponse<PaginatedResponse<User>>>('/admin/users', { params }),

  getById: (id: number) =>
    api.get<ApiResponse<User>>(`/admin/users/${id}`),

  create: (data: CreateUserRequest) =>
    api.post<ApiResponse<User>>('/admin/users', data),

  update: (id: number, data: UpdateUserRequest) =>
    api.put<ApiResponse<User>>(`/admin/users/${id}`, data),

  delete: (id: number) =>
    api.delete<ApiResponse>(`/admin/users/${id}`),

  lock: (id: number) =>
    api.patch<ApiResponse>(`/admin/users/${id}/lock`),

  unlock: (id: number) =>
    api.patch<ApiResponse>(`/admin/users/${id}/unlock`),

  // Admin-only: role list (used by user form)
  getRoles: () =>
    api.get<ApiResponse<Role[]>>('/admin/roles'),

  getMe: () =>
    api.get<ApiResponse<User>>('/users/me'),

  updateMe: (data: { fullName?: string; phone?: string }) =>
    api.put<ApiResponse<User>>('/users/me', data),

  getApprovers: () =>
    api.get<ApiResponse<User[]>>('/users/approvers'),

  getClerks: () =>
    api.get<ApiResponse<User[]>>('/users/clerks'),
};
