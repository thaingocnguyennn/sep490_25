import React, { useState, useEffect } from 'react';
import { useDocumentBookActions } from '../../../shared/hooks';
import { DocumentBook } from '../../../api/modules/document-books';
import '../styles/document-books.css';

interface DocumentBookFormModalProps {
  book?: DocumentBook;
  onClose: () => void;
  onSuccess: () => void;
}

export function DocumentBookFormModal({ book, onClose, onSuccess }: DocumentBookFormModalProps) {
  const isEditing = !!book;
  const { create, update, loading } = useDocumentBookActions();

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    bookType: 'INCOMING' as 'INCOMING' | 'OUTGOING',
    year: new Date().getFullYear(),
    currentNumber: 0,
    isDefault: false,
    description: '',
  });

  useEffect(() => {
    if (book) {
      setFormData({
        name: book.name,
        code: book.code || '',
        bookType: book.bookType,
        year: book.year,
        currentNumber: book.currentNumber,
        isDefault: book.isDefault,
        description: book.description || '',
      });
    }
  }, [book]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditing) {
        await update(book!.id, {
          name: formData.name,
          code: formData.code,
          description: formData.description,
          isDefault: formData.isDefault,
        });
        alert('Cập nhật sổ văn bản thành công');
      } else {
        await create({
          name: formData.name,
          code: formData.code,
          bookType: formData.bookType,
          year: formData.year,
          currentNumber: formData.currentNumber,
          isDefault: formData.isDefault,
          description: formData.description,
        });
        alert('Tạo sổ văn bản thành công');
      }
      onSuccess();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal document-book-modal">
        <div className="modal-header">
          <h3>{isEditing ? 'Chỉnh sửa sổ văn bản' : 'Tạo sổ văn bản mới'}</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Tên sổ <span className="required">*</span></label>
              <input
                type="text"
                className="form-control"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                maxLength={255}
                placeholder="VD: Sổ công văn đến năm 2024"
              />
            </div>
            <div className="form-group">
              <label>Mã sổ (Tùy chọn)</label>
              <input
                type="text"
                className="form-control"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                maxLength={50}
                placeholder="VD: SCVD-2024"
              />
            </div>
            
            {!isEditing && (
              <div className="form-row">
                <div className="form-group half">
                  <label>Loại sổ <span className="required">*</span></label>
                  <select
                    className="form-control"
                    value={formData.bookType}
                    onChange={(e) => setFormData({ ...formData, bookType: e.target.value as any })}
                    required
                  >
                    <option value="INCOMING">Sổ văn bản đến</option>
                    <option value="OUTGOING">Sổ văn bản đi</option>
                  </select>
                </div>
                <div className="form-group half">
                  <label>Năm <span className="required">*</span></label>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
                    required
                    min={2000}
                    max={2100}
                  />
                </div>
              </div>
            )}

            {!isEditing && (
              <div className="form-group">
                <label>Số bắt đầu (Số hiện tại)</label>
                <input
                  type="number"
                  className="form-control"
                  value={formData.currentNumber}
                  onChange={(e) => setFormData({ ...formData, currentNumber: Number(e.target.value) })}
                  min={0}
                  help-text="Số thứ tự tiếp theo sẽ là số này + 1"
                />
                <small className="help-text">Số văn bản tiếp theo sẽ bắt đầu từ {formData.currentNumber + 1}</small>
              </div>
            )}

            <div className="form-group">
              <label>Ghi chú</label>
              <textarea
                className="form-control"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                />
                Đặt làm sổ mặc định cho năm {formData.year}
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Đang lưu...' : (isEditing ? 'Cập nhật' : 'Tạo mới')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
