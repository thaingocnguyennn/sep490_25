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
    return <div className="page-content"><p>Access denied.</p></div>;
  }

  return (
    <>
      <div className="top-bar">
        <h1>User Management</h1>
        <button className="btn btn-primary" onClick={() => navigate('/admin/users/new')}>
          + Create User
        </button>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <h2>All Users ({total})</h2>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search by name, username, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14, width: 260 }}
              />
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as UserStatus | ''); setPage(1); }}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14 }}
              >
                <option value="">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="LOCKED">Locked</option>
              </select>
              <select
                value={roleFilter}
                onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
                style={{ padding: '6px 12px', border: '1px solid #dfe6e9', borderRadius: 6, fontSize: 14 }}
              >
                <option value="">All Roles</option>
                <option value="ADMIN">ADMIN</option>
                <option value="DEPARTMENT_HEAD">DEPARTMENT_HEAD</option>
                <option value="SPECIALIST">SPECIALIST</option>
                <option value="DOCUMENT_CLERK">DOCUMENT_CLERK</option>
              </select>
              <button type="submit" className="btn btn-secondary">Search</button>
            </form>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {loading ? (
              <LoadingSpinner />
            ) : users.length === 0 ? (
              <div className="empty-state">
                <h3>No users found</h3>
                <p>Try adjusting your search or filter criteria.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Username</th>
                    <th>Full Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Roles</th>
                    <th>Status</th>
                    <th>Actions</th>
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
                          title="Edit"
                          onClick={() => navigate(`/admin/users/${user.id}/edit`)}
                        >
                          &#9998;
                        </button>
                        {user.status === 'LOCKED' ? (
                          <button
                            className="action-btn unlock"
                            title="Unlock Account"
                            disabled={actionLoading}
                            onClick={() => setToggleTarget({ id: user.id, action: 'unlock' })}
                          >
                            &#128272;
                          </button>
                        ) : (
                          <button
                            className="action-btn lock"
                            title="Lock Account"
                            disabled={actionLoading}
                            onClick={() => setToggleTarget({ id: user.id, action: 'lock' })}
                          >
                            &#128274;
                          </button>
                        )}
                        <button
                          className="action-btn delete"
                          title="Delete"
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
              <button onClick={() => setPage(page - 1)} disabled={page === 1}>Previous</button>
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
              <button onClick={() => setPage(page + 1)} disabled={page === totalPages}>Next</button>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={!!toggleTarget}
        title={toggleTarget?.action === 'lock' ? 'Lock Account' : 'Unlock Account'}
        message={
          toggleTarget?.action === 'lock'
            ? 'Are you sure you want to lock this account? The user will not be able to log in until unlocked.'
            : 'Are you sure you want to unlock this account? The user will be able to log in again.'
        }
        confirmLabel={toggleTarget?.action === 'lock' ? 'Yes, Lock' : 'Yes, Unlock'}
        variant="warning"
        loading={actionLoading}
        onConfirm={handleToggleConfirm}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Confirm Delete"
        message={
          <>
            Are you sure you want to delete user <strong>{deleteTarget?.username}</strong>?
            This action cannot be undone.
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
