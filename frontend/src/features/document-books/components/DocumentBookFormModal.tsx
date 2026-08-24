import React, { useState, useEffect } from 'react';
import { useDocumentBookActions } from '../../../shared/hooks';
import { DocumentBook } from '../../../api/modules/document-books';
import { departmentsApi } from '../../../api/modules/departments';
import type { Department } from '../../../api/modules/departments';

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
    departmentId: 0,
    currentNumber: 0,
    isDefault: false,
    description: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  // ─── Danh sách phòng ban ───────────────────────────────────────────────────
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [deptsError, setDeptsError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setLoadingDepts(true);
      setDeptsError(null);
      departmentsApi
        .getAll()
        .then((res) => {
          const list = res.data?.data ?? [];
          setDepartments(list);
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

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) {
      errs.name = 'Tên sổ văn bản không được để trống';
    }
    if (!isEditing && (!formData.departmentId || formData.departmentId === 0)) {
      errs.departmentId = 'Vui lòng chọn phòng ban cho sổ văn bản';
    }
    if (!isEditing && (!formData.year || formData.year < 2000 || formData.year > 2100)) {
      errs.year = 'Năm không hợp lệ (2000 - 2100)';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ─── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;

    try {
      if (isEditing) {
        await update(book!.id, {
          name: formData.name.trim(),
          code: formData.code.trim() || undefined,
          description: formData.description.trim() || undefined,
          isDefault: formData.isDefault,
        });
      } else {
        await create({
          name: formData.name.trim(),
          code: formData.code.trim() || undefined,
          bookType: formData.bookType,
          year: formData.year,
          departmentId: formData.departmentId,
          currentNumber: formData.currentNumber || undefined,
          isDefault: formData.isDefault,
          description: formData.description.trim() || undefined,
        });
      }
      onSuccess();
    } catch (err: any) {
      const serverMsg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0]?.message ||
        'Có lỗi xảy ra, vui lòng thử lại.';
      setApiError(serverMsg);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: 580 }}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {isEditing ? 'Chỉnh sửa sổ văn bản' : 'Tạo sổ văn bản mới'}
          </h3>
          <button className="modal-close" onClick={onClose} type="button" aria-label="Đóng">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {apiError && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                {apiError}
              </div>
            )}

            {/* Tên sổ */}
            <div className="form-group">
              <label htmlFor="bookName">
                Tên sổ <span style={{ color: '#e74c3c' }}>*</span>
              </label>
              <input
                id="bookName"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="VD: Sổ công văn đến năm 2026"
                maxLength={255}
                style={{ borderColor: errors.name ? '#e74c3c' : undefined }}
              />
              {errors.name && (
                <span style={{ color: '#e74c3c', fontSize: 12 }}>{errors.name}</span>
              )}
            </div>

            {/* Mã sổ */}
            <div className="form-group">
              <label htmlFor="bookCode">Mã sổ (Tùy chọn)</label>
              <input
                id="bookCode"
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="VD: SCVD-2026"
                maxLength={50}
              />
            </div>

            {/* Phòng ban — chỉ hiện khi tạo mới */}
            {!isEditing && (
              <div className="form-group">
                <label htmlFor="bookDepartment">
                  Phòng ban <span style={{ color: '#e74c3c' }}>*</span>
                </label>
                {loadingDepts ? (
                  <p style={{ fontSize: 13, color: '#636e72' }}>Đang tải danh sách phòng ban...</p>
                ) : deptsError ? (
                  <p style={{ fontSize: 13, color: '#e74c3c' }}>{deptsError}</p>
                ) : (
                  <select
                    id="bookDepartment"
                    value={formData.departmentId}
                    onChange={(e) =>
                      setFormData({ ...formData, departmentId: Number(e.target.value) })
                    }
                    style={{ borderColor: errors.departmentId ? '#e74c3c' : undefined }}
                  >
                    <option value={0} disabled>
                      -- Chọn phòng ban --
                    </option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                )}
                {errors.departmentId && (
                  <span style={{ color: '#e74c3c', fontSize: 12 }}>{errors.departmentId}</span>
                )}
              </div>
            )}

            {/* Loại sổ + Năm — chỉ hiện khi tạo mới */}
            {!isEditing && (
              <div style={{ display: 'flex', gap: 16 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label htmlFor="bookType">
                    Loại sổ <span style={{ color: '#e74c3c' }}>*</span>
                  </label>
                  <select
                    id="bookType"
                    value={formData.bookType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        bookType: e.target.value as 'INCOMING' | 'OUTGOING',
                      })
                    }
                  >
                    <option value="INCOMING">Sổ văn bản đến</option>
                    <option value="OUTGOING">Sổ văn bản đi</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label htmlFor="bookYear">
                    Năm <span style={{ color: '#e74c3c' }}>*</span>
                  </label>
                  <input
                    id="bookYear"
                    type="number"
                    value={formData.year}
                    onChange={(e) =>
                      setFormData({ ...formData, year: Number(e.target.value) })
                    }
                    min={2000}
                    max={2100}
                    style={{ borderColor: errors.year ? '#e74c3c' : undefined }}
                  />
                  {errors.year && (
                    <span style={{ color: '#e74c3c', fontSize: 12 }}>{errors.year}</span>
                  )}
                </div>
              </div>
            )}

            {/* Số bắt đầu — chỉ hiện khi tạo mới */}
            {!isEditing && (
              <div className="form-group">
                <label htmlFor="currentNumber">Số bắt đầu (Tùy chọn)</label>
                <input
                  id="currentNumber"
                  type="number"
                  value={formData.currentNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, currentNumber: Number(e.target.value) })
                  }
                  min={0}
                />
                <small style={{ color: '#636e72', fontSize: 12, marginTop: 4, display: 'block' }}>
                  Số văn bản tiếp theo sẽ bắt đầu từ {formData.currentNumber + 1}
                </small>
              </div>
            )}

            {/* Ghi chú */}
            <div className="form-group">
              <label htmlFor="bookDescription">Mô tả / Ghi chú</label>
              <textarea
                id="bookDescription"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder="Mô tả thêm về sổ văn bản..."
              />
            </div>

            {/* Đặt làm mặc định */}
            <div style={{ marginTop: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                />
                <span style={{ fontSize: 14 }}>Đặt làm sổ mặc định cho năm {formData.year}</span>
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
              {loading ? 'Đang lưu...' : isEditing ? 'Lưu thay đổi' : 'Tạo mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
