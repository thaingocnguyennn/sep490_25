import type { CSSProperties } from 'react';

interface DocumentViewerProps {
  file: File | null;
  fileUrl: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(mimeType: string): boolean {
  return ['image/png', 'image/jpeg', 'image/jpg', 'image/tiff', 'image/bmp', 'image/webp'].includes(mimeType);
}

function isPdfType(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

export default function DocumentViewer({ file, fileUrl }: DocumentViewerProps) {
  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  };

  if (!file || !fileUrl) {
    return (
      <div style={containerStyle}>
        <div className="document-viewer">
          <div className="document-viewer-header">
            <span className="document-viewer-title">Xem trước tài liệu</span>
          </div>
          <div className="document-viewer-empty">
            <div className="document-viewer-empty-icon">
              <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#b2bec3" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="11" x2="12" y2="17" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
            </div>
            <p className="document-viewer-empty-text">Chưa có tài liệu</p>
            <p className="document-viewer-empty-hint">Tải lên hình ảnh hoặc PDF để xem trước</p>
          </div>
        </div>
      </div>
    );
  }

  const mimeType = file.type || '';
  const isImage = isImageType(mimeType);
  const isPdf = isPdfType(mimeType);
  const typeLabel = isPdf ? 'PDF' : 'Hình ảnh';

  return (
    <div style={containerStyle}>
      <div className="document-viewer">
        <div className="document-viewer-header">
          <div className="document-viewer-info">
            <span className="document-viewer-type-badge">{typeLabel}</span>
            <span className="document-viewer-filename" title={file.name}>{file.name}</span>
            <span className="document-viewer-filesize">{formatFileSize(file.size)}</span>
          </div>
        </div>

        <div className="document-viewer-body">
          {isImage && (
            <img
              src={fileUrl}
              alt={file.name}
              style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
              className="document-viewer-img"
            />
          )}
          {isPdf && (
            <object
              data={fileUrl}
              type="application/pdf"
              className="document-viewer-pdf"
            >
              <embed
                src={fileUrl}
                type="application/pdf"
                className="document-viewer-pdf"
              />
            </object>
          )}
          {!isImage && !isPdf && (
            <div className="document-viewer-unsupported">
              <p>Định dạng không được hỗ trợ xem trước: {mimeType || 'không xác định'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
