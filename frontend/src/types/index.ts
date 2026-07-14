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

/**
 * Confidentiality classifications seeded into the Confidentiality lookup
 * table. The previous ConfidentialityLevel enum has been replaced by this
 * table; the API still accepts the legacy values for backward compatibility.
 */
export type ConfidentialityName = 'THUONG' | 'MAT' | 'TOI_MAT' | 'TUYET_MAT';

/** Legacy enum values, kept for backward-compatible API payloads. */
export type ConfidentialityLevel = 'NORMAL' | 'CONFIDENTIAL' | 'TOP_SECRET';

/** Either a code ('A' | 'B' | 'C'), a seeded name, or a legacy enum value. */
export type ConfidentialityCodeOrName = ConfidentialityName | ConfidentialityLevel | 'A' | 'B' | 'C';

export interface Confidentiality {
  id: number;
  code: string | null;
  name: ConfidentialityName;
  description: string | null;
}

// ─── Urgency types (replaces the previous Urgency enum) ──────────────────────

/** Urgency levels seeded into the Urgency lookup table. */
export type UrgencyName = 'THUONG' | 'KHAN' | 'THUONG_KHAN' | 'HOA_TOC';

/** Legacy alias kept so the API can still accept older payloads. */
export type UrgencyAlias = 'THUONG_KHAU';

export interface Urgency {
  id: number;
  name: UrgencyName;
  description: string | null;
}

/** Either a seeded name or a legacy alias. Numeric ids are also accepted by the API. */
export type UrgencyCodeOrName = UrgencyName | UrgencyAlias | number;

export interface Document {
  id: number;
  documentNumber: string;
  title: string;
  description: string | null;
  type: DocumentType;
  fileUrl: string | null;
  documentStatus: DocumentStatus;
  isArchived: boolean;
  urgencyId: number | null;
  urgency: Urgency | null;
  confidentialityId: number | null;
  confidentiality: Confidentiality | null;
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
  /** Seeded urgency name, legacy alias, or numeric id */
  urgency?: UrgencyCodeOrName;
  urgencyId?: UrgencyCodeOrName;
  confidentialityLevel?: ConfidentialityCodeOrName;
  confidentialityId?: ConfidentialityCodeOrName;
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
  /** Seeded urgency name, legacy alias, or numeric id; null to clear */
  urgency?: UrgencyCodeOrName | null;
  urgencyId?: UrgencyCodeOrName | null;
  confidentialityLevel?: ConfidentialityCodeOrName;
  confidentialityId?: ConfidentialityCodeOrName | null;
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

export interface OutgoingDocument {
  id: number;
  documentId: number;
  documentType: string | null;
  documentNumber: string | null;
  dispatchNumber: string | null;
  issuanceDate: string | null;
  signerName: string | null;
  signerTitle: string | null;
  recipientName: string | null;
  recipientAddress: string | null;
  recipientEmail: string | null;
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
  assignedApproverId: number | null;
  assignedClerkId: number | null;
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
    urgencyId: number | null;
    urgency: Urgency | null;
    confidentialityId: number | null;
    confidentiality: Confidentiality | null;
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
  urgency?: UrgencyCodeOrName;
  confidentialityLevel?: ConfidentialityCodeOrName;
  confidentialityId?: ConfidentialityCodeOrName;
  departmentId?: number;
  documentType?: string;
  recipientName?: string;
  recipientAddress?: string;
  recipientEmail?: string;
  notes?: string;
  relatedIncomingDocumentId?: number;
}

export interface UpdateOutgoingMetadataRequest {
  title?: string;
  description?: string;
  urgency?: UrgencyCodeOrName | null;
  confidentialityLevel?: ConfidentialityCodeOrName | null;
  confidentialityId?: ConfidentialityCodeOrName | null;
  departmentId?: number | null;
  documentType?: string;
  documentNumber?: string;
  signerName?: string;
  signerTitle?: string;
  recipientName?: string;
  recipientAddress?: string;
  recipientEmail?: string;
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
  recipientEmail?: string;
  /** Độ khẩn tùy chọn khi phát hành (THUONG, KHAN, THUONG_KHAN, HOA_TOC) */
  urgency?: UrgencyCodeOrName;
  /** Độ mật tùy chọn khi phát hành (THUONG, MAT, TOI_MAT, TUYET_MAT) */
  confidentialityLevel?: ConfidentialityCodeOrName;
  assignedApproverId?: number;
  assignedClerkId?: number;
}

export interface OutgoingDocumentFilterParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: OutgoingDocumentStatus;
  urgency?: UrgencyCodeOrName;
  urgencyId?: UrgencyCodeOrName;
  documentType?: string;
  dateFrom?: string;
  dateTo?: string;
  confidentialityLevel?: ConfidentialityCodeOrName;
  confidentialityId?: ConfidentialityCodeOrName;
  departmentId?: number;
}

export interface OcrResult {
  text: string;
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
    recipientName?: string;
    urgencyLevel?: string;
    confidentialityLevel?: string;
  };
}

export interface SignatureVerificationResult {
  hasSignature: boolean;
  signatureCount: number;
  isModifiedAfterSigning: boolean | null;
  integrityStatus: 'NO_SIGNATURE' | 'VALID_OR_NOT_MODIFIED' | 'MODIFIED_AFTER_SIGNING' | 'UNKNOWN';
  checkedBy: 'BYTE_RANGE_BASIC';
  message: string;
}

// ─── UC-70: PDF Signature List ───────────────────────────────────────────────

export interface PdfSignatureItem {
  index: number;
  signerName: string | null;
  organization: string | null;
  certificateIssuer: string | null;
  signingTime: string | null;
  certificateValidFrom: string | null;
  certificateValidTo: string | null;
  isModifiedAfterSigning: boolean | null;
  integrityStatus:
    | 'VALID_OR_NOT_MODIFIED'
    | 'MODIFIED_AFTER_SIGNING'
    | 'NO_SIGNATURE'
    | 'UNKNOWN';
  validityStatus: 'VALID' | 'INVALID' | 'MODIFIED_AFTER_SIGNING' | 'UNKNOWN';
  signatureOrder: number;
}

// ─── UC-72: PDF Signature Detail ──────────────────────────────────────────────

export interface PdfSignatureDetail extends PdfSignatureItem {
  certificateSerialNumber: string | null;
  certificateSubject: string | null;
  signatureAlgorithm: string | null;
  byteRange: [number, number, number, number] | null;
  message: string;
}
