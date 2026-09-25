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
  const title = hasUsage ? 'Vô hiệu hóa lĩnh vực văn bản' : 'Xóa lĩnh vực văn bản';
  const actionText = hasUsage ? 'Vô hiệu hóa' : 'Xóa';

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
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: 480 }}>
        {/* Header */}
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Đóng">
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Thông tin category */}
          <div
            style={{
              padding: '12px 16px',
              background: '#f8f9fa',
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 15, color: '#2d3436' }}>{category.name}</div>
            <div style={{ fontSize: 13, color: '#636e72', marginTop: 2 }}>
              Mã lĩnh vực: <span style={{ fontFamily: 'monospace' }}>{category.code}</span>
            </div>
          </div>

          {/* Mô tả hành động */}
          {hasUsage ? (
            <div
              className="alert"
              style={{
                background: '#fff3cd',
                border: '1px solid #ffeeba',
                color: '#856404',
                marginBottom: 0,
              }}
            >
              <strong>Lĩnh vực đang được sử dụng</strong>
              <p style={{ marginTop: 6, marginBottom: 0 }}>
                Lĩnh vực này đang liên kết với <strong>{category.usageCount} văn bản</strong>. Hệ thống
                sẽ chuyển sang trạng thái <strong>Ngừng hoạt động</strong> thay vì xóa để bảo toàn dữ liệu.
              </p>
            </div>
          ) : (
            <div className="alert alert-error" style={{ marginBottom: 0 }}>
              <strong>Xác nhận xóa hoàn toàn</strong>
              <p style={{ marginTop: 6, marginBottom: 0 }}>
                Lĩnh vực này chưa được sử dụng và sẽ bị xóa khỏi hệ thống.
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
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Hủy
          </button>
          <button
            type="button"
            className={`btn ${hasUsage ? 'btn-primary' : 'btn-danger'}`}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? 'Đang xử lý...' : `Xác nhận ${actionText.toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
};
