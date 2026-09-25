import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  incomingDocumentsApi,
  type IncomingDocumentListItem,
} from '../../../api';
import { DocumentStatusBadge } from '../../../shared/components/DocumentBadges';
import { LoadingSpinner } from '../../../shared/components';
import { useAuth } from '../../../contexts/AuthContext';
import { formatUrgency } from '../../../shared/constants/urgency';
import { annotateIncomingUnread } from '../../../shared/utils/incomingUnread';

export default function PendingIncomingDocumentsPage() {
  const navigate = useNavigate();
  const { isDepartmentHead, isSpecialist, isAdmin } = useAuth();

  const isHead = isDepartmentHead || isAdmin;
  const isSpec = isSpecialist || isAdmin;
  const viewMode = isHead ? ('head' as const) : ('specialist' as const);

  const [documents, setDocuments] = useState<IncomingDocumentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = (p: number, s: string) => {
    setLoading(true);
    setError('');
    const apiCall =
      viewMode === 'head'
        ? incomingDocumentsApi.getPendingForHead({ page: p, limit, search: s || undefined })
        : incomingDocumentsApi.getPendingForSpecialist({ page: p, limit, search: s || undefined });
    apiCall
      .then(({ data }) => {
        // Precompute the unread flag for each row so the JSX template can
        // decide whether to render the bold styling. Same logic as the
        // main `IncomingDocumentsPage` (`backend/src/shared/access/viewer-status.ts`).
        setDocuments(annotateIncomingUnread(data.data!.items));
        setTotal(data.data!.total);
      })
      .catch(() => setError('Không thể tải danh sách văn bản chờ xử lý'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isHead || isSpec) load(1, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // Mirror filter/page state into refs so the focus/visibility listener
  // (bound once on mount) reads the latest values when the user
  // navigates back from the detail page.
  const pageRef = useRef(page);
  const searchRef = useRef(search);
  useEffect(() => {
    pageRef.current = page;
    searchRef.current = search;
  }, [page, search]);

  // Re-fetch on tab focus so unread bold styling refreshes immediately
  // when the user navigates back from the detail page (the sidebar
  // counter is refreshed on its own 15s cadence by `MainLayout`).
  useEffect(() => {
    const handleRefocus = () => {
      if (document.visibilityState !== 'visible') return;
      if (isHead || isSpec) load(pageRef.current, searchRef.current);
    };
    document.addEventListener('visibilitychange', handleRefocus);
    window.addEventListener('focus', handleRefocus);
    return () => {
      document.removeEventListener('visibilitychange', handleRefocus);
      window.removeEventListener('focus', handleRefocus);
    };
    // Re-bind only when `viewMode` (HEAD ↔ SPECIALIST) flips, which is
    // the only case where `load` itself changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load(1, search);
  };

  const totalPages = Math.ceil(total / limit);

  if (!isHead && !isSpec) {
    return (
      <>
        <div className="top-bar">
          <h1>Văn bản chờ xử lý</h1>
          <button className="btn btn-secondary" onClick={() => navigate('/incoming-documents')}>
            Quay lại
          </button>
        </div>
        <div className="page-content">
          <div className="alert alert-error">
            Bạn không có quyền truy cập trang này. Chỉ Trưởng phòng hoặc Chuyên viên mới có thể xem văn bản chờ xử lý.
          </div>
        </div>
      </>
    );
  }

  const pageTitle =
    viewMode === 'head'
      ? 'Văn bản chờ Trưởng phòng xử lý'
      : 'Văn bản chờ Chuyên viên xử lý';

  return (
    <>
      <div className="top-bar">
        <h1>{pageTitle}</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/incoming-documents')}>
          Quay lại danh sách
        </button>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <h2>Danh sách văn bản chờ xử lý ({total})</h2>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Tìm theo tiêu đề, số ký hiệu, cơ quan..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #dfe6e9',
                  borderRadius: 6,
                  fontSize: 14,
                  width: 280,
                }}
              />
              <button type="submit" className="btn btn-secondary">Tìm kiếm</button>
            </form>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {loading ? (
              <LoadingSpinner />
            ) : error ? (
              <div className="alert alert-error" style={{ margin: 16 }}>{error}</div>
            ) : documents.length === 0 ? (
              <div className="empty-state">
                <h3>Không có văn bản nào chờ xử lý</h3>
                <p>Tất cả văn bản đến đã được xử lý. Hãy quay lại sau.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Số đến</th>
                    <th>Số ký hiệu</th>
                    <th>Cơ quan ban hành</th>
                    <th>Loại VB</th>
                    <th>Tiêu đề</th>
                    <th>Ngày đến</th>
                    <th>Độ khẩn</th>
                    <th>Trạng thái</th>
                    <th>Văn thư tạo</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((item) => (
                    <tr key={item.id} className={item.viewerUnread ? 'row-unread' : ''}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#667eea' }}>
                        {item.arrivalNumber ?? '—'}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#667eea' }}>
                          {item.document.documentNumber || '—'}
                        </span>
                      </td>
                      <td
                        style={{
                          maxWidth: 160,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.document.issuer || ''}
                      >
                        {item.document.issuer || '—'}
                      </td>
                      <td>
                        {item.document.documentTypeRef ? (
                          <span className="badge badge-type">{item.document.documentTypeRef.name}</span>
                        ) : '—'}
                      </td>
                      <td style={{ maxWidth: 200 }}>
                        <span
                          title={item.document.subject}
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {item.document.subject}
                        </span>
                      </td>
                      <td>{new Date(item.dateReceived).toLocaleDateString('vi-VN')}</td>
                      <td>
                        {item.document.urgency && item.document.urgency.name !== 'THUONG'
                          ? formatUrgency(item.document.urgency)
                          : '—'}
                      </td>
                      <td><DocumentStatusBadge status={item.document.viewerStatus ?? item.document.status} /></td>
                      <td>{item.document.createdByUser?.fullName || '—'}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => navigate(`/incoming-documents/${item.id}`)}
                          title="Xem chi tiết và xử lý"
                        >
                          Xem & xử lý
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button onClick={() => { setPage(page - 1); load(page - 1, search); }} disabled={page === 1}>
                Trước
              </button>
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
                    <button
                      key={p}
                      onClick={() => { setPage(p as number); load(p as number, search); }}
                      className={page === p ? 'active' : ''}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => { setPage(page + 1); load(page + 1, search); }}
                disabled={page === totalPages}
              >
                Sau
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
