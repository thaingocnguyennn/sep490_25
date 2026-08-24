import React, { useState } from 'react';
import { useDocumentTypeActions } from '../hooks/useDocumentTypes';
import { DocumentTypeResponse } from '../types/documentType.types';

interface DeleteDocumentTypeModalProps {
  documentType: DocumentTypeResponse;
  onClose: () => void;
  onSuccess: () => void;
}

export const DeleteDocumentTypeModal: React.FC<DeleteDocumentTypeModalProps> = ({
  documentType,
  onClose,
  onSuccess,
}) => {
  const { remove, loading } = useDocumentTypeActions();
  const [apiError, setApiError] = useState<string | null>(null);

  const hasUsage = documentType.usageCount > 0;
  const title = hasUsage ? 'Vô hiệu hóa thể loại văn bản' : 'Xóa thể loại văn bản';
  const actionText = hasUsage ? 'Vô hiệu hóa' : 'Xóa';

  const handleDelete = async () => {
    setApiError(null);
    try {
      await remove(documentType.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      setApiError(err.response?.data?.message || 'Có lỗi xảy ra, vui lòng thử lại');
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
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Đóng">
            &times;
          </button>
        </div>
        <div className="modal-body">
          {/* Thông tin */}
          <div
            style={{
              padding: '12px 16px',
              background: '#f8f9fa',
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 15, color: '#2d3436' }}>
              {documentType.name}
            </div>
            <div style={{ fontSize: 13, color: '#636e72', marginTop: 2 }}>
              Mã thể loại: <span style={{ fontFamily: 'monospace' }}>{documentType.code}</span>
            </div>
          </div>

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
              <strong>Thể loại đang được sử dụng</strong>
              <p style={{ marginTop: 6, marginBottom: 0 }}>
                Thể loại này đang liên kết với <strong>{documentType.usageCount} văn bản</strong>. Hệ
                thống sẽ chuyển sang trạng thái <strong>Ngừng hoạt động</strong> thay vì xóa để bảo toàn dữ liệu.
              </p>
            </div>
          ) : (
            <div className="alert alert-error" style={{ marginBottom: 0 }}>
              <strong>Xác nhận xóa hoàn toàn</strong>
              <p style={{ marginTop: 6, marginBottom: 0 }}>
                Thể loại văn bản này chưa được sử dụng và sẽ bị xóa khỏi hệ thống.
              </p>
            </div>
          )}

          {apiError && (
            <div className="alert alert-error" style={{ marginTop: 12, marginBottom: 0 }}>
              {apiError}
            </div>
          )}
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
          <button
            type="button"
            className={`btn ${hasUsage ? 'btn-primary' : 'btn-danger'}`}
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? 'Đang xử lý...' : `Xác nhận ${actionText.toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
};
