import api from '../../../api/axios';
import {
  DocumentCategoryFilter,
  DocumentCategoryOption,
  DocumentCategoryResponse,
  PaginatedDocumentCategoryResponse,
} from '../types/documentCategory.types';

export const documentCategoryApi = {
  getAll: async (filter?: DocumentCategoryFilter) => {
    const response = await api.get<PaginatedDocumentCategoryResponse>('/document-categories', {
      params: filter,
    });
    return response.data;
  },

  getById: async (id: number) => {
    const response = await api.get<DocumentCategoryResponse>(`/document-categories/${id}`);
    return response.data;
  },

  getActiveOptions: async () => {
    const response = await api.get<DocumentCategoryOption[]>('/document-categories/options');
    return response.data;
  },
};
