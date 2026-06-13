import api from '../axios';
import type {
  ApiResponse,
  Document,
  DocumentFilterParams,
  UpdateDocumentRequest,
  PaginatedResponse,
} from '../../types';

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
};
