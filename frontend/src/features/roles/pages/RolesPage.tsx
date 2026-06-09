import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoles } from '../../../shared/hooks';
import { useRoleActions } from '../../../shared/hooks';
import { LoadingSpinner, ConfirmModal } from '../../../shared/components';
import { useAuth } from '../../../contexts/AuthContext';

export default function RolesPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { roles, loading, refetch } = useRoles();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const { deleteRole, actionLoading } = useRoleActions(refetch);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteRole(deleteTarget.id);
    setDeleteTarget(null);
  };

  if (!isAdmin) {
    return <div className="page-content"><p>Access denied.</p></div>;
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
              <LoadingSpinner />
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
                      <td style={{ color: '#636e72' }}>{role.description || '—'}</td>
                      <td>
                        <span
                          style={{
                            background: (role.userCount ?? 0) > 0 ? '#e8f8f0' : '#f5f6fa',
                            color: (role.userCount ?? 0) > 0 ? '#27ae60' : '#636e72',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 13,
                            fontWeight: 500,
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
                          &#9998;
                        </button>
                        <button
                          className="action-btn delete"
                          title="Delete"
                          disabled={actionLoading}
                          onClick={() => setDeleteTarget({ id: role.id, name: role.name })}
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
        title="Confirm Delete"
        message={
          <>
            Are you sure you want to delete role <strong>{deleteTarget?.name}</strong>?
            {deleteTarget ? (
              (() => {
                const targetRole = roles.find((r) => r.id === deleteTarget.id);
                const count = targetRole?.userCount ?? 0;
                return count > 0 ? (
                  <><br /><br />
                    <span style={{ color: '#e74c3c' }}>
                      Warning: This role is assigned to {count} user(s).
                      Deleting will remove all user-role assignments.
                    </span>
                  </>
                ) : null;
              })()
            ) : null}
            <br />This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        loading={actionLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
