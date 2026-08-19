import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIncomingDocuments } from '../../../shared/hooks';
import { DocumentStatusBadge } from '../../../shared/components/DocumentBadges';
import { LoadingSpinner } from '../../../shared/components';
import { useAuth } from '../../../contexts/AuthContext';
import { formatUrgency } from '../../../shared/constants/urgency';
import { useDocumentTypeOptions } from '../../document-types/hooks/useDocumentTypes';

type StatusTab = '' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DRAFT';

const TABS: { value: StatusTab; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'DRAFT', label: 'Bản nháp' },
  { value: 'PENDING', label: 'Chờ xử lý' },
  { value: 'IN_PROGRESS', label: 'Đang xử lý' },
  { value: 'COMPLETED', label: 'Đã xử lý' },
];

export default function IncomingDocumentsPage() {
  const navigate = useNavigate();
  const { isDocumentClerk, isAdmin, isDepartmentHead } = useAuth();
  const { documents, total, page, limit, loading, fetch, setPage } = useIncomingDocuments({ pageSize: 10 });
  const { options: documentTypeOptions, fetchOptions: fetchDocumentTypes } = useDocumentTypeOptions();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusTab>('');
  const [activeTab, setActiveTab] = useState<StatusTab>('');
  const [documentTypeFilter, setDocumentTypeFilter] = useState('');

  useEffect(() => {
    fetchDocumentTypes();
    fetch();
  }, [fetch, fetchDocumentTypes]);

  useEffect(() => {
    setStatusFilter(activeTab);
  }, [activeTab]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetch({
      search,
      status: statusFilter,
      documentTypeId: documentTypeFilter ? Number(documentTypeFilter) : undefined,
    });
  };

  const handleTabChange = (tab: StatusTab) => {
    setActiveTab(tab);
    fetch({
      search,
      status: tab,
      documentTypeId: documentTypeFilter ? Number(documentTypeFilter) : undefined,
    });
  };

  const handleDocumentTypeChange = (documentTypeId: string) => {
    setDocumentTypeFilter(documentTypeId);
    fetch({
      search,
      status: statusFilter,
      documentTypeId: documentTypeId ? Number(documentTypeId) : undefined,
    });
  };

  const totalPages = Math.ceil(total / limit);

  const canCreate = isDocumentClerk || isAdmin;
  const canViewPending = isDepartmentHead || isAdmin;

  return (
    <>
      <div className="top-bar">
        <h1>Văn bản đến</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {canViewPending && (
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/incoming-documents/pending')}
              title="Danh sách văn bản chờ Trưởng phòng xử lý"
            >
              Văn bản chờ xử lý
            </button>
          )}
          {canCreate && (
            <button className="btn btn-primary" onClick={() => navigate('/incoming-documents/new')}>
              + Thêm Văn bản đến mới
            </button>
          )}
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <h2>Tất cả Văn bản đến ({total})</h2>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Tìm theo số ký hiệu hoặc trích yếu..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14, width: 280 }}
              />
              <select
                id="incoming-document-type-filter"
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

          <div style={{ display: 'flex', gap: 4, padding: '12px 16px 0', borderBottom: '1px solid #dfe6e9' }}>
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
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {loading ? (
              <LoadingSpinner />
            ) : documents.length === 0 ? (
              <div className="empty-state">
                <h3>Không tìm thấy văn bản đến</h3>
                <p>Thử điều chỉnh tìm kiếm hoặc tạo văn bản đến mới.</p>
                {canCreate && (
                  <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/incoming-documents/new')}>
                    + Thêm Văn bản đến mới
                  </button>
                )}
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Số đến</th>
                    <th>Số ký hiệu</th>
                    <th>Cơ quan ban hành</th>
                    <th>Loại VB</th>
                    <th>Trích yếu</th>
                    <th>Ngày đến</th>
                    <th>Độ khẩn</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#667eea' }}>
                        {item.arrivalNumber ?? '—'}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#667eea' }}>
                          {item.document.documentNumber || '—'}
                        </span>
                      </td>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.document.issuer || ''}>
                        {item.document.issuer || '—'}
                      </td>
                      <td>
                        {item.document.documentTypeRef ? (
                          <span className="badge badge-type">{item.document.documentTypeRef.name}</span>
                        ) : '—'}
                      </td>
                      <td style={{ maxWidth: 200 }}>
                        <span title={item.document.description || ''} style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}>
                          {item.document.description || '—'}
                        </span>
                      </td>
                      <td>{new Date(item.dateReceived).toLocaleDateString('vi-VN')}</td>
                      <td>
                        {item.document.urgency ? (
                          <span className={`urgency-badge urgency-${item.document.urgency.name.toLowerCase()}`}>
                            {formatUrgency(item.document.urgency)}
                          </span>
                        ) : '—'}
                      </td>
                      <td><DocumentStatusBadge status={item.document.status} /></td>
                      <td>
                        {item.document.status === 'DRAFT' ? (
                          <button
                            className="action-btn edit"
                            title="Sửa bản nháp"
                            onClick={() => navigate(`/incoming-documents/${item.id}/edit`)}
                          >
                            &#9998;
                          </button>
                        ) : (
                          <button
                            className="action-btn view"
                            title="Xem chi tiết"
                            onClick={() => navigate(`/incoming-documents/${item.id}`)}
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

          {totalPages > 1 && (
            <div className="pagination">
              <button onClick={() => setPage(page - 1)} disabled={page === 1}>Trước</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | string)[]>((acc, p, idx, arr) => {
                  if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === '...' ? (
                    <span key={`ellipsis-${idx}`} style={{ padding: '6px 8px' }}>...</span>
                  ) : (
                    <button key={p} onClick={() => setPage(p as number)} className={page === p ? 'active' : ''}>
                      {p}
                    </button>
                  )
                )}
              <button onClick={() => setPage(page + 1)} disabled={page === totalPages}>Sau</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
