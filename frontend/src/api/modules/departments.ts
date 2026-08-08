import api from '../axios';
import type { ApiResponse } from '../../types';

export interface Department {
  id: number;
  name: string;
  description: string | null;
  parentId: number | null;
  parent: { id: number; name: string } | null;
  children?: { id: number; name: string }[];
  userCount?: number;
  childCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDepartmentRequest {
  name: string;
  description?: string;
  parentId?: number | null;
}

export interface UpdateDepartmentRequest {
  name?: string;
  description?: string | null;
  parentId?: number | null;
}

export interface ListDepartmentsParams {
  search?: string;
}

export interface DepartmentMember {
  userId: number;
  departmentId: number;
  assignedAt: string;
  user: {
    id: number;
    username: string;
    fullName: string;
    email: string;
    status: string;
    roles: string[];
  };
}

export interface AddMembersRequest {
  userIds: number[];
}

export interface AddMembersResult {
  created: number;
  alreadyMembers: number[];
}

export const departmentsApi = {
  getAll: (params?: ListDepartmentsParams) => {
    const search = params?.search?.trim();
    return api.get<ApiResponse<Department[]>>('/departments', {
      params: search ? { search } : undefined,
    });
  },

  getById: (id: number) =>
    api.get<ApiResponse<Department>>(`/departments/${id}`),

  create: (data: CreateDepartmentRequest) =>
    api.post<ApiResponse<Department>>('/departments', data),

  update: (id: number, data: UpdateDepartmentRequest) =>
    api.put<ApiResponse<Department>>(`/departments/${id}`, data),

  delete: (id: number) =>
    api.delete<ApiResponse<null>>(`/departments/${id}`),

  // ---- Members (many-to-many) ----

  getMembers: (departmentId: number) =>
    api.get<ApiResponse<DepartmentMember[]>>(`/departments/${departmentId}/members`),

  addMembers: (departmentId: number, data: AddMembersRequest) =>
    api.post<ApiResponse<AddMembersResult>>(
      `/departments/${departmentId}/members`,
      data
    ),

  removeMember: (departmentId: number, userId: number) =>
    api.delete<ApiResponse<null>>(
      `/departments/${departmentId}/members/${userId}`
    ),
};
