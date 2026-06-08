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
  getAll: (params?: PaginationParams) =>
    api.get<ApiResponse<PaginatedResponse<User>>>('/users', { params }),

  getById: (id: number) =>
    api.get<ApiResponse<User>>(`/users/${id}`),

  create: (data: CreateUserRequest) =>
    api.post<ApiResponse<User>>('/users', data),

  update: (id: number, data: UpdateUserRequest) =>
    api.put<ApiResponse<User>>(`/users/${id}`, data),

  delete: (id: number) =>
    api.delete<ApiResponse>(`/users/${id}`),

  lock: (id: number) =>
    api.patch<ApiResponse>(`/users/${id}/lock`),

  unlock: (id: number) =>
    api.patch<ApiResponse>(`/users/${id}/unlock`),

  getRoles: () =>
    api.get<ApiResponse<Role[]>>('/users/roles'),
};
