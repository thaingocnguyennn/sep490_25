import React from 'react';
import { DocumentCategoryResponse } from '../types/documentCategory.types';

interface DocumentCategoryTableProps {
  categories: DocumentCategoryResponse[];
  loading: boolean;
  onEdit: (category: DocumentCategoryResponse) => void;
  onDelete: (category: DocumentCategoryResponse) => void;
}

export const DocumentCategoryTable: React.FC<DocumentCategoryTableProps> = ({
  categories,
  loading,
  onEdit,
  onDelete,
}) => {
  if (loading) {
    return (
      <div className="loading-spinner">
        <div className="spinner" />
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>Không tìm thấy lĩnh vực văn bản nào.</p>
          <p>Thử thay đổi bộ lọc hoặc thêm mới.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <table className="data-table">
        <thead>
          <tr>
            <th>Mã Lĩnh Vực</th>
            <th>Tên Lĩnh Vực</th>
            <th style={{ textAlign: 'center' }}>Số VB Liên Quan</th>
            <th>Trạng Thái</th>
            <th style={{ textAlign: 'right' }}>Thao Tác</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.id}>
              {/* Mã */}
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{category.code}</span>
                  {category.isSystem && (
                    <span
                      title="Lĩnh vực hệ thống, không thể sửa/xóa"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        padding: '2px 6px', background: '#fff3cd', color: '#856404',
                        borderRadius: 4, fontSize: 11, fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      🛡 Hệ thống
                    </span>
                  )}
                </div>
              </td>

              {/* Tên + mô tả */}
              <td>
                <div>
                  <div style={{ fontWeight: 500 }}>{category.name}</div>
                  {category.description && (
                    <div style={{ fontSize: 12, color: '#636e72', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                      {category.description}
                    </div>
                  )}
                </div>
              </td>

              {/* Usage */}
              <td style={{ textAlign: 'center' }}>
                <span className="role-badge">{category.usageCount} văn bản</span>
              </td>

              {/* Trạng thái */}
              <td>
                <span className={`status-badge ${category.status === 'ACTIVE' ? 'active' : 'inactive'}`}>
                  {category.status === 'ACTIVE' ? 'Hoạt động' : 'Ngừng HĐ'}
                </span>
              </td>

              {/* Thao tác */}
              <td style={{ textAlign: 'right' }}>
                <button
                  className="action-btn edit"
                  onClick={() => onEdit(category)}
                  disabled={category.isSystem}
                  title={category.isSystem ? 'Lĩnh vực hệ thống không thể chỉnh sửa' : 'Chỉnh sửa'}
                  style={category.isSystem ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                >
                  ✏
                </button>

                {!category.isSystem && (
                  <button
                    className="action-btn delete"
                    onClick={() => onDelete(category)}
                    title={category.usageCount > 0 ? 'Vô hiệu hóa (đang được sử dụng)' : 'Xóa'}
                  >
                    🗑
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
