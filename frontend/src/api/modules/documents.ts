import api from '../axios';
import type { ApiResponse, PaginatedResponse, Document, DocumentFilterParams, UpdateDocumentRequest, ConfidentialityCodeOrName, OcrResult } from '../../types';

export type DocumentDirection = 'INCOMING' | 'OUTGOING' | 'INTERNAL' | 'ARCHIVAL';
export type DocumentStatus = 'DRAFT' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
export type ProcessorType = 'XLC' | 'PHXL' | 'XDB';
export type Urgency = 'THUONG' | 'KHAN' | 'THUONG_KHAN' | 'THUONG_KHAU' | 'HOA_TOC';

/** New urgency lookup record returned by the API. */
export interface UrgencyRecord {
  id: number;
  name: Urgency;
  description: string | null;
}

export interface DocumentProcessor {
  id: number;
  processorType: ProcessorType;
  completedAt: string | null;
  notes: string | null;
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

export type WorkflowStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';

export interface IncomingDocumentDetail {
  id: number;
  documentId: number;
  arrivalNumber: number | null;
  dateReceived: string;
  pageCount: number | null;
  processingInstructions: string | null;
  documentBookId: number | null;
  documentBook: { id: number; name: string; code: string | null } | null;
  document: Document;
}

export interface IncomingDocumentListItem {
  id: number;
  documentId: number;
  arrivalNumber: number | null;
  dateReceived: string;
  pageCount: number | null;
  processingInstructions: string | null;
  documentBookId: number | null;
  documentBook: { id: number; name: string; code: string | null } | null;
  document: Document;
}



export interface CreateIncomingDocumentRequest {
  issuer?: string;
  documentTypeId?: number;
  documentNumber?: string;
  arrivalNumber?: number;
  signerName?: string;
  signerTitle?: string;
  dateLetter?: string;
  dateReceived: string;
  summary: string;
  pageCount?: number;
  urgency?: Urgency;
  processingInstructions?: string;
  processorIds: { userId: number; processorType: ProcessorType }[];
  attachments?: { fileName: string; fileUrl: string; fileSize?: number; mimeType?: string }[];
  confidentialityLevel?: ConfidentialityCodeOrName;
  confidentialityId?: ConfidentialityCodeOrName;
  documentBookId?: number;
}

export type HeadAction = 'FINISH' | 'FORWARD' | 'RETURN';
/**
 * Per the new flow design, the assigned specialist (XLC at step 3) has
 * exactly ONE action available: FINISH. The FORWARD / RETURN branches
 * that used to live on the specialist endpoint have been removed from
 * both the backend service and the route validation, so the frontend
 * type is narrowed here as well to keep the call sites honest.
 */
export type SpecialistAction = 'FINISH';

export interface ProcessIncomingDocumentRequest {
  action: HeadAction;
  processorIds?: { userId: number; processorType: ProcessorType }[];
  processingInstructions?: string;
  reason?: string;
  attachments?: { fileName: string; fileUrl: string; fileSize?: number; mimeType?: string }[];
}

export interface ProcessSpecialistDocumentRequest {
  action: SpecialistAction;
  processorIds?: { userId: number; processorType: ProcessorType }[];
  processingInstructions?: string;
  reason?: string;
}

/** Thống kê KPI tổng quan */
export interface DashboardKpi {
  totalIncoming: number;
  totalOutgoing: number;
  incomingPending: number;
  outgoingIssued: number;
  total: number;
}

/** Trend 12 tháng */
export interface DashboardTrend {
  year: number;
  months: string[];
  incoming: number[];
  outgoing: number[];
}

/** Phân bổ theo trạng thái */
export interface StatusDistributionItem {
  status: string;
  count: number;
}

/** Phân bổ theo độ khẩn */
export interface UrgencyDistributionItem {
  name: string;
  count: number;
}

/** Toàn bộ dữ liệu thống kê Dashboard */
export interface DashboardStats {
  kpi: DashboardKpi;
  trend: DashboardTrend;
  outgoingStatus: StatusDistributionItem[];
  incomingStatus: StatusDistributionItem[];
  urgencyDistribution: UrgencyDistributionItem[];
}

export const documentsApi = {
  // ─── List & Filter ──────────────────────────────────────────────────────

  /** Get basic document stats */
  getStats: () =>
    api.get<ApiResponse<{ total: number; incoming: number; outgoing: number }>>('/documents/stats'),

  /** Thống kê tổng hợp Dashboard (đến + đi) theo Nghị định 30/2020/NĐ-CP */
  getDashboardStats: (params?: { year?: number }) =>
    api.get<ApiResponse<DashboardStats>>('/documents/dashboard-stats', { params }),

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

  /** Restore a soft-deleted document */
  restore: (id: number) =>
    api.patch<ApiResponse>(`/documents/${id}/restore`),

  /** Archive a completed document */
  archiveDocument: (id: number) =>
    api.patch<ApiResponse>(`/documents/${id}/archive`),

  /** Reopen an archived document */
  reopenDocument: (id: number, reason: string) =>
    api.patch<ApiResponse>(`/documents/${id}/reopen`, { reason }),

  /** Hard-delete a document permanently */
  hardDelete: (id: number) =>
    api.delete<ApiResponse>(`/documents/${id}/permanent`),

  /** Update document status (e.g. DRAFT -> COMPLETED) */
  updateDocumentStatus: (id: number, status: string) =>
    api.patch<ApiResponse>(`/documents/${id}/status`, { status }),

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
    documentTypeId?: number;
  }) =>
    api.get<ApiResponse<PaginatedResponse<IncomingDocumentListItem>>>('/incoming-documents', { params }),

  getPendingForHead: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get<ApiResponse<PaginatedResponse<IncomingDocumentListItem>>>(
      '/incoming-documents/pending-for-head',
      { params }
    ),

  getPendingForSpecialist: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get<ApiResponse<PaginatedResponse<IncomingDocumentListItem>>>(
      '/incoming-documents/pending-for-specialist',
      { params }
    ),

  getById: (id: number) =>
    api.get<ApiResponse<IncomingDocumentDetail>>(`/incoming-documents/${id}`),

  create: (data: CreateIncomingDocumentRequest) =>
    api.post<ApiResponse<IncomingDocumentDetail>>('/incoming-documents', data),

  /**
   * Save an incoming document as a draft.
   * Unlike create(), this does not require processors and allows partial data.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveDraft: (data: any) =>
    api.post<ApiResponse<IncomingDocumentDetail>>('/incoming-documents/draft', data),

  /**
   * Save a draft incoming document with a PDF/image file attached.
   * Sends metadata and the file in a single multipart request.
   * Additional "Tệp đính kèm" files (if provided) are uploaded under the
   * `attachments` field name and persisted as DocumentAttachment rows.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveDraftWithFile: (data: any, file: File, attachmentFiles?: File[]) => {
    const formData = new FormData();
    formData.append('file', file);
    const entries: [string, string | number | undefined][] = [
      ['issuer', data.issuer],
      ['documentTypeId', data.documentTypeId],
      ['documentNumber', data.documentNumber],
      ['arrivalNumber', data.arrivalNumber],
      ['signerName', data.signerName],
      ['signerTitle', data.signerTitle],
      ['dateLetter', data.dateLetter],
      ['dateReceived', data.dateReceived],
      ['summary', data.summary],
      ['pageCount', data.pageCount],
      ['urgency', data.urgency],
      ['confidentialityLevel', data.confidentialityLevel],
      ['confidentialityId', data.confidentialityId],
      ['documentBookId', data.documentBookId],
    ];
    for (const [key, value] of entries) {
      if (value !== undefined) {
        formData.append(key, String(value));
      }
    }
    if (attachmentFiles && attachmentFiles.length > 0) {
      for (const att of attachmentFiles) {
        formData.append('attachments', att);
      }
    }
    // `data.attachments` is kept for backwards compatibility (metadata-only
    // entries). The backend ignores entries with `fileUrl: blob:...`.
    if (data.attachments && data.attachments.length > 0) {
      formData.append('attachments', JSON.stringify(data.attachments));
    }
    return api.post<ApiResponse<IncomingDocumentDetail>>('/incoming-documents/draft/with-file', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /**
   * Update an existing draft incoming document.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateDraft: (id: number, data: any) =>
    api.put<ApiResponse<IncomingDocumentDetail>>(`/incoming-documents/${id}/draft`, data),

  /**
   * Update an existing draft incoming document with a new file.
   * Additional "Tệp đính kèm" files (if provided) are uploaded under the
   * `attachments` field name and persisted as DocumentAttachment rows.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateDraftWithFile: (id: number, data: any, file: File, attachmentFiles?: File[]) => {
    const formData = new FormData();
    formData.append('file', file);
    const entries: [string, string | number | undefined][] = [
      ['issuer', data.issuer],
      ['documentTypeId', data.documentTypeId],
      ['documentNumber', data.documentNumber],
      ['arrivalNumber', data.arrivalNumber],
      ['signerName', data.signerName],
      ['signerTitle', data.signerTitle],
      ['dateLetter', data.dateLetter],
      ['dateReceived', data.dateReceived],
      ['summary', data.summary],
      ['pageCount', data.pageCount],
      ['urgency', data.urgency],
      ['confidentialityLevel', data.confidentialityLevel],
      ['confidentialityId', data.confidentialityId],
      ['documentBookId', data.documentBookId],
    ];
    for (const [key, value] of entries) {
      if (value !== undefined) {
        formData.append(key, String(value));
      }
    }
    if (attachmentFiles && attachmentFiles.length > 0) {
      for (const att of attachmentFiles) {
        formData.append('attachments', att);
      }
    }
    if (data.attachments && data.attachments.length > 0) {
      formData.append('attachments', JSON.stringify(data.attachments));
    }
    return api.put<ApiResponse<IncomingDocumentDetail>>(`/incoming-documents/${id}/draft/with-file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /**
   * Create an incoming document with a PDF/image file attached.
   * Sends metadata and the file in a single multipart request.
   * Used when the user has already run OCR and wants to persist the PDF.
   *
   * Additional "Tệp đính kèm" files (if provided) are uploaded under the
   * `attachments` field name and persisted as DocumentAttachment rows.
   */
  createWithFile: (data: CreateIncomingDocumentRequest, file: File, attachmentFiles?: File[]) => {
    const formData = new FormData();
    // Attach file first so it appears first in the multipart body
    formData.append('file', file);
    // Append all metadata fields
    const entries: [string, string | number | undefined][] = [
      ['issuer', data.issuer],
      ['documentTypeId', data.documentTypeId],
      ['documentNumber', data.documentNumber],
      ['arrivalNumber', data.arrivalNumber],
      ['signerName', data.signerName],
      ['signerTitle', data.signerTitle],
      ['dateLetter', data.dateLetter],
      ['dateReceived', data.dateReceived],
      ['summary', data.summary],
      ['pageCount', data.pageCount],
      ['urgency', data.urgency],
      ['confidentialityLevel', data.confidentialityLevel],
      ['confidentialityId', data.confidentialityId],
      ['processingInstructions', data.processingInstructions],
      ['documentBookId', data.documentBookId],
    ];
    for (const [key, value] of entries) {
      if (value !== undefined) {
        formData.append(key, String(value));
      }
    }
    if (data.processorIds && data.processorIds.length > 0) {
      formData.append('processorIds', JSON.stringify(data.processorIds));
    }
    if (attachmentFiles && attachmentFiles.length > 0) {
      for (const att of attachmentFiles) {
        formData.append('attachments', att);
      }
    }
    if (data.attachments && data.attachments.length > 0) {
      formData.append('attachments', JSON.stringify(data.attachments));
    }
    return api.post<ApiResponse<IncomingDocumentDetail>>('/incoming-documents/with-file', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  updateStatus: (id: number, data: { status: string; notes?: string }) =>
    api.patch<ApiResponse<IncomingDocumentDetail>>(`/incoming-documents/${id}/status`, data),

  /**
   * Submit a DRAFT incoming document for processing. Used by the create/edit
   * page instead of the older `updateStatus({ status: 'PENDING' })` flow,
   * because the new flow also creates workflow rows and participations.
   */
  submitDraft: (id: number) =>
    api.post<ApiResponse<IncomingDocumentDetail>>(`/incoming-documents/${id}/submit-draft`, {}),

  /**
   * Resubmit a returned document. The clerk picks a new primary handler
   * (XLC) and the document is re-opened for the head/specialist to act on.
   */
  resubmit: (id: number, data: { processorIds: { userId: number; processorType: 'XLC' | 'PHXL' | 'XDB' }[]; processingInstructions?: string }) =>
    api.post<ApiResponse<IncomingDocumentDetail>>(`/incoming-documents/${id}/resubmit`, data),

  /**
   * Mark the calling user as having viewed this document for the first
   * time. Idempotent. The detail page calls this on mount.
   */
  markViewed: (id: number) =>
    api.post<ApiResponse<{ id: number }>>(`/incoming-documents/${id}/view`, {}),

  updateWorkflowStep: (id: number, workflowId: number, data: { stepStatus: string; notes?: string }) =>
    api.patch<ApiResponse<IncomingDocumentDetail>>(`/incoming-documents/${id}/workflow/${workflowId}`, data),

  processByHead: (id: number, data: ProcessIncomingDocumentRequest) =>
    api.post<ApiResponse<IncomingDocumentDetail>>(`/incoming-documents/${id}/process`, data),

  processBySpecialist: (id: number, data: ProcessSpecialistDocumentRequest) =>
    api.post<ApiResponse<IncomingDocumentDetail>>(`/incoming-documents/${id}/process-specialist`, data),

  /**
   * Mark a PHXL processor's supporting task as complete. Only PHXL users
   * (or ADMIN) may invoke this; XDB is read-only.
   */
  completeProcessorTask: (id: number, userId: number, notes?: string) =>
    api.post<ApiResponse<IncomingDocumentDetail>>(
      `/incoming-documents/${id}/processors/${userId}/complete`,
      { notes }
    ),

  // Thống kê Văn bản đến (thêm mới)
  getStatistics: (params?: { dateFrom?: string; dateTo?: string; departmentId?: number }) =>
    api.get<ApiResponse<{
      totalCount: number;
      byStatus: { status: string; count: number }[];
      byDocumentType: { documentType: string; count: number }[];
      byDepartment: { departmentId: number | null; departmentName: string; count: number }[];
      byMonth: { month: string; count: number }[];
    }>>('/incoming-documents/statistics', { params }),

  // Cấp số (vào sổ) văn bản đến
  register: (id: number, data: { documentBookId: number; customArrivalDate?: string }) =>
    api.post<ApiResponse<IncomingDocumentDetail>>(`/incoming-documents/${id}/register`, data),
};
