import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDocuments, useDocumentActions } from '../../../shared/hooks';
import { LoadingSpinner, ConfirmModal } from '../../../shared/components';
import type { DocumentType, DocumentStatus, UrgencyCodeOrName, ConfidentialityCodeOrName } from '../../../types';
import { CONFIDENTIALITY_OPTIONS } from '../../../shared/constants/confidentiality';
import { URGENCY_OPTIONS, formatUrgency } from '../../../shared/constants/urgency';
import { useAuth } from '../../../contexts/AuthContext';

/**
 * DocumentsPage – Main list view for all documents.
 * Features: search, multi-filter, pagination, soft-delete, export to Excel/PDF.
 */
export default function DocumentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isClerk = user?.roles?.includes('DOCUMENT_CLERK');
  const { documents, total, page, limit, loading, fetch, setPage } = useDocuments({ pageSize: 10 });

  // ─── Filter state ─────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocumentType | ''>('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | ''>('');
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyCodeOrName | ''>('');
  const [confidentialityFilter, setConfidentialityFilter] = useState<ConfidentialityCodeOrName | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [processorFilter, setProcessorFilter] = useState('');
  
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  const [processors, setProcessors] = useState<{ id: number; fullName: string }[]>([]);

  // ─── Delete modal state ───────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<{ id: number; title: string } | null>(null);
  const [hardDeleteTarget, setHardDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{ id: number; title: string } | null>(null);
  const [statusUpdateTarget, setStatusUpdateTarget] = useState<{ id: number; title: string; currentStatus: string } | null>(null);
  const [newStatus, setNewStatus] = useState<string>('');

  const handleSuccess = () => fetchWithFilters();
  const { 
    deleteDocument, 
    restoreDocument, 
    hardDeleteDocument,
    archiveDocument,
    updateDocumentStatus,
    exportExcel, 
    exportPdf, 
    actionLoading 
  } = useDocumentActions(handleSuccess);

  /** Build filter params from current state and trigger fetch */
  const fetchWithFilters = () => {
    fetch({
      search: search || undefined,
      type: typeFilter || undefined,
      status: statusFilter || undefined,
      urgency: urgencyFilter || undefined,
      confidentialityLevel: confidentialityFilter || undefined,
      departmentId: departmentFilter ? Number(departmentFilter) : undefined,
      processorId: processorFilter ? Number(processorFilter) : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
  };

  // Initial load
  useEffect(() => {
    fetchWithFilters();
    
    // Load departments and users for filter dropdowns
    import('../../../api').then(({ departmentsApi, usersApi }) => {
      departmentsApi.getAll().then(res => setDepartments(res.data.data || []));
      usersApi.getAll({ limit: 100 }).then(res => setProcessors(res.data.data?.items || []));
    }).catch(console.error);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchWithFilters();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteDocument(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;
    await restoreDocument(restoreTarget.id);
    setRestoreTarget(null);
  };

  const handleHardDeleteConfirm = async () => {
    if (!hardDeleteTarget) return;
    await hardDeleteDocument(hardDeleteTarget.id);
    setHardDeleteTarget(null);
  };

  /** Build current filter params for export (without pagination) */
  const getExportParams = () => ({
    search: search || undefined,
    type: typeFilter || undefined,
    status: statusFilter || undefined,
    urgency: urgencyFilter || undefined,
    confidentialityLevel: confidentialityFilter || undefined,
    departmentId: departmentFilter ? Number(departmentFilter) : undefined,
    processorId: processorFilter ? Number(processorFilter) : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const totalPages = Math.ceil(total / limit);

  // ─── Helper: format file size to human-readable string ────────────────
  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ─── Helper: urgency badge color ──────────────────────────────────────
  const getUrgencyClass = (name?: string | null) => {
    switch (name) {
      case 'HOA_TOC':
      case 'THUONG_KHAN':
      case 'THUONG_KHAU': return 'doc-badge urgent';
      case 'KHAN':         return 'doc-badge high';
      case 'THUONG':       return 'doc-badge normal';
      default:             return 'doc-badge low';
    }
  };

  // ─── Helper: document type badge ──────────────────────────────────────
  const getTypeClass = (type: DocumentType) => {
    switch (type) {
      case 'INCOMING': return 'doc-type-badge incoming';
      case 'OUTGOING': return 'doc-type-badge outgoing';
      case 'INTERNAL': return 'doc-type-badge internal';
      case 'ARCHIVAL': return 'doc-type-badge archival';
      default: return 'doc-type-badge';
    }
  };

  return (
    <>
      {/* ─── Top Bar ───────────────────────────────────────────────────── */}
      <div className="top-bar">
        <h1>📄 Quản lý tài liệu</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary"
            disabled={actionLoading}
            onClick={() => exportExcel(getExportParams())}
          >
            📊 Xuất Excel
          </button>
          <button
            className="btn btn-secondary"
            disabled={actionLoading}
            onClick={() => exportPdf(getExportParams())}
          >
            📑 Xuất PDF
          </button>
          {isClerk && (
            <button className="btn btn-primary" onClick={() => navigate('/documents/upload')}>
              + Tải lên tài liệu
            </button>
          )}
        </div>
      </div>

      {/* ─── Page Content ──────────────────────────────────────────────── */}
      <div className="page-content">
        <div className="card">
          {/* ─── Filter Header ──────────────────────────────────────── */}
          <div className="card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Tất cả tài liệu ({total})</h2>
            </div>

            <form onSubmit={handleSearch} className="doc-filter-bar">
              <input
                type="text"
                placeholder="Tìm theo số hiệu, tiêu đề, cơ quan..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="filter-input"
                style={{ minWidth: 240 }}
              />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as DocumentType | '')}
                className="filter-select"
              >
                <option value="">Tất cả loại</option>
                <option value="INCOMING">Văn bản đến</option>
                <option value="OUTGOING">Văn bản đi</option>
                <option value="INTERNAL">Nội bộ</option>
                <option value="ARCHIVAL">Lưu trữ</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | '')}
                className="filter-select"
              >
                <option value="">Chỉ tài liệu đang hoạt động</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="DELETED">Đã xóa</option>
              </select>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="filter-select"
              >
                <option value="">Tất cả phòng ban</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <select
                value={processorFilter}
                onChange={(e) => setProcessorFilter(e.target.value)}
                className="filter-select"
              >
                <option value="">Tất cả người xử lý</option>
                {processors.map(p => (
                  <option key={p.id} value={p.id}>{p.fullName}</option>
                ))}
              </select>
              <select
                value={urgencyFilter}
                onChange={(e) => setUrgencyFilter(e.target.value as UrgencyCodeOrName | '')}
                className="filter-select"
              >
                <option value="">Tất cả độ khẩn</option>
                {URGENCY_OPTIONS.map((opt) => (
                  <option key={opt.name} value={opt.name}>{opt.label}</option>
                ))}
              </select>
              <select
                value={confidentialityFilter}
                onChange={(e) => setConfidentialityFilter(e.target.value as ConfidentialityCodeOrName | '')}
                className="filter-select"
              >
                <option value="">Tất cả độ bảo mật</option>
                {CONFIDENTIALITY_OPTIONS.map((opt) => (
                  <option key={opt.name} value={opt.name}>{opt.label}</option>
                ))}
              </select>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="filter-input"
                title="From date"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="filter-input"
                title="To date"
              />
              <button type="submit" className="btn btn-secondary">
                🔍 Tìm kiếm
              </button>
            </form>
          </div>

          {/* ─── Data Table ─────────────────────────────────────────── */}
          <div className="card-body" style={{ padding: 0 }}>
            {loading ? (
              <LoadingSpinner />
            ) : documents.length === 0 ? (
              <div className="empty-state">
                <h3>Không tìm thấy tài liệu</h3>
                <p>Thử điều chỉnh tiêu chí tìm kiếm hoặc tải lên tài liệu mới.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Số ký hiệu</th>
                    <th>Tiêu đề</th>
                    <th>Loại</th>
                    <th>Độ khẩn</th>
                    <th>Cơ quan gửi/ban hành</th>
                    <th>Ngày ban hành</th>
                    <th>Trạng thái</th>
                    <th>File</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc, index) => (
                    <tr key={doc.id}>
                      <td>{(page - 1) * limit + index + 1}</td>
                      <td>
                        <Link to={`/documents/${doc.id}`} style={{ color: '#667eea', fontWeight: 500 }}>
                          {doc.documentNumber}
                        </Link>
                      </td>
                      <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.title}
                      </td>
                      <td>
                        <span className={getTypeClass(doc.type)}>{doc.type}</span>
                      </td>
                      <td>
                        <span className={getUrgencyClass(doc.urgency?.name)}>
                          {doc.urgency?.name ? formatUrgency(doc.urgency) : '—'}
                        </span>
                      </td>
                      <td>{doc.sendingAgency || '—'}</td>
                      <td>
                        {doc.issuanceDate
                          ? new Date(doc.issuanceDate).toLocaleDateString()
                          : '—'}
                      </td>
                      <td>
                        <span className={`status-badge ${doc.status.toLowerCase()}`}>
                          {doc.status}
                        </span>
                      </td>
                      <td>
                        {doc.originalFileName ? (
                          <span title={doc.originalFileName} style={{ fontSize: 12, color: '#636e72' }}>
                            📎 {formatFileSize(doc.fileSize)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {doc.documentStatus === 'DELETED' ? (
                          <>
                            {isClerk && (
                              <>
                                <button
                                  className="action-btn view"
                                  title="Khôi phục"
                                  disabled={actionLoading}
                                  onClick={() => setRestoreTarget({ id: doc.id, title: doc.title })}
                                >
                                  ↺
                                </button>
                                <button
                                  className="action-btn delete"
                                  title="Xóa vĩnh viễn"
                                  disabled={actionLoading}
                                  onClick={() => setHardDeleteTarget({ id: doc.id, title: doc.title })}
                                >
                                  ✕
                                </button>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              className="action-btn view"
                              title="Xem chi tiết"
                              onClick={() => navigate(`/documents/${doc.id}`)}
                            >
                              👁
                            </button>
                            {isClerk && (
                              <>
                                <button
                                    className="action-btn edit"
                                    title="Sửa metadata"
                                    onClick={() => navigate(`/documents/${doc.id}/edit`)}
                                  >
                                    ✎
                                  </button>
                                  <button
                                    className="action-btn"
                                    style={{ color: '#00b894' }}
                                    title="Đổi trạng thái"
                                    onClick={() => {
                                      setStatusUpdateTarget({ id: doc.id, title: doc.title, currentStatus: doc.status });
                                      setNewStatus(doc.status);
                                    }}
                                  >
                                    🔄
                                  </button>
                                {['COMPLETED', 'ISSUED', 'APPROVED'].includes(doc.status) && !doc.isArchived && (
                                  <button
                                    className="action-btn"
                                    style={{ color: '#0984e3' }}
                                    title="Lưu trữ"
                                    onClick={() => setArchiveTarget({ id: doc.id, title: doc.title })}
                                  >
                                    📦
                                  </button>
                                )}
                                <button
                                  className="action-btn delete"
                                  title="Xóa"
                                  disabled={actionLoading}
                                  onClick={() => setDeleteTarget({ id: doc.id, title: doc.title })}
                                >
                                  🗑
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ─── Pagination ─────────────────────────────────────────── */}
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

      {/* ─── Delete Confirmation Modal ─────────────────────────────── */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Xóa tài liệu"
        message={
          <>
            Bạn có chắc chắn muốn xóa tài liệu <strong>{deleteTarget?.title}</strong>?
            <br />
            <span style={{ fontSize: 13, color: '#636e72' }}>
              Tài liệu sẽ được chuyển vào thùng rác và có thể khôi phục sau.
            </span>
          </>
        }
        confirmLabel="Xóa"
        variant="danger"
        loading={actionLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        open={!!restoreTarget}
        title="Khôi phục tài liệu"
        message={
          <>
            Bạn có chắc chắn muốn khôi phục tài liệu <strong>{restoreTarget?.title}</strong>?
          </>
        }
        confirmLabel="Khôi phục"
        variant="info"
        loading={actionLoading}
        onConfirm={handleRestoreConfirm}
        onCancel={() => setRestoreTarget(null)}
      />

      <ConfirmModal
        open={!!archiveTarget}
        title="Lưu trữ tài liệu"
        message={
          <>
            Bạn có chắc chắn muốn đưa tài liệu <strong>{archiveTarget?.title}</strong> vào hồ sơ lưu trữ?
            <br />
            <br />
            <small style={{ color: '#636e72' }}>
              Sau khi lưu trữ, tài liệu sẽ bị khóa và chỉ có thể xem/tải xuống ở mục "Hồ sơ lưu trữ".
            </small>
          </>
        }
        confirmLabel="Đồng ý lưu trữ"
        variant="info"
        loading={actionLoading}
        onConfirm={async () => {
          if (archiveTarget) {
            await archiveDocument(archiveTarget.id);
            setArchiveTarget(null);
          }
        }}
        onCancel={() => setArchiveTarget(null)}
      />

      <ConfirmModal
        open={!!statusUpdateTarget}
        title="Đổi trạng thái tài liệu"
        message={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              Đổi trạng thái cho tài liệu: <strong>{statusUpdateTarget?.title}</strong>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 14, marginBottom: 4, fontWeight: 500 }}>
                Trạng thái mới
              </label>
              <select 
                className="form-control" 
                value={newStatus} 
                onChange={(e) => setNewStatus(e.target.value)}
              >
                <option value="DRAFT">Dự thảo (DRAFT)</option>
                <option value="PENDING">Chờ xử lý (PENDING)</option>
                <option value="IN_PROGRESS">Đang xử lý (IN_PROGRESS)</option>
                <option value="COMPLETED">Hoàn tất (COMPLETED)</option>
                <option value="ISSUED">Ban hành (ISSUED)</option>
                <option value="APPROVED">Đã duyệt (APPROVED)</option>
                <option value="REJECTED">Từ chối (REJECTED)</option>
                <option value="CANCELLED">Đã hủy (CANCELLED)</option>
              </select>
            </div>
          </div>
        }
        confirmLabel="Cập nhật"
        variant="info"
        loading={actionLoading}
        onConfirm={async () => {
          if (statusUpdateTarget) {
            await updateDocumentStatus(statusUpdateTarget.id, newStatus);
            setStatusUpdateTarget(null);
          }
        }}
        onCancel={() => setStatusUpdateTarget(null)}
      />

      <ConfirmModal
        open={!!hardDeleteTarget}
        title="Xóa vĩnh viễn tài liệu"
        message={
          <>
            Bạn có chắc chắn muốn XÓA VĨNH VIỄN tài liệu <strong>{hardDeleteTarget?.title}</strong>?
            <br />
            <span style={{ fontSize: 13, color: '#d63031' }}>
              Hành động này không thể hoàn tác! Tài liệu sẽ bị xóa hoàn toàn khỏi hệ thống.
            </span>
          </>
        }
        confirmLabel="Xóa vĩnh viễn"
        variant="danger"
        loading={actionLoading}
        onConfirm={handleHardDeleteConfirm}
        onCancel={() => setHardDeleteTarget(null)}
      />
    </>
  );
}
