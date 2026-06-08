import React, { useState, useEffect } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { usersApi } from '../../../api';
import { useAuth } from '../../../contexts/AuthContext';
import type { User, PaginationParams, UserStatus } from '../../../types';

export default function UsersPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<{ id: number; action: 'lock' | 'unlock' } | null>(null);
  const [toggling, setToggling] = useState(false);

  const fetchUsers = async (params: PaginationParams) => {
    setLoading(true);
    try {
      const { data } = await usersApi.getAll({ ...params, page, limit });
      setUsers(data.data!.items);
      setTotal(data.data!.total);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    fetchUsers({ search, status: statusFilter || undefined });
  }, [page, search, statusFilter, isAdmin]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers({ search, status: statusFilter || undefined });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await usersApi.delete(deleteId);
      setDeleteId(null);
      fetchUsers({ search, status: statusFilter || undefined });
    } catch {
      // handled by interceptor
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleLock = async () => {
    if (!toggleTarget) return;
    setToggling(true);
    try {
      if (toggleTarget.action === 'lock') {
        await usersApi.lock(toggleTarget.id);
      } else {
        await usersApi.unlock(toggleTarget.id);
      }
      setToggleTarget(null);
      fetchUsers({ search, status: statusFilter || undefined });
    } catch {
      // handled by interceptor
    } finally {
      setToggling(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const getStatusClass = (status: string) => {
    if (status === 'ACTIVE') return 'active';
    if (status === 'LOCKED') return 'locked';
    return 'inactive';
  };

  if (!isAdmin) {
    return <Navigate to="/" replace />;
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
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Search by name, username, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #dfe6e9',
                  borderRadius: 6,
                  fontSize: 14,
                  width: 260,
                }}
              />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as UserStatus | '');
                  setPage(1);
                }}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #dfe6e9',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              >
                <option value="">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="LOCKED">Locked</option>
              </select>
              <button type="submit" className="btn btn-secondary">
                Search
              </button>
            </form>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {loading ? (
              <div className="loading-spinner">
                <div className="spinner" />
              </div>
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
                        <Link
                          to={`/admin/users/${user.id}`}
                          style={{ color: '#667eea', fontWeight: 500 }}
                        >
                          {user.username}
                        </Link>
                      </td>
                      <td>{user.fullName}</td>
                      <td>{user.email}</td>
                      <td>{user.phone || '—'}</td>
                      <td>
                        {user.roles.map((role: string) => (
                          <span key={role} className="role-badge">
                            {role}
                          </span>
                        ))}
                      </td>
                      <td>
                        <span className={`status-badge ${getStatusClass(user.status)}`}>
                          {user.status}
                        </span>
                      </td>
                      <td>
                        <button
                          className="action-btn edit"
                          title="Edit"
                          onClick={() => navigate(`/admin/users/${user.id}/edit`)}
                        >
                          ✏️
                        </button>
                        {user.status === 'LOCKED' ? (
                          <button
                            className="action-btn unlock"
                            title="Unlock Account"
                            onClick={() => setToggleTarget({ id: user.id, action: 'unlock' })}
                          >
                            🔓
                          </button>
                        ) : (
                          <button
                            className="action-btn lock"
                            title="Lock Account"
                            onClick={() => setToggleTarget({ id: user.id, action: 'lock' })}
                          >
                            🔒
                          </button>
                        )}
                        <button
                          className="action-btn delete"
                          title="Delete"
                          onClick={() => setDeleteId(user.id)}
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

          {totalPages > 1 && (
            <div className="pagination">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === '...' ? (
                    <span key={`ellipsis-${idx}`} style={{ padding: '6px 8px' }}>
                      ...
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={page === p ? 'active' : ''}
                    >
                      {p}
                    </button>
                  )
                )}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                Next
              </button>
            </div>
          )}
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
              <p>Are you sure you want to delete this user? This action cannot be undone.</p>
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

      {toggleTarget && (
        <div className="modal-overlay" onClick={() => setToggleTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{toggleTarget.action === 'lock' ? 'Lock Account' : 'Unlock Account'}</h2>
              <button className="modal-close" onClick={() => setToggleTarget(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>
                {toggleTarget.action === 'lock'
                  ? 'Are you sure you want to lock this account? The user will not be able to log in until it is unlocked.'
                  : 'Are you sure you want to unlock this account? The user will be able to log in again.'}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-cancel" onClick={() => setToggleTarget(null)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleToggleLock}
                disabled={toggling}
              >
                {toggling
                  ? toggleTarget.action === 'lock'
                    ? 'Locking...'
                    : 'Unlocking...'
                  : toggleTarget.action === 'lock'
                  ? 'Yes, Lock'
                  : 'Yes, Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
