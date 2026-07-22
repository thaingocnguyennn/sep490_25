import React from 'react';
import { Edit2, Trash2, ShieldAlert } from 'lucide-react';
import { DocumentCategoryResponse } from '../types/documentCategory.types';

interface DocumentCategoryTableProps {
  categories: DocumentCategoryResponse[];
  loading: boolean;
  onEdit: (category: DocumentCategoryResponse) => void;
  onDelete: (category: DocumentCategoryResponse) => void;
}

export const DocumentCategoryTable: React.FC<DocumentCategoryTableProps> = ({
  categories,
  loading,
  onEdit,
  onDelete,
}) => {
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 bg-white rounded-lg border border-slate-200">
        <div className="flex flex-col items-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-sm text-slate-500">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200">
        <p className="font-medium">Không tìm thấy lĩnh vực văn bản nào.</p>
        <p className="text-sm mt-1">Thử thay đổi bộ lọc hoặc thêm mới.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-medium">Mã Lĩnh Vực</th>
              <th className="px-6 py-4 font-medium">Tên Lĩnh Vực</th>
              <th className="px-6 py-4 font-medium text-center">Số VB Liên Quan</th>
              <th className="px-6 py-4 font-medium">Trạng Thái</th>
              <th className="px-6 py-4 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {categories.map((category) => (
              <tr key={category.id} className="hover:bg-slate-50 transition-colors">
                {/* Mã */}
                <td className="px-6 py-4 font-mono font-medium text-slate-900">
                  <div className="flex items-center space-x-2">
                    <span>{category.code}</span>
                    {category.isSystem && (
                      <span
                        title="Lĩnh vực hệ thống, không thể sửa/xóa"
                        className="inline-flex items-center space-x-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-sans"
                      >
                        <ShieldAlert className="h-3 w-3" />
                        <span>Hệ thống</span>
                      </span>
                    )}
                  </div>
                </td>

                {/* Tên + mô tả */}
                <td className="px-6 py-4">
                  <div>
                    <p className="font-medium text-slate-900">{category.name}</p>
                    {category.description && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{category.description}</p>
                    )}
                  </div>
                </td>

                {/* Usage */}
                <td className="px-6 py-4 text-center text-slate-600">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                    {category.usageCount} văn bản
                  </span>
                </td>

                {/* Trạng thái */}
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      category.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {category.status === 'ACTIVE' ? 'Hoạt động' : 'Ngừng HĐ'}
                  </span>
                </td>

                {/* Thao tác */}
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end space-x-1">
                    <button
                      onClick={() => onEdit(category)}
                      disabled={category.isSystem}
                      title={category.isSystem ? 'Lĩnh vực hệ thống không thể chỉnh sửa' : 'Chỉnh sửa'}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>

                    {!category.isSystem && (
                      <button
                        onClick={() => onDelete(category)}
                        title={category.usageCount > 0 ? 'Vô hiệu hóa (đang được sử dụng)' : 'Xóa'}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
