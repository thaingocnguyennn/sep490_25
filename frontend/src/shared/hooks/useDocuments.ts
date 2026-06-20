import { useState, useCallback } from 'react';
import { documentsApi } from '../../api';
import type {
  Document,
  DocumentFilterParams,
  DocumentType,
  DocumentStatus,
  PriorityLevel,
} from '../../types';

interface UseDocumentsOptions {
  pageSize?: number;
}

interface UseDocumentsResult {
  documents: Document[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string;
  /** Fetch documents with new filter criteria (resets to page 1) */
  fetch: (params?: DocumentFilterParams) => void;
  /** Navigate to a specific page (keeps current filters) */
  setPage: (page: number) => void;
}

/**
 * Hook for managing the paginated, filterable document list.
 * Mirrors the pattern of useUsers but adapted for documents.
 */
export function useDocuments(options: UseDocumentsOptions = {}): UseDocumentsResult {
  const { pageSize = 10 } = options;
  const [documents, setDocuments] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Store current filter state so setPage can re-apply them
  const [currentFilters, setCurrentFilters] = useState<DocumentFilterParams>({});

  const fetch = useCallback(
    (params?: DocumentFilterParams) => {
      const filters = params || {};
      setCurrentFilters(filters);
      setPageState(1);
      setLoading(true);
      setError('');

      // Clean undefined values from params
      const cleanParams: DocumentFilterParams = {
        page: 1,
        limit: pageSize,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, v]) => v !== undefined && v !== '')
        ),
      };

      documentsApi
        .getAll(cleanParams)
        .then(({ data }) => {
          setDocuments(data.data!.items);
          setTotal(data.data!.total);
        })
        .catch(() => {
          setError('Failed to load documents');
        })
        .finally(() => setLoading(false));
    },
    [pageSize]
  );

  const loadPage = useCallback(
    (newPage: number) => {
      setPageState(newPage);
      setLoading(true);
      setError('');

      const cleanParams: DocumentFilterParams = {
        page: newPage,
        limit: pageSize,
        ...Object.fromEntries(
          Object.entries(currentFilters).filter(([_, v]) => v !== undefined && v !== '')
        ),
      };

      documentsApi
        .getAll(cleanParams)
        .then(({ data }) => {
          setDocuments(data.data!.items);
          setTotal(data.data!.total);
        })
        .catch(() => {
          setError('Failed to load documents');
        })
        .finally(() => setLoading(false));
    },
    [pageSize, currentFilters]
  );

  return {
    documents,
    total,
    page,
    limit: pageSize,
    loading,
    error,
    fetch,
    setPage: loadPage,
  };
}
