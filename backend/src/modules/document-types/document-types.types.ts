import { DocumentTypeStatus } from '@prisma/client';

export interface DocumentTypeFilterDto {
  page?: number;
  limit?: number;
  search?: string;
  status?: DocumentTypeStatus;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateDocumentTypeDto {
  name: string;
  code: string;
  description?: string;
  status?: DocumentTypeStatus;
}

export interface UpdateDocumentTypeDto {
  name?: string;
  code?: string;
  description?: string | null;
  status?: DocumentTypeStatus;
}

export interface DocumentTypeResponse {
  id: number;
  name: string;
  code: string;
  description: string | null;
  status: DocumentTypeStatus;
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

export interface PaginatedDocumentTypeResponse {
  data: DocumentTypeResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DocumentTypeOption {
  id: number;
  name: string;
  code: string;
}

export interface DocumentTypeUsage {
  incoming: number;
  outgoing: number;
  total: number;
}

export type DeleteDocumentTypeOperation = 'SOFT_DELETED' | 'DEACTIVATED';

export interface DeleteDocumentTypeResult {
  kind: DocumentTypeResponse;
  operation: DeleteDocumentTypeOperation;
  usage: DocumentTypeUsage;
}
