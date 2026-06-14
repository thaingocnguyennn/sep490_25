import api from '../axios';
import type { ApiResponse, PaginatedResponse } from '../../types';
import type {
  Document,
  DocumentFilterParams,
  UpdateDocumentRequest,
} from '../../types';

export type DocumentType = 'INCOMING' | 'OUTGOING' | 'INTERNAL' | 'ARCHIVAL';
export type DocumentStatus = 'DRAFT' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type ProcessorType = 'XLC' | 'PHXL' | 'XDB';
export type Urgency = 'THUONG' | 'KHAN' | 'THUONG_KHAU' | 'HOA_TOC';

export interface DocumentProcessor {
  id: number;
  processorType: ProcessorType;
  user: {
    id: number;
    fullName: string;
    email: string;
  };
}

export interface DocumentAttachment {
  id: number;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
}

export interface DocumentWorkflow {
  id: number;
  status: WorkflowStatus;
  notes: string | null;
  completedAt: string | null;
  workflowStep: {
    id: number;
    name: string;
    stepOrder: number;
    roleName: string | null;
  };
  user: { id: number; fullName: string } | null;
}

export type WorkflowStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'CANCELLED' | 'SKIPPED';

export interface IncomingDocumentDetail {
  id: number;
  documentId: number;
  issuer: string | null;
  documentType: string | null;
  documentNumber: string | null;
  arrivalNumber: number | null;
  signerName: string | null;
  signerTitle: string | null;
  dateLetter: string | null;
  dateReceived: string;
  summary: string | null;
  pageCount: number | null;
  urgency: Urgency | null;
  notes: string | null;
  processingInstructions: string | null;
  departmentId: number | null;
  document: Document;
  department: { id: number; name: string } | null;
}

export interface IncomingDocumentListItem {
  id: number;
  documentId: number;
  issuer: string | null;
  documentType: string | null;
  documentNumber: string | null;
  arrivalNumber: number | null;
  signerName: string | null;
  signerTitle: string | null;
  dateLetter: string | null;
  dateReceived: string;
  summary: string | null;
  pageCount: number | null;
  urgency: Urgency | null;
  notes: string | null;
  processingInstructions: string | null;
  departmentId: number | null;
  document: Document;
  department: { id: number; name: string } | null;
}

export interface OcrResult {
  text: string;
  confidence: number;
  extractedFields: Record<string, string>;
}

export interface CreateIncomingDocumentRequest {
  issuer?: string;
  documentType?: string;
  documentNumber?: string;
  arrivalNumber?: number;
  signerName?: string;
  signerTitle?: string;
  dateLetter?: string;
  dateReceived: string;
  summary?: string;
  pageCount?: number;
  urgency?: Urgency;
  notes?: string;
  processingInstructions?: string;
  departmentId?: number;
  processorIds: { userId: number; processorType: ProcessorType }[];
  attachments?: { fileName: string; fileUrl: string; fileSize?: number; mimeType?: string }[];
}

export const documentsApi = {
  // ─── List & Filter ──────────────────────────────────────────────────────

  /** Get paginated & filtered document list */
  getAll: (params?: DocumentFilterParams) =>
    api.get<ApiResponse<PaginatedResponse<Document>>>('/documents', { params }),

  /** Get full details of a single document */
  getById: (id: number) =>
    api.get<ApiResponse<Document>>(`/documents/${id}`),

  // ─── Upload ─────────────────────────────────────────────────────────────

  /** Upload a new document (file + metadata as FormData) */
  upload: (formData: FormData) =>
    api.post<ApiResponse<Document>>('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  // ─── Update Metadata ──────────────────────────────────────────────────

  /** Update document metadata (no file change) */
  update: (id: number, data: UpdateDocumentRequest) =>
    api.put<ApiResponse<Document>>(`/documents/${id}`, data),

  // ─── Soft Delete ──────────────────────────────────────────────────────

  /** Soft-delete a document */
  delete: (id: number) =>
    api.delete<ApiResponse>(`/documents/${id}`),

  // ─── Preview & Download ───────────────────────────────────────────────

  /** Get the preview URL for in-browser PDF viewing */
  getPreviewUrl: (id: number) => `/api/documents/${id}/preview`,

  /** Get the download URL */
  getDownloadUrl: (id: number) => `/api/documents/${id}/download`,

  // ─── Export ───────────────────────────────────────────────────────────

  /** Export document list to Excel (returns a blob download URL) */
  exportExcel: (params?: DocumentFilterParams) =>
    api.get('/documents/export', {
      params: { ...params, format: 'excel' },
      responseType: 'blob',
    }),

  /** Export document list to PDF (returns a blob download URL) */
  exportPdf: (params?: DocumentFilterParams) =>
    api.get('/documents/export', {
      params: { ...params, format: 'pdf' },
      responseType: 'blob',
    }),

  // ─── OCR ──────────────────────────────────────────────────────────────

  /** Perform OCR on an uploaded file */
  getOcr: (formData: FormData) =>
    api.post<ApiResponse<OcrResult>>('/documents/ocr', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

export const incomingDocumentsApi = {
  getAll: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    priority?: string;
  }) =>
    api.get<ApiResponse<PaginatedResponse<IncomingDocumentListItem>>>('/incoming-documents', { params }),

  getById: (id: number) =>
    api.get<ApiResponse<IncomingDocumentDetail>>(`/incoming-documents/${id}`),

  create: (data: CreateIncomingDocumentRequest) =>
    api.post<ApiResponse<IncomingDocumentDetail>>('/incoming-documents', data),

  updateStatus: (id: number, data: { status: string; notes?: string }) =>
    api.patch<ApiResponse<IncomingDocumentDetail>>(`/incoming-documents/${id}/status`, data),

  updateWorkflowStep: (id: number, workflowId: number, data: { stepStatus: string; notes?: string }) =>
    api.patch<ApiResponse<IncomingDocumentDetail>>(`/incoming-documents/${id}/workflow/${workflowId}`, data),
};
