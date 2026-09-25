import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  documentBooksApi,
  DocumentBook,
  IncomingBookEntryItem,
  OutgoingBookEntryItem,
} from '../../../api/modules/document-books';
import { useDocumentBookActions } from '../../../shared/hooks';
import { useAuth } from '../../../contexts/AuthContext';
import { LoadingSpinner, ConfirmModal } from '../../../shared/components';
import { DocumentBookFormModal } from '../components/DocumentBookFormModal';

function formatDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
}

function urgencyLabel(name?: string | null) {
  const map: Record<string, string> = {
    HOA_TOC: 'Hỏa tốc',
    THUONG_KHAN: 'Thượng khẩn',
    KHAN: 'Khẩn',
    THUONG: 'Thường',
  };
  return name ? map[name] ?? name : '—';
}

export function DocumentBookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDocumentClerk, isAdmin } = useAuth();
  const canManage = isDocumentClerk || isAdmin;

  const bookId = parseInt(id ?? '0', 10);

  const [book, setBook] = useState<DocumentBook | null>(null);
  const [loadingBook, setLoadingBook] = useState(true);

  const [entries, setEntries] = useState<(IncomingBookEntryItem | OutgoingBookEntryItem)[]>([]);
  const [entriesTotal, setEntriesTotal] = useState(0);
  const [entriesTotalPages, setEntriesTotalPages] = useState(1);
  const [entriesPage, setEntriesPage] = useState(1);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { closeBook, reopenBook, deleteBook, loading: actionLoading } = useDocumentBookActions();

  const loadBook = useCallback(async () => {
    if (!bookId) return;
    setLoadingBook(true);
    try {
      const data = await documentBooksApi.getById(bookId);
      setBook(data);
    } catch {
      navigate('/document-books');
    } finally {
      setLoadingBook(false);
    }
  }, [bookId, navigate]);

  const loadEntries = useCallback(
    async (page: number) => {
      if (!bookId) return;
      setLoadingEntries(true);
      try {
        const data = await documentBooksApi.getEntries(bookId, { page, limit: 15 });
        setEntries(data.items);
        setEntriesTotal(data.total);
        setEntriesTotalPages(data.totalPages);
      } catch {
        setEntries([]);
      } finally {
        setLoadingEntries(false);
      }
    },
    [bookId],
  );

  useEffect(() => {
    loadBook();
  }, [loadBook]);

  useEffect(() => {
    loadEntries(entriesPage);
  }, [loadEntries, entriesPage]);

  const handleClose = async () => {
    if (!book) return;
    try {
      await closeBook(book.id);
      setConfirmClose(false);
      loadBook();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi khi đóng sổ');
    }
  };

  const handleReopen = async () => {
    if (!book) return;
    try {
      await reopenBook(book.id);
      setConfirmReopen(false);
      loadBook();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi khi mở lại sổ');
    }
  };

  const handleDelete = async () => {
    if (!book) return;
    try {
      const result = await deleteBook(book.id);
      setConfirmDelete(false);
      if (result?.data?.deletedAt) {
        navigate('/document-books');
      } else {
        loadBook();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi khi xóa sổ');
    }
  };

  if (loadingBook) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <LoadingSpinner />
      </div>
    );
  }

  if (!book) return null;

  const totalEntries = (book._count?.incomingEntries ?? 0) + (book._count?.outgoingEntries ?? 0);
  const isIncoming = book.bookType === 'INCOMING';

  const deleteConfirmMsg =
    totalEntries > 0
      ? `Sổ "${book.name}" đã có ${totalEntries} văn bản. Sổ sẽ được chuyển sang trạng thái Ngừng hoạt động (dữ liệu đã vào sổ vẫn được bảo lưu). Bạn có chắc chắn?`
      : `Xác nhận xóa sổ "${book.name}"? Sổ chưa có văn bản nên sẽ bị xóa hoàn toàn khỏi hệ thống.`;

  return (
    <>
      {/* Top Bar */}
      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/document-books')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            &larr; Danh sách sổ
          </button>
          <h1 style={{ margin: 0 }}>{book.name}</h1>
          <span
            className={`status-badge ${
              book.status === 'ACTIVE'
                ? 'status-active'
                : book.status === 'CLOSED'
                ? 'status-pending'
                : 'status-inactive'
            }`}
          >
            {book.status === 'ACTIVE' ? 'Đang mở' : book.status === 'CLOSED' ? 'Đã đóng' : 'Ngừng HĐ'}
          </span>
          {book.isDefault && (
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
          )}
        </div>

        {canManage && (
          <div style={{ display: 'flex', gap: 8 }}>
            {book.status === 'ACTIVE' && (
              <>
                <button className="btn btn-secondary" onClick={() => setEditModalOpen(true)}>
                  Chỉnh sửa
                </button>
                <button className="btn btn-secondary" onClick={() => setConfirmClose(true)}>
                  Đóng sổ
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => setConfirmDelete(true)}
                  disabled={book.isDefault}
                  title={book.isDefault ? 'Không thể xóa sổ mặc định' : 'Xóa sổ'}
                  style={book.isDefault ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                >
                  Xóa sổ
                </button>
              </>
            )}
            {book.status === 'CLOSED' && (
              <button className="btn btn-primary" onClick={() => setConfirmReopen(true)}>
                Mở lại sổ
              </button>
            )}
          </div>
        )}
      </div>

      <div className="page-content">
        {/* KPI Cards / Metadata Summary */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            className="card"
            style={{
              padding: '16px 20px',
              borderLeft: '4px solid #3498db',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 13, color: '#636e72', fontWeight: 500 }}>Số hiện tại</span>
            <span style={{ fontSize: 24, fontWeight: 700, color: '#2d3436' }}>
              {book.currentNumber}
            </span>
            <span style={{ fontSize: 12, color: '#95a5a6' }}>Số văn bản tiếp theo: {book.currentNumber + 1}</span>
          </div>

          <div
            className="card"
            style={{
              padding: '16px 20px',
              borderLeft: '4px solid #2ecc71',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 13, color: '#636e72', fontWeight: 500 }}>Tổng số đã vào sổ</span>
            <span style={{ fontSize: 24, fontWeight: 700, color: '#2d3436' }}>
              {totalEntries}
            </span>
            <span style={{ fontSize: 12, color: '#95a5a6' }}>Văn bản trong sổ</span>
          </div>

          <div
            className="card"
            style={{
              padding: '16px 20px',
              borderLeft: '4px solid #9b59b6',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 13, color: '#636e72', fontWeight: 500 }}>Loại sổ & Năm</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#2d3436', marginTop: 2 }}>
              {isIncoming ? 'Văn bản đến' : 'Văn bản đi'} — Năm {book.year}
            </span>
            <span style={{ fontSize: 12, color: '#95a5a6' }}>Mã sổ: {book.code || '—'}</span>
          </div>

          <div
            className="card"
            style={{
              padding: '16px 20px',
              borderLeft: '4px solid #e67e22',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 13, color: '#636e72', fontWeight: 500 }}>Phòng ban quản lý</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#2d3436', marginTop: 4 }}>
              {book.department?.name || 'Toàn cơ quan'}
            </span>
            <span style={{ fontSize: 12, color: '#95a5a6' }}>Người tạo: {book.createdBy?.fullName || '—'}</span>
          </div>
        </div>

        {/* Entries Table Card */}
        <div className="card">
          <div className="card-header">
            <h2>Danh sách văn bản đã vào sổ ({entriesTotal})</h2>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {loadingEntries ? (
              <LoadingSpinner />
            ) : entries.length === 0 ? (
              <div className="empty-state" style={{ padding: 48, textAlign: 'center' }}>
                <p style={{ color: '#636e72', margin: 0 }}>
                  Chưa có văn bản nào được đăng ký vào sổ này.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      {isIncoming ? (
                        <>
                          <th style={{ width: 80, textAlign: 'center' }}>Số đến</th>
                          <th>Ngày đến</th>
                          <th>Số ký hiệu</th>
                          <th>Cơ quan gửi</th>
                          <th>Trích yếu nội dung</th>
                          <th>Loại VB</th>
                          <th>Độ khẩn</th>
                          <th>Trạng thái</th>
                          <th style={{ width: 80, textAlign: 'right' }}>Thao tác</th>
                        </>
                      ) : (
                        <>
                          <th style={{ width: 80, textAlign: 'center' }}>Số đi</th>
                          <th>Số ký hiệu</th>
                          <th>Loại VB</th>
                          <th>Trích yếu nội dung</th>
                          <th>Người ký</th>
                          <th>Nơi nhận</th>
                          <th>Ngày ban hành</th>
                          <th>Độ khẩn</th>
                          <th>Trạng thái</th>
                          <th style={{ width: 80, textAlign: 'right' }}>Thao tác</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {isIncoming
                      ? (entries as IncomingBookEntryItem[]).map((entry) => (
                          <tr key={entry.id}>
                            <td style={{ textAlign: 'center', fontWeight: 700 }}>
                              {entry.arrivalNumber}
                            </td>
                            <td>{formatDate(entry.arrivalDate)}</td>
                            <td>
                              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                {entry.documentNumberSnapshot || '—'}
                              </span>
                            </td>
                            <td>{entry.senderSnapshot}</td>
                            <td style={{ maxWidth: 260 }}>
                              <span
                                style={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                }}
                                title={entry.summarySnapshot}
                              >
                                {entry.summarySnapshot}
                              </span>
                            </td>
                            <td>
                              <span className="badge badge-type">
                                {entry.incomingDocument.documentTypeRef?.name ||
                                  entry.documentTypeSnapshot ||
                                  '—'}
                              </span>
                            </td>
                            <td>{urgencyLabel(entry.incomingDocument.document.urgency?.name)}</td>
                            <td>
                              <span className="status-badge status-active">
                                {entry.incomingDocument.document.status}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Link
                                to={`/incoming-documents/${entry.incomingDocument.id}`}
                                className="action-btn view"
                                title="Xem chi tiết văn bản đến"
                              >
                                &#128065;
                              </Link>
                            </td>
                          </tr>
                        ))
                      : (entries as OutgoingBookEntryItem[]).map((entry) => (
                          <tr key={entry.id}>
                            <td style={{ textAlign: 'center', fontWeight: 700 }}>
                              {entry.officialNumber}
                            </td>
                            <td>
                              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                {entry.documentSymbol || '—'}
                              </span>
                            </td>
                            <td>
                              <span className="badge badge-type">
                                {entry.outgoingDocument.documentTypeRef?.name ||
                                  entry.documentTypeSnapshot ||
                                  '—'}
                              </span>
                            </td>
                            <td style={{ maxWidth: 260 }}>
                              <span
                                style={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                }}
                                title={entry.summarySnapshot}
                              >
                                {entry.summarySnapshot}
                              </span>
                            </td>
                            <td>{entry.signerSnapshot || '—'}</td>
                            <td>
                              {entry.outgoingDocument.recipientName ||
                                entry.recipientsSnapshot ||
                                '—'}
                            </td>
                            <td>{formatDate(entry.issuanceDate)}</td>
                            <td>{urgencyLabel(entry.outgoingDocument.document.urgency?.name)}</td>
                            <td>
                              <span className="status-badge status-active">
                                {entry.outgoingDocument.document.status}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Link
                                to={`/outgoing-documents/${entry.outgoingDocument.id}`}
                                className="action-btn view"
                                title="Xem chi tiết văn bản đi"
                              >
                                &#128065;
                              </Link>
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {entriesTotalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setEntriesPage((p) => Math.max(1, p - 1))}
                disabled={entriesPage === 1}
              >
                Trước
              </button>
              {Array.from({ length: entriesTotalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === entriesTotalPages || Math.abs(p - entriesPage) <= 2)
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
                      className={entriesPage === p ? 'active' : ''}
                      onClick={() => setEntriesPage(p as number)}
                    >
                      {p}
                    </button>
                  ),
                )}
              <button
                onClick={() => setEntriesPage((p) => Math.min(entriesTotalPages, p + 1))}
                disabled={entriesPage === entriesTotalPages}
              >
                Sau
              </button>
            </div>
          )}
        </div>
      </div>

      {editModalOpen && (
        <DocumentBookFormModal
          book={book}
          onClose={() => setEditModalOpen(false)}
          onSuccess={() => {
            setEditModalOpen(false);
            loadBook();
          }}
        />
      )}

      <ConfirmModal
        open={confirmClose}
        title="Xác nhận đóng sổ văn bản"
        message={`Sau khi đóng, sổ "${book.name}" sẽ tạm ngừng cấp số văn bản mới. Bạn có thể mở lại sổ bất cứ lúc nào.`}
        onConfirm={handleClose}
        onCancel={() => setConfirmClose(false)}
      />

      <ConfirmModal
        open={confirmReopen}
        title="Xác nhận mở lại sổ văn bản"
        message={`Mở lại sổ "${book.name}"? Sổ sẽ tiếp tục nhận cấp số văn bản tiếp theo từ số ${
          book.currentNumber + 1
        }.`}
        onConfirm={handleReopen}
        onCancel={() => setConfirmReopen(false)}
      />

      <ConfirmModal
        open={confirmDelete}
        title="Xác nhận xóa / ngừng sổ"
        message={deleteConfirmMsg}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      {actionLoading && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.1)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LoadingSpinner />
        </div>
      )}
    </>
  );
}
