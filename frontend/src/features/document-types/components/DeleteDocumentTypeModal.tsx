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
  const title = hasUsage ? 'Ngừng hoạt động thể loại văn bản' : 'Xóa thể loại văn bản';
  const actionText = hasUsage ? 'Ngừng hoạt động' : 'Xóa';

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
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 450 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 18, color: hasUsage ? '#e67e22' : '#d63031' }}>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Đóng">&times;</button>
        </div>
        <div className="modal-body">
          {apiError && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              ⚠ {apiError}
            </div>
          )}
          {hasUsage ? (
            <div>
              <p>
                Thể loại <strong>{documentType.name} ({documentType.code})</strong> đang được sử dụng bởi <strong>{documentType.usageCount}</strong> văn bản.
              </p>
              <p style={{ marginTop: 8 }}>
                Hệ thống sẽ không xóa hoàn toàn mà chuyển trạng thái sang <strong>Ngừng hoạt động (INACTIVE)</strong>.
                Các văn bản cũ vẫn giữ nguyên, nhưng sẽ không thể chọn thể loại này khi tạo mới.
              </p>
              <p style={{ marginTop: 8, color: '#e67e22', fontWeight: 500 }}>
                Bạn có chắc chắn muốn tiếp tục?
              </p>
            </div>
          ) : (
            <div>
              <p>
                Bạn có chắc chắn muốn xóa thể loại văn bản <strong>{documentType.name} ({documentType.code})</strong>?
              </p>
              <p style={{ marginTop: 8, color: '#636e72' }}>
                Hành động này không thể hoàn tác, nhưng hệ thống v�n lưu trữ thông tin trong thùng rác để phục hồi nếu cần.
              </p>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Hủy
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDelete}
            disabled={loading}
            style={{ backgroundColor: hasUsage ? '#e67e22' : '#d63031' }}
          >
            {loading ? 'Đang xử lý...' : `Xác nhận ${actionText.toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
};
