import { DocumentCategoryStatus } from '@prisma/client';

export interface DocumentCategoryQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: DocumentCategoryStatus;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface DocumentCategoryFilterDto {
  page?: number;
  limit?: number;
  search?: string;
  status?: DocumentCategoryStatus;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface DocumentCategoryResponse {
  id: number;
  name: string;
  code: string;
  description: string | null;
  status: DocumentCategoryStatus;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: number;
    fullName: string;
  };
  usageCount: number; // calculated field based on incoming/outgoing documents
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
