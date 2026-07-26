import api from '../../../api/axios';
import {
  DocumentKindFilter,
  DocumentKindOption,
  DocumentKindResponse,
  PaginatedDocumentKindResponse,
  CreateDocumentKindDto,
  UpdateDocumentKindDto,
  DeleteDocumentKindResult,
} from '../types/documentType.types';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export const documentTypeApi = {
  getAll: async (filter?: DocumentKindFilter): Promise<PaginatedDocumentKindResponse> => {
    const response = await api.get<ApiResponse<{ items: DocumentKindResponse[]; total: number; page: number; limit: number; totalPages: number }>>('/document-types', {
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

  getById: async (id: number): Promise<DocumentKindResponse> => {
    const response = await api.get<ApiResponse<DocumentKindResponse>>(`/document-types/${id}`);
    return response.data.data;
  },

  getActiveOptions: async (): Promise<DocumentKindOption[]> => {
    const response = await api.get<ApiResponse<DocumentKindOption[]>>('/document-types/options');
    return response.data.data;
  },

  create: async (dto: CreateDocumentKindDto): Promise<DocumentKindResponse> => {
    const response = await api.post<ApiResponse<DocumentKindResponse>>('/document-types', dto);
    return response.data.data;
  },

  update: async (id: number, dto: UpdateDocumentKindDto): Promise<DocumentKindResponse> => {
    const response = await api.patch<ApiResponse<DocumentKindResponse>>(`/document-types/${id}`, dto);
    return response.data.data;
  },

  reactivate: async (id: number): Promise<DocumentKindResponse> => {
    const response = await api.patch<ApiResponse<DocumentKindResponse>>(`/document-types/${id}/reactivate`);
    return response.data.data;
  },

  delete: async (id: number): Promise<DeleteDocumentKindResult> => {
    const response = await api.delete<ApiResponse<DeleteDocumentKindResult>>(`/document-types/${id}`);
    return response.data.data;
  },
};
