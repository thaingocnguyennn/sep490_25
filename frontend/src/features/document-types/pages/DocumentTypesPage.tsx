import React, { useEffect, useState, useCallback } from 'react';
import { useDocumentTypes, useDocumentTypeActions } from '../hooks/useDocumentTypes';
import { DocumentTypeToolbar } from '../components/DocumentTypeToolbar';
import { DocumentTypeTable } from '../components/DocumentTypeTable';
import { DocumentTypeFormModal } from '../components/DocumentTypeFormModal';
import { DeleteDocumentTypeModal } from '../components/DeleteDocumentTypeModal';
import { DocumentKindResponse, DocumentKindStatus } from '../types/documentType.types';

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

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
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
    <div className="page-content">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Quản lý Thể loại văn bản</h1>
        <p style={{ color: '#636e72', fontSize: 14 }}>Quản lý danh sách các thể loại văn bản trong hệ thống (Công văn, Quyết định...)</p>
      </div>

      <DocumentTypeToolbar
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        statusFilter={statusFilter}
        onStatusChange={handleStatusChange}
        onAddClick={handleAddClick}
      />

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

      <DocumentTypeTable
        documentTypes={data?.data || []}
        loading={loading || actionLoading}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
        onReactivate={handleReactivateClick}
      />

      {data && data.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, padding: '12px 16px', background: '#fff', borderRadius: 8, border: '1px solid #dfe6e9' }}>
          <p style={{ fontSize: 14, color: '#636e72', margin: 0 }}>
            Hiển thị{' '}
            <strong>{(page - 1) * limit + 1}</strong>
            {' '}–{' '}
            <strong>{Math.min(page * limit, data.total)}</strong>
            {' '}trong{' '}
            <strong>{data.total}</strong> kết quả
          </p>
          <div className="pagination" style={{ padding: 0 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              Trước
            </button>
            <span style={{ padding: '6px 12px', fontSize: 14 }}>{page} / {data.totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages}>
              Sau
            </button>
          </div>
        </div>
      )}

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
  );
};
