import React, { useState } from 'react';
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
      await remove(category.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Có lỗi xảy ra, vui lòng thử lại';
      setApiError(msg);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        {/* Header */}
        <div className="modal-header">
          <h2 style={{ fontSize: 18 }}>
            {hasUsage ? 'Vô hiệu hóa lĩnh vực văn bản' : 'Xóa lĩnh vực văn bản'}
          </h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Thông tin category */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: '#f8f9fa', borderRadius: 8, marginBottom: 16 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
              background: hasUsage ? '#fff3cd' : '#ffeaea', flexShrink: 0,
            }}>
              {hasUsage ? '⚠️' : '🗑️'}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{category.name}</div>
              <div style={{ fontSize: 13, color: '#636e72', marginTop: 2 }}>Mã: {category.code}</div>
            </div>
          </div>

          {/* Mô tả hành động */}
          {hasUsage ? (
            <div className="alert" style={{ background: '#fff3cd', border: '1px solid #ffc107', color: '#856404', marginBottom: 0 }}>
              <strong>Lĩnh vực đang được sử dụng</strong>
              <p style={{ marginTop: 6, marginBottom: 0 }}>
                Lĩnh vực này đang được sử dụng bởi <strong>{category.usageCount} văn bản</strong>.
                Hệ thống sẽ chuyển sang trạng thái <strong>Ngừng hoạt động</strong> thay vì xóa.
                Văn bản cũ vẫn giữ lĩnh vực này.
              </p>
            </div>
          ) : (
            <div className="alert alert-error" style={{ marginBottom: 0 }}>
              <strong>Xác nhận xóa</strong>
              <p style={{ marginTop: 6, marginBottom: 0 }}>
                Lĩnh vực này chưa được sử dụng và sẽ bị <strong>xóa khỏi hệ thống</strong>.
                Hành động này không thể hoàn tác.
              </p>
            </div>
          )}

          {/* Lỗi API */}
          {apiError && (
            <div className="alert alert-error" style={{ marginTop: 12, marginBottom: 0 }}>
              {apiError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button type="button" className="btn btn-cancel" onClick={onClose} disabled={loading}>
            Hủy
          </button>
          <button
            type="button"
            className={`btn ${hasUsage ? 'btn-warning' : 'btn-danger'}`}
            onClick={handleConfirm}
            disabled={loading}
            style={{ width: 'auto' }}
          >
            {loading
              ? 'Đang xử lý...'
              : (hasUsage ? 'Vô hiệu hóa' : 'Xóa')}
          </button>
        </div>
      </div>
    </div>
  );
};
