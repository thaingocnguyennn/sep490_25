import React, { useState, useEffect } from 'react';
import { useDocumentBookActions } from '../../../shared/hooks';
import { DocumentBook } from '../../../api/modules/document-books';
import { departmentsApi } from '../../../api/modules/departments';
import type { Department } from '../../../api/modules/departments';
import '../styles/document-books.css';

interface DocumentBookFormModalProps {
  book?: DocumentBook;
  onClose: () => void;
  onSuccess: () => void;
}

export function DocumentBookFormModal({ book, onClose, onSuccess }: DocumentBookFormModalProps) {
  const isEditing = !!book;
  const { create, update, loading } = useDocumentBookActions();

  // ─── State form ────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    bookType: 'INCOMING' as 'INCOMING' | 'OUTGOING',
    year: new Date().getFullYear(),
    // departmentId bắt buộc khi tạo mới (backend yêu cầu)
    departmentId: 0,
    currentNumber: 0,
    isDefault: false,
    description: '',
  });

  // ─── Danh sách phòng ban để chọn ───────────────────────────────────────────
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [deptsError, setDeptsError] = useState<string | null>(null);

  // Load danh sách phòng ban khi modal mở (chỉ cần khi tạo mới)
  useEffect(() => {
    if (!isEditing) {
      setLoadingDepts(true);
      setDeptsError(null);
      departmentsApi
        .getAll()
        .then((res) => {
          const list = res.data?.data ?? [];
          setDepartments(list);
          // Tự động chọn phòng ban đầu tiên nếu có
          if (list.length > 0 && formData.departmentId === 0) {
            setFormData((prev) => ({ ...prev, departmentId: list[0].id }));
          }
        })
        .catch(() => {
          setDeptsError('Không tải được danh sách phòng ban. Vui lòng thử lại.');
        })
        .finally(() => setLoadingDepts(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  // Nạp dữ liệu khi đang chỉnh sửa
  useEffect(() => {
    if (book) {
      setFormData({
        name: book.name,
        code: book.code || '',
        bookType: book.bookType,
        year: book.year,
        departmentId: book.departmentId,
        currentNumber: book.currentNumber,
        isDefault: book.isDefault,
        description: book.description || '',
      });
    }
  }, [book]);

  // ─── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Kiểm tra phòng ban phải được chọn khi tạo mới
    if (!isEditing && (!formData.departmentId || formData.departmentId === 0)) {
      alert('Vui lòng chọn phòng ban cho sổ văn bản.');
      return;
    }

    try {
      if (isEditing) {
        // Khi cập nhật: chỉ gửi các trường được phép thay đổi
        await update(book!.id, {
          name: formData.name,
          code: formData.code || undefined,
          description: formData.description || undefined,
          isDefault: formData.isDefault,
        });
        alert('Cập nhật sổ văn bản thành công');
      } else {
        // Khi tạo mới: gửi đầy đủ bao gồm departmentId
        await create({
          name: formData.name,
          code: formData.code || undefined,
          bookType: formData.bookType,
          year: formData.year,
          departmentId: formData.departmentId,
          currentNumber: formData.currentNumber || undefined,
          isDefault: formData.isDefault,
          description: formData.description || undefined,
        });
        alert('Tạo sổ văn bản thành công');
      }
      onSuccess();
    } catch (err: any) {
      // Hiển thị thông báo lỗi chi tiết từ server nếu có
      const serverMsg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0]?.message ||
        'Có lỗi xảy ra, vui lòng thử lại.';
      alert(serverMsg);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay">
      <div className="modal document-book-modal">
        <div className="modal-header">
          <h3>{isEditing ? 'Chỉnh sửa sổ văn bản' : 'Tạo sổ văn bản mới'}</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">

            {/* Tên sổ */}
            <div className="form-group">
              <label>Tên sổ <span className="required">*</span></label>
              <input
                type="text"
                className="form-control"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                maxLength={255}
                placeholder="VD: Sổ công văn đến năm 2026"
              />
            </div>

            {/* Mã sổ */}
            <div className="form-group">
              <label>Mã sổ (Tùy chọn)</label>
              <input
                type="text"
                className="form-control"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                maxLength={50}
                placeholder="VD: SCVD-2026"
              />
            </div>

            {/* Phòng ban — chỉ hiện khi tạo mới, bắt buộc */}
            {!isEditing && (
              <div className="form-group">
                <label>
                  Phòng ban <span className="required">*</span>
                </label>
                {loadingDepts ? (
                  <p style={{ fontSize: 13, color: '#636e72' }}>Đang tải danh sách phòng ban...</p>
                ) : deptsError ? (
                  <p style={{ fontSize: 13, color: '#e74c3c' }}>{deptsError}</p>
                ) : (
                  <select
                    className="form-control"
                    value={formData.departmentId}
                    onChange={(e) =>
                      setFormData({ ...formData, departmentId: Number(e.target.value) })
                    }
                    required
                  >
                    <option value={0} disabled>-- Chọn phòng ban --</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Loại sổ + Năm — chỉ hiện khi tạo mới */}
            {!isEditing && (
              <div className="form-row">
                <div className="form-group half">
                  <label>Loại sổ <span className="required">*</span></label>
                  <select
                    className="form-control"
                    value={formData.bookType}
                    onChange={(e) =>
                      setFormData({ ...formData, bookType: e.target.value as 'INCOMING' | 'OUTGOING' })
                    }
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

            {/* Số bắt đầu — chỉ hiện khi tạo mới */}
            {!isEditing && (
              <div className="form-group">
                <label>Số bắt đầu (Tùy chọn)</label>
                <input
                  type="number"
                  className="form-control"
                  value={formData.currentNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, currentNumber: Number(e.target.value) })
                  }
                  min={0}
                />
                <small className="help-text">
                  Số văn bản tiếp theo sẽ bắt đầu từ {formData.currentNumber + 1}
                </small>
              </div>
            )}

            {/* Ghi chú */}
            <div className="form-group">
              <label>Ghi chú</label>
              <textarea
                className="form-control"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder="Mô tả thêm về sổ văn bản (tùy chọn)"
              />
            </div>

            {/* Đặt làm mặc định */}
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                />
                {' '}Đặt làm sổ mặc định cho năm {formData.year}
              </label>
            </div>

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
              disabled={loading || (!isEditing && loadingDepts)}
            >
              {loading ? 'Đang lưu...' : isEditing ? 'Cập nhật' : 'Tạo mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
