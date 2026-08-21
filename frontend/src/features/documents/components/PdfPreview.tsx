import { useEffect, useRef, useState } from 'react';
import { documentsApi } from '../../../api';
import type { DocumentAttachment } from '../../../api/modules/documents';
import api from '../../../api/axios';

interface PdfPreviewProps {
  documentId: number;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  pageCount: number | null;
  /**
   * Additional "Tệp đính kèm" files that should also be previewable from
   * this panel. When provided, each attachment becomes a clickable tab;
   * selecting one swaps the toolbar info and viewer to that file while
   * keeping the main document available as the first tab.
   */
  attachments?: DocumentAttachment[];
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return ['image/png', 'image/jpeg', 'image/jpg', 'image/tiff', 'image/bmp', 'image/webp', 'image/gif'].includes(mimeType.toLowerCase());
}

function isPdfType(mimeType: string | null | undefined): boolean {
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
 * Identify which file is currently being previewed so the toolbar and
 * viewer stay in sync. `kind` distinguishes the main document (fetched via
 * the auth-protected `/documents/:id/preview` route) from attachments
 * (fetched via the static `/uploads/<filename>` path).
 */
type ActiveSource =
  | { kind: 'main'; documentId: number }
  | { kind: 'attachment'; attachment: DocumentAttachment };

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

/**
 * Fetch an attachment file as a blob. Attachments live at the static
 * `/uploads/<filename>` route mounted by `app.use('/uploads', express.static(...))`
 * in `backend/src/app.ts`. That route is NOT registered under `/api`, but the
 * shared axios instance has `baseURL: '/api'` (or `VITE_API_BASE_URL + '/api'`)
 * — so a request like `api.get('/uploads/foo.pdf')` would resolve to
 * `/api/uploads/foo.pdf` and 404. Use `fetch()` directly against the path the
 * server actually serves; the static handler does not require auth anyway.
 */
async function fetchAttachmentBlob(fileUrl: string): Promise<{ blob: Blob; revoke: () => void }> {
  const response = await fetch(fileUrl, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Failed to fetch attachment: ${response.status}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  return { blob, revoke: () => URL.revokeObjectURL(url) };
}

export default function PdfPreview({
  documentId,
  fileName,
  fileSize,
  mimeType,
  pageCount,
  attachments = [],
}: PdfPreviewProps) {
  const [activeSource, setActiveSource] = useState<ActiveSource | null>(
    fileName ? { kind: 'main', documentId } : null,
  );
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const lastUrlRef = useRef<string | null>(null);

  const hasMainFile = !!fileName;
  const attachmentList = attachments ?? [];

  const activeMimeType =
    activeSource?.kind === 'attachment' ? activeSource.attachment.mimeType : mimeType;
  const activeFileName =
    activeSource?.kind === 'attachment' ? activeSource.attachment.fileName : fileName;
  const activeFileSize =
    activeSource?.kind === 'attachment' ? activeSource.attachment.fileSize : fileSize;

  const isImage = isImageType(activeMimeType);
  const isPdf = isPdfType(activeMimeType);
  const hasActiveSource = !!activeSource;

  useEffect(() => {
    if (!activeSource) {
      setBlobUrl(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(false);

    const fetcher =
      activeSource.kind === 'main'
        ? fetchPreviewBlob(activeSource.documentId)
        : fetchAttachmentBlob(activeSource.attachment.fileUrl);

    fetcher
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
  }, [activeSource]);

  // If the main document becomes available (e.g. data loaded after first
  // render) and nothing is selected yet, default to it.
  useEffect(() => {
    if (!activeSource && hasMainFile) {
      setActiveSource({ kind: 'main', documentId });
    }
  }, [activeSource, hasMainFile, documentId]);

  const handleDownload = async () => {
    if (!activeSource) return;
    try {
      if (activeSource.kind === 'main') {
        // Use the same axios endpoint so the Authorization header is attached —
        // never leak the JWT into the URL.
        const path = documentsApi.getDownloadUrl(activeSource.documentId).replace(/^\/api/, '');
        const response = await api.get<Blob>(path, { responseType: 'blob' });
        const blob = response.data;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = activeFileName || 'document';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        const attachment = activeSource.attachment;
        // Attachments are served from the static `/uploads/<filename>` route
        // (NOT under `/api`) — fetch directly so the axios `/api` baseURL
        // does not mangle the path.
        const response = await fetch(attachment.fileUrl, { credentials: 'include' });
        if (!response.ok) {
          throw new Error(`Failed to fetch attachment: ${response.status}`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = attachment.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch {
      // The user can retry from the toolbar.
    }
  };

  if (!hasMainFile && attachmentList.length === 0) {
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

  const isActiveMain = activeSource?.kind === 'main';

  return (
    <div className="pdf-preview-section">
      <div className="pdf-preview-toolbar">
        <div className="pdf-preview-info">
          {isPdf && <span className="pdf-preview-badge">PDF</span>}
          {isImage && <span className="pdf-preview-badge image">HÌNH ẢNH</span>}
          <span className="pdf-preview-filename" title={activeFileName || ''}>{activeFileName}</span>
          {activeFileSize && (
            <span className="pdf-preview-size">{formatFileSize(activeFileSize)}</span>
          )}
          {isActiveMain && pageCount && (
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

      {(hasMainFile || attachmentList.length > 0) && (
        <div className="pdf-preview-files">
          <span className="pdf-preview-files-label">Tệp đính kèm:</span>
          <div className="pdf-preview-files-list" role="tablist" aria-label="Danh sách tệp">
            {hasMainFile && (
              <button
                type="button"
                role="tab"
                aria-selected={isActiveMain}
                className={`pdf-preview-file-chip${isActiveMain ? ' active' : ''}`}
                onClick={() => setActiveSource({ kind: 'main', documentId })}
                title={fileName || 'Tài liệu chính'}
              >
                <span className="pdf-preview-file-chip-icon" aria-hidden="true">📄</span>
                <span className="pdf-preview-file-chip-name">{fileName || 'Tài liệu chính'}</span>
              </button>
            )}
            {attachmentList.map((att) => {
              const isActive =
                activeSource?.kind === 'attachment' && activeSource.attachment.id === att.id;
              return (
                <button
                  key={att.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`pdf-preview-file-chip${isActive ? ' active' : ''}`}
                  onClick={() => setActiveSource({ kind: 'attachment', attachment: att })}
                  title={att.fileName}
                >
                  <span className="pdf-preview-file-chip-icon" aria-hidden="true">📎</span>
                  <span className="pdf-preview-file-chip-name">{att.fileName}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="pdf-preview-viewer">
        {!hasActiveSource ? (
          <div className="pdf-preview-unsupported">
            <FileIcon />
            <p>Chọn một tệp ở trên để xem trước</p>
          </div>
        ) : loadError ? (
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
                key={`pdf-${activeSource.kind === 'main' ? `main-${activeSource.documentId}` : `att-${activeSource.attachment.id}`}`}
                src={blobUrl}
                className="pdf-preview-iframe"
                title={activeFileName || 'PDF Viewer'}
                onError={() => setLoadError(true)}
              />
            )}
            {!loading && isImage && blobUrl && (
              <img
                key={`img-${activeSource.kind === 'main' ? `main-${activeSource.documentId}` : `att-${activeSource.attachment.id}`}`}
                src={blobUrl}
                alt={activeFileName || 'Document preview'}
                className="pdf-preview-image"
                onError={() => setLoadError(true)}
              />
            )}
            {!loading && !isPdf && !isImage && (
              <div className="pdf-preview-unsupported">
                <FileIcon />
                <p>Định dạng không được hỗ trợ xem trước</p>
                <p className="pdf-preview-unsupported-type">{activeMimeType || 'Không xác định'}</p>
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