import React, { useState, useEffect } from 'react';
import { useDocumentBooks } from '../../../shared/hooks';

interface RegisterDocumentModalProps {
  type: 'INCOMING' | 'OUTGOING';
  onClose: () => void;
  onRegister: (data: { documentBookId: number; customDate?: string }) => Promise<void>;
  loading: boolean;
  documentSymbol?: string;
  documentTypeName?: string;
}

export default function RegisterDocumentModal({
  type,
  onClose,
  onRegister,
  loading,
  documentSymbol,
  documentTypeName,
}: RegisterDocumentModalProps) {
  const [selectedBookId, setSelectedBookId] = useState<number | ''>('');
  const [customDate, setCustomDate] = useState<string>(
    new Date().toISOString().split('T')[0],
  );

  const { data: books, loading: booksLoading } = useDocumentBooks({
    limit: 100,
    bookType: type,
    status: 'ACTIVE',
  });

  // Tự động chọn sổ mặc định hoặc sổ đầu tiên
  useEffect(() => {
    if (books.length > 0 && selectedBookId === '') {
      const defaultBook = books.find((b) => b.isDefault);
      setSelectedBookId(defaultBook ? defaultBook.id : books[0].id);
    }
  }, [books, selectedBookId]);

  const selectedBook = books.find((b) => b.id === selectedBookId);

  const nextSeq = selectedBook ? selectedBook.currentNumber + 1 : 1;
  const paddedNextSeq = nextSeq < 10 ? `0${nextSeq}` : String(nextSeq);

  let previewNumber = String(nextSeq);
  if (type === 'OUTGOING') {
    if (documentSymbol && documentSymbol.trim()) {
      const pureSymbol = documentSymbol.includes('/')
        ? documentSymbol.split('/').slice(1).join('/')
        : documentSymbol.trim();
      previewNumber = `${paddedNextSeq}/${pureSymbol}`;
    } else if (selectedBook?.code) {
      previewNumber = `${paddedNextSeq}/${selectedBook.code}`;
    } else {
      previewNumber = `${paddedNextSeq}/VB`;
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookId) return;

    const localDate = new Date(customDate);
    const isoString = localDate.toISOString();

    onRegister({
      documentBookId: Number(selectedBookId),
      customDate: isoString,
    });
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {type === 'INCOMING' ? 'Vào sổ văn bản đến' : 'Cấp số & Phát hành văn bản đi'}
          </h3>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={loading}
            aria-label="Đóng"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {booksLoading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#636e72' }}>
                Đang tải danh sách sổ văn bản...
              </div>
            ) : books.length === 0 ? (
              <div className="alert alert-error">
                Không tìm thấy sổ văn bản {type === 'INCOMING' ? 'đến' : 'đi'} nào đang hoạt động.
                Vui lòng liên hệ Quản trị viên để tạo sổ mới.
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label htmlFor="selectBook">
                    Chọn sổ văn bản <span style={{ color: '#e74c3c' }}>*</span>
                  </label>
                  <select
                    id="selectBook"
                    value={selectedBookId}
                    onChange={(e) => setSelectedBookId(Number(e.target.value))}
                    required
                  >
                    {books.map((book) => (
                      <option key={book.id} value={book.id}>
                        {book.name} (Năm {book.year}) {book.isDefault ? '— [Mặc định]' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedBook && (
                  <div className="form-group">
                    <label>
                      {type === 'INCOMING' ? 'Số đến dự kiến cấp' : 'Số phát hành dự kiến cấp (NĐ 30)'}
                    </label>
                    <div
                      style={{
                        padding: '12px 16px',
                        backgroundColor: '#f8f9fa',
                        border: '1px solid #dfe6e9',
                        borderRadius: 8,
                        fontFamily: 'monospace',
                        fontSize: 18,
                        fontWeight: 700,
                        color: type === 'INCOMING' ? '#0984e3' : '#27ae60',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>{previewNumber}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#636e72', fontFamily: 'inherit' }}>
                        Thứ tự: #{nextSeq}
                      </span>
                    </div>
                    <small style={{ color: '#636e72', fontSize: 12, marginTop: 4, display: 'block' }}>
                      {type === 'INCOMING'
                        ? 'Số đến sẽ được tự động tăng liên tục theo thứ tự thời gian vào sổ.'
                        : 'Số phát hành được tự động định dạng chuẩn: [Số thứ tự]/[Ký hiệu loại VB]-[Ký hiệu đơn vị].'}
                    </small>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="regCustomDate">
                    {type === 'INCOMING' ? 'Ngày đến' : 'Ngày ban hành chính thức'}
                  </label>
                  <input
                    id="regCustomDate"
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                  />
                  <small style={{ color: '#636e72', fontSize: 12, marginTop: 4, display: 'block' }}>
                    Mặc định là ngày hôm nay. Bạn có thể chọn lại ngày chính xác nếu cần.
                  </small>
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || books.length === 0}
            >
              {loading
                ? 'Đang xử lý...'
                : type === 'INCOMING'
                ? 'Xác nhận vào sổ'
                : 'Cấp số & Phát hành'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
