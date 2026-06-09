export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

export interface Role {
  id: number;
  name: string;
  description: string | null;
  userCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatar: string | null;
  status: UserStatus;
  isFirstLogin: boolean;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
  roles: string[];
  department?: {
    id: number;
    name: string;
  } | null;
  createdBy?: {
    id: number;
    fullName: string;
  } | null;
  updatedBy?: {
    id: number;
    fullName: string;
  } | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  roleIds: number[];
}

export interface UpdateUserRequest {
  username?: string;
  email?: string;
  fullName?: string;
  phone?: string;
  status?: UserStatus;
  roleIds?: number[];
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: UserStatus;
  role?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: unknown;
}
