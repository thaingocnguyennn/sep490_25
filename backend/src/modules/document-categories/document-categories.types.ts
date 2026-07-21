import { DocumentCategoryStatus } from '@prisma/client';

// ──────────────────────────────────────────────────────────────────────────────
// Query / Filter
// ──────────────────────────────────────────────────────────────────────────────

export interface DocumentCategoryFilterDto {
  page?: number;
  limit?: number;
  search?: string;
  status?: DocumentCategoryStatus;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ──────────────────────────────────────────────────────────────────────────────
// Request DTOs (chỉ nhận các field cho phép từ client)
// ──────────────────────────────────────────────────────────────────────────────

export interface CreateDocumentCategoryDto {
  name: string;
  code: string;
  description?: string;
  /** Mặc định ACTIVE nếu không truyền */
  status?: DocumentCategoryStatus;
}

export interface UpdateDocumentCategoryDto {
  name?: string;
  code?: string;
  description?: string | null;
  status?: DocumentCategoryStatus;
}

// ──────────────────────────────────────────────────────────────────────────────
// Response shapes
// ──────────────────────────────────────────────────────────────────────────────

export interface DocumentCategoryResponse {
  id: number;
  name: string;
  code: string;
  description: string | null;
  status: DocumentCategoryStatus;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: {
    id: number;
    fullName: string;
  };
  /** Tổng số văn bản (đến + đi) đang sử dụng lĩnh vực này */
  usageCount: number;
}

export interface PaginatedDocumentCategoryResponse {
  data: DocumentCategoryResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DocumentCategoryOption {
  id: number;
  name: string;
  code: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Usage count (dùng nội bộ service)
// ──────────────────────────────────────────────────────────────────────────────

export interface DocumentCategoryUsage {
  incoming: number;
  outgoing: number;
  total: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Delete result
// ──────────────────────────────────────────────────────────────────────────────

export type DeleteDocumentCategoryOperation = 'SOFT_DELETED' | 'DEACTIVATED';

export interface DeleteDocumentCategoryResult {
  category: DocumentCategoryResponse;
  operation: DeleteDocumentCategoryOperation;
  usage: DocumentCategoryUsage;
}
