import { useState, useCallback } from 'react';
import { incomingDocumentsApi, type IncomingDocumentListItem } from '../../api';

interface UseIncomingDocumentsOptions {
  pageSize?: number;
}

interface UseIncomingDocumentsResult {
  documents: IncomingDocumentListItem[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string;
  fetch: (params?: { search?: string; status?: string; documentTypeId?: number }) => void;
  setPage: (page: number) => void;
}

export function useIncomingDocuments(options: UseIncomingDocumentsOptions = {}): UseIncomingDocumentsResult {
  const { pageSize = 10 } = options;
  const [documents, setDocuments] = useState<IncomingDocumentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [documentTypeId, setDocumentTypeId] = useState<number | undefined>();

  const fetch = useCallback(
    (params?: { search?: string; status?: string; documentTypeId?: number }) => {
      const s = params?.search ?? search;
      const st = params?.status ?? statusFilter;
      const dt = params && 'documentTypeId' in params ? params.documentTypeId : documentTypeId;
      setSearch(s);
      setStatusFilter(st);
      setDocumentTypeId(dt);
      setPageState(1);
      setLoading(true);
      setError('');

      incomingDocumentsApi
        .getAll({ page: 1, limit: pageSize, search: s, status: st || undefined, documentTypeId: dt })
        .then(({ data }) => {
          setDocuments(data.data!.items);
          setTotal(data.data!.total);
        })
        .catch(() => setError('Failed to load incoming documents'))
        .finally(() => setLoading(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageSize]
  );

  const loadPage = useCallback(
    (newPage: number) => {
      setPageState(newPage);
      setLoading(true);
      setError('');

      incomingDocumentsApi
        .getAll({ page: newPage, limit: pageSize, search, status: statusFilter || undefined, documentTypeId })
        .then(({ data }) => {
          setDocuments(data.data!.items);
          setTotal(data.data!.total);
        })
        .catch(() => setError('Failed to load incoming documents'))
        .finally(() => setLoading(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageSize, search, statusFilter, documentTypeId]
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

// ─── Specialist pending documents ───────────────────────────────────────────────

interface UseSpecialistPendingDocumentsResult {
  documents: IncomingDocumentListItem[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string;
  fetch: (params?: { search?: string }) => void;
  setPage: (page: number) => void;
}

export function useSpecialistPendingDocuments(options: UseIncomingDocumentsOptions = {}): UseSpecialistPendingDocumentsResult {
  const { pageSize = 10 } = options;
  const [documents, setDocuments] = useState<IncomingDocumentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const fetch = useCallback(
    (params?: { search?: string }) => {
      const s = params?.search ?? search;
      setSearch(s);
      setPageState(1);
      setLoading(true);
      setError('');

      incomingDocumentsApi
        .getPendingForSpecialist({ page: 1, limit: pageSize, search: s || undefined })
        .then(({ data }) => {
          setDocuments(data.data!.items);
          setTotal(data.data!.total);
        })
        .catch(() => setError('Không thể tải danh sách văn bản'))
        .finally(() => setLoading(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageSize]
  );

  const loadPage = useCallback(
    (newPage: number) => {
      setPageState(newPage);
      setLoading(true);
      setError('');

      incomingDocumentsApi
        .getPendingForSpecialist({ page: newPage, limit: pageSize, search: search || undefined })
        .then(({ data }) => {
          setDocuments(data.data!.items);
          setTotal(data.data!.total);
        })
        .catch(() => setError('Không thể tải danh sách văn bản'))
        .finally(() => setLoading(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageSize, search]
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
