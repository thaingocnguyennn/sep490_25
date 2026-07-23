import React from 'react';

interface DocumentCategoryToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  onAddClick: () => void;
}

export const DocumentCategoryToolbar: React.FC<DocumentCategoryToolbarProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  onAddClick,
}) => {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
      {/* Tìm kiếm + Lọc trạng thái */}
      <div className="doc-filter-bar">
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            className="filter-input"
            placeholder="Tìm theo tên hoặc mã..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ paddingLeft: 32, minWidth: 220 }}
          />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#b2bec3', pointerEvents: 'none' }}>
            🔍
          </span>
        </div>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="INACTIVE">Ngừng hoạt động</option>
        </select>
      </div>

      {/* Nút Thêm mới */}
      <button className="btn btn-primary" onClick={onAddClick} style={{ width: 'auto' }}>
        + Thêm Lĩnh vực
      </button>
    </div>
  );
};
