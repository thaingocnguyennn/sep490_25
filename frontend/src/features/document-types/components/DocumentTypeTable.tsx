import React from 'react';
import { DocumentKindResponse } from '../types/documentType.types';

interface DocumentTypeTableProps {
  documentTypes: DocumentKindResponse[];
  loading: boolean;
  onEdit: (type: DocumentKindResponse) => void;
  onDelete: (type: DocumentKindResponse) => void;
  onReactivate: (type: DocumentKindResponse) => void;
}

export const DocumentTypeTable: React.FC<DocumentTypeTableProps> = ({
  documentTypes,
  loading,
  onEdit,
  onDelete,
  onReactivate,
}) => {
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#636e72' }}>
        Đang tải dữ liệu...
      </div>
    );
  }

  if (documentTypes.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#636e72', background: '#fff', borderRadius: 8, border: '1px solid #dfe6e9' }}>
        Không tìm thấy thể loại văn bản nào.
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: '80px' }}>ID</th>
            <th style={{ width: '120px' }}>Mã thể loại</th>
            <th style={{ width: '200px' }}>Tên thể loại</th>
            <th>Mô tả</th>
            <th style={{ width: '100px', textAlign: 'center' }}>Sử dụng</th>
            <th style={{ width: '120px', textAlign: 'center' }}>Trạng thái</th>
            <th style={{ width: '120px', textAlign: 'center' }}>Hệ thống</th>
            <th style={{ width: '100px', textAlign: 'right' }}>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {documentTypes.map((type) => (
            <tr key={type.id}>
              <td>#{type.id}</td>
              <td style={{ fontWeight: 600 }}>{type.code}</td>
              <td style={{ fontWeight: 500, color: '#2d3436' }}>{type.name}</td>
              <td style={{ color: '#636e72' }}>
                {type.description || <span style={{ color: '#b2bec3', fontStyle: 'italic' }}>Không có mô tả</span>}
              </td>
              <td style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{type.usageCount}</span>
                  {type.usageCount > 0 && (
                    <span style={{ color: '#636e72' }}>
                      (Đến: {type.usageDetail.incoming} / Đi: {type.usageDetail.outgoing})
                    </span>
                  )}
                </div>
              </td>
              <td style={{ textAlign: 'center' }}>
                <span className={`status-badge ${type.status === 'ACTIVE' ? 'status-active' : 'status-inactive'}`}>
                  {type.status === 'ACTIVE' ? 'Hoạt động' : 'Đã ngừng'}
                </span>
              </td>
              <td style={{ textAlign: 'center' }}>
                {type.isSystem ? (
                  <span style={{ padding: '4px 8px', background: '#f1f2f6', color: '#2f3542', borderRadius: 4, fontSize: 12, fontWeight: 500 }}>
                    Mặc định
                  </span>
                ) : (
                  <span style={{ color: '#b2bec3' }}>-</span>
                )}
              </td>
              <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {!type.isSystem && type.status === 'INACTIVE' && !type.deletedAt && (
                    <button
                      className="btn-icon"
                      onClick={() => onReactivate(type)}
                      title="Kích hoạt lại"
                      style={{ color: '#00b894' }}
                    >
                      <span className="material-icons" style={{ fontSize: 18 }}>restore</span>
                    </button>
                  )}
                  
                  {!type.isSystem && (
                    <button
                      className="btn-icon"
                      onClick={() => onEdit(type)}
                      title="Chỉnh sửa"
                      style={{ color: '#0984e3' }}
                    >
                      <span className="material-icons" style={{ fontSize: 18 }}>edit</span>
                    </button>
                  )}

                  {!type.isSystem && (
                    <button
                      className="btn-icon"
                      onClick={() => onDelete(type)}
                      title={type.usageCount > 0 ? 'Ngừng hoạt động' : 'Xóa'}
                      style={{ color: '#d63031' }}
                    >
                      <span className="material-icons" style={{ fontSize: 18 }}>
                        {type.usageCount > 0 ? 'block' : 'delete'}
                      </span>
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
