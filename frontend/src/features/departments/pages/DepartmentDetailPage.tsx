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
    return <div className="page-content"><p>Truy cập bị từ chối.</p></div>;
  }

  if (loading) {
    return (
      <>
        <div className="top-bar">
          <h1>Thông tin phòng ban</h1>
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
        <h1>Thông tin phòng ban</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/admin/departments')}>
            Quay lại
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/admin/departments/${id}/edit`)}
          >
            Chỉnh sửa
          </button>
          <button className="btn btn-danger" onClick={() => setDeleteModal(true)}>
            Xóa
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
                <label>Tên phòng ban</label>
                <span>{department.name}</span>
              </div>
              <div className="detail-item">
                <label>Phòng ban cấp trên</label>
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
                <label>Mô tả</label>
                <span>{department.description || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Số thành viên</label>
                <span>{members.length}</span>
              </div>
              <div className="detail-item">
                <label>Phòng ban trực thuộc</label>
                <span>{department.childCount ?? 0}</span>
              </div>
              <div className="detail-item">
                <label>Ngày tạo</label>
                <span>{formatDate(department.createdAt)}</span>
              </div>
              <div className="detail-item">
                <label>Ngày cập nhật</label>
                <span>{formatDate(department.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>Thành viên ({members.length})</h2>
            <button
              className="btn btn-primary"
              onClick={() => {
                clearActionError();
                setAddMembersOpen(true);
              }}
            >
              + Thêm người dùng
            </button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {membersLoading ? (
              <LoadingSpinner />
            ) : members.length === 0 ? (
              <div className="empty-state">
                <h3>Chưa có thành viên</h3>
                <p>Nhấn "Thêm người dùng" để thêm thành viên vào phòng ban này.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tên đăng nhập</th>
                    <th>Họ và tên</th>
                    <th>Email</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                    <th>Ngày thêm</th>
                    <th>Thao tác</th>
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
                          title="Xóa khỏi phòng ban"
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
              <h2>Phòng ban trực thuộc ({department.children.length})</h2>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tên phòng ban</th>
                    <th>Thao tác</th>
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
                          Xem
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
        title="Xác nhận xóa"
        message={
          <>
            Bạn có chắc chắn muốn xóa phòng ban <strong>{department.name}</strong>?
            {members.length > 0 ? (
              <>
                <br />
                <br />
                <span style={{ color: '#e74c3c' }}>
                  Cảnh báo: Phòng ban này hiện có {members.length} thành viên.
                </span>
              </>
            ) : null}
            {(department.childCount ?? 0) > 0 ? (
              <>
                <br />
                <span style={{ color: '#e74c3c' }}>
                  Cảnh báo: Phòng ban này có {department.childCount} phòng ban trực thuộc.
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
            Hành động này không thể hoàn tác.
          </>
        }
        confirmLabel="Xóa"
        variant="danger"
        loading={actionLoading}
        onConfirm={handleDelete}
        onCancel={closeDeleteModal}
      />

      <ConfirmModal
        open={!!removeTarget}
        title="Xóa thành viên"
        message={
          <>
            Bạn có chắc chắn muốn xóa{' '}
            <strong>{removeTarget?.user.fullName}</strong> khỏi{' '}
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
        confirmLabel="Xóa"
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
