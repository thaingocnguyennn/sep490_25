import { DocumentKindStatus } from '@prisma/client';

export interface DocumentKindFilterDto {
  page?: number;
  limit?: number;
  search?: string;
  status?: DocumentKindStatus;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateDocumentKindDto {
  name: string;
  code: string;
  description?: string;
  status?: DocumentKindStatus;
}

export interface UpdateDocumentKindDto {
  name?: string;
  code?: string;
  description?: string | null;
  status?: DocumentKindStatus;
}

export interface DocumentKindResponse {
  id: number;
  name: string;
  code: string;
  description: string | null;
  status: DocumentKindStatus;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: {
    id: number;
    fullName: string;
  };
  usageCount: number;
  usageDetail: {
    incoming: number;
    outgoing: number;
  };
}

export interface PaginatedDocumentKindResponse {
  data: DocumentKindResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DocumentKindOption {
  id: number;
  name: string;
  code: string;
}

export interface DocumentKindUsage {
  incoming: number;
  outgoing: number;
  total: number;
}

export type DeleteDocumentKindOperation = 'SOFT_DELETED' | 'DEACTIVATED';

export interface DeleteDocumentKindResult {
  kind: DocumentKindResponse;
  operation: DeleteDocumentKindOperation;
  usage: DocumentKindUsage;
}
