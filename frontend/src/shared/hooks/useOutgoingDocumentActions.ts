import { useState, useCallback } from 'react';
import {
  createOutgoingDocument,
  uploadOutgoingFile,
  runOutgoingOcr,
  updateOutgoingMetadata,
  updateOutgoingStatus,
} from '../../api/modules/outgoing-documents';
import type {
  OutgoingDocument,
  CreateOutgoingDocumentRequest,
  UpdateOutgoingMetadataRequest,
  UpdateOutgoingStatusRequest,
  OcrResult,
} from '../../types';

interface UseOutgoingDocumentActionsReturn {
  loading: boolean;
  uploadProgress: number;
  error: string | null;
  create: (data: CreateOutgoingDocumentRequest) => Promise<OutgoingDocument | null>;
  uploadFile: (id: number, file: File) => Promise<OutgoingDocument | null>;
  runOcr: (id: number) => Promise<OcrResult | null>;
  updateMetadata: (id: number, data: UpdateOutgoingMetadataRequest) => Promise<OutgoingDocument | null>;
  updateStatus: (id: number, data: UpdateOutgoingStatusRequest) => Promise<OutgoingDocument | null>;
  clearError: () => void;
}

/**
 * Hook quản lý các hành động trên văn bản đi:
 * tạo mới, upload file, OCR, cập nhật metadata, cập nhật trạng thái.
 */
export function useOutgoingDocumentActions(): UseOutgoingDocumentActionsReturn {
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Tạo văn bản đi mới (chức năng #1).
   */
  const create = useCallback(
    async (data: CreateOutgoingDocumentRequest): Promise<OutgoingDocument | null> => {
      setLoading(true);
      setError(null);
      try {
        return await createOutgoingDocument(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Lỗi khi tạo văn bản đi';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * Upload file nháp (chức năng #2).
   */
  const uploadFile = useCallback(
    async (id: number, file: File): Promise<OutgoingDocument | null> => {
      setLoading(true);
      setUploadProgress(0);
      setError(null);
      try {
        return await uploadOutgoingFile(id, file, (percent) => setUploadProgress(percent));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Lỗi khi upload file';
        setError(message);
        return null;
      } finally {
        setLoading(false);
        setUploadProgress(0);
      }
    },
    [],
  );

  /**
   * Chạy OCR (chức năng #3).
   */
  const runOcr = useCallback(async (id: number): Promise<OcrResult | null> => {
    setLoading(true);
    setError(null);
    try {
      return await runOutgoingOcr(id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi khi chạy OCR';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Cập nhật metadata (chức năng #4).
   */
  const updateMetadata = useCallback(
    async (id: number, data: UpdateOutgoingMetadataRequest): Promise<OutgoingDocument | null> => {
      setLoading(true);
      setError(null);
      try {
        return await updateOutgoingMetadata(id, data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Lỗi khi cập nhật thông tin';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * Cập nhật trạng thái workflow.
   */
  const updateStatus = useCallback(
    async (id: number, data: UpdateOutgoingStatusRequest): Promise<OutgoingDocument | null> => {
      setLoading(true);
      setError(null);
      try {
        return await updateOutgoingStatus(id, data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Lỗi khi cập nhật trạng thái';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, uploadProgress, error, create, uploadFile, runOcr, updateMetadata, updateStatus, clearError };
}
