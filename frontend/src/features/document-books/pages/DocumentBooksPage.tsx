import React, { useState } from 'react';
import { useDocumentBooks, useDocumentBookActions } from '../../../shared/hooks';
import { LoadingSpinner, ConfirmModal } from '../../../shared/components';
import { useAuth } from '../../../contexts/AuthContext';
import { DocumentBookFormModal } from '../components/DocumentBookFormModal';
import { DocumentBook } from '../../../api/modules/document-books';
import '../styles/document-books.css';

export function DocumentBooksPage() {
  const { isDocumentClerk, isAdmin } = useAuth();
  const [page, setPage] = useState(1);
  const [bookType, setBookType] = useState<string>('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  
  const { data: books, total, totalPages, loading, refresh } = useDocumentBooks({
    page,
    limit: 10,
    bookType: bookType || undefined,
    year: year || undefined,
  });

  const { deleteBook, closeBook, reopenBook } = useDocumentBookActions();

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState<DocumentBook | undefined>(undefined);
  
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<DocumentBook | null>(null);

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
      alert('Xóa sổ văn bản thành công');
      setDeleteModalOpen(false);
      setBookToDelete(null);
      refresh();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi khi xóa sổ văn bản');
    }
  };

  const handleToggleStatus = async (book: DocumentBook) => {
    try {
      if (book.status === 'ACTIVE') {
        await closeBook(book.id);
        alert(`Đã đóng sổ "${book.name}"`);
      } else if (book.status === 'CLOSED') {
        await reopenBook(book.id);
        alert(`Đã mở lại sổ "${book.name}"`);
      }
      refresh();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi khi thay đổi trạng thái');
    }
  };

  return (
    <div className="document-books-page">
      <div className="page-header">
        <h2>Quản lý sổ văn bản</h2>
        {canManage && (
          <button className="btn btn-primary" onClick={handleCreate}>
            + Thêm sổ mới
          </button>
        )}
      </div>

      <div className="filters-section">
        <div className="filter-group">
          <label>Loại sổ</label>
          <select value={bookType} onChange={(e) => setBookType(e.target.value)}>
            <option value="">Tất cả</option>
            <option value="INCOMING">Sổ văn bản đến</option>
            <option value="OUTGOING">Sổ văn bản đi</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Năm</label>
          <input 
            type="number" 
            value={year} 
            onChange={(e) => setYear(Number(e.target.value))}
            min="2000"
            max="2100"
          />
        </div>
      </div>

      <div className="content-section card">
        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tên sổ</th>
                    <th>Mã sổ</th>
                    <th>Loại</th>
                    <th>Năm</th>
                    <th>Số hiện tại</th>
                    <th>Trạng thái</th>
                    <th>Mặc định</th>
                    {canManage && <th style={{ width: 150 }}>Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {books.length === 0 ? (
                    <tr>
                      <td colSpan={canManage ? 8 : 7} style={{ textAlign: 'center', padding: '2rem' }}>
                        Không có dữ liệu sổ văn bản
                      </td>
                    </tr>
                  ) : (
                    books.map((book) => (
                      <tr key={book.id}>
                        <td style={{ fontWeight: 500 }}>{book.name}</td>
                        <td>{book.code || '—'}</td>
                        <td>
                          <span className={`badge ${book.bookType === 'INCOMING' ? 'badge-info' : 'badge-primary'}`}>
                            {book.bookType === 'INCOMING' ? 'Đến' : 'Đi'}
                          </span>
                        </td>
                        <td>{book.year}</td>
                        <td>
                          <strong>{book.currentNumber}</strong>
                        </td>
                        <td>
                          <span className={`badge ${book.status === 'ACTIVE' ? 'badge-success' : book.status === 'CLOSED' ? 'badge-warning' : 'badge-danger'}`}>
                            {book.status === 'ACTIVE' ? 'Hoạt động' : book.status === 'CLOSED' ? 'Đã đóng' : 'Ngừng HĐ'}
                          </span>
                        </td>
                        <td>
                          {book.isDefault ? (
                            <span className="badge badge-success">Mặc định</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        {canManage && (
                          <td>
                            <button
                              className="action-btn edit"
                              title="Chỉnh sửa"
                              onClick={() => handleEdit(book)}
                            >
                              &#9998;
                            </button>
                            <button
                              className={`action-btn ${book.status === 'ACTIVE' ? 'delete' : 'edit'}`}
                              title={book.status === 'ACTIVE' ? 'Đóng sổ' : 'Mở sổ'}
                              onClick={() => handleToggleStatus(book)}
                            >
                              {book.status === 'ACTIVE' ? '🔒' : '🔓'}
                            </button>
                            <button
                              className="action-btn delete"
                              title="Xóa"
                              onClick={() => handleDeleteClick(book)}
                            >
                              &#10006;
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                <button
                  className="btn btn-secondary"
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  style={{ padding: '4px 12px' }}
                >
                  Trước
                </button>
                <span style={{ padding: '4px 12px', background: '#f8f9fa', borderRadius: 4 }}>
                  Trang {page} / {totalPages}
                </span>
                <button
                  className="btn btn-secondary"
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                  style={{ padding: '4px 12px' }}
                >
                  Sau
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {formModalOpen && (
        <DocumentBookFormModal
          book={selectedBook}
          onClose={() => setFormModalOpen(false)}
          onSuccess={() => {
            setFormModalOpen(false);
            refresh();
          }}
        />
      )}

      <ConfirmModal
        open={deleteModalOpen}
        title="Xác nhận xóa"
        message={`Bạn có chắc chắn muốn xóa sổ văn bản "${bookToDelete?.name}"? Các văn bản đã đăng ký trong sổ này có thể bị mất liên kết.`}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteModalOpen(false);
          setBookToDelete(null);
        }}
      />
    </div>
  );
}
