export type DocumentCategoryStatus = 'ACTIVE' | 'INACTIVE';

export interface DocumentCategoryResponse {
  id: number;
  name: string;
  code: string;
  description: string | null;
  status: DocumentCategoryStatus;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: number;
    fullName: string;
  };
  usageCount: number;
}

export interface DocumentCategoryFilter {
  page?: number;
  limit?: number;
  search?: string;
  status?: DocumentCategoryStatus;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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
