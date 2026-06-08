import api from '../axios';
import type {
  ApiResponse,
  LoginRequest,
  LoginResponse,
  ChangePasswordRequest,
  User,
} from '../../types';

export const authApi = {
  login: (data: LoginRequest) =>
    api.post<ApiResponse<LoginResponse>>('/auth/login', data),

  logout: () => api.post<ApiResponse>('/auth/logout'),

  getProfile: () => api.get<ApiResponse<User>>('/auth/profile'),

  changePassword: (data: ChangePasswordRequest) =>
    api.patch<ApiResponse>('/auth/change-password', data),
};
