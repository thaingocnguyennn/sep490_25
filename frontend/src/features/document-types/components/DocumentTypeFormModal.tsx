import React, { useState, useEffect } from 'react';
import { useDocumentTypeActions } from '../hooks/useDocumentTypes';
import {
  DocumentTypeResponse,
  CreateDocumentTypeDto,
  UpdateDocumentTypeDto,
} from '../types/documentType.types';

interface DocumentTypeFormModalProps {
  documentType?: DocumentTypeResponse;
  onClose: () => void;
  onSuccess: () => void;
}

export const DocumentTypeFormModal: React.FC<DocumentTypeFormModalProps> = ({
  documentType,
  onClose,
  onSuccess,
}) => {
  const isEditing = !!documentType;
  const { create, update, loading } = useDocumentTypeActions();
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (documentType) {
      setFormData({
        name: documentType.name,
        code: documentType.code,
        description: documentType.description || '',
        status: documentType.status,
      });
    }
  }, [documentType]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Tên thể loại văn bản là bắt buộc';
    } else if (formData.name.trim().length > 100) {
      newErrors.name = 'Tên không được vượt quá 100 ký tự';
    }
    if (!formData.code.trim()) {
      newErrors.code = 'Mã thể loại văn bản là bắt buộc';
    } else if (formData.code.trim().length > 20) {
      newErrors.code = 'Mã không được vượt quá 20 ký tự';
    } else if (/\s/.test(formData.code)) {
      newErrors.code = 'Mã không được chứa khoảng trắng';
    } else if (formData.code.includes('/')) {
      newErrors.code = 'Mã không được chứa dấu /';
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
        const dto: UpdateDocumentTypeDto = {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          status: formData.status,
        };
        const newCode = formData.code.trim().toUpperCase();
        if (newCode !== documentType!.code && documentType!.usageCount === 0) {
          dto.code = formData.code.trim();
        }
        await update(documentType!.id, dto);
      } else {
        const dto: CreateDocumentTypeDto = {
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

  const codeDisabled = loading || (isEditing && (documentType?.usageCount ?? 0) > 0);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {isEditing ? 'Chỉnh sửa thể loại văn bản' : 'Thêm thể loại văn bản mới'}
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Đóng">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {apiError && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                {apiError}
              </div>
            )}
            <div className="form-group">
              <label htmlFor="typeName">
                Tên thể loại <span style={{ color: '#e74c3c' }}>*</span>
              </label>
              <input
                id="typeName"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="VD: Công văn, Quyết định, Tờ trình..."
                maxLength={100}
                disabled={loading}
                style={errors.name ? { borderColor: '#e74c3c' } : {}}
              />
              {errors.name && (
                <span style={{ color: '#e74c3c', fontSize: 12 }}>{errors.name}</span>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="typeCode">
                Mã thể loại <span style={{ color: '#e74c3c' }}>*</span>
              </label>
              <input
                id="typeCode"
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="VD: CV, QD, TTr..."
                maxLength={20}
                disabled={codeDisabled}
                style={{
                  ...(errors.code ? { borderColor: '#e74c3c' } : {}),
                  ...(codeDisabled ? { backgroundColor: '#f8f9fa', cursor: 'not-allowed' } : {}),
                }}
              />
              {isEditing && (documentType?.usageCount ?? 0) > 0 && (
                <div style={{ color: '#e67e22', fontSize: 12, marginTop: 4 }}>
                  Mã không thể thay đổi vì đang được sử dụng bởi {documentType?.usageCount} văn bản
                </div>
              )}
              {errors.code && (
                <span style={{ color: '#e74c3c', fontSize: 12 }}>{errors.code}</span>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="typeDescription">Mô tả</label>
              <textarea
                id="typeDescription"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Mô tả thể loại (tùy chọn)"
                maxLength={500}
                rows={3}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #dfe6e9',
                  borderRadius: 8,
                  fontSize: 14,
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  ...(errors.description ? { borderColor: '#e74c3c' } : {}),
                }}
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
            <div className="form-group">
              <label htmlFor="typeStatus">Trạng thái</label>
              <select
                id="typeStatus"
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
              {isEditing && formData.status === 'INACTIVE' && documentType?.status === 'ACTIVE' && (
                <div style={{ color: '#e67e22', fontSize: 12, marginTop: 4 }}>
                  Văn bản cũ vẫn giữ thể loại này nhưng sẽ không thể chọn khi tạo mới
                </div>
              )}
            </div>
          </div>
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
              {loading ? 'Đang lưu...' : isEditing ? 'Lưu thay đổi' : 'Tạo mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
