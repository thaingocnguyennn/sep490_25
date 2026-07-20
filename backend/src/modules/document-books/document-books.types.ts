import { DocumentBookType, DocumentBookStatus } from '@prisma/client';

export interface DocumentBookDto {
  id: number;
  name: string;
  code?: string | null;
  description?: string | null;
  bookType: DocumentBookType;
  year: number;
  currentNumber: number;
  isDefault: boolean;
  status: DocumentBookStatus;
  departmentId: number;
  department?: { id: number; name: string };
  createdById: number;
  createdBy?: { id: number; fullName: string };
  openedAt: Date;
  closedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDocumentBookInput {
  name: string;
  code?: string;
  description?: string;
  bookType: DocumentBookType;
  year: number;
  isDefault?: boolean;
  departmentId: number;
}

export interface UpdateDocumentBookInput {
  name?: string;
  code?: string | null;
  description?: string | null;
  isDefault?: boolean;
  status?: DocumentBookStatus;
}

export interface ListDocumentBooksQuery {
  page?: number;
  limit?: number;
  search?: string;
  bookType?: DocumentBookType;
  year?: number;
  departmentId?: number;
  status?: DocumentBookStatus;
  isDefault?: boolean;
}
