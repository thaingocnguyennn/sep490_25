import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDepartments } from '../../../shared/hooks';
import { useDepartmentActions } from '../../../shared/hooks';
import { LoadingSpinner, ConfirmModal } from '../../../shared/components';
import { useAuth } from '../../../contexts/AuthContext';
import type { Department } from '../../../api';

type ViewMode = 'tree' | 'flat';

interface TreeNode {
  department: Department;
  children: TreeNode[];
}

function buildTree(departments: Department[]): TreeNode[] {
  const byId = new Map<number, TreeNode>();
  for (const d of departments) {
    byId.set(d.id, { department: d, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const d of departments) {
    const node = byId.get(d.id)!;
    if (d.parentId && byId.has(d.parentId)) {
      byId.get(d.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  expanded: Set<number>;
  toggle: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (d: Department) => void;
  actionLoading: boolean;
}

function TreeRow({ node, depth, expanded, toggle, onEdit, onDelete, actionLoading }: TreeRowProps) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.department.id);

  return (
    <>
      <tr>
        <td style={{ paddingLeft: 8 + depth * 24 }}>
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggle(node.department.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                marginRight: 6,
                color: '#636e72',
                fontSize: 12,
                width: 16,
              }}
              title={isOpen ? 'Thu gọn' : 'Mở rộng'}
            >
              {isOpen ? '▼' : '▶'}
            </button>
          ) : (
            <span style={{ display: 'inline-block', width: 22 }} />
          )}
          <span
            onClick={() => onEdit(node.department.id)}
            style={{ cursor: 'pointer', color: '#2d3436', fontWeight: 500 }}
            title="Xem chi tiết"
          >
            {node.department.name}
          </span>
        </td>
        <td style={{ color: '#636e72' }}>{node.department.parent?.name || '—'}</td>
        <td>
          <span style={countStyle(node.department.userCount ?? 0, '#27ae60', '#e8f8f0')}>
            {node.department.userCount ?? 0}
          </span>
        </td>
        <td>
          <span style={countStyle(node.department.childCount ?? 0, '#6c5ce7', '#efedfc')}>
            {node.department.childCount ?? 0}
          </span>
        </td>
        <td>
          <button
            className="action-btn edit"
            title="Chỉnh sửa"
            onClick={() => onEdit(node.department.id)}
          >
            &#9998;
          </button>
          <button
            className="action-btn delete"
            title="Xóa"
            disabled={actionLoading}
            onClick={() => onDelete(node.department)}
          >
            &#128465;
          </button>
        </td>
      </tr>
      {isOpen &&
        node.children.map((child) => (
          <TreeRow
            key={child.department.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            toggle={toggle}
            onEdit={onEdit}
            onDelete={onDelete}
            actionLoading={actionLoading}
          />
        ))}
    </>
  );
}

function countStyle(count: number, activeColor: string, activeBg: string): React.CSSProperties {
  const isActive = count > 0;
  return {
    background: isActive ? activeBg : '#f5f6fa',
    color: isActive ? activeColor : '#636e72',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 13,
    fontWeight: 500,
  };
}

export default function DepartmentsPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { departments, loading, refetch } = useDepartments();
  const { deleteDepartment, actionLoading, actionError, clearActionError } = useDepartmentActions(refetch);
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tree = useMemo(() => buildTree(departments), [departments]);

  const handleEdit = (id: number) => {
    navigate(`/admin/departments/${id}`);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDepartment(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // keep modal open so the user sees the error message in actionError
    }
  };

  const closeDeleteModal = () => {
    if (actionLoading) return;
    setDeleteTarget(null);
    clearActionError();
  };

  if (!isAdmin) {
    return <div className="page-content"><p>Truy cập bị từ chối.</p></div>;
  }

  return (
    <>
      <div className="top-bar">
        <h1>Quản lý phòng ban</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              border: '1px solid #dfe6e9',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              className="btn"
              style={{
                borderRadius: 0,
                background: viewMode === 'tree' ? '#667eea' : 'white',
                color: viewMode === 'tree' ? 'white' : '#2d3436',
                padding: '6px 14px',
                fontSize: 13,
              }}
            >
              Dạng cây
            </button>
            <button
              type="button"
              onClick={() => setViewMode('flat')}
              className="btn"
              style={{
                borderRadius: 0,
                background: viewMode === 'flat' ? '#667eea' : 'white',
                color: viewMode === 'flat' ? 'white' : '#2d3436',
                padding: '6px 14px',
                fontSize: 13,
                borderLeft: '1px solid #dfe6e9',
              }}
            >
              Dạng bảng
            </button>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/admin/departments/new')}>
            + Tạo phòng ban
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {loading ? (
              <LoadingSpinner />
            ) : departments.length === 0 ? (
              <div className="empty-state">
                <h3>Chưa có phòng ban nào</h3>
                <p>Hãy tạo phòng ban đầu tiên của bạn để bắt đầu.</p>
              </div>
            ) : viewMode === 'tree' ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tên phòng ban</th>
                    <th>Phòng ban cấp trên</th>
                    <th>Người dùng</th>
                    <th>Phòng ban trực thuộc</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {tree.map((node) => (
                    <TreeRow
                      key={node.department.id}
                      node={node}
                      depth={0}
                      expanded={expanded}
                      toggle={toggle}
                      onEdit={handleEdit}
                      onDelete={(d) => {
                        clearActionError();
                        setDeleteTarget(d);
                      }}
                      actionLoading={actionLoading}
                    />
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Tên phòng ban</th>
                    <th>Phòng ban cấp trên</th>
                    <th>Người dùng</th>
                    <th>Phòng ban trực thuộc</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((d, index) => (
                    <tr key={d.id}>
                      <td>{index + 1}</td>
                      <td>
                        <span
                          onClick={() => handleEdit(d.id)}
                          style={{ cursor: 'pointer', color: '#2d3436', fontWeight: 500 }}
                        >
                          {d.name}
                        </span>
                      </td>
                      <td style={{ color: '#636e72' }}>{d.parent?.name || '—'}</td>
                      <td>
                        <span style={countStyle(d.userCount ?? 0, '#27ae60', '#e8f8f0')}>
                          {d.userCount ?? 0}
                        </span>
                      </td>
                      <td>
                        <span style={countStyle(d.childCount ?? 0, '#6c5ce7', '#efedfc')}>
                          {d.childCount ?? 0}
                        </span>
                      </td>
                      <td>
                        <button
                          className="action-btn edit"
                          title="Chỉnh sửa"
                          onClick={() => handleEdit(d.id)}
                        >
                          &#9998;
                        </button>
                        <button
                          className="action-btn delete"
                          title="Xóa"
                          disabled={actionLoading}
                          onClick={() => {
                            clearActionError();
                            setDeleteTarget(d);
                          }}
                        >
                          &#128465;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        title="Xác nhận xóa"
        message={
          <>
            Bạn có chắc chắn muốn xóa phòng ban <strong>{deleteTarget?.name}</strong>?
            <br />
            {deleteTarget && (deleteTarget.userCount ?? 0) > 0 ? (
              <>
                <br />
                <span style={{ color: '#e74c3c' }}>
                  Cảnh báo: Phòng ban này hiện có {deleteTarget.userCount} người dùng được phân công.
                </span>
              </>
            ) : null}
            {deleteTarget && (deleteTarget.childCount ?? 0) > 0 ? (
              <>
                <br />
                <span style={{ color: '#e74c3c' }}>
                  Cảnh báo: Phòng ban này có {deleteTarget.childCount} phòng ban trực thuộc.
                </span>
              </>
            ) : null}
            {actionError ? (
              <>
                <br />
                <br />
                <span style={{ color: '#e74c3c' }}>{actionError}</span>
              </>
            ) : null}
            <br />
            Hành động này không thể hoàn tác.
          </>
        }
        confirmLabel="Xóa"
        variant="danger"
        loading={actionLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={closeDeleteModal}
      />
    </>
  );
}
