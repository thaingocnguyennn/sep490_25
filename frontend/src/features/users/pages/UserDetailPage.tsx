import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usersApi } from '../../../api';
import { useDepartmentActions } from '../../../shared/hooks';
import { useAuth } from '../../../contexts/AuthContext';
import { StatusBadge, RoleBadge, LoadingSpinner, ConfirmModal } from '../../../shared/components';
import type { User } from '../../../types';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removeDeptTarget, setRemoveDeptTarget] = useState<{
    departmentId: number;
    name: string;
  } | null>(null);

  const { removeMember, actionLoading, actionError, clearActionError } = useDepartmentActions();

  const loadUser = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await usersApi.getById(Number(id));
      setUser(data.data!);
    } catch {
      navigate('/admin/users');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    loadUser();
  }, [isAdmin, loadUser]);

  const handleDelete = async () => {
    try {
      await usersApi.delete(Number(id));
      navigate('/admin/users');
    } catch {
      setDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleRemoveDepartment = async () => {
    if (!removeDeptTarget) return;
    try {
      await removeMember(removeDeptTarget.departmentId, Number(id));
      setRemoveDeptTarget(null);
      await loadUser();
    } catch {
      // keep modal open
    }
  };

  const closeRemoveModal = () => {
    if (actionLoading) return;
    setRemoveDeptTarget(null);
    clearActionError();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('vi-VN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  };

  if (!isAdmin) {
    return <div className="page-content"><p>Truy cập bị từ chối.</p></div>;
  }

  if (loading) {
    return (
      <>
        <div className="top-bar"><h1>Thông tin người dùng</h1></div>
        <div className="page-content"><LoadingSpinner /></div>
      </>
    );
  }

  if (!user) return null;

  const memberships = user.departmentMemberships ?? [];

  return (
    <>
      <div className="top-bar">
        <h1>Thông tin người dùng</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/admin/users')}>Quay lại</button>
          <button className="btn btn-secondary" onClick={() => navigate(`/admin/users/${id}/edit`)}>Chỉnh sửa</button>
          <button className="btn btn-danger" onClick={() => setDeleteModal(true)}>Xóa</button>
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <h2>{user.fullName}</h2>
            <StatusBadge status={user.status} />
          </div>
          <div className="card-body">
            <div className="user-detail-grid">
              <div className="detail-item"><label>Tên đăng nhập</label><span>{user.username}</span></div>
              <div className="detail-item"><label>Email</label><span>{user.email}</span></div>
              <div className="detail-item"><label>Họ và tên</label><span>{user.fullName}</span></div>
              <div className="detail-item"><label>Số điện thoại</label><span>{user.phone || '—'}</span></div>
              <div className="detail-item">
                <label>Vai trò</label>
                <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {user.roles.map((role: string) => (
                    <RoleBadge key={role} name={role} />
                  ))}
                </span>
              </div>
              {user.department && (
                <div className="detail-item"><label>Phòng ban chính</label><span>{user.department.name}</span></div>
              )}
              {user.createdBy && (
                <div className="detail-item"><label>Người tạo</label><span>{user.createdBy.fullName}</span></div>
              )}
              <div className="detail-item"><label>Đăng nhập lần đầu</label><span>{user.isFirstLogin ? 'Có' : 'Không'}</span></div>
              <div className="detail-item"><label>Đăng nhập gần nhất</label><span>{formatDate(user.lastLogin)}</span></div>
              <div className="detail-item"><label>Ngày tạo</label><span>{formatDate(user.createdAt)}</span></div>
              <div className="detail-item"><label>Ngày cập nhật</label><span>{formatDate(user.updatedAt)}</span></div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>Thành viên phòng ban ({memberships.length})</h2>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {memberships.length === 0 ? (
              <div className="empty-state">
                <h3>Chưa có thành viên phòng ban</h3>
                <p>Người dùng này chưa thuộc phòng ban nào. Hãy thêm họ từ trang chi tiết của một phòng ban.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Phòng ban</th>
                    <th>Ngày thêm</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {memberships.map((m) => (
                    <tr key={m.departmentId}>
                      <td>
                        <a
                          onClick={() => navigate(`/admin/departments/${m.departmentId}`)}
                          style={{ cursor: 'pointer', color: '#667eea', fontWeight: 500 }}
                        >
                          {m.name}
                        </a>
                      </td>
                      <td style={{ color: '#636e72', fontSize: 13 }}>
                        {formatDate(m.assignedAt)}
                      </td>
                      <td>
                        <button
                          className="action-btn delete"
                          title="Xóa khỏi phòng ban"
                          disabled={actionLoading}
                          onClick={() => {
                            clearActionError();
                            setRemoveDeptTarget({
                              departmentId: m.departmentId,
                              name: m.name,
                            });
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
        open={deleteModal}
        title="Xác nhận xóa"
        message={
          <>
            Bạn có chắc chắn muốn xóa người dùng <strong>{user.username}</strong>?
            Hành động này không thể hoàn tác.
          </>
        }
        confirmLabel="Xóa"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal(false)}
      />

      <ConfirmModal
        open={!!removeDeptTarget}
        title="Xóa khỏi phòng ban"
        message={
          <>
            Bạn có chắc chắn muốn xóa <strong>{user.fullName}</strong> khỏi{' '}
            <strong>{removeDeptTarget?.name}</strong>?
            {actionError ? (
              <>
                <br />
                <br />
                <span style={{ color: '#e74c3c' }}>{actionError}</span>
              </>
            ) : null}
          </>
        }
        confirmLabel="Xóa"
        variant="warning"
        loading={actionLoading}
        onConfirm={handleRemoveDepartment}
        onCancel={closeRemoveModal}
      />
    </>
  );
}
