import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOutgoingDocuments } from '../../../shared/hooks';
import { DocumentStatusBadge, UrgencyBadge } from '../../../shared/components/DocumentBadges';
import { LoadingSpinner } from '../../../shared/components';
import { useAuth } from '../../../contexts/AuthContext';
import type { OutgoingDocumentStatus, UrgencyLevel } from '../../../types';

const OUTGOING_STATUSES: { value: OutgoingDocumentStatus | ''; label: string }[] = [
  { value: '',                 label: 'Tất cả trạng thái' },
  { value: 'DRAFT',            label: 'Bản nháp' },
  { value: 'SUBMITTED',        label: 'Chờ duyệt' },
  { value: 'RETURNED',         label: 'Trả lại' },
  { value: 'APPROVED',         label: 'Đã duyệt' },
  { value: 'WAITING_FOR_ISSUE',label: 'Chờ phát hành' },
  { value: 'ISSUED',           label: 'Đã phát hành' },
  { value: 'COMPLETED',        label: 'Hoàn tất' },
  { value: 'RECALLED',         label: 'Thu hồi' },
];

const URGENCY_OPTIONS: { value: UrgencyLevel | ''; label: string }[] = [
  { value: '',           label: 'Tất cả độ khẩn' },
  { value: 'THUONG',     label: 'Thường' },
  { value: 'KHAN',       label: 'Khẩn' },
  { value: 'THUONG_KHAU',label: 'Thượng khẩn' },
  { value: 'HOA_TOC',    label: 'Hỏa tốc' },
];

export default function OutgoingDocumentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { documents, total, totalPages, loading, error, fetchDocuments } = useOutgoingDocuments();

  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState<OutgoingDocumentStatus | ''>('');
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyLevel | ''>('');
  const [currentPage, setCurrentPage] = useState(1);
  const LIMIT = 10;

  // Xác định quyền tạo văn bản đi
  const canCreate = user?.roles.some((r) => ['SPECIALIST', 'DOCUMENT_CLERK'].includes(r));

  const loadData = useCallback(
    (page = 1) => {
      fetchDocuments({
        page,
        limit: LIMIT,
        search: search || undefined,
        status: statusFilter || undefined,
        urgency: urgencyFilter || undefined,
      });
    },
    [fetchDocuments, search, statusFilter, urgencyFilter],
  );

  useEffect(() => {
    loadData(currentPage);
  }, [currentPage, statusFilter, urgencyFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadData(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <>
      {/* Top bar */}
      <div className="top-bar">
        <h1>Văn bản đi</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/outgoing-documents/trash')}
          >
            🗑️ Thùng rác
          </button>
          {canCreate && (
            <button
              id="btn-create-outgoing"
              className="btn btn-primary"
              onClick={() => navigate('/outgoing-documents/new')}
            >
              + Tạo văn bản đi mới
            </button>
          )}
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          {/* Header với filter */}
          <div className="card-header">
            <h2>Tất cả Văn bản đi ({total})</h2>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                id="outgoing-search"
                type="text"
                placeholder="Tìm theo tiêu đề, số ký hiệu..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14, minWidth: 260 }}
              />
              <select
                id="outgoing-status-filter"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as OutgoingDocumentStatus | ''); setCurrentPage(1); }}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14 }}
              >
                {OUTGOING_STATUSES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <select
                id="outgoing-urgency-filter"
                value={urgencyFilter}
                onChange={(e) => { setUrgencyFilter(e.target.value as UrgencyLevel | ''); setCurrentPage(1); }}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14 }}
              >
                {URGENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button type="submit" className="btn btn-secondary">🔍 Tìm kiếm</button>
            </form>
          </div>

          {/* Body: bảng dữ liệu */}
          <div className="card-body" style={{ padding: 0 }}>
            {error && (
              <div style={{ padding: 16, color: '#e74c3c', background: '#fdf0f0', margin: 16, borderRadius: 8 }}>
                ⚠️ {error}
              </div>
            )}

            {loading ? (
              <LoadingSpinner />
            ) : documents.length === 0 ? (
              <div className="empty-state">
                <h3>Không tìm thấy văn bản đi</h3>
                <p>Thử điều chỉnh bộ lọc hoặc tạo văn bản đi mới.</p>
                {canCreate && (
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: 16 }}
                    onClick={() => navigate('/outgoing-documents/new')}
                  >
                    + Tạo văn bản đi mới
                  </button>
                )}
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Số phát hành</th>
                    <th>Số ký hiệu</th>
                    <th>Loại VB</th>
                    <th>Tiêu đề</th>
                    <th>Người nhận</th>
                    <th>Ngày tạo</th>
                    <th>Độ khẩn</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((item) => (
                    <tr
                      key={item.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/outgoing-documents/${item.id}`)}
                    >
                      <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#667eea' }}>
                        {item.dispatchNumber || '—'}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#667eea' }}>
                          {item.documentNumber || item.document.documentNumber}
                        </span>
                      </td>
                      <td>
                        {item.documentType ? (
                          <span className="badge badge-type">{item.documentType}</span>
                        ) : '—'}
                      </td>
                      <td style={{ maxWidth: 220 }}>
                        <span
                          title={item.document.title}
                          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        >
                          {item.document.title}
                        </span>
                      </td>
                      <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.recipientName || '—'}
                      </td>
                      <td>{new Date(item.createdAt).toLocaleDateString('vi-VN')}</td>
                      <td><UrgencyBadge urgency={item.urgency} /></td>
                      <td>
                        <DocumentStatusBadge status={item.document.status} />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          id={`btn-view-outgoing-${item.id}`}
                          className="action-btn edit"
                          title="Xem chi tiết"
                          onClick={() => navigate(`/outgoing-documents/${item.id}`)}
                        >
                          👁️
                        </button>
                        {canCreate && item.document.status === 'DRAFT' && (
                          <button
                            id={`btn-edit-outgoing-${item.id}`}
                            className="action-btn"
                            title="Chỉnh sửa"
                            onClick={() => navigate(`/outgoing-documents/${item.id}/edit`)}
                          >
                            ✏️
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}>
                Trước
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                .reduce<(number | string)[]>((acc, p, idx, arr) => {
                  if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === '...' ? (
                    <span key={`ellipsis-${idx}`} style={{ padding: '6px 8px' }}>...</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => handlePageChange(p as number)}
                      className={currentPage === p ? 'active' : ''}
                    >
                      {p}
                    </button>
                  ),
                )}
              <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}>
                Sau
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
