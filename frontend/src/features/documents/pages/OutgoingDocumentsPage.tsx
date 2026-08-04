import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOutgoingDocuments, useDepartments } from '../../../shared/hooks';
import { DocumentStatusBadge, UrgencyBadge } from '../../../shared/components/DocumentBadges';
import { LoadingSpinner } from '../../../shared/components';
import { useAuth } from '../../../contexts/AuthContext';
import { URGENCY_OPTIONS as URGENCY_LIST } from '../../../shared/constants/urgency';
import { exportOutgoingExcel, exportOutgoingPdf } from '../../../api/modules/outgoing-documents';
import type { OutgoingDocumentStatus, UrgencyName, ConfidentialityName } from '../../../types';
import { useDocumentTypeOptions } from '../../document-types/hooks/useDocumentTypes';

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
  { value: 'TRASHED',          label: 'Đã xóa' },
];

const URGENCY_OPTIONS: { value: UrgencyName | ''; label: string }[] = [
  { value: '',           label: 'Tất cả độ khẩn' },
  ...URGENCY_LIST.map((o) => ({ value: o.value, label: o.label })),
];

const CONFIDENTIALITY_OPTIONS_LOCAL: { value: ConfidentialityName | ''; label: string }[] = [
  { value: '',         label: 'Tất cả độ mật' },
  { value: 'THUONG',   label: 'Thường' },
  { value: 'MAT',      label: 'Mật (C)' },
  { value: 'TOI_MAT',  label: 'Tối mật (B)' },
  { value: 'TUYET_MAT',label: 'Tuyệt mật (A)' },
];

// Document kinds fetched dynamically

export default function OutgoingDocumentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { documents, total, totalPages, loading, error, fetchDocuments } = useOutgoingDocuments();

  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState<OutgoingDocumentStatus | ''>('');
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyName | ''>('');
  const [documentTypeFilter, setDocumentTypeFilter] = useState('');
  const [confidentialityFilter, setConfidentialityFilter] = useState<ConfidentialityName | ''>('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const LIMIT = 10;

  const { departments } = useDepartments();
  const { options: documentTypeOptions, fetchOptions: fetchDocumentTypes } = useDocumentTypeOptions();

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
        documentTypeId: documentTypeFilter ? Number(documentTypeFilter) : undefined,
        confidentialityLevel: confidentialityFilter || undefined,
        departmentId: departmentFilter ? Number(departmentFilter) : undefined,
        dateFrom: dateFromFilter || undefined,
        dateTo: dateToFilter || undefined,
      });
    },
    [fetchDocuments, search, statusFilter, urgencyFilter, documentTypeFilter, confidentialityFilter, departmentFilter, dateFromFilter, dateToFilter],
  );

  useEffect(() => {
    fetchDocumentTypes();
  }, [fetchDocumentTypes]);

  useEffect(() => {
    loadData(currentPage);
  }, [currentPage, statusFilter, urgencyFilter, documentTypeFilter, confidentialityFilter, departmentFilter, dateFromFilter, dateToFilter, loadData]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadData(1);
  };

  const handleExport = async (format: 'excel' | 'pdf') => {
    try {
      const params = {
        search: search || undefined,
        status: statusFilter || undefined,
        urgency: urgencyFilter || undefined,
        documentType: documentTypeFilter || undefined, // Keep string for export or pass ID depending on backend export
        confidentialityLevel: confidentialityFilter || undefined,
        departmentId: departmentFilter ? Number(departmentFilter) : undefined,
        dateFrom: dateFromFilter || undefined,
        dateTo: dateToFilter || undefined,
      };

      const res = format === 'excel' ? await exportOutgoingExcel(params) : await exportOutgoingPdf(params);
      
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `bao_cao_van_ban_di.${format === 'excel' ? 'xlsx' : 'pdf'}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Lỗi khi xuất file:', err);
      alert('Đã có lỗi xảy ra khi xuất báo cáo. Vui lòng thử lại.');
    }
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
          {/* <button
            className="btn btn-secondary"
            onClick={() => handleExport('excel')}
          >
            📊 Xuất Excel
          </button> */}
          {/* <button
            className="btn btn-secondary"
            onClick={() => handleExport('pdf')}
          >
            📑 Xuất PDF
          </button> */}
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
                onChange={(e) => { setUrgencyFilter(e.target.value as UrgencyName | ''); setCurrentPage(1); }}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14 }}
              >
                {URGENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <select
                value={documentTypeFilter}
                onChange={(e) => { setDocumentTypeFilter(e.target.value); setCurrentPage(1); }}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14 }}
              >
                <option value="">Tất cả loại VB</option>
                {documentTypeOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select
                value={confidentialityFilter}
                onChange={(e) => { setConfidentialityFilter(e.target.value as ConfidentialityName | ''); setCurrentPage(1); }}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14 }}
              >
                {CONFIDENTIALITY_OPTIONS_LOCAL.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <select
                value={departmentFilter}
                onChange={(e) => { setDepartmentFilter(e.target.value); setCurrentPage(1); }}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14 }}
              >
                <option value="">Tất cả phòng ban</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <input
                type="date"
                value={dateFromFilter}
                onChange={(e) => { setDateFromFilter(e.target.value); setCurrentPage(1); }}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14 }}
                title="Từ ngày"
              />
              <input
                type="date"
                value={dateToFilter}
                onChange={(e) => { setDateToFilter(e.target.value); setCurrentPage(1); }}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14 }}
                title="Đến ngày"
              />
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
                        {item.documentTypeRef ? (
                          <span className="badge badge-type">{item.documentTypeRef.name}</span>
                        ) : item.documentType ? (
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
                      <td><UrgencyBadge urgency={item.document.urgency} /></td>
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
