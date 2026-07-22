import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useDocumentCategoryActions } from '../hooks/useDocumentCategories';
import {
  DocumentCategoryResponse,
  CreateDocumentCategoryDto,
  UpdateDocumentCategoryDto,
} from '../types/documentCategory.types';

interface DocumentCategoryFormModalProps {
  /** Nếu truyền category thì là chế độ Sửa, không truyền là Tạo mới */
  category?: DocumentCategoryResponse;
  onClose: () => void;
  onSuccess: () => void;
}

export const DocumentCategoryFormModal: React.FC<DocumentCategoryFormModalProps> = ({
  category,
  onClose,
  onSuccess,
}) => {
  const isEditing = !!category;
  const { create, update, loading } = useDocumentCategoryActions();

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  // Khi mở modal sửa, điền sẵn dữ liệu
  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        code: category.code,
        description: category.description || '',
        status: category.status,
      });
    }
  }, [category]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Tên lĩnh vực văn bản là bắt buộc';
    } else if (formData.name.trim().length > 100) {
      newErrors.name = 'Tên không được vượt quá 100 ký tự';
    }
    if (!formData.code.trim()) {
      newErrors.code = 'Mã lĩnh vực văn bản là bắt buộc';
    } else if (formData.code.trim().length > 50) {
      newErrors.code = 'Mã không được vượt quá 50 ký tự';
    }
    if (formData.description.length > 500) {
      newErrors.description = 'Mô tả không được vượt quá 500 ký tự';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;

    try {
      if (isEditing) {
        const dto: UpdateDocumentCategoryDto = {
          name: formData.name.trim(),
          code: formData.code.trim(),
          description: formData.description.trim() || null,
          status: formData.status,
        };
        // Nếu code trùng với code cũ thì không gửi code (tránh lỗi khi có usage)
        if (formData.code.trim().toUpperCase().replace(/\s+/g, '_') === category!.code) {
          delete dto.code;
        }
        await update(category!.id, dto);
      } else {
        const dto: CreateDocumentCategoryDto = {
          name: formData.name.trim(),
          code: formData.code.trim(),
          description: formData.description.trim() || undefined,
          status: formData.status,
        };
        await create(dto);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Có lỗi xảy ra, vui lòng thử lại';
      setApiError(msg);
    }
  };

  const inputClass = (field: string) =>
    `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors ${
      errors[field]
        ? 'border-red-400 focus:ring-red-300'
        : 'border-slate-300 focus:ring-primary/40 focus:border-primary'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEditing ? 'Chỉnh sửa lĩnh vực văn bản' : 'Thêm lĩnh vực văn bản mới'}
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
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">
            {/* Lỗi từ API */}
            {apiError && (
              <div className="flex items-start space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{apiError}</span>
              </div>
            )}

            {/* Tên */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tên lĩnh vực <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={inputClass('name')}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="VD: Nhân sự, Tài chính, Đào tạo..."
                maxLength={100}
                disabled={loading}
              />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
            </div>

            {/* Mã */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Mã lĩnh vực <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={inputClass('code')}
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="VD: NHAN_SU, TAI_CHINH..."
                maxLength={50}
                disabled={loading || (isEditing && (category?.usageCount ?? 0) > 0)}
              />
              {isEditing && (category?.usageCount ?? 0) > 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  ⚠ Mã không thể thay đổi vì lĩnh vực đang được sử dụng bởi {category?.usageCount} văn bản
                </p>
              )}
              {errors.code && <p className="mt-1 text-xs text-red-600">{errors.code}</p>}
            </div>

            {/* Mô tả */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mô tả</label>
              <textarea
                className={inputClass('description')}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder="Mô tả ngắn về lĩnh vực văn bản (tùy chọn)"
                maxLength={500}
                disabled={loading}
              />
              <p className="mt-1 text-xs text-slate-400 text-right">{formData.description.length}/500</p>
              {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description}</p>}
            </div>

            {/* Trạng thái */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Trạng thái</label>
              <select
                className={inputClass('status')}
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}
                disabled={loading}
              >
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="INACTIVE">Ngừng hoạt động</option>
              </select>
              {isEditing && formData.status === 'INACTIVE' && category?.status === 'ACTIVE' && (
                <p className="mt-1 text-xs text-amber-600">
                  ⚠ Khi chuyển sang Ngừng hoạt động, văn bản cũ vẫn giữ lĩnh vực này nhưng sẽ không thể chọn khi tạo văn bản mới
                </p>
              )}
            </div>
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
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              {loading ? (
                <>
                  <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <span>{isEditing ? 'Cập nhật' : 'Tạo mới'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
