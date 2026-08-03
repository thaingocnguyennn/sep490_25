import api from '../axios';
import type {
  ApiResponse,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  ChangePasswordRequest,
  ResetPasswordRequest,
  User,
} from '../../types';

export const authApi = {
  login: (data: LoginRequest) =>
    api.post<ApiResponse<LoginResponse>>('/auth/login', data),

  forgotPassword: (data: ForgotPasswordRequest) =>
    api.post<ApiResponse<{ message: string }>>('/auth/forgot-password', data),

  resetPassword: (data: ResetPasswordRequest) =>
    api.post<ApiResponse>('/auth/reset-password', data),

  logout: () => api.post<ApiResponse>('/auth/logout'),

  getProfile: () => api.get<ApiResponse<User>>('/auth/profile'),

  updateProfile: (data: { fullName: string; phone: string | null }) =>
    api.patch<ApiResponse<User>>('/auth/profile', data),

  changePassword: (data: ChangePasswordRequest) =>
    api.patch<ApiResponse>('/auth/change-password', data),
};
