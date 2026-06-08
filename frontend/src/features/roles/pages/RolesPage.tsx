import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { rolesApi } from '../../../api';
import { useAuth } from '../../../contexts/AuthContext';
import type { Role } from '../../../types';

export default function RolesPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const { data } = await rolesApi.getAll();
      setRoles(data.data!);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetchRoles();
  }, [isAdmin]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await rolesApi.delete(deleteId);
      setDeleteId(null);
      fetchRoles();
    } catch {
      // handled by interceptor
    } finally {
      setDeleting(false);
    }
  };

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <div className="top-bar">
        <h1>Role Management</h1>
        <button className="btn btn-primary" onClick={() => navigate('/admin/roles/new')}>
          + Create Role
        </button>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {loading ? (
              <div className="loading-spinner">
                <div className="spinner" />
              </div>
            ) : roles.length === 0 ? (
              <div className="empty-state">
                <h3>No roles found</h3>
                <p>Create your first role to get started.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Role Name</th>
                    <th>Description</th>
                    <th>Users</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role, index) => (
                    <tr key={role.id}>
                      <td>{index + 1}</td>
                      <td>
                        <span className="role-badge">{role.name}</span>
                      </td>
                      <td style={{ color: '#636e72' }}>
                        {role.description || '—'}
                      </td>
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            background: (role.userCount ?? 0) > 0 ? '#e8f8f0' : '#f5f6fa',
                            color: (role.userCount ?? 0) > 0 ? '#27ae60' : '#636e72',
                          }}
                        >
                          {role.userCount ?? 0}
                        </span>
                      </td>
                      <td style={{ color: '#636e72', fontSize: 13 }}>
                        {role.createdAt ? new Date(role.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        <button
                          className="action-btn edit"
                          title="Edit"
                          onClick={() => navigate(`/admin/roles/${role.id}/edit`)}
                        >
                          ✏️
                        </button>
                        <button
                          className="action-btn delete"
                          title="Delete"
                          onClick={() => setDeleteId(role.id)}
                        >
                          🗑️
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

      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm Delete</h2>
              <button className="modal-close" onClick={() => setDeleteId(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete this role? This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-cancel" onClick={() => setDeleteId(null)}>
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
