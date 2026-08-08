import { useState, useCallback } from 'react';
import { documentTypeApi } from '../api/documentTypeApi';
import {
  DocumentKindFilter,
  DocumentKindOption,
  PaginatedDocumentKindResponse,
  CreateDocumentKindDto,
  UpdateDocumentKindDto,
} from '../types/documentType.types';

export const useDocumentTypes = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaginatedDocumentKindResponse | null>(null);

  const fetchDocumentTypes = useCallback(async (filter?: DocumentKindFilter) => {
    setLoading(true);
    setError(null);
    try {
      const response = await documentTypeApi.getAll(filter);
      setData(response);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Không thể tải danh sách thể loại văn bản');
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetchDocumentTypes };
};

export const useDocumentTypeOptions = () => {
  const [options, setOptions] = useState<DocumentKindOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await documentTypeApi.getActiveOptions();
      setOptions(response);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Không thể tải danh sách lựa chọn');
    } finally {
      setLoading(false);
    }
  }, []);

  return { options, loading, error, fetchOptions };
};

export const useDocumentTypeActions = () => {
  const [loading, setLoading] = useState(false);

  const create = useCallback(async (dto: CreateDocumentKindDto) => {
    setLoading(true);
    try {
      return await documentTypeApi.create(dto);
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(async (id: number, dto: UpdateDocumentKindDto) => {
    setLoading(true);
    try {
      return await documentTypeApi.update(id, dto);
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(async (id: number) => {
    setLoading(true);
    try {
      return await documentTypeApi.delete(id);
    } finally {
      setLoading(false);
    }
  }, []);

  const reactivate = useCallback(async (id: number) => {
    setLoading(true);
    try {
      return await documentTypeApi.reactivate(id);
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, update, remove, reactivate, loading };
};
