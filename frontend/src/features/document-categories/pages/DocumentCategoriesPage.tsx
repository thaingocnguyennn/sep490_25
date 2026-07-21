import React, { useEffect, useState } from 'react';
import { useDocumentCategories } from '../hooks/useDocumentCategories';
import { DocumentCategoryToolbar } from '../components/DocumentCategoryToolbar';
import { DocumentCategoryTable } from '../components/DocumentCategoryTable';
import { DocumentCategoryStatus } from '../types/documentCategory.types';

export const DocumentCategoriesPage: React.FC = () => {
  const { data, loading, fetchCategories } = useDocumentCategories();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const limit = 10;

  useEffect(() => {
    fetchCategories({
      page,
      limit,
      search: searchQuery || undefined,
      status: (statusFilter as DocumentCategoryStatus) || undefined,
    });
  }, [fetchCategories, page, limit, searchQuery, statusFilter]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1); // Reset to first page on search
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1); // Reset to first page on filter
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Quản lý Lĩnh vực văn bản</h1>
        <p className="text-slate-500 mt-1">Quản lý danh sách các lĩnh vực/thể loại phân loại văn bản trong hệ thống</p>
      </div>

      <DocumentCategoryToolbar
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        statusFilter={statusFilter}
        onStatusChange={handleStatusChange}
      />

      <DocumentCategoryTable
        categories={data?.data || []}
        loading={loading}
      />

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex justify-between items-center mt-6 bg-white p-4 rounded-lg border border-slate-200">
          <p className="text-sm text-slate-500">
            Hiển thị <span className="font-medium">{(page - 1) * limit + 1}</span> đến{' '}
            <span className="font-medium">
              {Math.min(page * limit, data.total)}
            </span>{' '}
            trong số <span className="font-medium">{data.total}</span> kết quả
          </p>
          <div className="flex space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 border border-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Trước
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              className="px-3 py-1 border border-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
