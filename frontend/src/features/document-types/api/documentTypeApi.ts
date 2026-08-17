import api from '../../../api/axios';
import {
  DocumentTypeFilter,
  DocumentTypeOption,
  DocumentTypeResponse,
  PaginatedDocumentTypeResponse,
  CreateDocumentTypeDto,
  UpdateDocumentTypeDto,
  DeleteDocumentTypeResult,
} from '../types/documentType.types';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export const documentTypeApi = {
  getAll: async (filter?: DocumentTypeFilter): Promise<PaginatedDocumentTypeResponse> => {
    const response = await api.get<ApiResponse<{ items: DocumentTypeResponse[]; total: number; page: number; limit: number; totalPages: number }>>('/document-types', {
      params: filter,
    });
    const d = response.data.data;
    return {
      data: d.items,
      total: d.total,
      page: d.page,
      limit: d.limit,
      totalPages: d.totalPages,
    };
  },

  getById: async (id: number): Promise<DocumentTypeResponse> => {
    const response = await api.get<ApiResponse<DocumentTypeResponse>>(`/document-types/${id}`);
    return response.data.data;
  },

  getActiveOptions: async (): Promise<DocumentTypeOption[]> => {
    const response = await api.get<ApiResponse<DocumentTypeOption[]>>('/document-types/options');
    return response.data.data;
  },

  create: async (dto: CreateDocumentTypeDto): Promise<DocumentTypeResponse> => {
    const response = await api.post<ApiResponse<DocumentTypeResponse>>('/document-types', dto);
    return response.data.data;
  },

  update: async (id: number, dto: UpdateDocumentTypeDto): Promise<DocumentTypeResponse> => {
    const response = await api.patch<ApiResponse<DocumentTypeResponse>>(`/document-types/${id}`, dto);
    return response.data.data;
  },

  reactivate: async (id: number): Promise<DocumentTypeResponse> => {
    const response = await api.patch<ApiResponse<DocumentTypeResponse>>(`/document-types/${id}/reactivate`);
    return response.data.data;
  },

  delete: async (id: number): Promise<DeleteDocumentTypeResult> => {
    const response = await api.delete<ApiResponse<DeleteDocumentTypeResult>>(`/document-types/${id}`);
    return response.data.data;
  },
};
