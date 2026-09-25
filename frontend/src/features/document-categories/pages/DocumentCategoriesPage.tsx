import React, { useEffect, useState, useCallback } from 'react';
import { useDocumentCategories } from '../hooks/useDocumentCategories';
import { DocumentCategoryTable } from '../components/DocumentCategoryTable';
import { DocumentCategoryFormModal } from '../components/DocumentCategoryFormModal';
import { DeleteDocumentCategoryModal } from '../components/DeleteDocumentCategoryModal';
import { DocumentCategoryResponse, DocumentCategoryStatus } from '../types/documentCategory.types';

export const DocumentCategoriesPage: React.FC = () => {
  const { data, loading, error, fetchCategories } = useDocumentCategories();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<DocumentCategoryResponse | undefined>(
    undefined,
  );
  const [deletingCategory, setDeletingCategory] = useState<DocumentCategoryResponse | undefined>(
    undefined,
  );

  const loadData = useCallback(() => {
    fetchCategories({
      page,
      limit,
      search: searchQuery.trim() || undefined,
      status: (statusFilter as DocumentCategoryStatus) || undefined,
    });
  }, [fetchCategories, page, limit, searchQuery, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadData();
  };

  const handleAddClick = () => {
    setEditingCategory(undefined);
    setShowFormModal(true);
  };

  const handleEditClick = (category: DocumentCategoryResponse) => {
    setEditingCategory(category);
    setShowFormModal(true);
  };

  const handleDeleteClick = (category: DocumentCategoryResponse) => {
    setDeletingCategory(category);
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

  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  return (
    <>
      <div className="top-bar">
        <h1>Quản lý Lĩnh vực văn bản</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleAddClick}>
            + Thêm Lĩnh vực
          </button>
        </div>
      </div>

      <div className="page-content">
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h2>Tất cả Lĩnh vực ({total})</h2>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Tìm theo tên hoặc mã lĩnh vực..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #dfe6e9',
                  borderRadius: 6,
                  fontSize: 14,
                  minWidth: 240,
                }}
              />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
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
            <DocumentCategoryTable
              categories={data?.data || []}
              loading={loading}
              onEdit={handleEditClick}
              onDelete={handleDeleteClick}
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
      </div>

      {/* Modal Tạo/Sửa */}
      {showFormModal && (
        <DocumentCategoryFormModal
          category={editingCategory}
          onClose={() => setShowFormModal(false)}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* Modal Xóa */}
      {deletingCategory && (
        <DeleteDocumentCategoryModal
          category={deletingCategory}
          onClose={() => setDeletingCategory(undefined)}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </>
  );
};
