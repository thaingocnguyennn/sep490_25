import { useState, useCallback } from 'react';
import {
  getOutgoingDocuments,
  getTrashedOutgoingDocuments,
  getOutgoingDocumentById,
} from '../../api/modules/outgoing-documents';
import type {
  OutgoingDocument,
  OutgoingDocumentFilterParams,
  PaginatedResponse,
} from '../../types';

interface UseOutgoingDocumentsReturn {
  documents: OutgoingDocument[];
  total: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  fetchDocuments: (params?: OutgoingDocumentFilterParams) => Promise<void>;
  fetchTrashed: (params?: { page?: number; limit?: number; search?: string }) => Promise<void>;
  fetchById: (id: number) => Promise<OutgoingDocument | null>;
}

/**
 * Hook quản lý danh sách và chi tiết văn bản đi.
 */
export function useOutgoingDocuments(): UseOutgoingDocumentsReturn {
  const [documents, setDocuments] = useState<OutgoingDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async (params: OutgoingDocumentFilterParams = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result: PaginatedResponse<OutgoingDocument> = await getOutgoingDocuments({
        page: 1,
        limit: 10,
        ...params,
      });
      setDocuments(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi khi tải danh sách văn bản đi';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTrashed = useCallback(async (
    params: { page?: number; limit?: number; search?: string } = {},
  ) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getTrashedOutgoingDocuments({ page: 1, limit: 10, ...params });
      setDocuments(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi khi tải thùng rác văn bản đi';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchById = useCallback(async (id: number): Promise<OutgoingDocument | null> => {
    try {
      return await getOutgoingDocumentById(id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi khi tải chi tiết văn bản đi';
      setError(message);
      return null;
    }
  }, []);

  return { documents, total, totalPages, loading, error, fetchDocuments, fetchTrashed, fetchById };
}
