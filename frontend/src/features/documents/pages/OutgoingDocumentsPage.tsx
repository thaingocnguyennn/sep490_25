import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOutgoingDocuments } from '../../../shared/hooks';
import { DocumentStatusBadge, UrgencyBadge } from '../../../shared/components/DocumentBadges';
import { LoadingSpinner } from '../../../shared/components';
import { useAuth } from '../../../contexts/AuthContext';
import type { OutgoingDocumentStatus } from '../../../types';
import { useDocumentTypeOptions } from '../../document-types/hooks/useDocumentTypes';

// Kiểu dữ liệu Tab trạng thái cho Văn bản đi
type StatusTab = '' | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'WAITING_FOR_ISSUE' | 'ISSUED' | 'RETURNED';

// Danh sách các tab trạng thái văn bản đi hiển thị trên giao diện
const TABS: { value: StatusTab; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'DRAFT', label: 'Bản nháp' },
  { value: 'SUBMITTED', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'WAITING_FOR_ISSUE', label: 'Chờ phát hành' },
  { value: 'ISSUED', label: 'Đã phát hành' },
  { value: 'RETURNED', label: 'Trả lại' },
];

export default function OutgoingDocumentsPage() {
  const navigate = useNavigate();
  const { user, isDocumentClerk, isAdmin, isSpecialist } = useAuth();
  const { documents, total, totalPages, loading, error, fetchDocuments } = useOutgoingDocuments();
  const { options: documentTypeOptions, fetchOptions: fetchDocumentTypes } = useDocumentTypeOptions();

  // State tìm kiếm, lọc theo tab và loại văn bản
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusTab>('');
  const [activeTab, setActiveTab] = useState<StatusTab>('');
  const [documentTypeFilter, setDocumentTypeFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const LIMIT = 10;

  // Quyền tạo văn bản đi mới (Chuyên viên, Văn thư, Quản trị viên)
  const canCreate = isSpecialist || isDocumentClerk || isAdmin || user?.roles.some((r) => ['SPECIALIST', 'DOCUMENT_CLERK'].includes(r));

  // Hàm tải dữ liệu danh sách văn bản đi
  const loadData = useCallback(
    (page = 1, currentStatus = statusFilter, currentDocType = documentTypeFilter, currentSearch = search) => {
      fetchDocuments({
        page,
        limit: LIMIT,
        search: currentSearch.trim() || undefined,
        status: (currentStatus || undefined) as OutgoingDocumentStatus | undefined,
        documentTypeId: currentDocType ? Number(currentDocType) : undefined,
      });
    },
    [fetchDocuments, search, statusFilter, documentTypeFilter]
  );

  useEffect(() => {
    fetchDocumentTypes();
    loadData(1, '', '', '');
  }, [fetchDocumentTypes]);

  useEffect(() => {
    setStatusFilter(activeTab);
  }, [activeTab]);

  // Xử lý sự kiện tìm kiếm theo từ khóa
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadData(1, statusFilter, documentTypeFilter, search);
  };

  // Xử lý khi chuyển tab trạng thái
  const handleTabChange = (tab: StatusTab) => {
    setActiveTab(tab);
    setStatusFilter(tab);
    setCurrentPage(1);
    loadData(1, tab, documentTypeFilter, search);
  };

  // Xử lý khi lọc theo loại văn bản
  const handleDocumentTypeChange = (documentTypeId: string) => {
    setDocumentTypeFilter(documentTypeId);
    setCurrentPage(1);
    loadData(1, statusFilter, documentTypeId, search);
  };

  // Xử lý chuyển trang phân trang
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    loadData(page, statusFilter, documentTypeFilter, search);
  };

  return (
    <>
      {/* Thanh tiêu đề trên cùng (Top Bar) */}
      <div className="top-bar">
        <h1>Văn bản đi</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {canCreate && (
            <button
              id="btn-create-outgoing"
              className="btn btn-primary"
              onClick={() => navigate('/outgoing-documents/new')}
            >
              + Thêm Văn bản đi mới
            </button>
          )}
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          {/* Header của thẻ card gồm tiêu đề tổng số lượng và form tìm kiếm tinh gọn */}
          <div className="card-header">
            <h2>Tất cả Văn bản đi ({total})</h2>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                id="outgoing-search"
                type="text"
                placeholder="Tìm theo số ký hiệu hoặc trích yếu..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14, width: 280 }}
              />
              <select
                id="outgoing-document-type-filter"
                value={documentTypeFilter}
                onChange={(e) => handleDocumentTypeChange(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14 }}
              >
                <option value="">Tất cả loại VB</option>
                {documentTypeOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
              <button type="submit" className="btn btn-secondary">Tìm kiếm</button>
            </form>
          </div>

          {/* Thanh Tab trạng thái văn bản đi (gạch chân active indicator giống trang Văn bản đến) */}
          <div style={{ display: 'flex', gap: 4, padding: '12px 16px 0', borderBottom: '1px solid #dfe6e9', overflowX: 'auto' }}>
            {TABS.map((tab) => (
              <button
                key={tab.value || 'all'}
                type="button"
                onClick={() => handleTabChange(tab.value)}
                className={`tab-btn ${activeTab === tab.value ? 'active' : ''}`}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === tab.value ? '2px solid #667eea' : '2px solid transparent',
                  color: activeTab === tab.value ? '#667eea' : '#636e72',
                  fontWeight: activeTab === tab.value ? 600 : 500,
                  fontSize: 14,
                  cursor: 'pointer',
                  marginBottom: -1,
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Nội dung bảng danh sách dữ liệu */}
          <div className="card-body" style={{ padding: 0 }}>
            {error && (
              <div style={{ padding: 16, color: '#e74c3c', background: '#fdf0f0', margin: 16, borderRadius: 8 }}>
                {error}
              </div>
            )}

            {loading ? (
              <LoadingSpinner />
            ) : documents.length === 0 ? (
              <div className="empty-state">
                <h3>Không tìm thấy văn bản đi</h3>
                <p>Thử điều chỉnh tìm kiếm hoặc tạo văn bản đi mới.</p>
                {canCreate && (
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: 16 }}
                    onClick={() => navigate('/outgoing-documents/new')}
                  >
                    + Thêm Văn bản đi mới
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
                    <th>Trích yếu</th>
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
                          {item.documentNumber || item.document.documentNumber || '—'}
                        </span>
                      </td>
                      <td>
                        {item.documentTypeRef ? (
                          <span className="badge badge-type">{item.documentTypeRef.name}</span>
                        ) : '—'}
                      </td>
                      <td style={{ maxWidth: 200 }}>
                        <span
                          title={item.document.subject || ''}
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {item.document.subject || '—'}
                        </span>
                      </td>
                      <td
                        style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={item.recipientName || ''}
                      >
                        {item.recipientName || '—'}
                      </td>
                      <td>{new Date(item.createdAt).toLocaleDateString('vi-VN')}</td>
                      <td><UrgencyBadge urgency={item.document.urgency} /></td>
                      <td>
                        <DocumentStatusBadge status={item.document.status} />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {item.document.status === 'DRAFT' && canCreate ? (
                          <button
                            id={`btn-edit-outgoing-${item.id}`}
                            className="action-btn edit"
                            title="Sửa bản nháp"
                            onClick={() => navigate(`/outgoing-documents/${item.id}/edit`)}
                          >
                            &#9998;
                          </button>
                        ) : (
                          <button
                            id={`btn-view-outgoing-${item.id}`}
                            className="action-btn view"
                            title="Xem chi tiết"
                            onClick={() => navigate(`/outgoing-documents/${item.id}`)}
                          >
                            &#128065;
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Phân trang đồng bộ với IncomingDocumentsPage */}
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
                  )
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

