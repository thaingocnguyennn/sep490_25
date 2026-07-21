import React from 'react';
import { Edit2, Trash2, ShieldAlert } from 'lucide-react';
import { DocumentCategoryResponse } from '../types/documentCategory.types';

interface DocumentCategoryTableProps {
  categories: DocumentCategoryResponse[];
  loading: boolean;
}

export const DocumentCategoryTable: React.FC<DocumentCategoryTableProps> = ({
  categories,
  loading,
}) => {
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200">
        <p>Không tìm thấy lĩnh vực văn bản nào.</p>
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
              <th className="px-6 py-4 font-medium">Số VB Liên Quan</th>
              <th className="px-6 py-4 font-medium">Trạng Thái</th>
              <th className="px-6 py-4 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {categories.map((category) => (
              <tr key={category.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-medium text-slate-900">
                  <div className="flex items-center space-x-2">
                    <span>{category.code}</span>
                    {category.isSystem && (
                      <ShieldAlert className="h-4 w-4 text-amber-500" title="Hệ thống mặc định" />
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div>
                    <p className="font-medium text-slate-900">{category.name}</p>
                    {category.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1">{category.description}</p>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-600">
                  {category.usageCount} văn bản
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      category.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {category.status === 'ACTIVE' ? 'Hoạt động' : 'Ngừng HĐ'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end space-x-3">
                    <button
                      className="text-primary hover:text-primary-dark transition-colors p-1"
                      title="Chỉnh sửa"
                      disabled
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    {!category.isSystem && (
                      <button
                        className="text-red-500 hover:text-red-700 transition-colors p-1 disabled:opacity-50"
                        title="Xóa"
                        disabled
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
