import React from 'react';
import { Search, Plus } from 'lucide-react';

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
    <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
      {/* Tìm kiếm + Lọc trạng thái */}
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Tìm theo tên hoặc mã..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition-colors"
          />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-white transition-colors"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="INACTIVE">Ngừng hoạt động</option>
        </select>
      </div>

      {/* Nút Thêm mới */}
      <button
        onClick={onAddClick}
        className="w-full sm:w-auto px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors flex items-center justify-center gap-2 text-sm font-medium"
      >
        <Plus className="h-4 w-4" />
        <span>Thêm Lĩnh vực</span>
      </button>
    </div>
  );
};
