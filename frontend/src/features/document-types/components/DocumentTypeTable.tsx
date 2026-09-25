import React from 'react';
import { DocumentTypeResponse } from '../types/documentType.types';
import { LoadingSpinner } from '../../../shared/components';

interface DocumentTypeTableProps {
  documentTypes: DocumentTypeResponse[];
  loading: boolean;
  onEdit: (type: DocumentTypeResponse) => void;
  onDelete: (type: DocumentTypeResponse) => void;
  onReactivate: (type: DocumentTypeResponse) => void;
}

export const DocumentTypeTable: React.FC<DocumentTypeTableProps> = ({
  documentTypes,
  loading,
  onEdit,
  onDelete,
  onReactivate,
}) => {
  if (loading) {
    return <LoadingSpinner />;
  }

  if (documentTypes.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 48, textAlign: 'center' }}>
        <p style={{ color: '#636e72', margin: 0 }}>Không tìm thấy thể loại văn bản nào.</p>
      </div>
    );
  }

  return (
    <div className="table-responsive">
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 70 }}>ID</th>
            <th style={{ width: 140 }}>Mã thể loại</th>
            <th>Tên thể loại</th>
            <th>Mô tả</th>
            <th style={{ width: 150, textAlign: 'center' }}>Sử dụng</th>
            <th style={{ width: 130, textAlign: 'center' }}>Trạng thái</th>
            <th style={{ width: 110, textAlign: 'center' }}>Hệ thống</th>
            <th style={{ width: 110, textAlign: 'right' }}>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {documentTypes.map((type) => (
            <tr key={type.id}>
              <td>#{type.id}</td>
              <td>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{type.code}</span>
              </td>
              <td style={{ fontWeight: 600, color: '#2d3436' }}>{type.name}</td>
              <td>
                {type.description ? (
                  <span style={{ color: '#636e72', fontSize: 13 }}>{type.description}</span>
                ) : (
                  <span style={{ color: '#b2bec3', fontStyle: 'italic', fontSize: 13 }}>
                    Chưa có mô tả
                  </span>
                )}
              </td>
              <td style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{type.usageCount}</span>
                  {type.usageCount > 0 && (
                    <span style={{ color: '#636e72', fontSize: 11 }}>
                      (Đến: {type.usageDetail.incoming} / Đi: {type.usageDetail.outgoing})
                    </span>
                  )}
                </div>
              </td>
              <td style={{ textAlign: 'center' }}>
                <span
                  className={`status-badge ${
                    type.status === 'ACTIVE' ? 'status-active' : 'status-inactive'
                  }`}
                >
                  {type.status === 'ACTIVE' ? 'Hoạt động' : 'Đã ngừng'}
                </span>
              </td>
              <td style={{ textAlign: 'center' }}>
                {type.isSystem ? (
                  <span
                    style={{
                      padding: '2px 8px',
                      background: '#fff3cd',
                      color: '#856404',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    Hệ thống
                  </span>
                ) : (
                  <span style={{ color: '#b2bec3' }}>—</span>
                )}
              </td>
              <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  {!type.isSystem && type.status === 'INACTIVE' && !type.deletedAt && (
                    <button
                      className="action-btn unlock"
                      onClick={() => onReactivate(type)}
                      title="Kích hoạt lại thể loại"
                    >
                      &#128275;
                    </button>
                  )}

                  {!type.isSystem && (
                    <button
                      className="action-btn edit"
                      onClick={() => onEdit(type)}
                      title="Chỉnh sửa thể loại"
                    >
                      &#9998;
                    </button>
                  )}

                  {!type.isSystem && (
                    <button
                      className="action-btn delete"
                      onClick={() => onDelete(type)}
                      title={type.usageCount > 0 ? 'Ngừng hoạt động' : 'Xóa'}
                    >
                      &#128465;
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
