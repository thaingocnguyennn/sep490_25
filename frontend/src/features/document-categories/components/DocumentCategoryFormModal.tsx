import React, { useState, useEffect } from 'react';
import { useDocumentCategoryActions } from '../hooks/useDocumentCategories';
import {
  DocumentCategoryResponse,
  CreateDocumentCategoryDto,
  UpdateDocumentCategoryDto,
} from '../types/documentCategory.types';

interface DocumentCategoryFormModalProps {
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
          description: formData.description.trim() || null,
          status: formData.status,
        };
        const normalizedCode = formData.code.trim().toUpperCase().replace(/\s+/g, '_');
        if (normalizedCode !== category!.code && category!.usageCount === 0) {
          dto.code = formData.code.trim();
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

  const codeDisabled = loading || (isEditing && (category?.usageCount ?? 0) > 0);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: 520 }}>
        {/* Header */}
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {isEditing ? 'Chỉnh sửa lĩnh vực văn bản' : 'Thêm lĩnh vực văn bản mới'}
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Đóng">
            &times;
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {apiError && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                {apiError}
              </div>
            )}

            {/* Tên */}
            <div className="form-group">
              <label htmlFor="categoryName">
                Tên lĩnh vực <span style={{ color: '#e74c3c' }}>*</span>
              </label>
              <input
                id="categoryName"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="VD: Nhân sự, Tài chính, Đào tạo..."
                maxLength={100}
                disabled={loading}
                style={errors.name ? { borderColor: '#e74c3c' } : {}}
              />
              {errors.name && (
                <span style={{ color: '#e74c3c', fontSize: 12 }}>{errors.name}</span>
              )}
            </div>

            {/* Mã */}
            <div className="form-group">
              <label htmlFor="categoryCode">
                Mã lĩnh vực <span style={{ color: '#e74c3c' }}>*</span>
              </label>
              <input
                id="categoryCode"
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="VD: NHAN_SU, TAI_CHINH..."
                maxLength={50}
                disabled={codeDisabled}
                style={{
                  ...(errors.code ? { borderColor: '#e74c3c' } : {}),
                  ...(codeDisabled ? { backgroundColor: '#f8f9fa', cursor: 'not-allowed' } : {}),
                }}
              />
              {isEditing && (category?.usageCount ?? 0) > 0 && (
                <div style={{ color: '#e67e22', fontSize: 12, marginTop: 4 }}>
                  Mã không thể thay đổi vì đang được sử dụng bởi {category?.usageCount} văn bản
                </div>
              )}
              {errors.code && (
                <span style={{ color: '#e74c3c', fontSize: 12 }}>{errors.code}</span>
              )}
            </div>

            {/* Mô tả */}
            <div className="form-group">
              <label htmlFor="categoryDescription">Mô tả</label>
              <textarea
                id="categoryDescription"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Mô tả ngắn về lĩnh vực (tùy chọn)"
                maxLength={500}
                rows={3}
                disabled={loading}
                style={errors.description ? { borderColor: '#e74c3c' } : {}}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                {errors.description ? (
                  <span style={{ color: '#e74c3c', fontSize: 12 }}>{errors.description}</span>
                ) : (
                  <span />
                )}
                <span style={{ fontSize: 12, color: '#b2bec3' }}>
                  {formData.description.length}/500
                </span>
              </div>
            </div>

            {/* Trạng thái */}
            <div className="form-group">
              <label htmlFor="categoryStatus">Trạng thái</label>
              <select
                id="categoryStatus"
                value={formData.status}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    status: e.target.value as 'ACTIVE' | 'INACTIVE',
                  })
                }
                disabled={loading}
              >
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="INACTIVE">Ngừng hoạt động</option>
              </select>
              {isEditing && formData.status === 'INACTIVE' && category?.status === 'ACTIVE' && (
                <div style={{ color: '#e67e22', fontSize: 12, marginTop: 4 }}>
                  Văn bản cũ vẫn giữ lĩnh vực này nhưng sẽ không thể chọn khi tạo mới
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading
                ? isEditing
                  ? 'Đang cập nhật...'
                  : 'Đang tạo...'
                : isEditing
                ? 'Lưu thay đổi'
                : 'Tạo mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
