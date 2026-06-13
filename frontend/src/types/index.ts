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

// ─── Document Management Types ──────────────────────────────────────────────

export type DocumentType = 'INCOMING' | 'OUTGOING' | 'INTERNAL' | 'ARCHIVAL';
export type DocumentStatus = 'ACTIVE' | 'DELETED';
export type PriorityLevel = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type ConfidentialityLevel = 'NORMAL' | 'CONFIDENTIAL' | 'TOP_SECRET';

export interface Document {
  id: number;
  documentNumber: string;
  title: string;
  description: string | null;
  type: DocumentType;
  fileUrl: string | null;
  documentStatus: DocumentStatus;
  urgencyLevel: PriorityLevel;
  confidentialityLevel: ConfidentialityLevel;
  sendingAgency: string | null;
  issuanceDate: string | null;
  category: string | null;
  originalFileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUser: { id: number; fullName: string } | null;
  updatedByUser?: { id: number; fullName: string } | null;
  department: { id: number; name: string } | null;
  processor: { id: number; fullName: string } | null;
}

export interface DocumentFilterParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: DocumentType;
  status?: DocumentStatus;
  urgencyLevel?: PriorityLevel;
  confidentialityLevel?: ConfidentialityLevel;
  departmentId?: number;
  processorId?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface UpdateDocumentRequest {
  documentNumber?: string;
  title?: string;
  description?: string;
  type?: DocumentType;
  issuanceDate?: string | null;
  sendingAgency?: string;
  urgencyLevel?: PriorityLevel;
  confidentialityLevel?: ConfidentialityLevel;
  category?: string;
  departmentId?: number | null;
  processorId?: number | null;
}
