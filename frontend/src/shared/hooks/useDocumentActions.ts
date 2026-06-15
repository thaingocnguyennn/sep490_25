import { useState, useCallback } from 'react';
import { documentsApi } from '../../api';

/**
 * Hook for document action operations: upload, soft-delete, and export.
 * Accepts an onSuccess callback to refresh the list after mutations.
 */
export function useDocumentActions(onSuccess?: () => void) {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  /** Upload a new document (FormData with file + metadata fields) */
  const uploadDocument = useCallback(
    async (formData: FormData) => {
      setActionLoading(true);
      setActionError('');
      try {
        const { data } = await documentsApi.upload(formData);
        onSuccess?.();
        return data.data;
      } catch (err: any) {
        const msg = err.response?.data?.message || 'Tải lên thất bại';
        setActionError(msg);
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [onSuccess]
  );

  /** Soft-delete a document by ID */
  const deleteDocument = useCallback(
    async (id: number) => {
      setActionLoading(true);
      setActionError('');
      try {
        await documentsApi.delete(id);
        onSuccess?.();
      } catch (err: any) {
        const msg = err.response?.data?.message || 'Xóa thất bại';
        setActionError(msg);
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [onSuccess]
  );

  /** Restore a soft-deleted document */
  const restoreDocument = useCallback(
    async (id: number) => {
      setActionLoading(true);
      setActionError('');
      try {
        await documentsApi.restore(id);
        onSuccess?.();
      } catch (err: any) {
        const msg = err.response?.data?.message || 'Khôi phục thất bại';
        setActionError(msg);
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [onSuccess]
  );

  /** Archive a completed document */
  const archiveDocument = useCallback(
    async (id: number) => {
      setActionLoading(true);
      setActionError('');
      try {
        await documentsApi.archiveDocument(id);
        onSuccess?.();
      } catch (err: any) {
        const msg = err.response?.data?.message || 'Lưu trữ thất bại';
        setActionError(msg);
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [onSuccess]
  );

  /** Hard-delete a document permanently */
  const hardDeleteDocument = useCallback(
    async (id: number) => {
      setActionLoading(true);
      setActionError('');
      try {
        await documentsApi.hardDelete(id);
        onSuccess?.();
      } catch (err: any) {
        const msg = err.response?.data?.message || 'Xóa vĩnh viễn thất bại';
        setActionError(msg);
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [onSuccess]
  );

  /** Trigger a file download by creating a temporary link from a Blob response */
  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  /** Export document list to Excel */
  const exportExcel = useCallback(
    async (params?: Record<string, any>) => {
      setActionLoading(true);
      setActionError('');
      try {
        const response = await documentsApi.exportExcel(params);
        triggerBlobDownload(response.data, 'documents.xlsx');
      } catch (err: any) {
        setActionError('Xuất file Excel thất bại');
      } finally {
        setActionLoading(false);
      }
    },
    []
  );

  /** Export document list to PDF */
  const exportPdf = useCallback(
    async (params?: Record<string, any>) => {
      setActionLoading(true);
      setActionError('');
      try {
        const response = await documentsApi.exportPdf(params);
        triggerBlobDownload(response.data, 'documents.pdf');
      } catch (err: any) {
        setActionError('Xuất file PDF thất bại');
      } finally {
        setActionLoading(false);
      }
    },
    []
  );

  return {
    actionLoading,
    actionError,
    uploadDocument,
    deleteDocument,
    restoreDocument,
    archiveDocument,
    hardDeleteDocument,
    exportExcel,
    exportPdf,
  };
}
