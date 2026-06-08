import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usersApi } from '../../../api';
import type { User } from '../../../types';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data } = await usersApi.getById(Number(id));
        setUser(data.data!);
      } catch {
        navigate('/users');
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, [id, navigate]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await usersApi.delete(Number(id));
      navigate('/users');
    } catch {
      setDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };

  const getStatusClass = (status: string) => {
    if (status === 'ACTIVE') return 'active';
    if (status === 'LOCKED') return 'locked';
    return 'inactive';
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <>
        <div className="top-bar"><h1>User Details</h1></div>
        <div className="page-content">
          <div className="loading-spinner"><div className="spinner" /></div>
        </div>
      </>
    );
  }

  if (!user) return null;

  return (
    <>
      <div className="top-bar">
        <h1>User Details</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/users')}>
            Back
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/users/${id}/edit`)}
          >
            Edit
          </button>
          <button className="btn btn-danger" onClick={() => setDeleteModal(true)}>
            Delete
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <h2>{user.fullName}</h2>
            <span className={`status-badge ${getStatusClass(user.status)}`}>
              {user.status}
            </span>
          </div>
          <div className="card-body">
            <div className="user-detail-grid">
              <div className="detail-item">
                <label>Username</label>
                <span>{user.username}</span>
              </div>
              <div className="detail-item">
                <label>Email</label>
                <span>{user.email}</span>
              </div>
              <div className="detail-item">
                <label>Full Name</label>
                <span>{user.fullName}</span>
              </div>
              <div className="detail-item">
                <label>Phone</label>
                <span>{user.phone || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Roles</label>
                <span>
                  {user.roles.map((role: string) => (
                    <span key={role} className="role-badge">
                      {role}
                    </span>
                  ))}
                </span>
              </div>
              <div className="detail-item">
                <label>First Login</label>
                <span>{user.isFirstLogin ? 'Yes' : 'No'}</span>
              </div>
              <div className="detail-item">
                <label>Last Login</label>
                <span>{formatDate(user.lastLogin)}</span>
              </div>
              <div className="detail-item">
                <label>Created At</label>
                <span>{formatDate(user.createdAt)}</span>
              </div>
              <div className="detail-item">
                <label>Updated At</label>
                <span>{formatDate(user.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {deleteModal && (
        <div className="modal-overlay" onClick={() => setDeleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm Delete</h2>
              <button className="modal-close" onClick={() => setDeleteModal(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to delete user <strong>{user.username}</strong>? This
                action cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-cancel" onClick={() => setDeleteModal(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
