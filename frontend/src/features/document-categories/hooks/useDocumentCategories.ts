import { useState, useCallback } from 'react';
import { documentCategoryApi } from '../api/documentCategoryApi';
import {
  DocumentCategoryFilter,
  DocumentCategoryOption,
  PaginatedDocumentCategoryResponse,
  CreateDocumentCategoryDto,
  UpdateDocumentCategoryDto,
} from '../types/documentCategory.types';

export const useDocumentCategories = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaginatedDocumentCategoryResponse | null>(null);

  const fetchCategories = useCallback(async (filter?: DocumentCategoryFilter) => {
    setLoading(true);
    setError(null);
    try {
      const response = await documentCategoryApi.getAll(filter);
      setData(response);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Không thể tải danh sách lĩnh vực văn bản');
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetchCategories };
};

export const useDocumentCategoryOptions = () => {
  const [options, setOptions] = useState<DocumentCategoryOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await documentCategoryApi.getActiveOptions();
      setOptions(response);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Không thể tải danh sách lựa chọn');
    } finally {
      setLoading(false);
    }
  }, []);

  return { options, loading, error, fetchOptions };
};

export const useDocumentCategoryActions = () => {
  const [loading, setLoading] = useState(false);

  const create = useCallback(async (dto: CreateDocumentCategoryDto) => {
    setLoading(true);
    try {
      return await documentCategoryApi.create(dto);
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(async (id: number, dto: UpdateDocumentCategoryDto) => {
    setLoading(true);
    try {
      return await documentCategoryApi.update(id, dto);
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(async (id: number) => {
    setLoading(true);
    try {
      return await documentCategoryApi.delete(id);
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, update, remove, loading };
};
