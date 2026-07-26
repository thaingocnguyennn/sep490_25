import React from 'react';

interface DocumentTypeToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  onAddClick: () => void;
}

export const DocumentTypeToolbar: React.FC<DocumentTypeToolbarProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  onAddClick,
}) => {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 12, flex: 1 }}>
        <input
          type="text"
          placeholder="Tìm kiếm theo tên hoặc mã..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #dfe6e9',
            borderRadius: 6,
            minWidth: 300,
            fontSize: 14,
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #dfe6e9',
            borderRadius: 6,
            fontSize: 14,
            backgroundColor: 'white',
          }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="INACTIVE">Ngừng hoạt động</option>
        </select>
      </div>

      <button
        onClick={onAddClick}
        style={{
          padding: '8px 16px',
          backgroundColor: '#0984e3',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontWeight: 500,
          fontSize: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span>+</span> Thêm thể loại
      </button>
    </div>
  );
};
