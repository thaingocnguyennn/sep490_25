import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDepartments, useDepartmentActions } from '../../../shared/hooks';
import { useAuth } from '../../../contexts/AuthContext';
import { LoadingSpinner, ConfirmModal } from '../../../shared/components';
import type { Department } from '../../../api';

export default function DepartmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { fetchById } = useDepartments({ autoFetch: false });
  const { deleteDepartment, actionLoading, actionError, clearActionError } =
    useDepartmentActions();

  const [department, setDepartment] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;

    const load = async () => {
      try {
        const d = await fetchById(Number(id));
        setDepartment(d);
      } catch {
        navigate('/admin/departments');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, isAdmin, navigate, fetchById]);

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
                <label>Users</label>
                <span>{department.userCount ?? 0}</span>
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
            {(department.userCount ?? 0) > 0 ? (
              <>
                <br />
                <br />
                <span style={{ color: '#e74c3c' }}>
                  Warning: This department has {department.userCount} user(s) assigned.
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
    </>
  );
}
