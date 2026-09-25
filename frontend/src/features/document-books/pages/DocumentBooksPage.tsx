import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentBooks, useDocumentBookActions } from '../../../shared/hooks';
import { LoadingSpinner, ConfirmModal } from '../../../shared/components';
import { useAuth } from '../../../contexts/AuthContext';
import { DocumentBookFormModal } from '../components/DocumentBookFormModal';
import { DocumentBook } from '../../../api/modules/document-books';

export function DocumentBooksPage() {
  const { isDocumentClerk, isAdmin } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [bookType, setBookType] = useState<string>('');
  const [year, setYear] = useState<number | undefined>(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState<string>('');

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear + 1; y >= currentYear - 5; y--) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  const { data: books, total, totalPages, loading, refresh } = useDocumentBooks({
    page,
    limit: 10,
    search: search.trim() || undefined,
    bookType: bookType || undefined,
    year: year || undefined,
    status: statusFilter || undefined,
  });

  const { deleteBook, closeBook, reopenBook } = useDocumentBookActions();

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState<DocumentBook | undefined>(undefined);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<DocumentBook | null>(null);

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [bookToToggle, setBookToToggle] = useState<DocumentBook | null>(null);

  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const canManage = isDocumentClerk || isAdmin;

  const handleEdit = (book: DocumentBook) => {
    setSelectedBook(book);
    setFormModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedBook(undefined);
    setFormModalOpen(true);
  };

  const handleDeleteClick = (book: DocumentBook) => {
    setBookToDelete(book);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!bookToDelete) return;
    try {
      await deleteBook(bookToDelete.id);
      setFeedbackMsg({ type: 'success', text: `Đã xóa sổ "${bookToDelete.name}" thành công.` });
      setDeleteModalOpen(false);
      setBookToDelete(null);
      refresh();
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err.response?.data?.message || 'Lỗi khi xóa sổ văn bản',
      });
      setDeleteModalOpen(false);
    }
  };

  const handleToggleClick = (book: DocumentBook) => {
    setBookToToggle(book);
    setStatusModalOpen(true);
  };

  const confirmToggleStatus = async () => {
    if (!bookToToggle) return;
    try {
      if (bookToToggle.status === 'ACTIVE') {
        await closeBook(bookToToggle.id);
        setFeedbackMsg({ type: 'success', text: `Đã đóng sổ "${bookToToggle.name}".` });
      } else if (bookToToggle.status === 'CLOSED') {
        await reopenBook(bookToToggle.id);
        setFeedbackMsg({ type: 'success', text: `Đã mở lại sổ "${bookToToggle.name}".` });
      }
      setStatusModalOpen(false);
      setBookToToggle(null);
      refresh();
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err.response?.data?.message || 'Lỗi khi thay đổi trạng thái sổ',
      });
      setStatusModalOpen(false);
    }
  };

  return (
    <>
      <div className="top-bar">
        <h1>Quản lý Sổ văn bản</h1>
        {canManage && (
          <button className="btn btn-primary" onClick={handleCreate}>
            + Thêm Sổ mới
          </button>
        )}
      </div>

      <div className="page-content">
        {feedbackMsg && (
          <div
            className={`alert ${feedbackMsg.type === 'success' ? 'alert-success' : 'alert-error'}`}
            style={{
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{feedbackMsg.text}</span>
            <button
              onClick={() => setFeedbackMsg(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
            >
              &times;
            </button>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h2>Tất cả Sổ văn bản ({total})</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Tìm theo tên hoặc mã sổ..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #dfe6e9',
                  borderRadius: 6,
                  fontSize: 14,
                  minWidth: 220,
                }}
              />
              <select
                value={bookType}
                onChange={(e) => {
                  setBookType(e.target.value);
                  setPage(1);
                }}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #dfe6e9',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              >
                <option value="">Tất cả loại sổ</option>
                <option value="INCOMING">Sổ văn bản đến</option>
                <option value="OUTGOING">Sổ văn bản đi</option>
              </select>
              <select
                value={year ?? ''}
                onChange={(e) => {
                  setYear(e.target.value ? Number(e.target.value) : undefined);
                  setPage(1);
                }}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #dfe6e9',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              >
                <option value="">Tất cả các năm</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    Năm {y}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #dfe6e9',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang mở (ACTIVE)</option>
                <option value="CLOSED">Đã đóng (CLOSED)</option>
                <option value="INACTIVE">Ngừng hoạt động</option>
              </select>
            </div>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {loading ? (
              <LoadingSpinner />
            ) : books.length === 0 ? (
              <div className="empty-state" style={{ padding: 48, textAlign: 'center' }}>
                <p style={{ color: '#636e72', margin: 0 }}>Không tìm thấy sổ văn bản nào phù hợp.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tên sổ</th>
                      <th>Mã sổ</th>
                      <th>Loại sổ</th>
                      <th>Năm</th>
                      <th style={{ textAlign: 'center' }}>Số hiện tại</th>
                      <th style={{ textAlign: 'center' }}>Trạng thái</th>
                      <th style={{ textAlign: 'center' }}>Mặc định</th>
                      {canManage && <th style={{ width: 140, textAlign: 'right' }}>Thao tác</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {books.map((book) => (
                      <tr key={book.id}>
                        <td>
                          <Link
                            to={`/document-books/${book.id}`}
                            style={{ color: '#0984e3', textDecoration: 'none', fontWeight: 600 }}
                          >
                            {book.name}
                          </Link>
                          {book.department?.name && (
                            <div style={{ fontSize: 12, color: '#636e72', marginTop: 2 }}>
                              {book.department.name}
                            </div>
                          )}
                        </td>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            {book.code || '—'}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              book.bookType === 'INCOMING' ? 'badge-type' : 'badge-primary'
                            }`}
                            style={
                              book.bookType === 'INCOMING'
                                ? { background: '#e3f2fd', color: '#1976d2' }
                                : { background: '#e8f8f0', color: '#27ae60' }
                            }
                          >
                            {book.bookType === 'INCOMING' ? 'Văn bản đến' : 'Văn bản đi'}
                          </span>
                        </td>
                        <td>{book.year}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: '#2d3436' }}>
                            {book.currentNumber}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className={`status-badge ${
                              book.status === 'ACTIVE'
                                ? 'status-active'
                                : book.status === 'CLOSED'
                                ? 'status-pending'
                                : 'status-inactive'
                            }`}
                          >
                            {book.status === 'ACTIVE'
                              ? 'Đang mở'
                              : book.status === 'CLOSED'
                              ? 'Đã đóng'
                              : 'Ngừng HĐ'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {book.isDefault ? (
                            <span
                              style={{
                                padding: '2px 8px',
                                background: '#e8f8f0',
                                color: '#27ae60',
                                borderRadius: 12,
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              Mặc định
                            </span>
                          ) : (
                            <span style={{ color: '#b2bec3' }}>—</span>
                          )}
                        </td>
                        {canManage && (
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <Link
                                to={`/document-books/${book.id}`}
                                className="action-btn view"
                                title="Xem chi tiết sổ"
                              >
                                &#128065;
                              </Link>

                              {book.status === 'ACTIVE' && (
                                <button
                                  className="action-btn edit"
                                  title="Chỉnh sửa thông tin sổ"
                                  onClick={() => handleEdit(book)}
                                >
                                  &#9998;
                                </button>
                              )}

                              {book.status !== 'INACTIVE' && (
                                <button
                                  className={`action-btn ${book.status === 'ACTIVE' ? 'lock' : 'unlock'}`}
                                  title={book.status === 'ACTIVE' ? 'Đóng sổ' : 'Mở lại sổ'}
                                  onClick={() => handleToggleClick(book)}
                                >
                                  {book.status === 'ACTIVE' ? '🔒' : '🔓'}
                                </button>
                              )}

                              <button
                                className="action-btn delete"
                                title={
                                  book.isDefault
                                    ? 'Không thể xóa sổ mặc định'
                                    : book.status === 'CLOSED'
                                    ? 'Không thể xóa sổ đã đóng'
                                    : book.status === 'INACTIVE'
                                    ? 'Sổ đã ngừng hoạt động'
                                    : 'Xóa sổ'
                                }
                                disabled={
                                  book.status === 'CLOSED' ||
                                  book.status === 'INACTIVE' ||
                                  book.isDefault
                                }
                                onClick={() => handleDeleteClick(book)}
                                style={
                                  book.status === 'CLOSED' ||
                                  book.status === 'INACTIVE' ||
                                  book.isDefault
                                    ? { opacity: 0.35, cursor: 'not-allowed' }
                                    : undefined
                                }
                              >
                                &#128465;
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                Trước
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | string)[]>((acc, p, idx, arr) => {
                  if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === '...' ? (
                    <span key={`dots-${idx}`} className="dots">
                      ...
                    </span>
                  ) : (
                    <button
                      key={p}
                      className={page === p ? 'active' : ''}
                      onClick={() => setPage(p as number)}
                    >
                      {p}
                    </button>
                  ),
                )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Sau
              </button>
            </div>
          )}
        </div>
      </div>

      {formModalOpen && (
        <DocumentBookFormModal
          book={selectedBook}
          onClose={() => setFormModalOpen(false)}
          onSuccess={() => {
            setFormModalOpen(false);
            setFeedbackMsg({
              type: 'success',
              text: selectedBook ? 'Cập nhật sổ văn bản thành công.' : 'Tạo sổ văn bản mới thành công.',
            });
            refresh();
          }}
        />
      )}

      <ConfirmModal
        open={deleteModalOpen}
        title="Xác nhận xóa / ngừng sổ"
        message={
          bookToDelete &&
          ((bookToDelete._count?.incomingEntries || 0) > 0 ||
            (bookToDelete._count?.outgoingEntries || 0) > 0)
            ? `Sổ văn bản "${bookToDelete.name}" đã có dữ liệu văn bản. Sổ sẽ được chuyển sang trạng thái Ngừng hoạt động để bảo toàn lịch sử dữ liệu. Bạn có chắc chắn?`
            : `Bạn có chắc chắn muốn xóa sổ văn bản "${bookToDelete?.name}"? Sổ chưa có dữ liệu nên sẽ bị xóa hoàn toàn.`
        }
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteModalOpen(false);
          setBookToDelete(null);
        }}
      />

      <ConfirmModal
        open={statusModalOpen}
        title={bookToToggle?.status === 'ACTIVE' ? 'Xác nhận đóng sổ' : 'Xác nhận mở lại sổ'}
        message={
          bookToToggle?.status === 'ACTIVE'
            ? `Bạn có chắc chắn muốn đóng sổ "${bookToToggle?.name}"? Sau khi đóng, sẽ không thể cấp số văn bản mới từ sổ này.`
            : `Bạn có chắc chắn muốn mở lại sổ "${bookToToggle?.name}" để tiếp tục sử dụng cấp số?`
        }
        onConfirm={confirmToggleStatus}
        onCancel={() => {
          setStatusModalOpen(false);
          setBookToToggle(null);
        }}
      />
    </>
  );
}
