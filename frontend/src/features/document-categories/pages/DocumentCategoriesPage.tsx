import React, { useEffect, useState, useCallback } from 'react';
import { useDocumentCategories } from '../hooks/useDocumentCategories';
import { DocumentCategoryToolbar } from '../components/DocumentCategoryToolbar';
import { DocumentCategoryTable } from '../components/DocumentCategoryTable';
import { DocumentCategoryFormModal } from '../components/DocumentCategoryFormModal';
import { DeleteDocumentCategoryModal } from '../components/DeleteDocumentCategoryModal';
import { DocumentCategoryResponse, DocumentCategoryStatus } from '../types/documentCategory.types';

export const DocumentCategoriesPage: React.FC = () => {
  const { data, loading, fetchCategories } = useDocumentCategories();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<DocumentCategoryResponse | undefined>(undefined);
  const [deletingCategory, setDeletingCategory] = useState<DocumentCategoryResponse | undefined>(undefined);

  const loadData = useCallback(() => {
    fetchCategories({
      page,
      limit,
      search: searchQuery || undefined,
      status: (statusFilter as DocumentCategoryStatus) || undefined,
    });
  }, [fetchCategories, page, limit, searchQuery, statusFilter]);

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
    // Nếu trang hiện tại trống sau khi xóa, quay về trang trước
    if (data && data.data.length === 1 && page > 1) {
      setPage((p) => p - 1);
    } else {
      loadData();
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Tiêu đề */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Quản lý Lĩnh vực văn bản</h1>
        <p className="text-slate-500 mt-1">Quản lý danh sách các lĩnh vực phân loại văn bản trong hệ thống</p>
      </div>

      {/* Toolbar */}
      <DocumentCategoryToolbar
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        statusFilter={statusFilter}
        onStatusChange={handleStatusChange}
        onAddClick={handleAddClick}
      />

      {/* Bảng dữ liệu */}
      <DocumentCategoryTable
        categories={data?.data || []}
        loading={loading}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
      />

      {/* Phân trang */}
      {data && data.totalPages > 1 && (
        <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-slate-200">
          <p className="text-sm text-slate-500">
            Hiển thị{' '}
            <span className="font-medium">{(page - 1) * limit + 1}</span>
            {' '}–{' '}
            <span className="font-medium">{Math.min(page * limit, data.total)}</span>
            {' '}trong{' '}
            <span className="font-medium">{data.total}</span> kết quả
          </p>
          <div className="flex space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 border border-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Trước
            </button>
            <span className="px-3 py-1 text-sm text-slate-600">
              {page} / {data.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              className="px-3 py-1 border border-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Sau
            </button>
          </div>
        </div>
      )}

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
    </div>
  );
};
