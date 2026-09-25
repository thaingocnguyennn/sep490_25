import React, { useEffect, useState, useCallback } from 'react';
import { useDocumentTypes, useDocumentTypeActions } from '../hooks/useDocumentTypes';
import { DocumentTypeTable } from '../components/DocumentTypeTable';
import { DocumentTypeFormModal } from '../components/DocumentTypeFormModal';
import { DeleteDocumentTypeModal } from '../components/DeleteDocumentTypeModal';
import { DocumentTypeResponse, DocumentTypeStatus } from '../types/documentType.types';
import { ConfirmModal } from '../../../shared/components';

export const DocumentTypesPage: React.FC = () => {
  const { data, loading, error, fetchDocumentTypes } = useDocumentTypes();
  const { reactivate, loading: actionLoading } = useDocumentTypeActions();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingType, setEditingType] = useState<DocumentTypeResponse | undefined>(undefined);
  const [deletingType, setDeletingType] = useState<DocumentTypeResponse | undefined>(undefined);
  const [reactivateType, setReactivateType] = useState<DocumentTypeResponse | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  const loadData = useCallback(() => {
    fetchDocumentTypes({
      page,
      limit,
      search: searchQuery.trim() || undefined,
      status: (statusFilter as DocumentTypeStatus) || undefined,
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

  const handleEditClick = (type: DocumentTypeResponse) => {
    setEditingType(type);
    setShowFormModal(true);
  };

  const handleDeleteClick = (type: DocumentTypeResponse) => {
    setDeletingType(type);
  };

  const handleReactivateClick = (type: DocumentTypeResponse) => {
    setReactivateType(type);
  };

  const confirmReactivate = async () => {
    if (!reactivateType) return;
    setActionError(null);
    try {
      await reactivate(reactivateType.id);
      setFeedbackMsg({
        type: 'success',
        text: `Đã kích hoạt lại thể loại văn bản "${reactivateType.name}".`,
      });
      setReactivateType(undefined);
      loadData();
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Có lỗi xảy ra khi kích hoạt lại');
      setReactivateType(undefined);
    }
  };

  const handleFormSuccess = () => {
    setFeedbackMsg({
      type: 'success',
      text: editingType
        ? 'Cập nhật thể loại văn bản thành công.'
        : 'Tạo thể loại văn bản mới thành công.',
    });
    loadData();
  };

  const handleDeleteSuccess = () => {
    setFeedbackMsg({
      type: 'success',
      text: 'Xử lý thể loại văn bản thành công.',
    });
    if (data && data.data.length === 1 && page > 1) {
      setPage((p) => p - 1);
    } else {
      loadData();
    }
  };

  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

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
        {feedbackMsg && (
          <div
            className={`alert ${feedbackMsg.type === 'success' ? 'alert-success' : 'alert-error'}`}
            style={{
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{feedbackMsg.text}</span>
            <button
              onClick={() => setFeedbackMsg(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
            >
              &times;
            </button>
          </div>
        )}

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}
        {actionError && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {actionError}
            <button
              style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => setActionError(null)}
            >
              &times;
            </button>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h2>Tất cả Thể loại ({total})</h2>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Tìm kiếm theo tên hoặc mã..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #dfe6e9',
                  borderRadius: 6,
                  fontSize: 14,
                  minWidth: 260,
                }}
              />
              <select
                value={statusFilter}
                onChange={(e) => handleStatusChange(e.target.value)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #dfe6e9',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="INACTIVE">Ngừng hoạt động</option>
              </select>
              <button type="submit" className="btn btn-secondary">
                Tìm kiếm
              </button>
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

          {data && totalPages > 1 && (
            <div className="pagination">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
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
                    <span key={`dots-${idx}`} className="dots">
                      ...
                    </span>
                  ) : (
                    <button
                      key={p}
                      className={page === p ? 'active' : ''}
                      onClick={() => setPage(p as number)}
                    >
                      {p}
                    </button>
                  ),
                )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Sau
              </button>
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

        <ConfirmModal
          open={!!reactivateType}
          title="Kích hoạt lại thể loại văn bản"
          message={`Bạn có chắc chắn muốn kích hoạt lại thể loại văn bản "${reactivateType?.name}"? Sau khi kích hoạt, người dùng có thể chọn thể loại này khi tạo văn bản mới.`}
          onConfirm={confirmReactivate}
          onCancel={() => setReactivateType(undefined)}
        />
      </div>
    </>
  );
};
