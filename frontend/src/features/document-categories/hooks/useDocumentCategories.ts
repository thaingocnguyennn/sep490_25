import { useState, useCallback } from 'react';
import { documentCategoryApi } from '../api/documentCategoryApi';
import {
  DocumentCategoryFilter,
  DocumentCategoryOption,
  PaginatedDocumentCategoryResponse,
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
      setError(err.response?.data?.error || err.message || 'Failed to fetch document categories');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    data,
    loading,
    error,
    fetchCategories,
  };
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
      setError(err.response?.data?.error || err.message || 'Failed to fetch options');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    options,
    loading,
    error,
    fetchOptions,
  };
};
