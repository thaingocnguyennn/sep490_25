import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usersApi } from '../../../api';
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

  useEffect(() => {
    if (!isAdmin) return;

    const loadUser = async () => {
      try {
        const { data } = await usersApi.getById(Number(id));
        setUser(data.data!);
      } catch {
        navigate('/admin/users');
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, [id, isAdmin, navigate]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await usersApi.delete(Number(id));
      navigate('/admin/users');
    } catch {
      setDeleteModal(false);
    } finally {
      setDeleting(false);
    }
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
                <div className="detail-item"><label>Department</label><span>{user.department.name}</span></div>
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
    </>
  );
}
