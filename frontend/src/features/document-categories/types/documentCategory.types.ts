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
  deletedAt: string | null;
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

export interface CreateDocumentCategoryDto {
  name: string;
  code: string;
  description?: string;
  status?: DocumentCategoryStatus;
}

export interface UpdateDocumentCategoryDto {
  name?: string;
  code?: string;
  description?: string | null;
  status?: DocumentCategoryStatus;
}

export interface DocumentCategoryUsage {
  incoming: number;
  outgoing: number;
  total: number;
}

export type DeleteDocumentCategoryOperation = 'SOFT_DELETED' | 'DEACTIVATED';

export interface DeleteDocumentCategoryResult {
  category: DocumentCategoryResponse;
  operation: DeleteDocumentCategoryOperation;
  usage: DocumentCategoryUsage;
}
