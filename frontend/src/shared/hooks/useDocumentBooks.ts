import { useState, useEffect, useCallback } from 'react';
import { documentBooksApi, DocumentBook } from '../../api/modules/document-books';

interface UseDocumentBooksOptions {
  page?: number;
  limit?: number;
  search?: string;
  bookType?: string;
  year?: number;
  status?: string;
  departmentId?: number;
}

export function useDocumentBooks(options: UseDocumentBooksOptions = {}) {
  const [data, setData] = useState<DocumentBook[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await documentBooksApi.list(options);
      setData(response.items);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không thể tải danh sách sổ văn bản');
    } finally {
      setLoading(false);
    }
  }, [
    options.page,
    options.limit,
    options.search,
    options.bookType,
    options.year,
    options.status,
    options.departmentId,
  ]);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  return { data, total, totalPages, loading, error, refresh: fetchBooks };
}
