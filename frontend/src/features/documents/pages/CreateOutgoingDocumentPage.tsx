import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams, useOutletContext } from 'react-router-dom';
import { useOutgoingDocumentActions, useDepartments } from '../../../shared/hooks';
import { URGENCY_OPTIONS as URGENCY_LIST } from '../../../shared/constants/urgency';
import { documentsApi } from '../../../api';
import type { CreateOutgoingDocumentRequest, OcrResult, UrgencyName } from '../../../types';
import { useDocumentTypeOptions } from '../../document-types/hooks/useDocumentTypes';
import { useDocumentCategoryOptions } from '../../document-categories/hooks/useDocumentCategories';
import DocumentViewer from '../components/DocumentViewer';
import type { LayoutContextValue } from '../../../layouts/MainLayout';

const URGENCY_OPTIONS: { value: UrgencyName; label: string }[] = URGENCY_LIST.map((o) => ({
  value: o.value,
  label: o.label,
}));

// Document kinds fetched dynamically

export default function CreateOutgoingDocumentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromIncomingId = searchParams.get('fromIncomingId');

  const { create, uploadFile, loading: creating } = useOutgoingDocumentActions();
  const { departments } = useDepartments();
  const { options: documentTypeOptions, fetchOptions: fetchDocumentTypes } = useDocumentTypeOptions();
  // Lấy danh sách lĩnh vực đang ACTIVE để hiển thị dropdown
  const { options: categoryOptions, fetchOptions: fetchCategories } = useDocumentCategoryOptions();
  const layout = useOutletContext<LayoutContextValue>();

  // State
  const [error, setError] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrSuccess, setOcrSuccess] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<CreateOutgoingDocumentRequest>({
    subject: '',
    urgency: 'THUONG',
    confidentialityLevel: 'THUONG',
    documentTypeId: undefined,
    departmentId: undefined,
    // Lĩnh vực văn bản - mặc định chưa chọn
    documentCategoryId: undefined,
    recipientName: '',
    recipientAddress: '',
    recipientEmail: '',
    relatedIncomingDocumentId: fromIncomingId ? Number(fromIncomingId) : undefined,
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Collapse sidebar
  useEffect(() => {
    if (layout) layout.setSidebarCollapsed(true);
    fetchDocumentTypes();
    // Tải danh sách lĩnh vực ACTIVE khi component mount
    fetchCategories();
    return () => {
      if (layout) layout.setSidebarCollapsed(false);
    };
  }, [layout, fetchDocumentTypes]);

  useEffect(() => {
    return () => {
      if (documentPreviewUrl) URL.revokeObjectURL(documentPreviewUrl);
    };
  }, [documentPreviewUrl]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (validationErrors[name]) {
      setValidationErrors((prev) => ({ ...prev, [name]: '' }));
    }
    setError('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (documentPreviewUrl) URL.revokeObjectURL(documentPreviewUrl);
      setSelectedFile(file);
      setDocumentPreviewUrl(URL.createObjectURL(file));
      setError('');
      setOcrSuccess('');
    }
  };

  const handleOcr = async () => {
    if (!selectedFile) {
      setError('Vui lòng tải tệp lên trước khi chạy OCR.');
      return;
    }

    setOcrLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('mimeType', selectedFile.type);
      formData.append('mode', 'OUTGOING'); // Request outbound logic

      const { data } = await documentsApi.getOcr(formData);
      const result = data.data as OcrResult;
      const fields = result.extractedFields;

      setForm((prev) => ({
        ...prev,
        subject: fields.summary || prev.subject,
        recipientName: fields.recipientName || prev.recipientName,
        // documentType string from OCR can optionally be matched against documentTypeOptions here if desired
      }));

      const extractedKeys = Object.keys(fields);
      if (extractedKeys.length === 0) {
        setOcrSuccess('');
        setError('Không trích xuất được thông tin nào. Vui lòng nhập thủ công.');
      } else {
        setOcrSuccess(`Đã trích xuất thành công: ${extractedKeys.join(', ')}.`);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Xử lý OCR thất bại.');
    } finally {
      setOcrLoading(false);
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.subject.trim()) errs.subject = 'Trích yếu văn bản không được để trống';
    if (!selectedFile) errs.file = 'Vui lòng tải lên tệp dự thảo';
    setValidationErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError('Vui lòng kiểm tra lại các trường bắt buộc.');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!selectedFile) return;

    try {
      const result = await create({
        ...form,
        subject: form.subject.trim(),
        documentTypeId: form.documentTypeId ? Number(form.documentTypeId) : undefined,
        departmentId: form.departmentId ? Number(form.departmentId) : undefined,
        documentCategoryId: form.documentCategoryId ? Number(form.documentCategoryId) : undefined,
        recipientName: form.recipientName?.trim() || undefined,
        recipientAddress: form.recipientAddress?.trim() || undefined,
        recipientEmail: form.recipientEmail?.trim() || undefined,
      });

      if (result) {
        // Upload the file
        await uploadFile(result.id, selectedFile);
        navigate(`/outgoing-documents/${result.id}`, { state: { justCreated: true } });
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tạo văn bản đi');
    }
  };

  return (
    <div className="ocr-page-shell">
      <div className="ocr-workspace-topbar">
        <h1>Tạo Văn bản đi mới</h1>
        <div className="ocr-status-pill">
          <span className="ocr-status-dot" />
          OCR
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/outgoing-documents')}>
          Quay lại
        </button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ margin: '8px 16px', flexShrink: 0 }}>
          {error}
        </div>
      )}

      <div className="ocr-workspace">
        {/* LEFT: Viewer & OCR */}
        <div className="ocr-workspace-viewer-col">
          <DocumentViewer file={selectedFile} fileUrl={documentPreviewUrl} />

          <div className="ocr-upload-toolbar">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/jpg,image/tiff"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={ocrLoading || creating}
            >
              {selectedFile ? 'Đổi tệp' : 'Tải tệp lên *'}
            </button>
            {selectedFile && <span className="file-name-display">{selectedFile.name}</span>}

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleOcr}
              disabled={ocrLoading || creating || !selectedFile}
            >
              {ocrLoading ? 'Đang OCR...' : 'Trích xuất OCR'}
            </button>

            {ocrLoading && (
              <div className="ocr-progress-bar">
                <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                <span>Đang xử lý...</span>
              </div>
            )}
            {ocrSuccess && !error && (
              <div className="alert alert-success" style={{ margin: 0, padding: '4px 10px', fontSize: 12 }}>
                {ocrSuccess}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Form */}
        <div className="ocr-workspace-form-col">
          <div className="ocr-form-tabs">
            <button type="button" className="ocr-form-tab active">
              Thông tin Dự thảo
            </button>
          </div>

          <div className="ocr-form-scroll">
            <div className="form-section-body" style={{ padding: 16 }}>
              {form.relatedIncomingDocumentId && (
                <div className="alert alert-info" style={{ marginBottom: 16 }}>
                  Văn bản này đang phúc đáp văn bản đến ID: {form.relatedIncomingDocumentId}
                </div>
              )}

              <div className="form-group summary-field">
                <label htmlFor="subject">Trích yếu <span className="required">*</span></label>
                <textarea
                  id="subject"
                  name="subject"
                  value={form.subject}
                  onChange={handleChange}
                  rows={3}
                  className={validationErrors.subject ? 'is-invalid' : ''}
                  placeholder="Trích yếu nội dung văn bản..."
                />
                {validationErrors.subject && <span className="error-text">{validationErrors.subject}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="recipientName">Nơi nhận (Kính gửi)</label>
                <input
                  id="recipientName"
                  name="recipientName"
                  type="text"
                  value={form.recipientName}
                  onChange={handleChange}
                  placeholder="Trích xuất từ phần Kính gửi của VB..."
                />
              </div>

              <div className="signer-row">
                <div className="form-group">
                  <label htmlFor="documentTypeId">Loại văn bản</label>
                  <select
                    id="documentTypeId"
                    name="documentTypeId"
                    value={form.documentTypeId || ''}
                    onChange={handleChange}
                  >
                    <option value="">-- Chọn loại --</option>
                    {documentTypeOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="departmentId">Phòng ban</label>
                  <select
                    id="departmentId"
                    name="departmentId"
                    value={form.departmentId || ''}
                    onChange={handleChange}
                  >
                    <option value="">-- Chọn --</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="signer-row">
                <div className="form-group">
                  <label htmlFor="documentCategoryId">Lĩnh vực</label>
                  <select
                    id="documentCategoryId"
                    name="documentCategoryId"
                    value={form.documentCategoryId || ''}
                    onChange={handleChange}
                  >
                    <option value="">-- Chọn lĩnh vực --</option>
                    {/* Chỉ hiển thị các lĩnh vực đang ACTIVE (do API /options trả về) */}
                    {categoryOptions.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="urgency">Độ khẩn</label>
                  <select
                    id="urgency"
                    name="urgency"
                    value={form.urgency}
                    onChange={handleChange}
                  >
                    {URGENCY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>

              {/* notes field removed — Document.notes no longer exists */}
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="ocr-actions-bar">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/outgoing-documents')}
            disabled={creating}
          >
            Hủy
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={creating}
          >
            {creating ? 'Đang lưu...' : 'Lưu nháp'}
          </button>
        </div>
      </div>
    </div>
  );
}
