import React, { useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useDocumentCategoryActions } from '../hooks/useDocumentCategories';
import { DocumentCategoryResponse } from '../types/documentCategory.types';

interface DeleteDocumentCategoryModalProps {
  category: DocumentCategoryResponse;
  onClose: () => void;
  onSuccess: () => void;
}

export const DeleteDocumentCategoryModal: React.FC<DeleteDocumentCategoryModalProps> = ({
  category,
  onClose,
  onSuccess,
}) => {
  const { remove, loading } = useDocumentCategoryActions();
  const [apiError, setApiError] = useState<string | null>(null);

  const hasUsage = category.usageCount > 0;

  const handleConfirm = async () => {
    setApiError(null);
    try {
      const result = await remove(category.id);
      if (result.operation === 'DEACTIVATED') {
        // Thông báo đặc biệt khi deactivate
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Có lỗi xảy ra, vui lòng thử lại';
      setApiError(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-800">
            {hasUsage ? 'Vô hiệu hóa lĩnh vực văn bản' : 'Xóa lĩnh vực văn bản'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-200 transition-colors text-slate-500"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Icon + Thông tin category */}
          <div className="flex items-start space-x-4">
            <div className={`p-3 rounded-full flex-shrink-0 ${hasUsage ? 'bg-amber-100' : 'bg-red-100'}`}>
              {hasUsage ? (
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              ) : (
                <Trash2 className="h-6 w-6 text-red-600" />
              )}
            </div>
            <div>
              <p className="font-medium text-slate-900">{category.name}</p>
              <p className="text-sm text-slate-500 mt-0.5">Mã: {category.code}</p>
            </div>
          </div>

          {/* Mô tả hành động */}
          {hasUsage ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-1">
              <p className="font-semibold">Lĩnh vực đang được sử dụng</p>
              <p>
                Lĩnh vực này đang được sử dụng bởi{' '}
                <span className="font-semibold">{category.usageCount} văn bản</span>.
              </p>
              <p>
                Hệ thống sẽ chuyển lĩnh vực sang trạng thái{' '}
                <span className="font-semibold">Ngừng hoạt động</span> thay vì xóa. Văn bản cũ vẫn giữ lĩnh vực này.
              </p>
            </div>
          ) : (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 space-y-1">
              <p className="font-semibold">Xác nhận xóa</p>
              <p>
                Lĩnh vực này chưa được sử dụng và sẽ bị{' '}
                <span className="font-semibold">xóa khỏi hệ thống</span>. Hành động này không thể hoàn tác.
              </p>
            </div>
          )}

          {/* Lỗi API */}
          {apiError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {apiError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2 ${
              hasUsage
                ? 'bg-amber-500 hover:bg-amber-600'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {loading ? (
              <>
                <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Đang xử lý...</span>
              </>
            ) : (
              <span>{hasUsage ? 'Vô hiệu hóa' : 'Xóa'}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
