import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usersApi } from '../../../api';
import { LoadingSpinner } from '..';
import type { User } from '../../../types';

interface AddMembersModalProps {
  open: boolean;
  departmentName: string;
  /** IDs of users that are already members and should be shown as pre-checked / disabled */
  existingMemberIds: number[];
  onCancel: () => void;
  onConfirm: (userIds: number[]) => Promise<void> | void;
  loading?: boolean;
  error?: string;
}

const PAGE_SIZE = 50;

export function AddMembersModal({
  open,
  departmentName,
  existingMemberIds,
  onCancel,
  onConfirm,
  loading = false,
  error = '',
}: AddMembersModalProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [usersLoading, setUsersLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [fetchError, setFetchError] = useState('');

  const existingSet = useMemo(() => new Set(existingMemberIds), [existingMemberIds]);

  const fetchUsers = useCallback(
    (pageToLoad: number, searchTerm: string, status: string) => {
      setUsersLoading(true);
      setFetchError('');
      usersApi
        .getAll({
          page: pageToLoad,
          limit: PAGE_SIZE,
          search: searchTerm || undefined,
          status: (status as User['status']) || undefined,
        })
        .then(({ data }) => {
          setUsers(data.data?.items ?? []);
          setTotal(data.data?.total ?? 0);
        })
        .catch(() => setFetchError('Tải danh sách người dùng thất bại'))
        .finally(() => setUsersLoading(false));
    },
    []
  );

  useEffect(() => {
    if (open) {
      setPage(1);
      setSearch('');
      setStatusFilter('');
      setSelected(new Set());
      fetchUsers(1, '', '');
    }
  }, [open, fetchUsers]);

  useEffect(() => {
    if (!open) return;
    fetchUsers(page, search, statusFilter);
  }, [open, page, search, statusFilter, fetchUsers]);

  const toggleUser = (user: User) => {
    if (existingSet.has(user.id)) return; // cannot deselect existing members
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(user.id)) next.delete(user.id);
      else next.add(user.id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = users.filter((u) => !existingSet.has(u.id));
    const allSelected = selectable.every((u) => selected.has(u.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const u of selectable) next.delete(u.id);
      } else {
        for (const u of selectable) next.add(u.id);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) return;
    await onConfirm(Array.from(selected));
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectableUsers = users.filter((u) => !existingSet.has(u.id));
  const allOnPageSelected =
    selectableUsers.length > 0 && selectableUsers.every((u) => selected.has(u.id));

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720, width: '95%' }}
      >
        <div className="modal-header">
          <h2>Thêm thành viên vào {departmentName}</h2>
          <button className="modal-close" onClick={onCancel} disabled={loading}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
            }}
            style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}
          >
            <input
              type="text"
              placeholder="Tìm kiếm theo tên, tên đăng nhập, email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{
                flex: 1,
                minWidth: 200,
                padding: '8px 12px',
                border: '1px solid #dfe6e9',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '8px 12px',
                border: '1px solid #dfe6e9',
                borderRadius: 6,
                fontSize: 14,
                background: 'white',
              }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="ACTIVE">Hoạt động</option>
              <option value="INACTIVE">Không hoạt động</option>
              <option value="LOCKED">Bị khóa</option>
            </select>
          </form>

          {fetchError && (
            <div className="alert alert-error" style={{ marginBottom: 8 }}>
              {fetchError}
            </div>
          )}

          {usersLoading ? (
            <LoadingSpinner />
          ) : users.length === 0 ? (
            <div className="empty-state">
              <h3>Không tìm thấy người dùng</h3>
              <p>Hãy điều chỉnh tiêu chí tìm kiếm hoặc bộ lọc của bạn.</p>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    color: '#636e72',
                    cursor: selectableUsers.length > 0 ? 'pointer' : 'not-allowed',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    disabled={selectableUsers.length === 0}
                    onChange={toggleSelectAll}
                  />
                  Chọn tất cả trong trang này ({selectableUsers.length} có thể chọn)
                </label>
                <span style={{ fontSize: 13, color: '#636e72' }}>
                  Đã chọn {selected.size}
                </span>
              </div>

              <div
                style={{
                  maxHeight: 360,
                  overflowY: 'auto',
                  border: '1px solid #dfe6e9',
                  borderRadius: 6,
                }}
              >
                <table className="data-table" style={{ marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}></th>
                      <th>Tên đăng nhập</th>
                      <th>Họ và tên</th>
                      <th>Email</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const isExisting = existingSet.has(u.id);
                      const isSelected = selected.has(u.id);
                      return (
                        <tr
                          key={u.id}
                          onClick={() => !isExisting && toggleUser(u)}
                          style={{
                            cursor: isExisting ? 'not-allowed' : 'pointer',
                            background: isExisting ? '#f8f9fa' : undefined,
                          }}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isExisting || isSelected}
                              disabled={isExisting}
                              onChange={() => toggleUser(u)}
                            />
                          </td>
                          <td>
                            {u.username}
                            {isExisting && (
                              <span
                                style={{
                                  marginLeft: 6,
                                  fontSize: 11,
                                  padding: '1px 6px',
                                  borderRadius: 3,
                                  background: '#dfe6e9',
                                  color: '#636e72',
                                }}
                              >
                                thành viên
                              </span>
                            )}
                          </td>
                          <td>{u.fullName}</td>
                          <td>{u.email}</td>
                          <td style={{ fontSize: 12, color: '#636e72' }}>{u.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="pagination" style={{ marginTop: 12 }}>
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                    Trước
                  </button>
                  <span style={{ padding: '6px 8px', fontSize: 13 }}>
                    Trang {page} / {totalPages} ({total} người dùng)
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Sau
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-cancel" onClick={onCancel} disabled={loading}>
            Hủy
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading || selected.size === 0}
          >
            {loading ? 'Đang thêm...' : `Thêm ${selected.size} thành viên`}
          </button>
        </div>
      </div>
    </div>
  );
}
