import React, { useState, useEffect } from 'react';
import { useDocumentBooks } from '../../../shared/hooks';
import { DocumentBook } from '../../../api/modules/document-books';

interface RegisterDocumentModalProps {
  type: 'INCOMING' | 'OUTGOING';
  onClose: () => void;
  onRegister: (data: { documentBookId: number; customDate?: string }) => Promise<void>;
  loading: boolean;
}

export default function RegisterDocumentModal({ type, onClose, onRegister, loading }: RegisterDocumentModalProps) {
  const [selectedBookId, setSelectedBookId] = useState<number | ''>('');
  const [customDate, setCustomDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  const { data: books, loading: booksLoading } = useDocumentBooks({
    limit: 100,
    bookType: type,
    status: 'ACTIVE',
  });

  // Tự động chọn sổ mặc định hoặc sổ đầu tiên
  useEffect(() => {
    if (books.length > 0 && selectedBookId === '') {
      const defaultBook = books.find(b => b.isDefault);
      setSelectedBookId(defaultBook ? defaultBook.id : books[0].id);
    }
  }, [books, selectedBookId]);

  const selectedBook = books.find(b => b.id === selectedBookId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookId) return;
    
    // Convert the local date string to ISO-8601 string starting at 00:00:00 local time
    const localDate = new Date(customDate);
    const isoString = localDate.toISOString();
    
    onRegister({
      documentBookId: Number(selectedBookId),
      customDate: isoString,
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3>Vào sổ văn bản {type === 'INCOMING' ? 'đến' : 'đi'}</h3>
          <button type="button" className="close-btn" onClick={onClose} disabled={loading}>
            &times;
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {booksLoading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#636e72' }}>
                Đang tải danh sách sổ...
              </div>
            ) : books.length === 0 ? (
              <div className="alert alert-error">
                Không tìm thấy sổ văn bản {type === 'INCOMING' ? 'đến' : 'đi'} nào đang hoạt động.
                Vui lòng liên hệ Quản trị viên để tạo sổ mới.
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label>Chọn sổ văn bản <span className="required">*</span></label>
                  <select
                    className="form-control"
                    value={selectedBookId}
                    onChange={(e) => setSelectedBookId(Number(e.target.value))}
                    required
                  >
                    {books.map(book => (
                      <option key={book.id} value={book.id}>
                        {book.name} (Năm {book.year})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedBook && (
                  <div className="form-group">
                    <label>Số dự kiến</label>
                    <div style={{
                      padding: '12px',
                      backgroundColor: '#f8f9fa',
                      border: '1px solid #dfe6e9',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      color: '#667eea'
                    }}>
                      {selectedBook.currentNumber + 1}
                    </div>
                    <small className="help-text">Số văn bản sẽ được cấp tự động theo sổ đã chọn.</small>
                  </div>
                )}

                <div className="form-group">
                  <label>{type === 'INCOMING' ? 'Ngày đến (Tùy chọn)' : 'Ngày ban hành (Tùy chọn)'}</label>
                  <input
                    type="date"
                    className="form-control"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                  />
                  <small className="help-text">Mặc định là ngày hôm nay. Bạn có thể chọn lại nếu muốn.</small>
                </div>
              </>
            )}
          </div>
          
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Hủy
            </button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={loading || books.length === 0 || !selectedBookId}
            >
              {loading ? 'Đang xử lý...' : 'Đăng ký vào sổ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
