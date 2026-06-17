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
    return <div className="page-content"><p>Access denied.</p></div>;
  }

  if (loading) {
    return (
      <>
        <div className="top-bar"><h1>User Details</h1></div>
        <div className="page-content"><LoadingSpinner /></div>
      </>
    );
  }

  if (!user) return null;

  const memberships = user.departmentMemberships ?? [];

  return (
    <>
      <div className="top-bar">
        <h1>User Details</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/admin/users')}>Back</button>
          <button className="btn btn-secondary" onClick={() => navigate(`/admin/users/${id}/edit`)}>Edit</button>
          <button className="btn btn-danger" onClick={() => setDeleteModal(true)}>Delete</button>
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
              <div className="detail-item"><label>Username</label><span>{user.username}</span></div>
              <div className="detail-item"><label>Email</label><span>{user.email}</span></div>
              <div className="detail-item"><label>Full Name</label><span>{user.fullName}</span></div>
              <div className="detail-item"><label>Phone</label><span>{user.phone || '—'}</span></div>
              <div className="detail-item">
                <label>Roles</label>
                <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {user.roles.map((role: string) => (
                    <RoleBadge key={role} name={role} />
                  ))}
                </span>
              </div>
              {user.department && (
                <div className="detail-item"><label>Primary Department</label><span>{user.department.name}</span></div>
              )}
              {user.createdBy && (
                <div className="detail-item"><label>Created By</label><span>{user.createdBy.fullName}</span></div>
              )}
              <div className="detail-item"><label>First Login</label><span>{user.isFirstLogin ? 'Yes' : 'No'}</span></div>
              <div className="detail-item"><label>Last Login</label><span>{formatDate(user.lastLogin)}</span></div>
              <div className="detail-item"><label>Created At</label><span>{formatDate(user.createdAt)}</span></div>
              <div className="detail-item"><label>Updated At</label><span>{formatDate(user.updatedAt)}</span></div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>Department Memberships ({memberships.length})</h2>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {memberships.length === 0 ? (
              <div className="empty-state">
                <h3>No department memberships</h3>
                <p>This user does not belong to any department yet. Add them from a Department's detail page.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Added</th>
                    <th>Actions</th>
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
                          title="Remove from department"
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
        title="Confirm Delete"
        message={
          <>
            Are you sure you want to delete user <strong>{user.username}</strong>?
            This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal(false)}
      />

      <ConfirmModal
        open={!!removeDeptTarget}
        title="Remove from Department"
        message={
          <>
            Are you sure you want to remove <strong>{user.fullName}</strong> from{' '}
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
        confirmLabel="Remove"
        variant="warning"
        loading={actionLoading}
        onConfirm={handleRemoveDepartment}
        onCancel={closeRemoveModal}
      />
    </>
  );
}
