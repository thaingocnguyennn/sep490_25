import { useState } from 'react';
import { documentBooksApi, CreateDocumentBookRequest, UpdateDocumentBookRequest } from '../../api/modules/document-books';

export function useDocumentBookActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (data: CreateDocumentBookRequest) => {
    setLoading(true);
    setError(null);
    try {
      return await documentBooksApi.create(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lỗi khi tạo sổ văn bản');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const update = async (id: number, data: UpdateDocumentBookRequest) => {
    setLoading(true);
    setError(null);
    try {
      return await documentBooksApi.update(id, data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lỗi khi cập nhật sổ văn bản');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const closeBook = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      return await documentBooksApi.closeBook(id);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lỗi khi đóng sổ văn bản');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const reopenBook = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      return await documentBooksApi.reopenBook(id);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lỗi khi mở lại sổ văn bản');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteBook = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      return await documentBooksApi.delete(id);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lỗi khi xóa sổ văn bản');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getEntries = async (id: number, params?: { page?: number; limit?: number }) => {
    setLoading(true);
    setError(null);
    try {
      return await documentBooksApi.getEntries(id, params);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lỗi khi tải danh sách văn bản');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { create, update, closeBook, reopenBook, deleteBook, getEntries, loading, error };
}
