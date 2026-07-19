import { useState } from 'react';
import { documentsApi } from '../../../api';

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

function PdfIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 13h2a2 2 0 0 1 0 4H9v-4z" />
      <path d="M14 13h1a2 2 0 0 1 0 4h-1v-4z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

export default function PdfPreview({ documentId, fileName, fileSize, mimeType, pageCount }: PdfPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const isImage = isImageType(mimeType);
  const isPdf = isPdfType(mimeType);
  const hasFile = !!fileName;

  // The preview URL includes the auth token as a query param because the iframe
  // cannot forward the Authorization header from the parent page.
  const token = localStorage.getItem('token') ?? '';
  const previewUrl = hasFile ? `${documentsApi.getPreviewUrl(documentId)}?token=${encodeURIComponent(token)}` : null;
  const downloadUrl = hasFile ? `${documentsApi.getDownloadUrl(documentId)}?token=${encodeURIComponent(token)}` : null;

  const handleDownload = () => {
    if (!downloadUrl) return;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName || 'document';
    link.click();
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
          <a
            href={downloadUrl || '#'}
            download={fileName || 'document'}
            className="btn btn-sm btn-secondary"
            onClick={(e) => {
              if (!downloadUrl) e.preventDefault();
            }}
          >
            Tải về
          </a>
        </div>
      </div>

      <div className="pdf-preview-viewer">
        {loadError ? (
          <div className="pdf-preview-error">
            <p>Không thể tải tệp xem trước</p>
            <a
              href={downloadUrl || '#'}
              download={fileName || 'document'}
              className="btn btn-primary"
            >
              Tải về để xem
            </a>
          </div>
        ) : (
          <>
            {loading && (
              <div className="pdf-preview-loading">
                <div className="spinner" />
                <span>Đang tải tài liệu...</span>
              </div>
            )}
            {isPdf && previewUrl && (
              <iframe
                key={`pdf-${documentId}`}
                src={previewUrl}
                className="pdf-preview-iframe"
                title={fileName || 'PDF Viewer'}
                onLoad={() => setLoading(false)}
                onError={() => {
                  setLoadError(true);
                  setLoading(false);
                }}
              />
            )}
            {isImage && previewUrl && (
              <img
                key={`img-${documentId}`}
                src={previewUrl}
                alt={fileName || 'Document preview'}
                className="pdf-preview-image"
                onLoad={() => setLoading(false)}
                onError={() => {
                  setLoadError(true);
                  setLoading(false);
                }}
              />
            )}
            {!isPdf && !isImage && (
              <div className="pdf-preview-unsupported">
                <FileIcon />
                <p>Định dạng không được hỗ trợ xem trước</p>
                <p className="pdf-preview-unsupported-type">{mimeType || 'Không xác định'}</p>
                <a
                  href={downloadUrl || '#'}
                  download={fileName || 'document'}
                  className="btn btn-primary"
                  style={{ marginTop: 12 }}
                >
                  Tải về tệp
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
