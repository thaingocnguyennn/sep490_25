import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { documentBooksApi, DocumentBook, IncomingBookEntryItem, OutgoingBookEntryItem } from '../../../api/modules/document-books';
import { useDocumentBookActions } from '../../../shared/hooks';
import { useAuth } from '../../../contexts/AuthContext';
import { LoadingSpinner, ConfirmModal } from '../../../shared/components';
import { DocumentBookFormModal } from '../components/DocumentBookFormModal';
import '../styles/document-books.css';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
function formatDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
}

function statusLabel(s: DocumentBook['status']) {
  if (s === 'ACTIVE') return { label: 'Hoạt động', cls: 'badge-success' };
  if (s === 'CLOSED') return { label: 'Đã khóa', cls: 'badge-warning' };
  return { label: 'Ngừng HĐ', cls: 'badge-danger' };
}

function urgencyLabel(name?: string | null) {
  const map: Record<string, string> = {
    HOA_TOC: 'Hỏa tốc',
    THUONG_KHAN: 'Thượng khẩn',
    KHAN: 'Khẩn',
    THUONG: 'Thường',
  };
  return name ? (map[name] ?? name) : '—';
}

// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────
export function DocumentBookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDocumentClerk, isAdmin } = useAuth();
  const canManage = isDocumentClerk || isAdmin;

  const bookId = parseInt(id ?? '0', 10);

  // ── State ──────────────────────────────────────────────────────
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

  // ── Load Book ──────────────────────────────────────────────────
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

  // ── Load Entries ───────────────────────────────────────────────
  const loadEntries = useCallback(async (page: number) => {
    if (!bookId) return;
    setLoadingEntries(true);
    try {
      const data = await documentBooksApi.getEntries(bookId, { page, limit: 20 });
      setEntries(data.items);
      setEntriesTotal(data.total);
      setEntriesTotalPages(data.totalPages);
    } catch {
      setEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  }, [bookId]);

  useEffect(() => { loadBook(); }, [loadBook]);
  useEffect(() => { loadEntries(entriesPage); }, [loadEntries, entriesPage]);

  // ── Actions ────────────────────────────────────────────────────
  const handleClose = async () => {
    if (!book) return;
    try {
      await closeBook(book.id);
      setConfirmClose(false);
      loadBook();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi khi khóa sổ');
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
      // Nếu sổ bị soft-delete → quay lại danh sách
      // Nếu chuyển INACTIVE → cập nhật lại trang
      if (result?.data?.deletedAt) {
        navigate('/document-books');
      } else {
        loadBook();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi khi xóa sổ');
    }
  };

  // ── Render helpers ─────────────────────────────────────────────
  if (loadingBook) return <div style={{ padding: 40 }}><LoadingSpinner /></div>;
  if (!book) return null;

  const { label: statusLbl, cls: statusCls } = statusLabel(book.status);
  const totalEntries = (book._count?.incomingEntries ?? 0) + (book._count?.outgoingEntries ?? 0);
  const isIncoming = book.bookType === 'INCOMING';

  const deleteConfirmMsg = totalEntries > 0
    ? `Sổ "${book.name}" đã có ${totalEntries} văn bản. Sổ sẽ được chuyển sang trạng thái Ngừng hoạt động (văn bản đã đăng ký vẫn được giữ nguyên).`
    : `Xác nhận xóa sổ "${book.name}"? Sổ chưa có văn bản nên sẽ bị xóa hoàn toàn khỏi danh sách.`;

  return (
    <div className="document-books-page">
      {/* ── Breadcrumb ── */}
      <nav style={{ marginBottom: 16, fontSize: 14, color: '#636e72' }}>
        <Link to="/document-books" style={{ color: '#6c5ce7', textDecoration: 'none' }}>
          Quản lý sổ văn bản
        </Link>
        {' / '}
        <span>{book.name}</span>
      </nav>

      {/* ── Detail Card ── */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          {/* Left: info */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>{book.name}</h2>
              <span className={`badge ${statusCls}`}>{statusLbl}</span>
              {book.isDefault && <span className="badge badge-success">Mặc định</span>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px 32px', color: '#555', fontSize: 14 }}>
              <div><strong>Mã sổ:</strong> {book.code || '—'}</div>
              <div>
                <strong>Loại sổ:</strong>{' '}
                <span className={`badge ${isIncoming ? 'badge-info' : 'badge-primary'}`}>
                  {isIncoming ? 'Văn bản đến' : 'Văn bản đi'}
                </span>
              </div>
              <div><strong>Năm:</strong> {book.year}</div>
              <div><strong>Phòng ban:</strong> {book.department?.name || '—'}</div>
              <div><strong>Số hiện tại:</strong> <strong style={{ fontSize: 16 }}>{book.currentNumber}</strong></div>
              <div><strong>Số VB trong sổ:</strong> {totalEntries}</div>
              <div><strong>Ngày mở:</strong> {formatDate(book.openedAt)}</div>
              <div><strong>Ngày khóa:</strong> {formatDate(book.closedAt)}</div>
              <div><strong>Tạo bởi:</strong> {book.createdBy?.fullName || '—'}</div>
              {book.description && (
                <div style={{ gridColumn: '1 / -1' }}><strong>Mô tả:</strong> {book.description}</div>
              )}
            </div>
          </div>

          {/* Right: actions */}
          {canManage && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {/* ACTIVE: Chỉnh sửa, Khóa sổ, Xóa */}
              {book.status === 'ACTIVE' && (
                <>
                  <button className="btn btn-secondary" onClick={() => setEditModalOpen(true)}>
                    ✏️ Chỉnh sửa
                  </button>
                  <button className="btn btn-warning" onClick={() => setConfirmClose(true)}>
                    🔒 Khóa sổ
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => setConfirmDelete(true)}
                    disabled={book.isDefault}
                    title={book.isDefault ? 'Không thể xóa sổ mặc định' : 'Xóa sổ'}
                  >
                    🗑️ Xóa
                  </button>
                </>
              )}
              {/* CLOSED: Mở lại sổ */}
              {book.status === 'CLOSED' && (
                <button className="btn btn-primary" onClick={() => setConfirmReopen(true)}>
                  🔓 Mở lại sổ
                </button>
              )}
              {/* INACTIVE: chỉ xem, không có nút */}
            </div>
          )}
        </div>
      </div>

      {/* ── Entries Table ── */}
      <div className="card" style={{ padding: '0 0 16px' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>
            Danh sách văn bản đã đăng ký ({entriesTotal})
          </h3>
        </div>

        {loadingEntries ? (
          <div style={{ padding: 32 }}><LoadingSpinner /></div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#999' }}>
            Chưa có văn bản nào được đăng ký vào sổ này
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    {isIncoming ? (
                      <>
                        <th>Số đến</th>
                        <th>Ngày đến</th>
                        <th>Số ký hiệu</th>
                        <th>Cơ quan gửi</th>
                        <th>Trích yếu</th>
                        <th>Loại VB</th>
                        <th>Độ khẩn</th>
                        <th>Trạng thái</th>
                        <th>Thao tác</th>
                      </>
                    ) : (
                      <>
                        <th>Số phát hành</th>
                        <th>Số ký hiệu</th>
                        <th>Loại VB</th>
                        <th>Trích yếu</th>
                        <th>Người ký</th>
                        <th>Người nhận</th>
                        <th>Ngày ban hành</th>
                        <th>Độ khẩn</th>
                        <th>Trạng thái</th>
                        <th>Thao tác</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {isIncoming
                    ? (entries as IncomingBookEntryItem[]).map((entry) => (
                      <tr key={entry.id}>
                        <td><strong>{entry.arrivalNumber}</strong></td>
                        <td>{formatDate(entry.arrivalDate)}</td>
                        <td>{entry.documentNumberSnapshot || '—'}</td>
                        <td>{entry.senderSnapshot}</td>
                        <td style={{ maxWidth: 250 }}>{entry.summarySnapshot}</td>
                        <td>{entry.incomingDocument.documentTypeRef?.name || entry.documentTypeSnapshot || '—'}</td>
                        <td>{urgencyLabel(entry.incomingDocument.document.urgency?.name)}</td>
                        <td>
                          <span className="badge badge-info" style={{ fontSize: 11 }}>
                            {entry.incomingDocument.document.status}
                          </span>
                        </td>
                        <td>
                          <Link
                            to={`/incoming-documents/${entry.incomingDocument.id}`}
                            style={{ color: '#6c5ce7', fontSize: 12 }}
                          >
                            Xem
                          </Link>
                        </td>
                      </tr>
                    ))
                    : (entries as OutgoingBookEntryItem[]).map((entry) => (
                      <tr key={entry.id}>
                        <td><strong>{entry.officialNumber}</strong></td>
                        <td>{entry.documentSymbol || '—'}</td>
                        <td>{entry.outgoingDocument.documentTypeRef?.name || entry.documentTypeSnapshot || '—'}</td>
                        <td style={{ maxWidth: 250 }}>{entry.summarySnapshot}</td>
                        <td>{entry.signerSnapshot || '—'}</td>
                        <td>{entry.outgoingDocument.recipientName || entry.recipientsSnapshot || '—'}</td>
                        <td>{formatDate(entry.issuanceDate)}</td>
                        <td>{urgencyLabel(entry.outgoingDocument.document.urgency?.name)}</td>
                        <td>
                          <span className="badge badge-info" style={{ fontSize: 11 }}>
                            {entry.outgoingDocument.document.status}
                          </span>
                        </td>
                        <td>
                          <Link
                            to={`/outgoing-documents/${entry.outgoingDocument.id}`}
                            style={{ color: '#6c5ce7', fontSize: 12 }}
                          >
                            Xem
                          </Link>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {entriesTotalPages > 1 && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '16px' }}>
                <button
                  className="btn btn-secondary"
                  disabled={entriesPage === 1}
                  onClick={() => setEntriesPage(p => p - 1)}
                  style={{ padding: '4px 12px' }}
                >
                  Trước
                </button>
                <span style={{ padding: '4px 12px', background: '#f8f9fa', borderRadius: 4 }}>
                  Trang {entriesPage} / {entriesTotalPages}
                </span>
                <button
                  className="btn btn-secondary"
                  disabled={entriesPage === entriesTotalPages}
                  onClick={() => setEntriesPage(p => p + 1)}
                  style={{ padding: '4px 12px' }}
                >
                  Sau
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modals ── */}
      {editModalOpen && (
        <DocumentBookFormModal
          book={book}
          onClose={() => setEditModalOpen(false)}
          onSuccess={() => { setEditModalOpen(false); loadBook(); }}
        />
      )}

      <ConfirmModal
        open={confirmClose}
        title="Khóa sổ văn bản"
        message={`Sau khi khóa, sổ "${book.name}" sẽ không nhận đăng ký văn bản mới. Bạn có thể mở lại bất cứ lúc nào.`}
        onConfirm={handleClose}
        onCancel={() => setConfirmClose(false)}
      />

      <ConfirmModal
        open={confirmReopen}
        title="Mở lại sổ văn bản"
        message={`Mở lại sổ "${book.name}"? Sổ sẽ tiếp tục nhận đăng ký văn bản mới từ số ${book.currentNumber + 1}.`}
        onConfirm={handleReopen}
        onCancel={() => setConfirmReopen(false)}
      />

      <ConfirmModal
        open={confirmDelete}
        title="Xác nhận xóa/ngừng sổ"
        message={deleteConfirmMsg}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      {actionLoading && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.1)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LoadingSpinner /></div>}
    </div>
  );
}
