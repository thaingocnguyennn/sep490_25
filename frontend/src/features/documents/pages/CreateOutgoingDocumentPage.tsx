import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams, useOutletContext } from 'react-router-dom';
import { useOutgoingDocumentActions, useDepartments } from '../../../shared/hooks';
import { URGENCY_OPTIONS as URGENCY_LIST } from '../../../shared/constants/urgency';
import { CONFIDENTIALITY_OPTIONS } from '../../../shared/constants/confidentiality';
import { documentsApi } from '../../../api';
import type { CreateOutgoingDocumentRequest, OcrResult, UrgencyName, ConfidentialityCodeOrName } from '../../../types';
import { useDocumentTypeOptions } from '../../document-types/hooks/useDocumentTypes';
import { useDocumentCategoryOptions } from '../../document-categories/hooks/useDocumentCategories';
import DocumentViewer from '../components/DocumentViewer';
import SignaturePanel from '../components/SignaturePanel';
import type { LayoutContextValue } from '../../../layouts/MainLayout';

const URGENCY_OPTIONS: { value: UrgencyName; label: string }[] = URGENCY_LIST.map((o) => ({
  value: o.value,
  label: o.label,
}));

const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateToYmd = (val?: string | null): string => {
  if (!val) return getTodayDateString();
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const dmy = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    const iso = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    if (!Number.isNaN(new Date(iso).getTime())) return iso;
  }

  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return getTodayDateString();
};

export default function CreateOutgoingDocumentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromIncomingId = searchParams.get('fromIncomingId');

  const { create, uploadFile, loading: creating } = useOutgoingDocumentActions();
  const { departments } = useDepartments();
  const { options: documentTypeOptions, fetchOptions: fetchDocumentTypes } = useDocumentTypeOptions();
  const { options: categoryOptions, fetchOptions: fetchCategories } = useDocumentCategoryOptions();
  const layout = useOutletContext<LayoutContextValue>();

  // State
  const [error, setError] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrSuccess, setOcrSuccess] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab: 'form' | 'signatures'
  const [activeTab, setActiveTab] = useState<'form' | 'signatures'>('form');
  const [detectedSignatureCount, setDetectedSignatureCount] = useState(0);

  // ─── OCR text cache — gửi kèm khi tạo để lưu DB 1 lần duy nhất ───
  const [ocrText, setOcrText] = useState<string | undefined>(undefined);

  const [form, setForm] = useState<CreateOutgoingDocumentRequest>({
    issuer: '',
    documentNumber: '',
    issuedDate: getTodayDateString(),
    documentTypeId: undefined,
    subject: '',
    signerName: '',
    signerTitle: '',
    urgency: 'THUONG',
    confidentialityLevel: 'THUONG',
    recipientName: '',
    recipientAddress: '',
    recipientEmail: '',
    departmentId: undefined,
    documentCategoryId: undefined,
    pageCount: undefined,
    relatedIncomingDocumentId: fromIncomingId ? Number(fromIncomingId) : undefined,
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Collapse sidebar on mount
  useEffect(() => {
    if (layout) layout.setSidebarCollapsed(true);
    fetchDocumentTypes();
    fetchCategories();
    return () => {
      if (layout) layout.setSidebarCollapsed(false);
    };
  }, [layout, fetchDocumentTypes, fetchCategories]);

  useEffect(() => {
    return () => {
      if (documentPreviewUrl) URL.revokeObjectURL(documentPreviewUrl);
    };
  }, [documentPreviewUrl]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'issuedDate' && !value ? getTodayDateString() : value,
    }));
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
      setOcrText(undefined);
      setDetectedSignatureCount(0);
    }
  };

  const handleOcr = async () => {
    if (!selectedFile) {
      setError('Vui lòng tải tệp lên trước khi chạy OCR.');
      return;
    }

    setOcrLoading(true);
    setError('');
    setOcrText(undefined);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('mimeType', selectedFile.type);
      formData.append('mode', 'OUTGOING');

      const { data } = await documentsApi.getOcr(formData);
      const result = data.data as OcrResult;
      const fields = result.extractedFields ?? {};

      // Lưu toàn văn OCR
      setOcrText(result.text ?? undefined);

      // Tự động khớp Loại văn bản (documentType string) với danh mục
      let matchedDocumentTypeId: number | undefined = undefined;
      if (fields.documentType && documentTypeOptions.length > 0) {
        const normalized = String(fields.documentType).toLowerCase().trim().replace(/\s+/g, ' ');
        const matched = documentTypeOptions.find(
          (o) =>
            o.name.toLowerCase().trim().replace(/\s+/g, ' ') === normalized ||
            o.code.toLowerCase().trim() === normalized ||
            normalized.includes(o.name.toLowerCase().trim()),
        );
        if (matched) matchedDocumentTypeId = matched.id;
      }

      // Tự động khớp Độ khẩn
      let matchedUrgency: UrgencyName | undefined = undefined;
      const rawUrgency = fields.urgencyLevel;
      if (rawUrgency) {
        const u = String(rawUrgency).toUpperCase().replace(/\s/g, '_');
        const urgencyMap: Record<string, UrgencyName> = {
          HOA_TOC: 'HOA_TOC', HỎA_TỐC: 'HOA_TOC',
          THUONG_KHAN: 'THUONG_KHAN', THƯỢNG_KHẨN: 'THUONG_KHAN',
          KHAN: 'KHAN', KHẨN: 'KHAN',
          THUONG: 'THUONG', THƯỜNG: 'THUONG',
        };
        matchedUrgency = urgencyMap[u];
      }

      // Tự động khớp Độ mật
      let matchedConfidentiality: ConfidentialityCodeOrName | undefined = undefined;
      const rawConf = fields.confidentialityLevel;
      if (rawConf) {
        const c = String(rawConf).toUpperCase().replace(/\s/g, '_');
        const confMap: Record<string, ConfidentialityCodeOrName> = {
          TUYET_MAT: 'TUYET_MAT', TUYỆT_MẬT: 'TUYET_MAT', A: 'TUYET_MAT',
          TOI_MAT: 'TOI_MAT', TỐI_MẬT: 'TOI_MAT', B: 'TOI_MAT',
          MAT: 'MAT', MẬT: 'MAT', C: 'MAT',
          THUONG: 'THUONG', THƯỜNG: 'THUONG',
        };
        matchedConfidentiality = confMap[c];
      }

      // ─── Điền đầy đủ tất cả 9 trường quan trọng theo đúng bảng đối chiếu ───
      setForm((prev) => ({
        ...prev,
        // 1. Cơ quan ban hành
        issuer: fields.issuer || prev.issuer,
        // 2. Số ký hiệu
        documentNumber: fields.documentNumber || prev.documentNumber,
        // 3. Ngày tháng năm văn bản: Luôn giữ nguyên ngày người dùng đã chọn hoặc mặc định ngày hiện tại, không để OCR làm mất ngày
        issuedDate: prev.issuedDate ? parseDateToYmd(prev.issuedDate) : getTodayDateString(),
        // 4. Loại văn bản
        ...(matchedDocumentTypeId ? { documentTypeId: matchedDocumentTypeId } : {}),
        // 5. Trích yếu
        subject: fields.summary || prev.subject,
        // 6. Chức vụ người ký
        signerTitle: fields.signerTitle || prev.signerTitle,
        // 7. Họ và tên người ký
        signerName: fields.signerName || prev.signerName,
        // 8. Độ khẩn
        ...(matchedUrgency ? { urgency: matchedUrgency } : {}),
        // 9. Độ mật
        ...(matchedConfidentiality ? { confidentialityLevel: matchedConfidentiality } : {}),
        // Các trường bổ sung
        recipientName: fields.recipientName || prev.recipientName,
        pageCount: fields.pageCount ? Number(fields.pageCount) : prev.pageCount,
      }));

      const filledCount = Object.values(fields).filter(Boolean).length;
      if (filledCount === 0) {
        setOcrSuccess('');
        setError('Không trích xuất được thông tin nào. Vui lòng nhập thủ công.');
      } else {
        setOcrSuccess(
          `Đã trích xuất thành công ${filledCount} trường: Cơ quan ban hành, Số ký hiệu, Trích yếu, Người ký, Chức vụ, Nơi nhận...`,
        );
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Xử lý OCR thất bại.');
    } finally {
      setOcrLoading(false);
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.issuer?.trim()) errs.issuer = 'Cơ quan ban hành không được để trống';
    if (!form.documentNumber?.trim()) errs.documentNumber = 'Số ký hiệu không được để trống';
    if (!form.issuedDate?.trim()) errs.issuedDate = 'Ngày văn bản không được để trống';
    if (!form.documentTypeId) errs.documentTypeId = 'Vui lòng chọn loại văn bản';
    if (!form.subject?.trim()) errs.subject = 'Trích yếu nội dung không được để trống';
    if (!form.departmentId) errs.departmentId = 'Vui lòng chọn phòng ban soạn thảo';
    if (!form.signerName?.trim()) errs.signerName = 'Người ký không được để trống';
    if (!form.signerTitle?.trim()) errs.signerTitle = 'Chức vụ người ký không được để trống';
    if (!form.recipientName?.trim()) errs.recipientName = 'Nơi nhận / Đơn vị nhận không được để trống';
    if (!selectedFile) errs.file = 'Vui lòng tải lên tệp dự thảo';

    setValidationErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError('Vui lòng kiểm tra và điền đầy đủ các trường bắt buộc (*).');
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
        issuer: form.issuer?.trim() || undefined,
        documentNumber: form.documentNumber?.trim() || undefined,
        issuedDate: form.issuedDate?.trim() || undefined,
        signerName: form.signerName?.trim() || undefined,
        signerTitle: form.signerTitle?.trim() || undefined,
        pageCount: form.pageCount ? Number(form.pageCount) : undefined,
        documentTypeId: form.documentTypeId ? Number(form.documentTypeId) : undefined,
        departmentId: form.departmentId ? Number(form.departmentId) : undefined,
        documentCategoryId: form.documentCategoryId ? Number(form.documentCategoryId) : undefined,
        recipientName: form.recipientName?.trim() || undefined,
        recipientAddress: form.recipientAddress?.trim() || undefined,
        recipientEmail: form.recipientEmail?.trim() || undefined,
        // ─── Gửi kết quả OCR trong 1 lần duy nhất ───
        ...(ocrText
          ? {
            ocrText,
            ocrStatus: 'COMPLETED' as const,
          }
          : {}),
      });

      if (result) {
        // Upload tệp dự thảo
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
          OCR tự động
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
        {/* CỘT TRÁI: Viewer & OCR */}
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
              {ocrLoading ? 'Đang trích xuất OCR...' : 'Trích xuất OCR'}
            </button>

            {ocrLoading && (
              <div className="ocr-progress-bar">
                <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                <span>Đang xử lý OCR...</span>
              </div>
            )}
            {ocrSuccess && !error && (
              <div className="alert alert-success" style={{ margin: 0, padding: '6px 12px', fontSize: 13 }}>
                {ocrSuccess}
              </div>
            )}
          </div>
        </div>

        {/* CỘT PHẢI: Form Đầy Đủ Các Trường & Kiểm Tra Chữ Ký Số */}
        <div className="ocr-workspace-form-col">
          <div className="ocr-form-tabs">
            <button
              type="button"
              className={`ocr-form-tab ${activeTab === 'form' ? 'active' : ''}`}
              onClick={() => setActiveTab('form')}
            >
              Thông tin văn bản đi
            </button>
            <button
              type="button"
              className={`ocr-form-tab ${activeTab === 'signatures' ? 'active' : ''}`}
              onClick={() => setActiveTab('signatures')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              Kiểm tra chữ ký số
              {detectedSignatureCount > 0 && (
                <span
                  style={{
                    background: '#27ae60',
                    color: 'white',
                    borderRadius: 10,
                    padding: '1px 7px',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {detectedSignatureCount}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'signatures' ? (
            <div className="ocr-form-scroll" style={{ padding: 16 }}>
              <SignaturePanel
                file={selectedFile}
                mimeType={selectedFile?.type}
                onSignaturesLoaded={(res) => {
                  setDetectedSignatureCount(res.signatureCount);
                  if (
                    res.signatures.length > 0 &&
                    res.signatures[0].signerName &&
                    !form.signerName
                  ) {
                    setForm((prev) => ({
                      ...prev,
                      signerName: prev.signerName || res.signatures[0].signerName || '',
                    }));
                  }
                }}
              />
            </div>
          ) : (
            <div className="ocr-form-scroll">
              <div className="form-section-body" style={{ padding: 16 }}>
                {form.relatedIncomingDocumentId && (
                  <div className="alert alert-info" style={{ marginBottom: 16 }}>
                    Văn bản này đang phúc đáp văn bản đến ID: {form.relatedIncomingDocumentId}
                  </div>
                )}

                {/* 1. Cơ quan ban hành & 2. Số ký hiệu */}
                <div className="signer-row">
                  <div className="form-group" style={{ flex: 1.2 }}>
                    <label htmlFor="issuer">
                      1. Cơ quan ban hành <span style={{ color: '#e74c3c' }}>*</span>
                    </label>
                    <input
                      id="issuer"
                      name="issuer"
                      type="text"
                      value={form.issuer || ''}
                      onChange={handleChange}
                      placeholder="VD: ỦY BAN NHÂN DÂN THÀNH PHỐ..."
                      style={{
                        borderColor: validationErrors.issuer ? '#e74c3c' : undefined,
                      }}
                    />
                    {validationErrors.issuer && (
                      <span style={{ color: '#e74c3c', fontSize: 12 }}>
                        {validationErrors.issuer}
                      </span>
                    )}
                  </div>
                  <div className="form-group" style={{ flex: 0.8 }}>
                    <label htmlFor="documentNumber">
                      2. Số ký hiệu <span style={{ color: '#e74c3c' }}>*</span>
                    </label>
                    <input
                      id="documentNumber"
                      name="documentNumber"
                      type="text"
                      value={form.documentNumber || ''}
                      onChange={handleChange}
                      placeholder="VD: 123/UBND-VP"
                      style={{
                        borderColor: validationErrors.documentNumber ? '#e74c3c' : undefined,
                      }}
                    />
                    {validationErrors.documentNumber && (
                      <span style={{ color: '#e74c3c', fontSize: 12 }}>
                        {validationErrors.documentNumber}
                      </span>
                    )}
                  </div>
                </div>

                {/* 3. Ngày văn bản & 4. Loại văn bản */}
                <div className="signer-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label htmlFor="issuedDate">
                      3. Ngày văn bản <span style={{ color: '#e74c3c' }}>*</span>
                    </label>
                    <input
                      id="issuedDate"
                      name="issuedDate"
                      type="date"
                      value={form.issuedDate || getTodayDateString()}
                      onChange={handleChange}
                      style={{
                        borderColor: validationErrors.issuedDate ? '#e74c3c' : undefined,
                      }}
                    />

                    {validationErrors.issuedDate && (
                      <span style={{ color: '#e74c3c', fontSize: 12 }}>
                        {validationErrors.issuedDate}
                      </span>
                    )}
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label htmlFor="documentTypeId">
                      4. Loại văn bản <span style={{ color: '#e74c3c' }}>*</span>
                    </label>
                    <select
                      id="documentTypeId"
                      name="documentTypeId"
                      value={form.documentTypeId || ''}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : undefined;
                        setForm((prev) => ({ ...prev, documentTypeId: val }));
                        if (validationErrors.documentTypeId) {
                          setValidationErrors((prev) => ({ ...prev, documentTypeId: '' }));
                        }
                      }}
                      style={{
                        borderColor: validationErrors.documentTypeId ? '#e74c3c' : undefined,
                      }}
                    >
                      <option value="">-- Chọn loại văn bản --</option>
                      {documentTypeOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                    {validationErrors.documentTypeId && (
                      <span style={{ color: '#e74c3c', fontSize: 12 }}>
                        {validationErrors.documentTypeId}
                      </span>
                    )}
                  </div>
                </div>

                {/* 5. Trích yếu nội dung */}
                <div className="form-group">
                  <label htmlFor="subject">
                    5. Trích yếu nội dung <span style={{ color: '#e74c3c' }}>*</span>
                  </label>
                  <textarea
                    id="subject"
                    name="subject"
                    rows={3}
                    value={form.subject}
                    onChange={handleChange}
                    placeholder="Về việc chỉ đạo triển khai kế hoạch..."
                    style={{
                      borderColor: validationErrors.subject ? '#e74c3c' : undefined,
                    }}
                  />
                  {validationErrors.subject && (
                    <span style={{ color: '#e74c3c', fontSize: 12 }}>
                      {validationErrors.subject}
                    </span>
                  )}
                </div>

                {/* 6. Lĩnh vực văn bản & 7. Phòng ban soạn thảo */}
                <div className="signer-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label htmlFor="documentCategoryId">6. Lĩnh vực văn bản</label>
                    <select
                      id="documentCategoryId"
                      name="documentCategoryId"
                      value={form.documentCategoryId || ''}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : undefined;
                        setForm((prev) => ({ ...prev, documentCategoryId: val }));
                      }}
                    >
                      <option value="">-- Chọn lĩnh vực --</option>
                      {categoryOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label htmlFor="departmentId">
                      7. Phòng ban soạn thảo <span style={{ color: '#e74c3c' }}>*</span>
                    </label>
                    <select
                      id="departmentId"
                      name="departmentId"
                      value={form.departmentId || ''}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : undefined;
                        setForm((prev) => ({ ...prev, departmentId: val }));
                        if (validationErrors.departmentId) {
                          setValidationErrors((prev) => ({ ...prev, departmentId: '' }));
                        }
                      }}
                      style={{
                        borderColor: validationErrors.departmentId ? '#e74c3c' : undefined,
                      }}
                    >
                      <option value="">-- Chọn phòng ban --</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    {validationErrors.departmentId && (
                      <span style={{ color: '#e74c3c', fontSize: 12 }}>
                        {validationErrors.departmentId}
                      </span>
                    )}
                  </div>
                </div>

                {/* Người ký & Chức vụ người ký */}
                <div className="signer-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label htmlFor="signerName">
                      Người ký <span style={{ color: '#e74c3c' }}>*</span>
                    </label>
                    <input
                      id="signerName"
                      name="signerName"
                      type="text"
                      value={form.signerName || ''}
                      onChange={handleChange}
                      placeholder="VD: Nguyễn Văn A"
                      style={{
                        borderColor: validationErrors.signerName ? '#e74c3c' : undefined,
                      }}
                    />
                    {validationErrors.signerName && (
                      <span style={{ color: '#e74c3c', fontSize: 12 }}>
                        {validationErrors.signerName}
                      </span>
                    )}
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label htmlFor="signerTitle">
                      Chức vụ người ký <span style={{ color: '#e74c3c' }}>*</span>
                    </label>
                    <input
                      id="signerTitle"
                      name="signerTitle"
                      type="text"
                      value={form.signerTitle || ''}
                      onChange={handleChange}
                      placeholder="VD: Chủ tịch, Giám đốc..."
                      style={{
                        borderColor: validationErrors.signerTitle ? '#e74c3c' : undefined,
                      }}
                    />
                    {validationErrors.signerTitle && (
                      <span style={{ color: '#e74c3c', fontSize: 12 }}>
                        {validationErrors.signerTitle}
                      </span>
                    )}
                  </div>
                </div>

                {/* Đơn vị/Người nhận, Email & Số trang */}
                <div className="signer-row">
                  <div className="form-group" style={{ flex: 1.2 }}>
                    <label htmlFor="recipientName">
                      Nơi nhận / Đơn vị nhận <span style={{ color: '#e74c3c' }}>*</span>
                    </label>
                    <input
                      id="recipientName"
                      name="recipientName"
                      type="text"
                      value={form.recipientName || ''}
                      onChange={handleChange}
                      placeholder="VD: Các phòng ban trực thuộc, Sở KH&ĐT..."
                      style={{
                        borderColor: validationErrors.recipientName ? '#e74c3c' : undefined,
                      }}
                    />
                    {validationErrors.recipientName && (
                      <span style={{ color: '#e74c3c', fontSize: 12 }}>
                        {validationErrors.recipientName}
                      </span>
                    )}
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label htmlFor="recipientEmail">Email nhận</label>
                    <input
                      id="recipientEmail"
                      name="recipientEmail"
                      type="email"
                      value={form.recipientEmail || ''}
                      onChange={handleChange}
                      placeholder="vanthu@example.gov.vn"
                    />
                  </div>
                  <div className="form-group" style={{ flex: 0.6 }}>
                    <label htmlFor="pageCount">Số trang</label>
                    <input
                      id="pageCount"
                      name="pageCount"
                      type="number"
                      min={1}
                      value={form.pageCount ?? ''}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : undefined;
                        setForm((prev) => ({ ...prev, pageCount: val }));
                      }}
                      placeholder="VD: 3"
                    />
                  </div>
                </div>

                {/* 8. Độ khẩn & 9. Độ mật */}
                <div className="signer-row">
                  <div className="form-group">
                    <label htmlFor="urgency">8. Độ khẩn</label>
                    <select
                      id="urgency"
                      name="urgency"
                      value={form.urgency}
                      onChange={handleChange}
                    >
                      {URGENCY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="confidentialityLevel">9. Độ mật</label>
                    <select
                      id="confidentialityLevel"
                      name="confidentialityLevel"
                      value={form.confidentialityLevel}
                      onChange={handleChange}
                    >
                      {CONFIDENTIALITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
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

