import { api } from '../index';
import type {
  OutgoingDocument,
  CreateOutgoingDocumentRequest,
  UpdateOutgoingMetadataRequest,
  UpdateOutgoingStatusRequest,
  OutgoingDocumentFilterParams,
  PaginatedResponse,
  ApiResponse,
  OcrResult,
  SignatureVerificationResult,
  DocumentSignatureItem,
  DocumentSignatureResponse,
} from '../../types';

const BASE = '/outgoing-documents';

// ─── Danh sách ────────────────────────────────────────────────────────────────

/**
 * Lấy danh sách văn bản đi với phân trang và filter.
 */
export const getOutgoingDocuments = async (
  params: OutgoingDocumentFilterParams = {},
): Promise<PaginatedResponse<OutgoingDocument>> => {
  const queryParams = new URLSearchParams();
  if (params.page)   queryParams.set('page',   String(params.page));
  if (params.limit)  queryParams.set('limit',  String(params.limit));
  if (params.search) queryParams.set('search', params.search);
  if (params.status) queryParams.set('status', params.status);
  if (params.urgency !== undefined && params.urgency !== null)
    queryParams.set('urgency', String(params.urgency));

  const query = queryParams.toString();
  const res = await api.get<ApiResponse<PaginatedResponse<OutgoingDocument>>>(
    `${BASE}${query ? `?${query}` : ''}`,
  );
  return res.data.data!;
};

/**
 * Lấy danh sách văn bản đi trong thùng rác.
 */
export const getTrashedOutgoingDocuments = async (params: {
  page?: number;
  limit?: number;
  search?: string;
} = {}): Promise<PaginatedResponse<OutgoingDocument>> => {
  const queryParams = new URLSearchParams();
  if (params.page)   queryParams.set('page',   String(params.page));
  if (params.limit)  queryParams.set('limit',  String(params.limit));
  if (params.search) queryParams.set('search', params.search);

  const query = queryParams.toString();
  const res = await api.get<ApiResponse<PaginatedResponse<OutgoingDocument>>>(
    `${BASE}/trash${query ? `?${query}` : ''}`,
  );
  return res.data.data!;
};

/**
 * Lấy chi tiết văn bản đi theo ID.
 */
export const getOutgoingDocumentById = async (id: number): Promise<OutgoingDocument> => {
  const res = await api.get<ApiResponse<OutgoingDocument>>(`${BASE}/${id}`);
  return res.data.data!;
};

// ─── Tạo mới và chỉnh sửa ────────────────────────────────────────────────────

/**
 * Tạo văn bản đi mới (chức năng #1).
 */
export const createOutgoingDocument = async (
  data: CreateOutgoingDocumentRequest,
): Promise<OutgoingDocument> => {
  const res = await api.post<ApiResponse<OutgoingDocument>>(BASE, data);
  return res.data.data!;
};

/**
 * Upload file nháp cho văn bản đi (chức năng #2).
 */
export const uploadOutgoingFile = async (
  id: number,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<OutgoingDocument> => {
  const formData = new FormData();
  formData.append('file', file);

  const res = await api.post<ApiResponse<OutgoingDocument>>(
    `${BASE}/${id}/upload`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event: { loaded: number; total?: number }) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded * 100) / event.total));
        }
      },
    },
  );
  return res.data.data!;
};

/**
 * Chạy OCR trên file đã upload (chức năng #3).
 */
export const runOutgoingOcr = async (id: number): Promise<OcrResult> => {
  const res = await api.post<ApiResponse<OcrResult>>(`${BASE}/${id}/ocr`);
  return res.data.data!;
};

/**
 * Cập nhật metadata văn bản đi (chức năng #4).
 */
export const updateOutgoingMetadata = async (
  id: number,
  data: UpdateOutgoingMetadataRequest,
): Promise<OutgoingDocument> => {
  const res = await api.patch<ApiResponse<OutgoingDocument>>(`${BASE}/${id}/metadata`, data);
  return res.data.data!;
};

/**
 * Gán Văn thư (DOCUMENT_CLERK) để xử lý văn bản đi.
 * Chỉ dành cho DEPARTMENT_HEAD hoặc ADMIN.
 */
export const assignOutgoingClerk = async (
  id: number,
  clerkId: number,
): Promise<OutgoingDocument> => {
  const res = await api.patch<ApiResponse<OutgoingDocument>>(`${BASE}/${id}/assign-clerk`, { clerkId });
  return res.data.data!;
};

/**
 * Xóa mềm văn bản đi.
 */
export const deleteOutgoingDocument = async (id: number): Promise<OutgoingDocument> => {
  const res = await api.delete<ApiResponse<OutgoingDocument>>(`${BASE}/${id}`);
  return res.data.data!;
};

/**
 * Cập nhật trạng thái workflow văn bản đi.
 * Dùng cho nhiều chức năng: submit, approve, return, issue, recall, trash...
 */
export const updateOutgoingStatus = async (
  id: number,
  data: UpdateOutgoingStatusRequest,
): Promise<OutgoingDocument> => {
  const res = await api.patch<ApiResponse<OutgoingDocument>>(`${BASE}/${id}/status`, data);
  return res.data.data!;
};

export interface SendEmailResult {
  sentCount: number;
  failedCount: number;
  sentEmails: string[];
  failedEmails: string[];
}

/**
 * Gửi văn bản đi đã phát hành qua email cho danh sách người nhận.
 */
export const sendOutgoingEmail = async (
  id: number,
  recipients: string[],
): Promise<SendEmailResult> => {
  const res = await api.post<ApiResponse<SendEmailResult>>(`${BASE}/${id}/send-email`, { recipients });
  return res.data.data!;
};

/**
 * Kiểm tra chữ ký số của file đính kèm.
 */
export const verifyOutgoingDocumentSignature = async (id: number): Promise<SignatureVerificationResult> => {
  const res = await api.get<ApiResponse<SignatureVerificationResult>>(`${BASE}/${id}/verify-signature`);
  return res.data.data!;
};

/**
 * UC-70: Lấy danh sách tất cả chữ ký số trong file PDF/Word.
 */
export const getOutgoingSignatures = async (
  id: number,
): Promise<DocumentSignatureResponse> => {
  const res = await api.get<ApiResponse<DocumentSignatureResponse>>(
    `${BASE}/${id}/signatures`,
  );
  return res.data.data!;
};

/**
 * UC-72: Lấy thông tin chi tiết của một chữ ký theo index.
 */
export const getOutgoingSignatureDetail = async (
  id: number,
  signatureIndex: number,
): Promise<DocumentSignatureItem> => {
  const res = await api.get<ApiResponse<DocumentSignatureItem>>(
    `${BASE}/${id}/signatures/${signatureIndex}`,
  );
  return res.data.data!;
};

// ─── Thống kê ─────────────────────────────────────────────────────────────────

export interface OutgoingStatisticsData {
  totalCount: number;
  issuedCount: number;
  byStatus: Array<{ status: string; count: number }>;
  byDocumentType: Array<{ documentType: string; count: number }>;
  byDepartment: Array<{ departmentId: number | null; departmentName: string; count: number }>;
  byMonth: Array<{ month: string; count: number }>;
}

export interface OutgoingStatisticsParams {
  dateFrom?: string;
  dateTo?: string;
  departmentId?: number;
}

/**
 * Lấy số liệu thống kê văn bản đi từ server.
 */
export const getOutgoingStatistics = async (
  params: OutgoingStatisticsParams = {},
): Promise<OutgoingStatisticsData> => {
  const queryParams = new URLSearchParams();
  if (params.dateFrom)    queryParams.set('dateFrom',    params.dateFrom);
  if (params.dateTo)      queryParams.set('dateTo',      params.dateTo);
  if (params.departmentId !== undefined)
    queryParams.set('departmentId', String(params.departmentId));

  const query = queryParams.toString();
  const url = query ? `${BASE}/statistics?${query}` : `${BASE}/statistics`;
  const res = await api.get<ApiResponse<OutgoingStatisticsData>>(url);
  return res.data.data!;
};

/** Xuất danh sách văn bản đi ra Excel */
export const exportOutgoingExcel = (params: OutgoingDocumentFilterParams) =>
  api.get(`${BASE}/export`, {
    params: { ...params, format: 'excel' },
    responseType: 'blob',
  });

/** Xuất danh sách văn bản đi ra PDF */
export const exportOutgoingPdf = (params: OutgoingDocumentFilterParams) =>
  api.get(`${BASE}/export`, {
    params: { ...params, format: 'pdf' },
    responseType: 'blob',
  });

/** Cấp số (vào sổ) văn bản đi */
export const registerOutgoingDocument = async (
  id: number,
  data: { documentBookId: number; customIssuanceDate?: string },
): Promise<OutgoingDocument> => {
  const res = await api.post<ApiResponse<OutgoingDocument>>(`${BASE}/${id}/register`, data);
  return res.data.data!;
};
