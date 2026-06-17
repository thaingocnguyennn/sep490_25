import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDepartments, useDepartmentMembers, useDepartmentActions } from '../../../shared/hooks';
import { useAuth } from '../../../contexts/AuthContext';
import { LoadingSpinner, ConfirmModal, AddMembersModal, StatusBadge, RoleBadge } from '../../../shared/components';
import type { Department, DepartmentMember } from '../../../api';

export default function DepartmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { fetchById } = useDepartments({ autoFetch: false });
  const departmentId = id ? Number(id) : null;
  const {
    members,
    loading: membersLoading,
    refetch: refetchMembers,
  } = useDepartmentMembers(departmentId);

  const { deleteDepartment, addMembers, removeMember, actionLoading, actionError, clearActionError } =
    useDepartmentActions();

  const [department, setDepartment] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState(false);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<DepartmentMember | null>(null);

  const loadDepartment = useCallback(async () => {
    if (departmentId === null) return;
    try {
      const d = await fetchById(departmentId);
      setDepartment(d);
    } catch {
      navigate('/admin/departments');
    } finally {
      setLoading(false);
    }
  }, [departmentId, fetchById, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    loadDepartment();
  }, [isAdmin, loadDepartment]);

  const handleDelete = async () => {
    if (!department) return;
    try {
      await deleteDepartment(department.id);
      navigate('/admin/departments');
    } catch {
      // keep modal open so the user sees the error message
    }
  };

  const closeDeleteModal = () => {
    if (actionLoading) return;
    setDeleteModal(false);
    clearActionError();
  };

  const closeAddMembers = () => {
    if (actionLoading) return;
    setAddMembersOpen(false);
    clearActionError();
  };

  const handleAddMembers = async (userIds: number[]) => {
    if (departmentId === null) return;
    try {
      await addMembers(departmentId, userIds);
      await refetchMembers();
      await loadDepartment();
      setAddMembersOpen(false);
    } catch {
      // modal stays open so the error is visible
    }
  };

  const handleRemoveConfirm = async () => {
    if (!removeTarget || departmentId === null) return;
    try {
      await removeMember(departmentId, removeTarget.userId);
      await refetchMembers();
      await loadDepartment();
      setRemoveTarget(null);
    } catch {
      // keep modal open so the user sees the error message
    }
  };

  const closeRemoveModal = () => {
    if (actionLoading) return;
    setRemoveTarget(null);
    clearActionError();
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isAdmin) {
    return <div className="page-content"><p>Access denied.</p></div>;
  }

  if (loading) {
    return (
      <>
        <div className="top-bar">
          <h1>Department Details</h1>
        </div>
        <div className="page-content">
          <LoadingSpinner />
        </div>
      </>
    );
  }

  if (!department) return null;

  const existingMemberIds = members.map((m) => m.userId);

  return (
    <>
      <div className="top-bar">
        <h1>Department Details</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/admin/departments')}>
            Back
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/admin/departments/${id}/edit`)}
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
            <h2>{department.name}</h2>
          </div>
          <div className="card-body">
            <div className="user-detail-grid">
              <div className="detail-item">
                <label>Name</label>
                <span>{department.name}</span>
              </div>
              <div className="detail-item">
                <label>Parent</label>
                <span>
                  {department.parent ? (
                    <a
                      onClick={() => navigate(`/admin/departments/${department.parent!.id}`)}
                      style={{ cursor: 'pointer', color: '#667eea' }}
                    >
                      {department.parent.name}
                    </a>
                  ) : (
                    '—'
                  )}
                </span>
              </div>
              <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                <label>Description</label>
                <span>{department.description || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Members</label>
                <span>{members.length}</span>
              </div>
              <div className="detail-item">
                <label>Sub-departments</label>
                <span>{department.childCount ?? 0}</span>
              </div>
              <div className="detail-item">
                <label>Created At</label>
                <span>{formatDate(department.createdAt)}</span>
              </div>
              <div className="detail-item">
                <label>Updated At</label>
                <span>{formatDate(department.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>Members ({members.length})</h2>
            <button
              className="btn btn-primary"
              onClick={() => {
                clearActionError();
                setAddMembersOpen(true);
              }}
            >
              + Add User
            </button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {membersLoading ? (
              <LoadingSpinner />
            ) : members.length === 0 ? (
              <div className="empty-state">
                <h3>No members yet</h3>
                <p>Click "Add User" to add members to this department.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Full Name</th>
                    <th>Email</th>
                    <th>Roles</th>
                    <th>Status</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.userId}>
                      <td>
                        <a
                          onClick={() => navigate(`/admin/users/${m.userId}`)}
                          style={{ cursor: 'pointer', color: '#667eea', fontWeight: 500 }}
                        >
                          {m.user.username}
                        </a>
                      </td>
                      <td>{m.user.fullName}</td>
                      <td style={{ color: '#636e72' }}>{m.user.email}</td>
                      <td>
                        <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {m.user.roles.map((r) => (
                            <RoleBadge key={r} name={r} />
                          ))}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={m.user.status as 'ACTIVE' | 'INACTIVE' | 'LOCKED'} />
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
                            setRemoveTarget(m);
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

        {department.children && department.children.length > 0 && (
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header">
              <h2>Sub-departments ({department.children.length})</h2>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {department.children.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 12, padding: '4px 10px' }}
                          onClick={() => navigate(`/admin/departments/${c.id}`)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={deleteModal}
        title="Confirm Delete"
        message={
          <>
            Are you sure you want to delete department <strong>{department.name}</strong>?
            {members.length > 0 ? (
              <>
                <br />
                <br />
                <span style={{ color: '#e74c3c' }}>
                  Warning: This department has {members.length} member(s).
                </span>
              </>
            ) : null}
            {(department.childCount ?? 0) > 0 ? (
              <>
                <br />
                <span style={{ color: '#e74c3c' }}>
                  Warning: This department has {department.childCount} sub-department(s).
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
            This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        loading={actionLoading}
        onConfirm={handleDelete}
        onCancel={closeDeleteModal}
      />

      <ConfirmModal
        open={!!removeTarget}
        title="Remove Member"
        message={
          <>
            Are you sure you want to remove{' '}
            <strong>{removeTarget?.user.fullName}</strong> from{' '}
            <strong>{department.name}</strong>?
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
        onConfirm={handleRemoveConfirm}
        onCancel={closeRemoveModal}
      />

      <AddMembersModal
        open={addMembersOpen}
        departmentName={department.name}
        existingMemberIds={existingMemberIds}
        loading={actionLoading}
        error={actionError}
        onCancel={closeAddMembers}
        onConfirm={handleAddMembers}
      />
    </>
  );
}
