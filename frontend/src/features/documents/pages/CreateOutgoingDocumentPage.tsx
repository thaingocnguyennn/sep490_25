import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOutgoingDocumentActions, useDepartments } from '../../../shared/hooks';
import { CONFIDENTIALITY_OPTIONS } from '../../../shared/constants/confidentiality';
import { URGENCY_OPTIONS as URGENCY_LIST } from '../../../shared/constants/urgency';
import type {
  CreateOutgoingDocumentRequest,
  UrgencyName,
  ConfidentialityName,
} from '../../../types';

const URGENCY_OPTIONS: { value: UrgencyName; label: string }[] = URGENCY_LIST.map((o) => ({
  value: o.value,
  label: o.label,
}));

const DOC_TYPES = [
  'QUYẾT ĐỊNH', 'CÔNG VĂN', 'THÔNG BÁO', 'TỜ TRÌNH', 'BÁO CÁO',
  'KẾ HOẠCH', 'CHỈ THỊ', 'HƯỚNG DẪN', 'QUY ĐỊNH', 'QUY TRÌNH',
  'BIÊN BẢN', 'HỢP ĐỒNG', 'GIẤY ỦY QUYỀN',
];

export default function CreateOutgoingDocumentPage() {
  const navigate = useNavigate();
  const { loading, error, create, clearError } = useOutgoingDocumentActions();

  const [form, setForm] = useState<CreateOutgoingDocumentRequest>({
    title: '',
    description: '',
    urgency: 'THUONG',
    confidentialityLevel: 'THUONG',
    documentType: '',
    departmentId: undefined,
    recipientName: '',
    recipientAddress: '',
    recipientEmail: '',
    notes: '',
  });

  const { departments } = useDepartments();

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) {
      errs.title = 'Tiêu đề văn bản không được để trống';
    }
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (validationErrors[name]) {
      setValidationErrors((prev) => ({ ...prev, [name]: '' }));
    }
    if (error) clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const result = await create({
      ...form,
      title: form.title.trim(),
      description: form.description?.trim() || undefined,
      documentType: form.documentType || undefined,
      departmentId: form.departmentId ? Number(form.departmentId) : undefined,
      recipientName: form.recipientName?.trim() || undefined,
      recipientAddress: form.recipientAddress?.trim() || undefined,
      recipientEmail: form.recipientEmail?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
    });

    if (result) {
      // Sau khi tạo thành công, điều hướng sang trang chi tiết để upload file
      navigate(`/outgoing-documents/${result.id}`, {
        state: { justCreated: true },
      });
    }
  };

  return (
    <>
      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/outgoing-documents')}
            style={{ padding: '6px 12px' }}
          >
            ← Quay lại
          </button>
          <h1>Tạo Văn bản đi mới</h1>
        </div>
      </div>

      <div className="page-content">
        <div className="card" style={{ maxWidth: 860, margin: '0 auto' }}>
          <div className="card-header">
            <h2>📄 Thông tin văn bản đi</h2>
            <p style={{ color: '#636e72', fontSize: 14, margin: 0 }}>
              Nhập thông tin cơ bản. Sau khi tạo bạn có thể upload file và chạy OCR để điền tự động.
            </p>
          </div>

          <div className="card-body">
            {error && (
              <div
                style={{
                  padding: '12px 16px', background: '#fdf0f0', border: '1px solid #fcc',
                  borderRadius: 8, color: '#e74c3c', marginBottom: 20,
                }}
              >
                ⚠️ {error}
              </div>
            )}

            <form id="form-create-outgoing" onSubmit={handleSubmit}>
              {/* Tiêu đề */}
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label htmlFor="title" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Tiêu đề văn bản <span style={{ color: '#e74c3c' }}>*</span>
                </label>
                <input
                  id="title"
                  name="title"
                  type="text"
                  value={form.title}
                  onChange={handleChange}
                  placeholder="Nhập tiêu đề / trích yếu nội dung văn bản..."
                  style={{
                    width: '100%', padding: '10px 14px',
                    border: `1px solid ${validationErrors.title ? '#e74c3c' : '#dfe6e9'}`,
                    borderRadius: 8, fontSize: 15, boxSizing: 'border-box',
                  }}
                />
                {validationErrors.title && (
                  <p style={{ color: '#e74c3c', fontSize: 13, marginTop: 4 }}>{validationErrors.title}</p>
                )}
              </div>

              {/* Hàng 2 cột: Loại VB + Độ khẩn */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div className="form-group">
                  <label htmlFor="documentType" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Loại văn bản
                  </label>
                  <select
                    id="documentType"
                    name="documentType"
                    value={form.documentType}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14 }}
                  >
                    <option value="">-- Chọn loại văn bản --</option>
                    {DOC_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="departmentId" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Phòng ban soạn thảo
                  </label>
                  <select
                    id="departmentId"
                    name="departmentId"
                    value={form.departmentId || ''}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14 }}
                  >
                    <option value="">-- Chọn phòng ban --</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="urgency" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Độ khẩn
                  </label>
                  <select
                    id="urgency"
                    name="urgency"
                    value={form.urgency}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14 }}
                  >
                    {URGENCY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mức độ mật */}
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label htmlFor="confidentialityLevel" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Mức độ mật
                </label>
                <select
                  id="confidentialityLevel"
                  name="confidentialityLevel"
                  value={form.confidentialityLevel as ConfidentialityName | undefined}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14 }}
                >
                  {CONFIDENTIALITY_OPTIONS.map((opt) => (
                    <option key={opt.name} value={opt.name}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Người nhận */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div className="form-group">
                  <label htmlFor="recipientName" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Người/Cơ quan nhận
                  </label>
                  <input
                    id="recipientName"
                    name="recipientName"
                    type="text"
                    value={form.recipientName}
                    onChange={handleChange}
                    placeholder="Tên người hoặc cơ quan nhận..."
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="recipientEmail" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Email người nhận
                  </label>
                  <input
                    id="recipientEmail"
                    name="recipientEmail"
                    type="email"
                    value={form.recipientEmail}
                    onChange={handleChange}
                    placeholder="example@domain.com..."
                    style={{ width: '100%', padding: '10px 14px', border: `1px solid ${validationErrors.recipientEmail ? '#e74c3c' : '#dfe6e9'}`, borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                  />
                  {validationErrors.recipientEmail && (
                    <p style={{ color: '#e74c3c', fontSize: 13, marginTop: 4 }}>{validationErrors.recipientEmail}</p>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="recipientAddress" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Địa chỉ người nhận
                  </label>
                  <input
                    id="recipientAddress"
                    name="recipientAddress"
                    type="text"
                    value={form.recipientAddress}
                    onChange={handleChange}
                    placeholder="Địa chỉ..."
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Mô tả */}
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label htmlFor="description" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Mô tả thêm
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Mô tả thêm về văn bản (nếu có)..."
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              {/* Ghi chú */}
              <div className="form-group" style={{ marginBottom: 28 }}>
                <label htmlFor="notes" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Ghi chú nội bộ
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  placeholder="Ghi chú nội bộ (không in ra văn bản)..."
                  rows={2}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate('/outgoing-documents')}
                  disabled={loading}
                >
                  Hủy
                </button>
                <button
                  id="btn-submit-create-outgoing"
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? '⏳ Đang tạo...' : '✅ Tạo văn bản đi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
