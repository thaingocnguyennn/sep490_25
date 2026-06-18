import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getOutgoingDocumentById } from '../../../api/modules/outgoing-documents';
import { useOutgoingDocumentActions, useDepartments } from '../../../shared/hooks';
import { LoadingSpinner } from '../../../shared/components';
import type {
  OutgoingDocument,
  UpdateOutgoingMetadataRequest,
  UrgencyLevel,
  ConfidentialityLevel,
} from '../../../types';

const URGENCY_OPTIONS: { value: UrgencyLevel; label: string }[] = [
  { value: 'THUONG',      label: 'Thường' },
  { value: 'KHAN',        label: 'Khẩn' },
  { value: 'THUONG_KHAU', label: 'Thượng khẩn' },
  { value: 'HOA_TOC',     label: 'Hỏa tốc' },
];

const CONFIDENTIALITY_OPTIONS: { value: ConfidentialityLevel; label: string }[] = [
  { value: 'NORMAL',       label: 'Không mật' },
  { value: 'CONFIDENTIAL', label: 'Mật' },
  { value: 'TOP_SECRET',   label: 'Tuyệt mật' },
];

const DOC_TYPES = [
  'QUYẾT ĐỊNH', 'CÔNG VĂN', 'THÔNG BÁO', 'TỜ TRÌNH', 'BÁO CÁO',
  'KẾ HOẠCH', 'CHỈ THỊ', 'HƯỚNG DẪN', 'QUY ĐỊNH', 'QUY TRÌNH',
  'BIÊN BẢN', 'HỢP ĐỒNG', 'GIẤY ỦY QUYỀN',
];

export default function OutgoingDocumentEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { loading: actionLoading, error: actionError, updateMetadata, clearError } = useOutgoingDocumentActions();
  const { departments } = useDepartments();

  const [doc, setDoc] = useState<OutgoingDocument | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const ocrFields = (location.state as { ocrFields?: Record<string, string> })?.ocrFields;

  const [form, setForm] = useState<UpdateOutgoingMetadataRequest>({
    title: '',
    description: '',
    urgency: 'THUONG',
    confidentialityLevel: 'NORMAL',
    documentType: '',
    documentNumber: '',
    signerName: '',
    signerTitle: '',
    recipientName: '',
    recipientAddress: '',
    recipientEmail: '',
    pageCount: undefined,
    notes: '',
    departmentId: undefined,
  });

  useEffect(() => {
    if (!id) return;
    setPageLoading(true);
    getOutgoingDocumentById(parseInt(id))
      .then((data) => {
        setDoc(data);
        setForm({
          title: data.document.title,
          description: data.document.description || '',
          urgency: (data.urgency || 'THUONG') as UrgencyLevel,
          confidentialityLevel: (data.document.confidentialityLevel || 'NORMAL') as ConfidentialityLevel,
          documentType: data.documentType || '',
          documentNumber: data.documentNumber || '',
          signerName: data.signerName || '',
          signerTitle: data.signerTitle || '',
          recipientName: data.recipientName || '',
          recipientAddress: data.recipientAddress || '',
          recipientEmail: data.recipientEmail || '',
          pageCount: data.pageCount || undefined,
          notes: data.notes || '',
          departmentId: data.document.department?.id || undefined,
          ...(ocrFields ? {
            documentType: ocrFields.documentType || data.documentType || '',
            documentNumber: ocrFields.documentNumber || data.documentNumber || '',
            signerName: ocrFields.signerName || data.signerName || '',
            signerTitle: ocrFields.signerTitle || data.signerTitle || '',
            title: (ocrFields.summary ? ocrFields.summary : data.document.title),
            pageCount: ocrFields.pageCount ? parseInt(ocrFields.pageCount) : (data.pageCount || undefined),
          } : {}),
        });
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Không tải được thông tin'))
      .finally(() => setPageLoading(false));
  }, [id]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.title?.trim()) errs.title = 'Tiêu đề không được để trống';
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'pageCount' || name === 'departmentId' ? (value ? parseInt(value) : undefined) : value,
    }));
    if (validationErrors[name]) {
      setValidationErrors((prev) => ({ ...prev, [name]: '' }));
    }
    if (actionError) clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doc || !validate()) return;

    const result = await updateMetadata(doc.id, {
      ...form,
      title: form.title?.trim(),
      description: form.description?.trim() || undefined,
      documentType: form.documentType?.trim() || undefined,
      documentNumber: form.documentNumber?.trim() || undefined,
      signerName: form.signerName?.trim() || undefined,
      signerTitle: form.signerTitle?.trim() || undefined,
      departmentId: form.departmentId ? Number(form.departmentId) : undefined,
      recipientName: form.recipientName?.trim() || undefined,
      recipientAddress: form.recipientAddress?.trim() || undefined,
      recipientEmail: form.recipientEmail?.trim() || undefined,
      pageCount: form.pageCount ? Number(form.pageCount) : undefined,
      notes: form.notes?.trim() || undefined,
    });

    if (result) {
      navigate(`/outgoing-documents/${doc.id}`);
    }
  };

  if (pageLoading) return <LoadingSpinner />;
  if (loadError || !doc) {
    return (
      <div className="page-content">
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: '#e74c3c' }}>⚠️ {loadError || 'Không tìm thấy văn bản đi'}</p>
            <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => navigate('/outgoing-documents')}>
              ← Quay lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary" onClick={() => navigate(`/outgoing-documents/${doc.id}`)} style={{ padding: '6px 12px' }}>
            ← Quay lại chi tiết
          </button>
          <h1>Chỉnh sửa Văn bản đi</h1>
        </div>
      </div>

      <div className="page-content">
        {ocrFields && (
          <div style={{ background: '#d4edda', border: '1px solid #28a745', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#155724' }}>
            ✅ Đã điền sẵn thông tin từ kết quả OCR. Vui lòng kiểm tra và chỉnh sửa nếu cần.
          </div>
        )}

        <div className="card" style={{ maxWidth: 860, margin: '0 auto' }}>
          <div className="card-header">
            <h2>✏️ Cập nhật thông tin văn bản đi</h2>
            <p style={{ color: '#636e72', fontSize: 13, margin: 0 }}>
              Số văn bản hệ thống: <code style={{ color: '#667eea' }}>{doc.document.documentNumber}</code>
            </p>
          </div>

          <div className="card-body">
            {actionError && (
              <div style={{ padding: '12px 16px', background: '#fdf0f0', border: '1px solid #fcc', borderRadius: 8, color: '#e74c3c', marginBottom: 20 }}>
                ⚠️ {actionError}
              </div>
            )}

            <form id="form-edit-outgoing" onSubmit={handleSubmit}>
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
                  style={{
                    width: '100%', padding: '10px 14px',
                    border: `1px solid ${validationErrors.title ? '#e74c3c' : '#dfe6e9'}`,
                    borderRadius: 8, fontSize: 15, boxSizing: 'border-box',
                  }}
                />
                {validationErrors.title && <p style={{ color: '#e74c3c', fontSize: 13, marginTop: 4 }}>{validationErrors.title}</p>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div className="form-group">
                  <label htmlFor="documentType" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Loại văn bản</label>
                  <select
                    id="documentType"
                    name="documentType"
                    value={form.documentType}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14 }}
                  >
                    <option value="">-- Chọn loại văn bản --</option>
                    {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="documentNumber" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Số ký hiệu văn bản</label>
                  <input
                    id="documentNumber"
                    name="documentNumber"
                    type="text"
                    value={form.documentNumber}
                    onChange={handleChange}
                    placeholder="Vd: 61/QĐ-UBND"
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div className="form-group">
                  <label htmlFor="signerName" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Người ký</label>
                  <input
                    id="signerName"
                    name="signerName"
                    type="text"
                    value={form.signerName}
                    onChange={handleChange}
                    placeholder="Họ tên người ký..."
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="signerTitle" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Chức vụ người ký</label>
                  <input
                    id="signerTitle"
                    name="signerTitle"
                    type="text"
                    value={form.signerTitle}
                    onChange={handleChange}
                    placeholder="Chức vụ..."
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div className="form-group">
                  <label htmlFor="departmentId" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Phòng ban soạn thảo</label>
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
                  <label htmlFor="urgency" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Độ khẩn</label>
                  <select
                    id="urgency"
                    name="urgency"
                    value={form.urgency}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14 }}
                  >
                    {URGENCY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div className="form-group">
                  <label htmlFor="confidentialityLevel" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Mức độ mật</label>
                  <select
                    id="confidentialityLevel"
                    name="confidentialityLevel"
                    value={form.confidentialityLevel}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14 }}
                  >
                    {CONFIDENTIALITY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="pageCount" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Số trang</label>
                  <input
                    id="pageCount"
                    name="pageCount"
                    type="number"
                    min={1}
                    value={form.pageCount || ''}
                    onChange={handleChange}
                    placeholder="Số trang..."
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Người nhận */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div className="form-group">
                  <label htmlFor="recipientName" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Người/Cơ quan nhận</label>
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
                  <label htmlFor="recipientAddress" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Địa chỉ người nhận</label>
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
                <div className="form-group">
                  <label htmlFor="recipientEmail" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Email người nhận</label>
                  <input
                    id="recipientEmail"
                    name="recipientEmail"
                    type="email"
                    value={form.recipientEmail}
                    onChange={handleChange}
                    placeholder="example@domain.com..."
                    style={{ width: '100%', padding: '10px 14px', border: `1px solid ${validationErrors.recipientEmail ? '#e74c3c' : '#dfe6e9'}`, borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                  />
                  {validationErrors.recipientEmail && <p style={{ color: '#e74c3c', fontSize: 13, marginTop: 4 }}>{validationErrors.recipientEmail}</p>}
                </div>
              </div>

              {/* Mô tả + ghi chú */}
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label htmlFor="description" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Mô tả thêm</label>
                <textarea
                  id="description"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 28 }}>
                <label htmlFor="notes" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Ghi chú nội bộ</label>
                <textarea
                  id="notes"
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  rows={2}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => navigate(`/outgoing-documents/${doc.id}`)} disabled={actionLoading}>
                  Hủy
                </button>
                <button
                  id="btn-save-outgoing-metadata"
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? '⏳ Đang lưu...' : '💾 Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
