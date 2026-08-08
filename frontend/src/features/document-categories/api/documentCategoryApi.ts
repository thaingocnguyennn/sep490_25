import api from '../../../api/axios';
import {
  DocumentCategoryFilter,
  DocumentCategoryOption,
  DocumentCategoryResponse,
  PaginatedDocumentCategoryResponse,
  CreateDocumentCategoryDto,
  UpdateDocumentCategoryDto,
  DeleteDocumentCategoryResult,
} from '../types/documentCategory.types';

// Backend trả về wrapper { success, message, data } nên cần unwrap
interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export const documentCategoryApi = {
  getAll: async (filter?: DocumentCategoryFilter): Promise<PaginatedDocumentCategoryResponse> => {
    // Backend dùng paginatedResponse → data.items, nhưng controller dùng paginatedResponse nên cần unwrap
    const response = await api.get<ApiResponse<{ items: DocumentCategoryResponse[]; total: number; page: number; limit: number; totalPages: number }>>('/document-categories', {
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

  getById: async (id: number): Promise<DocumentCategoryResponse> => {
    const response = await api.get<ApiResponse<DocumentCategoryResponse>>(`/document-categories/${id}`);
    return response.data.data;
  },

  getActiveOptions: async (): Promise<DocumentCategoryOption[]> => {
    const response = await api.get<ApiResponse<DocumentCategoryOption[]>>('/document-categories/options');
    return response.data.data;
  },

  create: async (dto: CreateDocumentCategoryDto): Promise<DocumentCategoryResponse> => {
    const response = await api.post<ApiResponse<DocumentCategoryResponse>>('/document-categories', dto);
    return response.data.data;
  },

  update: async (id: number, dto: UpdateDocumentCategoryDto): Promise<DocumentCategoryResponse> => {
    const response = await api.patch<ApiResponse<DocumentCategoryResponse>>(`/document-categories/${id}`, dto);
    return response.data.data;
  },

  delete: async (id: number): Promise<DeleteDocumentCategoryResult> => {
    const response = await api.delete<ApiResponse<DeleteDocumentCategoryResult>>(`/document-categories/${id}`);
    return response.data.data;
  },
};
