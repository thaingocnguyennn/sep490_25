import React from 'react';
import { DocumentCategoryResponse } from '../types/documentCategory.types';
import { LoadingSpinner } from '../../../shared/components';

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
    return <LoadingSpinner />;
  }

  if (categories.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 48, textAlign: 'center' }}>
        <p style={{ color: '#636e72', margin: 0 }}>Không tìm thấy lĩnh vực văn bản nào.</p>
      </div>
    );
  }

  return (
    <div className="table-responsive">
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 140 }}>Mã Lĩnh Vực</th>
            <th>Tên Lĩnh Vực</th>
            <th>Mô tả</th>
            <th style={{ width: 140, textAlign: 'center' }}>Số VB Liên Quan</th>
            <th style={{ width: 130, textAlign: 'center' }}>Trạng Thái</th>
            <th style={{ width: 110, textAlign: 'center' }}>Hệ thống</th>
            <th style={{ width: 100, textAlign: 'right' }}>Thao Tác</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.id}>
              {/* Mã */}
              <td>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{category.code}</span>
              </td>

              {/* Tên */}
              <td>
                <div style={{ fontWeight: 600, color: '#2d3436' }}>{category.name}</div>
              </td>

              {/* Mô tả */}
              <td>
                {category.description ? (
                  <span style={{ color: '#636e72', fontSize: 13 }}>{category.description}</span>
                ) : (
                  <span style={{ color: '#b2bec3', fontStyle: 'italic', fontSize: 13 }}>
                    Chưa có mô tả
                  </span>
                )}
              </td>

              {/* Số VB */}
              <td style={{ textAlign: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{category.usageCount}</span>
              </td>

              {/* Trạng thái */}
              <td style={{ textAlign: 'center' }}>
                <span
                  className={`status-badge ${
                    category.status === 'ACTIVE' ? 'status-active' : 'status-inactive'
                  }`}
                >
                  {category.status === 'ACTIVE' ? 'Hoạt động' : 'Ngừng HĐ'}
                </span>
              </td>

              {/* Hệ thống */}
              <td style={{ textAlign: 'center' }}>
                {category.isSystem ? (
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

              {/* Thao tác */}
              <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    className="action-btn edit"
                    onClick={() => onEdit(category)}
                    disabled={category.isSystem}
                    title={
                      category.isSystem ? 'Lĩnh vực hệ thống không thể chỉnh sửa' : 'Chỉnh sửa'
                    }
                    style={category.isSystem ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
                  >
                    &#9998;
                  </button>

                  <button
                    className="action-btn delete"
                    onClick={() => onDelete(category)}
                    disabled={category.isSystem}
                    title={
                      category.isSystem
                        ? 'Lĩnh vực hệ thống không thể xóa'
                        : category.usageCount > 0
                        ? 'Vô hiệu hóa (đang được sử dụng)'
                        : 'Xóa'
                    }
                    style={category.isSystem ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
                  >
                    &#128465;
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
