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
        const msg = err.response?.data?.message || 'Upload failed';
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
        const msg = err.response?.data?.message || 'Delete failed';
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
        setActionError('Export to Excel failed');
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
        setActionError('Export to PDF failed');
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
    exportExcel,
    exportPdf,
  };
}
