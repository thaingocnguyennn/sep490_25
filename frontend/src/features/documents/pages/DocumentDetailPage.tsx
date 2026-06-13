import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { documentsApi } from '../../../api';
import { LoadingSpinner, ConfirmModal } from '../../../shared/components';
import { useDocumentActions } from '../../../shared/hooks';
import type { Document } from '../../../types';

/**
 * DocumentDetailPage – View full document details, preview PDF, and download.
 */
export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
      .catch(() => setError('Failed to load document'))
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
        <div className="alert alert-error">{error || 'Document not found'}</div>
        <button className="btn btn-secondary" onClick={() => navigate('/documents')}>← Back</button>
      </div>
    );
  }

  const isPdf = doc.mimeType === 'application/pdf';
  const isImage = doc.mimeType?.startsWith('image/');

  return (
    <>
      <div className="top-bar">
        <h1>📄 Document Details</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/documents')}>
            ← Back
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(`/documents/${doc.id}/edit`)}>
            ✏️ Edit
          </button>
          <button className="btn btn-danger" onClick={() => setDeleteOpen(true)}>
            🗑 Delete
          </button>
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
                <label>Document Number</label>
                <span>{doc.documentNumber}</span>
              </div>
              <div className="detail-item">
                <label>Title</label>
                <span>{doc.title}</span>
              </div>
              <div className="detail-item">
                <label>Type</label>
                <span className={`doc-type-badge ${doc.type.toLowerCase()}`}>{doc.type}</span>
              </div>
              <div className="detail-item">
                <label>Status</label>
                <span className={`status-badge ${doc.documentStatus.toLowerCase()}`}>
                  {doc.documentStatus}
                </span>
              </div>
              <div className="detail-item">
                <label>Urgency Level</label>
                <span className={`doc-badge ${doc.urgencyLevel.toLowerCase()}`}>
                  {doc.urgencyLevel}
                </span>
              </div>
              <div className="detail-item">
                <label>Confidentiality</label>
                <span className={`doc-badge ${doc.confidentialityLevel.toLowerCase()}`}>
                  {doc.confidentialityLevel}
                </span>
              </div>
              <div className="detail-item">
                <label>Sending Agency</label>
                <span>{doc.sendingAgency || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Issuance Date</label>
                <span>
                  {doc.issuanceDate
                    ? new Date(doc.issuanceDate).toLocaleDateString()
                    : '—'}
                </span>
              </div>
              <div className="detail-item">
                <label>Category</label>
                <span>{doc.category || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Department</label>
                <span>{doc.department?.name || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Processor</label>
                <span>{doc.processor?.fullName || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Created By</label>
                <span>{doc.createdByUser?.fullName || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Created At</label>
                <span>{new Date(doc.createdAt).toLocaleString()}</span>
              </div>
              <div className="detail-item">
                <label>Updated At</label>
                <span>{new Date(doc.updatedAt).toLocaleString()}</span>
              </div>
              {doc.description && (
                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                  <label>Description / Abstract</label>
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
              <h2>📎 Attached File</h2>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 32 }}>📄</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {doc.originalFileName || 'Document file'}
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
                    👁 View Online
                  </a>
                )}
                <a
                  href={documentsApi.getDownloadUrl(doc.id)}
                  className="btn btn-primary"
                  style={{ textDecoration: 'none', width: 'auto' }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ⬇ Download
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Delete Confirmation ───────────────────────────────────── */}
      <ConfirmModal
        open={deleteOpen}
        title="Delete Document"
        message={
          <>
            Are you sure you want to delete <strong>{doc.title}</strong>?
            <br />
            <span style={{ fontSize: 13, color: '#636e72' }}>
              The document will be soft-deleted and can be recovered later.
            </span>
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        loading={actionLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
