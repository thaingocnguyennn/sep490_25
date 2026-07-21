import { useEffect, useRef, useState } from 'react';
import { documentsApi } from '../../../api';
import api from '../../../api/axios';

interface PdfPreviewProps {
  documentId: number;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  pageCount: number | null;
}

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(mimeType: string | null): boolean {
  if (!mimeType) return false;
  return ['image/png', 'image/jpeg', 'image/jpg', 'image/tiff', 'image/bmp', 'image/webp', 'image/gif'].includes(mimeType.toLowerCase());
}

function isPdfType(mimeType: string | null): boolean {
  if (!mimeType) return false;
  return mimeType.toLowerCase() === 'application/pdf';
}

function FileIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#b2bec3" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

/**
 * Download a binary blob via the API, taking advantage of the Authorization
 * header that axios attaches automatically. Returns a short-lived object URL
 * the caller must `URL.revokeObjectURL` when done. The previous implementation
 * used `?token=` in the URL which leaked the JWT into server logs.
 */
async function fetchPreviewBlob(documentId: number): Promise<{ blob: Blob; revoke: () => void }> {
  const path = documentsApi.getPreviewUrl(documentId).replace(/^\/api/, '');
  const response = await api.get<Blob>(path, {
    responseType: 'blob',
  });
  const blob = response.data;
  const url = URL.createObjectURL(blob);
  return { blob, revoke: () => URL.revokeObjectURL(url) };
}

export default function PdfPreview({ documentId, fileName, fileSize, mimeType, pageCount }: PdfPreviewProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const lastUrlRef = useRef<string | null>(null);

  const isImage = isImageType(mimeType);
  const isPdf = isPdfType(mimeType);
  const hasFile = !!fileName;

  useEffect(() => {
    if (!hasFile) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetchPreviewBlob(documentId)
      .then(({ blob, revoke }) => {
        if (cancelled) {
          revoke();
          return;
        }
        const url = URL.createObjectURL(blob);
        lastUrlRef.current = url;
        setBlobUrl(url);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = null;
      }
    };
  }, [documentId, hasFile]);

  const handleDownload = async () => {
    // Use the same axios endpoint so the Authorization header is attached —
    // never leak the JWT into the URL.
    try {
      const path = documentsApi.getDownloadUrl(documentId).replace(/^\/api/, '');
      const response = await api.get<Blob>(path, { responseType: 'blob' });
      const blob = response.data;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'document';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // The user can retry from the toolbar.
    }
  };

  if (!hasFile) {
    return (
      <div className="pdf-preview-empty">
        <div className="pdf-preview-empty-icon">
          <FileIcon />
        </div>
        <p className="pdf-preview-empty-title">Không có tệp đính kèm</p>
        <p className="pdf-preview-empty-hint">Văn bản này chưa có tệp PDF hoặc hình ảnh đính kèm</p>
      </div>
    );
  }

  return (
    <div className="pdf-preview-section">
      <div className="pdf-preview-toolbar">
        <div className="pdf-preview-info">
          {isPdf && <span className="pdf-preview-badge">PDF</span>}
          {isImage && <span className="pdf-preview-badge image">HÌNH ẢNH</span>}
          <span className="pdf-preview-filename" title={fileName || ''}>{fileName}</span>
          {fileSize && (
            <span className="pdf-preview-size">{formatFileSize(fileSize)}</span>
          )}
          {pageCount && (
            <span className="pdf-preview-pages">{pageCount} trang</span>
          )}
        </div>
        <div className="pdf-preview-actions">
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={handleDownload}
            disabled={loading}
          >
            Tải về
          </button>
        </div>
      </div>

      <div className="pdf-preview-viewer">
        {loadError ? (
          <div className="pdf-preview-error">
            <p>Không thể tải tệp xem trước</p>
            <button type="button" className="btn btn-primary" onClick={handleDownload}>
              Tải về để xem
            </button>
          </div>
        ) : (
          <>
            {loading && (
              <div className="pdf-preview-loading">
                <div className="spinner" />
                <span>Đang tải tài liệu...</span>
              </div>
            )}
            {!loading && isPdf && blobUrl && (
              <iframe
                key={`pdf-${documentId}`}
                src={blobUrl}
                className="pdf-preview-iframe"
                title={fileName || 'PDF Viewer'}
                onError={() => setLoadError(true)}
              />
            )}
            {!loading && isImage && blobUrl && (
              <img
                key={`img-${documentId}`}
                src={blobUrl}
                alt={fileName || 'Document preview'}
                className="pdf-preview-image"
                onError={() => setLoadError(true)}
              />
            )}
            {!loading && !isPdf && !isImage && (
              <div className="pdf-preview-unsupported">
                <FileIcon />
                <p>Định dạng không được hỗ trợ xem trước</p>
                <p className="pdf-preview-unsupported-type">{mimeType || 'Không xác định'}</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: 12 }}
                  onClick={handleDownload}
                >
                  Tải về tệp
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
