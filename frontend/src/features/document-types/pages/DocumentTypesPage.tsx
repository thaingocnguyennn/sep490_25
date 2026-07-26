import React, { useEffect, useState, useCallback } from 'react';
import { useDocumentTypes, useDocumentTypeActions } from '../hooks/useDocumentTypes';
import { DocumentTypeTable } from '../components/DocumentTypeTable';
import { DocumentTypeFormModal } from '../components/DocumentTypeFormModal';
import { DeleteDocumentTypeModal } from '../components/DeleteDocumentTypeModal';
import { DocumentKindResponse, DocumentKindStatus } from '../types/documentType.types';
import { LoadingSpinner } from '../../../shared/components';

export const DocumentTypesPage: React.FC = () => {
  const { data, loading, error, fetchDocumentTypes } = useDocumentTypes();
  const { reactivate, loading: actionLoading } = useDocumentTypeActions();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingType, setEditingType] = useState<DocumentKindResponse | undefined>(undefined);
  const [deletingType, setDeletingType] = useState<DocumentKindResponse | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    fetchDocumentTypes({
      page,
      limit,
      search: searchQuery || undefined,
      status: (statusFilter as DocumentKindStatus) || undefined,
    });
  }, [fetchDocumentTypes, page, limit, searchQuery, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadData();
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleAddClick = () => {
    setEditingType(undefined);
    setShowFormModal(true);
  };

  const handleEditClick = (type: DocumentKindResponse) => {
    setEditingType(type);
    setShowFormModal(true);
  };

  const handleDeleteClick = (type: DocumentKindResponse) => {
    setDeletingType(type);
  };

  const handleReactivateClick = async (type: DocumentKindResponse) => {
    if (!window.confirm(`Bạn có chắc chắn muốn kích hoạt lại thể loại văn bản "${type.name}"?`)) {
      return;
    }
    
    setActionError(null);
    try {
      await reactivate(type.id);
      loadData();
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Có lỗi xảy ra khi kích hoạt lại');
    }
  };

  const handleFormSuccess = () => {
    loadData();
  };

  const handleDeleteSuccess = () => {
    if (data && data.data.length === 1 && page > 1) {
      setPage((p) => p - 1);
    } else {
      loadData();
    }
  };

  return (
    <>
      <div className="top-bar">
        <h1>Quản lý Thể loại văn bản</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleAddClick}>
            + Thêm Thể loại
          </button>
        </div>
      </div>

      <div className="page-content">
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        {actionError && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            ⚠ {actionError}
            <button style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setActionError(null)}>
              &times;
            </button>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h2>Tất cả Thể loại ({data?.total || 0})</h2>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Tìm kiếm theo tên hoặc mã..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14, minWidth: 260 }}
              />
              <select
                value={statusFilter}
                onChange={(e) => handleStatusChange(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14 }}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="INACTIVE">Ngừng hoạt động</option>
              </select>
              <button type="submit" className="btn btn-secondary">Tìm kiếm</button>
            </form>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            <DocumentTypeTable
              documentTypes={data?.data || []}
              loading={loading || actionLoading}
              onEdit={handleEditClick}
              onDelete={handleDeleteClick}
              onReactivate={handleReactivateClick}
            />
          </div>

          {data && data.totalPages > 1 && (
            <div className="pagination">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Trước</button>
              {Array.from({ length: data.totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === data.totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | string)[]>((acc, p, idx, arr) => {
                  if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) => (
                  <button
                    key={i}
                    onClick={() => typeof p === 'number' && setPage(p)}
                    className={page === p ? 'active' : ''}
                    disabled={typeof p !== 'number'}
                    style={typeof p !== 'number' ? { cursor: 'default', background: 'transparent', border: 'none' } : {}}
                  >
                    {p}
                  </button>
                ))}
              <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages}>Sau</button>
            </div>
          )}
        </div>

        {showFormModal && (
          <DocumentTypeFormModal
            documentType={editingType}
            onClose={() => setShowFormModal(false)}
            onSuccess={handleFormSuccess}
          />
        )}

        {deletingType && (
          <DeleteDocumentTypeModal
            documentType={deletingType}
            onClose={() => setDeletingType(undefined)}
            onSuccess={handleDeleteSuccess}
          />
        )}
      </div>
    </>
  );
};
