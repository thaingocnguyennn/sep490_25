import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDocuments, useDocumentActions } from '../../../shared/hooks';
import { LoadingSpinner, ConfirmModal } from '../../../shared/components';
import type { DocumentType, DocumentStatus, PriorityLevel, ConfidentialityLevel } from '../../../types';

/**
 * DocumentsPage – Main list view for all documents.
 * Features: search, multi-filter, pagination, soft-delete, export to Excel/PDF.
 */
export default function DocumentsPage() {
  const navigate = useNavigate();
  const { documents, total, page, limit, loading, fetch, setPage } = useDocuments({ pageSize: 10 });

  // ─── Filter state ─────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocumentType | ''>('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | ''>('');
  const [urgencyFilter, setUrgencyFilter] = useState<PriorityLevel | ''>('');
  const [confidentialityFilter, setConfidentialityFilter] = useState<ConfidentialityLevel | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ─── Delete modal state ───────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);

  const handleSuccess = () => fetchWithFilters();
  const { deleteDocument, exportExcel, exportPdf, actionLoading } = useDocumentActions(handleSuccess);

  /** Build filter params from current state and trigger fetch */
  const fetchWithFilters = () => {
    fetch({
      search: search || undefined,
      type: typeFilter || undefined,
      status: statusFilter || undefined,
      urgencyLevel: urgencyFilter || undefined,
      confidentialityLevel: confidentialityFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
  };

  // Initial load
  useEffect(() => {
    fetchWithFilters();
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

  /** Build current filter params for export (without pagination) */
  const getExportParams = () => ({
    search: search || undefined,
    type: typeFilter || undefined,
    status: statusFilter || undefined,
    urgencyLevel: urgencyFilter || undefined,
    confidentialityLevel: confidentialityFilter || undefined,
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
  const getUrgencyClass = (level: PriorityLevel) => {
    switch (level) {
      case 'URGENT': return 'doc-badge urgent';
      case 'HIGH': return 'doc-badge high';
      case 'LOW': return 'doc-badge low';
      default: return 'doc-badge normal';
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
        <h1>📄 Document Management</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary"
            disabled={actionLoading}
            onClick={() => exportExcel(getExportParams())}
          >
            📊 Export Excel
          </button>
          <button
            className="btn btn-secondary"
            disabled={actionLoading}
            onClick={() => exportPdf(getExportParams())}
          >
            📑 Export PDF
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/documents/upload')}>
            + Upload Document
          </button>
        </div>
      </div>

      {/* ─── Page Content ──────────────────────────────────────────────── */}
      <div className="page-content">
        <div className="card">
          {/* ─── Filter Header ──────────────────────────────────────── */}
          <div className="card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>All Documents ({total})</h2>
            </div>

            <form onSubmit={handleSearch} className="doc-filter-bar">
              <input
                type="text"
                placeholder="Search by number, title, agency..."
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
                <option value="">All Types</option>
                <option value="INCOMING">Incoming</option>
                <option value="OUTGOING">Outgoing</option>
                <option value="INTERNAL">Internal</option>
                <option value="ARCHIVAL">Archival</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | '')}
                className="filter-select"
              >
                <option value="">Active Only</option>
                <option value="ACTIVE">Active</option>
                <option value="DELETED">Deleted</option>
              </select>
              <select
                value={urgencyFilter}
                onChange={(e) => setUrgencyFilter(e.target.value as PriorityLevel | '')}
                className="filter-select"
              >
                <option value="">All Urgency</option>
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
              <select
                value={confidentialityFilter}
                onChange={(e) => setConfidentialityFilter(e.target.value as ConfidentialityLevel | '')}
                className="filter-select"
              >
                <option value="">All Confidentiality</option>
                <option value="NORMAL">Normal</option>
                <option value="CONFIDENTIAL">Confidential</option>
                <option value="TOP_SECRET">Top Secret</option>
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
                🔍 Search
              </button>
            </form>
          </div>

          {/* ─── Data Table ─────────────────────────────────────────── */}
          <div className="card-body" style={{ padding: 0 }}>
            {loading ? (
              <LoadingSpinner />
            ) : documents.length === 0 ? (
              <div className="empty-state">
                <h3>No documents found</h3>
                <p>Try adjusting your search or filter criteria, or upload a new document.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Document Number</th>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Urgency</th>
                    <th>Sending Agency</th>
                    <th>Issuance Date</th>
                    <th>File</th>
                    <th>Actions</th>
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
                        <span className={getUrgencyClass(doc.urgencyLevel)}>{doc.urgencyLevel}</span>
                      </td>
                      <td>{doc.sendingAgency || '—'}</td>
                      <td>
                        {doc.issuanceDate
                          ? new Date(doc.issuanceDate).toLocaleDateString()
                          : '—'}
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
                        <button
                          className="action-btn view"
                          title="View Details"
                          onClick={() => navigate(`/documents/${doc.id}`)}
                        >
                          👁
                        </button>
                        <button
                          className="action-btn edit"
                          title="Edit"
                          onClick={() => navigate(`/documents/${doc.id}/edit`)}
                        >
                          ✎
                        </button>
                        <button
                          className="action-btn delete"
                          title="Delete"
                          disabled={actionLoading}
                          onClick={() => setDeleteTarget({ id: doc.id, title: doc.title })}
                        >
                          🗑
                        </button>
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
              <button onClick={() => setPage(page - 1)} disabled={page === 1}>Previous</button>
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
              <button onClick={() => setPage(page + 1)} disabled={page === totalPages}>Next</button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Delete Confirmation Modal ─────────────────────────────── */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Document"
        message={
          <>
            Are you sure you want to delete document <strong>{deleteTarget?.title}</strong>?
            <br />
            <span style={{ fontSize: 13, color: '#636e72' }}>
              The document will be soft-deleted and can be recovered later.
            </span>
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        loading={actionLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
