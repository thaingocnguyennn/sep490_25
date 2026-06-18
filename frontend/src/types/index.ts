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
  departmentMemberships?: {
    departmentId: number;
    name: string;
    assignedAt: string;
  }[];
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
export type ConfidentialityLevel = 'THUONG' | 'MAT' | 'TOI_MAT' | 'TUYET_MAT';

export interface Document {
  id: number;
  documentNumber: string;
  title: string;
  description: string | null;
  type: DocumentType;
  fileUrl: string | null;
  documentStatus: DocumentStatus;
  isArchived: boolean;
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
  // Optional fields from dev schema (DocumentWorkflow, processors, attachments)
  status: string; // DocumentStatus enum - DRAFT, PENDING, IN_PROGRESS, COMPLETED, REJECTED, CANCELLED
  workflows?: Array<{
    id: number;
    status: string;
    notes: string | null;
    completedAt: string | null;
    workflowStep: { id: number; name: string; stepOrder: number; roleName: string | null };
    user: { id: number; fullName: string } | null;
  }>;
  processors?: Array<{
    id: number;
    processorType: string;
    user: { id: number; fullName: string; email: string };
  }>;
  attachments?: Array<{
    id: number;
    fileName: string;
    fileUrl: string;
    fileSize: number | null;
    mimeType: string | null;
    createdAt: string;
  }>;
}

export interface DocumentFilterParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: DocumentType;
  status?: DocumentStatus;
  isArchived?: boolean;
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

// ─── Outgoing Document Types ─────────────────────────────────────────────────

export type OutgoingDocumentStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'RETURNED'
  | 'APPROVED'
  | 'WAITING_FOR_ISSUE'
  | 'ISSUED'
  | 'COMPLETED'
  | 'RECALLED'
  | 'TRASHED'
  | 'REJECTED'
  | 'CANCELLED';

export type UrgencyLevel = 'THUONG' | 'KHAN' | 'THUONG_KHAU' | 'HOA_TOC';

export interface OutgoingDocument {
  id: number;
  documentId: number;
  documentType: string | null;
  documentNumber: string | null;
  dispatchNumber: string | null;
  issuanceDate: string | null;
  signerName: string | null;
  signerTitle: string | null;
  urgency: UrgencyLevel | null;
  recipientName: string | null;
  recipientAddress: string | null;
  sentDate: string | null;
  pageCount: number | null;
  // Workflow tracking
  submittedAt: string | null;
  submittedBy: number | null;
  approvedAt: string | null;
  approvedBy: number | null;
  returnedAt: string | null;
  returnedBy: number | null;
  returnReason: string | null;
  forwardedAt: string | null;
  forwardedBy: number | null;
  issuedAt: string | null;
  issuedBy: number | null;
  recalledAt: string | null;
  recalledBy: number | null;
  recallReason: string | null;
  trashedAt: string | null;
  trashedBy: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Relations
  document: {
    id: number;
    documentNumber: string;
    title: string;
    description: string | null;
    type: string;
    fileUrl: string | null;
    ocrText: string | null;
    ocrStatus: string;
    status: OutgoingDocumentStatus;
    urgencyLevel: PriorityLevel;
    confidentialityLevel: ConfidentialityLevel;
    documentStatus: DocumentStatus;
    isArchived: boolean;
    originalFileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    createdAt: string;
    updatedAt: string;
    createdByUser: { id: number; fullName: string } | null;
    updatedByUser: { id: number; fullName: string } | null;
    department: { id: number; name: string } | null;
    attachments: Array<{
      id: number;
      fileName: string;
      fileUrl: string;
      fileSize: number | null;
      mimeType: string | null;
    }>;
  };
  submittedByUser: { id: number; fullName: string } | null;
  approvedByUser: { id: number; fullName: string } | null;
  returnedByUser: { id: number; fullName: string } | null;
  forwardedByUser: { id: number; fullName: string } | null;
  issuedByUser: { id: number; fullName: string } | null;
  recalledByUser: { id: number; fullName: string } | null;
  trashedByUser: { id: number; fullName: string } | null;
}

export interface CreateOutgoingDocumentRequest {
  title: string;
  description?: string;
  urgency?: UrgencyLevel;
  confidentialityLevel?: ConfidentialityLevel;
  departmentId?: number;
  documentType?: string;
  recipientName?: string;
  recipientAddress?: string;
  notes?: string;
}

export interface UpdateOutgoingMetadataRequest {
  title?: string;
  description?: string;
  urgency?: UrgencyLevel;
  confidentialityLevel?: ConfidentialityLevel;
  departmentId?: number | null;
  documentType?: string;
  documentNumber?: string;
  signerName?: string;
  signerTitle?: string;
  recipientName?: string;
  recipientAddress?: string;
  pageCount?: number;
  notes?: string;
}

export interface UpdateOutgoingStatusRequest {
  status: OutgoingDocumentStatus;
  returnReason?: string;
  recallReason?: string;
  dispatchNumber?: string;
  issuanceDate?: string;
  sentDate?: string;
  recipientName?: string;
  recipientAddress?: string;
}

export interface OutgoingDocumentFilterParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: OutgoingDocumentStatus;
  urgency?: UrgencyLevel;
}

export interface OcrResult {
  ocrText: string;
  confidence: number;
  extractedFields: {
    issuer?: string;
    documentNumber?: string;
    dateLetter?: string;
    documentType?: string;
    summary?: string;
    pageCount?: string;
    signerName?: string;
    signerTitle?: string;
  };
}
