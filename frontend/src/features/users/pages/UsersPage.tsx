import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUsers } from '../../../shared/hooks';
import { useUserActions } from '../../../shared/hooks';
import { StatusBadge, RoleBadge, LoadingSpinner, ConfirmModal } from '../../../shared/components';
import { useAuth } from '../../../contexts/AuthContext';
import type { UserStatus } from '../../../types';

export default function UsersPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { users, total, page, limit, loading, fetch, setPage } = useUsers({ pageSize: 10 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('');
  const [roleFilter, setRoleFilter] = useState('');

  const [toggleTarget, setToggleTarget] = useState<{ id: number; action: 'lock' | 'unlock' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; username: string } | null>(null);

  const handleSuccess = () => fetch({ search, status: statusFilter, role: roleFilter });
  const { lockUser, unlockUser, deleteUser, actionLoading } = useUserActions(handleSuccess);

  useEffect(() => {
    fetch({ search, status: statusFilter, role: roleFilter });
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetch({ search, status: statusFilter, role: roleFilter });
  };

  const handleToggleConfirm = async () => {
    if (!toggleTarget) return;
    if (toggleTarget.action === 'lock') {
      await lockUser(toggleTarget.id);
    } else {
      await unlockUser(toggleTarget.id);
    }
    setToggleTarget(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteUser(deleteTarget.id);
    setDeleteTarget(null);
  };

  const totalPages = Math.ceil(total / limit);

  if (!isAdmin) {
    return <div className="page-content"><p>Truy cập bị từ chối.</p></div>;
  }

  return (
    <>
      <div className="top-bar">
        <h1>Quản lý người dùng</h1>
        <button className="btn btn-primary" onClick={() => navigate('/admin/users/new')}>
          + Tạo người dùng
        </button>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <h2>Tất cả người dùng ({total})</h2>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Tìm kiếm theo tên, tên đăng nhập, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14, width: 260 }}
              />
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as UserStatus | ''); setPage(1); }}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14 }}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="ACTIVE">Hoạt động</option>
                <option value="INACTIVE">Không hoạt động</option>
                <option value="LOCKED">Bị khóa</option>
              </select>
              <select
                value={roleFilter}
                onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14 }}
              >
                <option value="">Tất cả vai trò</option>
                <option value="ADMIN">ADMIN</option>
                <option value="DEPARTMENT_HEAD">DEPARTMENT_HEAD</option>
                <option value="SPECIALIST">SPECIALIST</option>
                <option value="DOCUMENT_CLERK">DOCUMENT_CLERK</option>
              </select>
              <button type="submit" className="btn btn-secondary">Tìm kiếm</button>
            </form>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {loading ? (
              <LoadingSpinner />
            ) : users.length === 0 ? (
              <div className="empty-state">
                <h3>Không tìm thấy người dùng</h3>
                <p>Hãy điều chỉnh tiêu chí tìm kiếm hoặc bộ lọc của bạn.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Tên đăng nhập</th>
                    <th>Họ và tên</th>
                    <th>Email</th>
                    <th>Số điện thoại</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, index) => (
                    <tr key={user.id}>
                      <td>{(page - 1) * limit + index + 1}</td>
                      <td>
                        <Link to={`/admin/users/${user.id}`} style={{ color: '#667eea', fontWeight: 500 }}>
                          {user.username}
                        </Link>
                      </td>
                      <td>{user.fullName}</td>
                      <td>{user.email}</td>
                      <td>{user.phone || '—'}</td>
                      <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {user.roles.map((role: string) => (
                          <RoleBadge key={role} name={role} />
                        ))}
                      </td>
                      <td><StatusBadge status={user.status} /></td>
                      <td>
                        <button
                          className="action-btn edit"
                          title="Chỉnh sửa"
                          onClick={() => navigate(`/admin/users/${user.id}/edit`)}
                        >
                          &#9998;
                        </button>
                        {user.status === 'LOCKED' ? (
                          <button
                            className="action-btn unlock"
                            title="Mở khóa tài khoản"
                            disabled={actionLoading}
                            onClick={() => setToggleTarget({ id: user.id, action: 'unlock' })}
                          >
                            &#128272;
                          </button>
                        ) : (
                          <button
                            className="action-btn lock"
                            title="Khóa tài khoản"
                            disabled={actionLoading}
                            onClick={() => setToggleTarget({ id: user.id, action: 'lock' })}
                          >
                            &#128274;
                          </button>
                        )}
                        <button
                          className="action-btn delete"
                          title="Xóa"
                          disabled={actionLoading}
                          onClick={() => setDeleteTarget({ id: user.id, username: user.username })}
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

          {totalPages > 1 && (
            <div className="pagination">
              <button onClick={() => setPage(page - 1)} disabled={page === 1}>Trước</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | string)[]>((acc, p, idx, arr) => {
                  if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === '...' ? (
                    <span key={`ellipsis-${idx}`} style={{ padding: '6px 8px' }}>...</span>
                  ) : (
                    <button key={p} onClick={() => setPage(p as number)} className={page === p ? 'active' : ''}>
                      {p}
                    </button>
                  )
                )}
              <button onClick={() => setPage(page + 1)} disabled={page === totalPages}>Sau</button>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={!!toggleTarget}
        title={toggleTarget?.action === 'lock' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
        message={
          toggleTarget?.action === 'lock'
            ? 'Bạn có chắc chắn muốn khóa tài khoản này? Người dùng sẽ không thể đăng nhập cho đến khi được mở khóa.'
            : 'Bạn có chắc chắn muốn mở khóa tài khoản này? Người dùng sẽ có thể đăng nhập lại.'
        }
        confirmLabel={toggleTarget?.action === 'lock' ? 'Đồng ý, Khóa' : 'Đồng ý, Mở khóa'}
        variant="warning"
        loading={actionLoading}
        onConfirm={handleToggleConfirm}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Xác nhận xóa"
        message={
          <>
            Bạn có chắc chắn muốn xóa người dùng <strong>{deleteTarget?.username}</strong>?
            Hành động này không thể hoàn tác.
          </>
        }
        confirmLabel="Xóa"
        variant="danger"
        loading={actionLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
