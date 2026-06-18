import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { documentsApi } from '../../../api';
import { LoadingSpinner, ConfirmModal } from '../../../shared/components';
import { useDocumentActions } from '../../../shared/hooks';
import type { Document } from '../../../types';
import { useAuth } from '../../../contexts/AuthContext';

/**
 * DocumentDetailPage – View full document details, preview PDF, and download.
 */
export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isClerk = user?.roles?.includes('DOCUMENT_CLERK');
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { deleteDocument, actionLoading } = useDocumentActions(() => navigate('/documents'));

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    documentsApi
      .getById(Number(id))
      .then(({ data }) => setDoc(data.data!))
      .catch(() => setError('Lỗi khi tải tài liệu'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!doc) return;
    await deleteDocument(doc.id);
    setDeleteOpen(false);
  };

  // Format file size
  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) return <div className="page-content"><LoadingSpinner /></div>;
  if (error || !doc) {
    return (
      <div className="page-content">
        <div className="alert alert-error">{error || 'Không tìm thấy tài liệu'}</div>
        <button className="btn btn-secondary" onClick={() => navigate('/documents')}>← Quay lại</button>
      </div>
    );
  }

  const isPdf = doc.mimeType === 'application/pdf';
  const isImage = doc.mimeType?.startsWith('image/');

  return (
    <>
      <div className="top-bar">
        <h1>📄 Chi tiết tài liệu</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/documents')}>
            ← Quay lại
          </button>
          {isClerk && (
            <>
              <button className="btn btn-secondary" onClick={() => navigate(`/documents/${doc.id}/edit`)}>
                ✏️ Sửa
              </button>
              <button className="btn btn-danger" onClick={() => setDeleteOpen(true)}>
                🗑 Xóa
              </button>
            </>
          )}
        </div>
      </div>

      <div className="page-content">
        {/* ─── Document Info Card ──────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h2>{doc.documentNumber} — {doc.title}</h2>
            <span className={`doc-type-badge ${doc.type.toLowerCase()}`}>{doc.type}</span>
          </div>
          <div className="card-body">
            <div className="user-detail-grid">
              <div className="detail-item">
                <label>Số ký hiệu</label>
                <span>{doc.documentNumber}</span>
              </div>
              <div className="detail-item">
                <label>Tiêu đề</label>
                <span>{doc.title}</span>
              </div>
              <div className="detail-item">
                <label>Loại tài liệu</label>
                <span className={`doc-type-badge ${doc.type.toLowerCase()}`}>{doc.type}</span>
              </div>
              <div className="detail-item">
                <label>Trạng thái</label>
                <span className={`status-badge ${doc.documentStatus.toLowerCase()}`}>
                  {doc.documentStatus}
                </span>
              </div>
              <div className="detail-item">
                <label>Độ khẩn</label>
                <span className={`doc-badge ${doc.urgencyLevel.toLowerCase()}`}>
                  {doc.urgencyLevel}
                </span>
              </div>
              <div className="detail-item">
                <label>Độ bảo mật</label>
                <span className={`doc-badge ${doc.confidentialityLevel.toLowerCase()}`}>
                  {{
                    THUONG: 'Thường',
                    MAT: 'Mật (C)',
                    TOI_MAT: 'Tối mật (B)',
                    TUYET_MAT: 'Tuyệt mật (A)',
                  }[doc.confidentialityLevel] ?? doc.confidentialityLevel}
                </span>
              </div>
              <div className="detail-item">
                <label>Cơ quan gửi/ban hành</label>
                <span>{doc.sendingAgency || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Ngày ban hành</label>
                <span>
                  {doc.issuanceDate
                    ? new Date(doc.issuanceDate).toLocaleDateString()
                    : '—'}
                </span>
              </div>
              <div className="detail-item">
                <label>Danh mục</label>
                <span>{doc.category || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Phòng ban</label>
                <span>{doc.department?.name || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Người xử lý</label>
                <span>{doc.processor?.fullName || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Người tạo</label>
                <span>{doc.createdByUser?.fullName || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Ngày tạo</label>
                <span>{new Date(doc.createdAt).toLocaleString()}</span>
              </div>
              <div className="detail-item">
                <label>Cập nhật lần cuối</label>
                <span>{new Date(doc.updatedAt).toLocaleString()}</span>
              </div>
              {doc.description && (
                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                  <label>Trích yếu nội dung</label>
                  <span style={{ whiteSpace: 'pre-wrap' }}>{doc.description}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── File Info & Actions Card ────────────────────────────── */}
        {doc.fileUrl && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <h2>📎 File đính kèm</h2>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 32 }}>📄</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {doc.originalFileName || 'File tài liệu'}
                  </div>
                  <div style={{ fontSize: 13, color: '#636e72' }}>
                    {doc.mimeType} • {formatFileSize(doc.fileSize)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {(isPdf || isImage) && (
                  <a
                    href={documentsApi.getPreviewUrl(doc.id)}
                    className="btn btn-secondary"
                    style={{ textDecoration: 'none', width: 'auto' }}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    👁 Xem Online
                  </a>
                )}
                <a
                  href={documentsApi.getDownloadUrl(doc.id)}
                  className="btn btn-primary"
                  style={{ textDecoration: 'none', width: 'auto' }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ⬇ Tải xuống
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Delete Confirmation ───────────────────────────────────── */}
      <ConfirmModal
        open={deleteOpen}
        title="Xóa tài liệu"
        message={
          <>
            Bạn có chắc chắn muốn xóa <strong>{doc.title}</strong>?
            <br />
            <span style={{ fontSize: 13, color: '#636e72' }}>
              Tài liệu sẽ được chuyển vào thùng rác và có thể khôi phục sau.
            </span>
          </>
        }
        confirmLabel="Xóa"
        variant="danger"
        loading={actionLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
