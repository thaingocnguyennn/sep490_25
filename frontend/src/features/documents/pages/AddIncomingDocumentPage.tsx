import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  documentsApi,
  incomingDocumentsApi,
  departmentsApi,
  type OcrResult,
  type ProcessorType,
  type Department,
  type Urgency,
} from '../../../api';
import { useProcessors } from '../../../shared/hooks';
import { useAuth } from '../../../contexts/AuthContext';

interface ProcessorAssignment {
  userId: number;
  processorType: ProcessorType;
}

const PROCESSOR_TYPE_LABELS: Record<ProcessorType, string> = {
  XLC: 'XLC - Người xử lý chính',
  PHXL: 'PHXL - Người phối hợp xử lý',
  XDB: 'XDB - Để biết',
};

const URGENCY_LABELS: Record<Urgency, string> = {
  THUONG: 'Thường',
  KHAN: 'Khẩn',
  THUONG_KHAU: 'Thượng khẩn',
  HOA_TOC: 'Hỏa tốc',
};

type Step = 1 | 2;

export default function AddIncomingDocumentPage() {
  const navigate = useNavigate();
  const { isDocumentClerk, isAdmin } = useAuth();
  const hasAccess = isDocumentClerk || isAdmin;
  const { processors, loading: loadingProcessors, fetch: fetchProcessors } = useProcessors();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrSuccess, setOcrSuccess] = useState('');
  const [ocrRawText, setOcrRawText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);

  // OCR-extracted fields
  const [form, setForm] = useState({
    issuer: '',
    documentNumber: '',
    dateLetter: '',
    documentType: '',
    summary: '',
    pageCount: '',
    signerName: '',
    signerTitle: '',
  });

  // Clerk-entered fields
  const [arrivalNumber, setArrivalNumber] = useState('');
  const [dateReceived, setDateReceived] = useState(new Date().toISOString().split('T')[0]);
  const [urgency, setUrgency] = useState<Urgency>('THUONG');
  const [departmentId, setDepartmentId] = useState('');
  const [notes, setNotes] = useState('');
  const [processingInstructions, setProcessingInstructions] = useState('');

  const [attachments, setAttachments] = useState<{ name: string; url: string }[]>([]);
  const [processorsList, setProcessorsList] = useState<ProcessorAssignment[]>([]);

  if (!hasAccess) {
    return (
      <>
        <div className="top-bar">
          <h1>Thêm Văn bản đến mới</h1>
          <button className="btn btn-secondary" onClick={() => navigate('/incoming-documents')}>Quay lại</button>
        </div>
        <div className="page-content">
          <div className="alert alert-error">Bạn không có quyền tạo văn bản đến.</div>
        </div>
      </>
    );
  }

  useEffect(() => {
    fetchProcessors();
    setLoadingDepts(true);
    departmentsApi
      .getAll()
      .then(({ data }) => setDepartments(data.data || []))
      .catch(() => setDepartments([]))
      .finally(() => setLoadingDepts(false));
  }, [fetchProcessors]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError('');
      setOcrSuccess('');
      setOcrRawText('');
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

      const { data } = await documentsApi.getOcr(formData);
      const result: OcrResult = data.data!;
      const fields = result.extractedFields;

      setForm((prev) => ({
        ...prev,
        issuer: fields.issuer || prev.issuer,
        documentNumber: fields.documentNumber || prev.documentNumber,
        dateLetter: fields.dateLetter || prev.dateLetter,
        documentType: fields.documentType || prev.documentType,
        summary: fields.summary || prev.summary,
        pageCount: fields.pageCount || prev.pageCount,
        signerName: fields.signerName || prev.signerName,
        signerTitle: fields.signerTitle || prev.signerTitle,
      }));

      setOcrRawText(result.text || '');

      const extractedKeys = Object.keys(fields);
      if (extractedKeys.length === 0) {
        setOcrSuccess('');
        setError('Không trích xuất được trường nào từ tài liệu. Vui lòng điền thông tin thủ công.');
      } else {
        setOcrSuccess(`Đã trích xuất thành công ${extractedKeys.length} trường: ${extractedKeys.join(', ')}. Vui lòng kiểm tra và chỉnh sửa nếu cần.`);
      }
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setError(apiError.response?.data?.message || 'Xử lý OCR thất bại. Vui lòng điền thông tin thủ công.');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleAddAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newAttachments = Array.from(files).map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
      }));
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleProcessorToggle = (userId: number, type: ProcessorType) => {
    setProcessorsList((prev) => {
      const existing = prev.find((p) => p.userId === userId);
      if (existing) {
        if (existing.processorType === type) {
          return prev.filter((p) => p.userId !== userId);
        }
        return prev.map((p) => p.userId === userId ? { ...p, processorType: type } : p);
      }
      return [...prev, { userId, processorType: type }];
    });
  };

  const validateStep1 = (): string | null => {
    if (!dateReceived) return 'Ngày đến là bắt buộc';
    return null;
  };

  const validateStep2 = (): string | null => {
    if (processorsList.length === 0) return 'Phải chọn ít nhất một người xử lý';
    const hasXLC = processorsList.some((p) => p.processorType === 'XLC');
    if (!hasXLC) return 'Phải chọn ít nhất một Người xử lý chính (XLC)';
    return null;
  };

  const handleContinue = () => {
    const validationError = validateStep1();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setCurrentStep(2);
  };

  const handleConfirm = async () => {
    const validationError = validateStep2();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await incomingDocumentsApi.create({
        issuer: form.issuer || undefined,
        documentType: form.documentType || undefined,
        documentNumber: form.documentNumber || undefined,
        arrivalNumber: arrivalNumber ? Number(arrivalNumber) : undefined,
        signerName: form.signerName || undefined,
        signerTitle: form.signerTitle || undefined,
        dateLetter: form.dateLetter || undefined,
        dateReceived,
        summary: form.summary || undefined,
        pageCount: form.pageCount ? Number(form.pageCount) : undefined,
        urgency,
        notes: notes || undefined,
        processingInstructions: processingInstructions || undefined,
        departmentId: departmentId ? Number(departmentId) : undefined,
        processorIds: processorsList,
        attachments: attachments.map((a) => ({
          fileName: a.name,
          fileUrl: a.url,
        })),
      });

      navigate('/incoming-documents');
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setError(apiError.response?.data?.message || 'Tạo văn bản đến thất bại. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  const getProcessorRole = (userId: number) => {
    return processors.find((p) => p.id === userId)?.roles.join(', ') || '';
  };

  const getUserProcessorType = (userId: number) => {
    return processorsList.find((p) => p.userId === userId)?.processorType || null;
  };

  return (
    <>
      <div className="top-bar">
        <h1>Thêm Văn bản đến mới</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/incoming-documents')}>
          Quay lại
        </button>
      </div>

      <div className="page-content">
        <div className="step-indicator">
          <div className={`step-item ${currentStep === 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
            <div className="step-number">1</div>
            <div className="step-label">Thông tin văn bản</div>
          </div>
          <div className="step-line" />
          <div className={`step-item ${currentStep === 2 ? 'active' : ''}`}>
            <div className="step-number">2</div>
            <div className="step-label">Phân công xử lý</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>{currentStep === 1 ? 'Bước 1: Thông tin văn bản' : 'Bước 2: Phân công xử lý & Gửi'}</h2>
          </div>

          <div className="card-body">
            {error && <div className="alert alert-error">{error}</div>}

            {currentStep === 1 && (
              <div className="form-grid">
                {/* ── OCR Section ─────────────────────────────────────── */}
                <div className="form-group full-width ocr-section">
                  <label>OCR - Trích xuất tự động</label>
                  <div className="ocr-upload-row">
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
                      disabled={ocrLoading}
                    >
                      {selectedFile ? 'Đổi tệp' : 'Tải tệp lên'}
                    </button>
                    {selectedFile && (
                      <span className="file-name-display">{selectedFile.name}</span>
                    )}
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleOcr}
                      disabled={ocrLoading || !selectedFile}
                    >
                      {ocrLoading ? 'Đang xử lý OCR...' : 'OCR'}
                    </button>
                  </div>
                  {ocrLoading && (
                    <div className="ocr-progress">
                      <div className="spinner" style={{ width: 20, height: 20 }} />
                      <span>Đang trích xuất nội dung...</span>
                    </div>
                  )}
                  {ocrSuccess && (
                    <div className="alert alert-success" style={{ marginTop: 8 }}>
                      {ocrSuccess}
                    </div>
                  )}
                  {ocrRawText && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer', color: '#636e72', fontSize: 12 }}>
                        Xem văn bản OCR thô ({ocrRawText.length} ký tự)
                      </summary>
                      <pre
                        style={{
                          background: '#f8f9fa',
                          border: '1px solid #dee2e6',
                          borderRadius: 4,
                          padding: 8,
                          fontSize: 11,
                          maxHeight: 200,
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          marginTop: 4,
                        }}
                      >
                        {ocrRawText}
                      </pre>
                    </details>
                  )}
                  <p style={{ fontSize: 12, color: '#636e72', marginTop: 6 }}>
                    Tải lên tài liệu quét (PNG, JPEG, TIFF, PDF) và nhấn OCR để tự động trích xuất thông tin.
                  </p>
                </div>

                {/* ── OCR Fields (auto-extracted) ────────────────────────── */}
                <div className="form-group full-width">
                  <label htmlFor="issuer">Cơ quan ban hành</label>
                  <input
                    id="issuer"
                    name="issuer"
                    type="text"
                    value={form.issuer}
                    onChange={handleChange}
                    placeholder="VD: ỦY BAN NHÂN DÂN TỈNH NINH BÌNH"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="documentNumber">Số ký hiệu</label>
                  <input
                    id="documentNumber"
                    name="documentNumber"
                    type="text"
                    value={form.documentNumber}
                    onChange={handleChange}
                    placeholder="VD: 61/2026/QĐ-UBND"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="dateLetter">Ngày, tháng, năm văn bản</label>
                  <input
                    id="dateLetter"
                    name="dateLetter"
                    type="text"
                    value={form.dateLetter}
                    onChange={handleChange}
                    placeholder="VD: 2026-05-26 hoặc 26/05/2026"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="documentType">Loại văn bản</label>
                  <input
                    id="documentType"
                    name="documentType"
                    type="text"
                    value={form.documentType}
                    onChange={handleChange}
                    placeholder="VD: QUYẾT ĐỊNH, CÔNG VĂN..."
                    list="docTypeSuggestions"
                  />
                  <datalist id="docTypeSuggestions">
                    <option value="QUYẾT ĐỊNH" />
                    <option value="CÔNG VĂN" />
                    <option value="THÔNG BÁO" />
                    <option value="TỜ TRÌNH" />
                    <option value="BÁO CÁO" />
                    <option value="KẾ HOẠCH" />
                    <option value="HƯỚNG DẪN" />
                    <option value="CHỈ THỊ" />
                  </datalist>
                </div>

                <div className="form-group">
                  <label htmlFor="pageCount">Số trang văn bản</label>
                  <input
                    id="pageCount"
                    name="pageCount"
                    type="number"
                    min="1"
                    value={form.pageCount}
                    onChange={handleChange}
                    placeholder="VD: 3"
                  />
                </div>

                <div className="form-group full-width">
                  <label htmlFor="summary">Trích yếu nội dung</label>
                  <textarea
                    id="summary"
                    name="summary"
                    value={form.summary}
                    onChange={handleChange}
                    placeholder="VD: Ban hành Quy chế đào tạo, bồi dưỡng cán bộ, công chức, viên chức trên địa bàn tỉnh..."
                    rows={2}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="signerName">Họ tên người ký</label>
                  <input
                    id="signerName"
                    name="signerName"
                    type="text"
                    value={form.signerName}
                    onChange={handleChange}
                    placeholder="VD: Nguyễn Anh Chức"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="signerTitle">Chức vụ người ký</label>
                  <input
                    id="signerTitle"
                    name="signerTitle"
                    type="text"
                    value={form.signerTitle}
                    onChange={handleChange}
                    placeholder="VD: PHÓ CHỦ TỊCH"
                    list="signerTitleSuggestions"
                  />
                  <datalist id="signerTitleSuggestions">
                    <option value="CHỦ TỊCH" />
                    <option value="PHÓ CHỦ TỊCH" />
                    <option value="GIÁM ĐỐC" />
                    <option value="TRƯỞNG PHÒNG" />
                  </datalist>
                </div>

                {/* ── Clerk-Entered Fields ─────────────────────────────── */}
                <div className="form-group">
                  <label htmlFor="arrivalNumber">Số đến</label>
                  <input
                    id="arrivalNumber"
                    type="number"
                    min="1"
                    value={arrivalNumber}
                    onChange={(e) => setArrivalNumber(e.target.value)}
                    placeholder="Số tự động tăng khi tiếp nhận"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="dateReceived">Ngày đến <span className="required">*</span></label>
                  <input
                    id="dateReceived"
                    type="date"
                    value={dateReceived}
                    onChange={(e) => setDateReceived(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="urgency">Độ khẩn</label>
                  <select id="urgency" value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)}>
                    <option value="THUONG">Thường</option>
                    <option value="KHAN">Khẩn</option>
                    <option value="THUONG_KHAU">Thượng khẩn</option>
                    <option value="HOA_TOC">Hỏa tốc</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="departmentId">Phòng ban tiếp nhận</label>
                  <select
                    id="departmentId"
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    disabled={loadingDepts}
                  >
                    <option value="">-- Chọn phòng ban --</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group full-width">
                  <label htmlFor="notes">Ghi chú</label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ghi chú bổ sung..."
                    rows={2}
                  />
                </div>

                {/* ── Attachments ─────────────────────────────────────── */}
                <div className="form-group full-width">
                  <label>Tệp đính kèm</label>
                  <input
                    type="file"
                    multiple
                    onChange={handleAddAttachment}
                    style={{ padding: '8px 0' }}
                  />
                  {attachments.length > 0 && (
                    <div className="attachment-list">
                      {attachments.map((att, idx) => (
                        <div key={idx} className="attachment-item">
                          <span>{att.name}</span>
                          <button
                            type="button"
                            className="att-remove-btn"
                            onClick={() => handleRemoveAttachment(idx)}
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div>
                <div className="processor-instructions">
                  <p>Phân công nhân viên xử lý văn bản này. Phải chọn ít nhất một <strong>XLC (Người xử lý chính)</strong>.</p>
                </div>

                <div className="processor-legend">
                  <div className="legend-item">
                    <span className="legend-badge xl">XLC</span>
                    <span>Người xử lý chính — Người chịu trách nhiệm chính</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-badge ph">PHXL</span>
                    <span>Người phối hợp xử lý — Hỗ trợ người xử lý chính</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-badge xd">XDB</span>
                    <span>Để biết</span>
                  </div>
                </div>

                <div className="processor-section">
                  <h3>Chọn người xử lý</h3>
                  {loadingProcessors ? (
                    <div className="loading-spinner"><div className="spinner" /></div>
                  ) : (
                    <div className="processor-grid">
                      {processors.map((processor) => {
                        const currentType = getUserProcessorType(processor.id);
                        return (
                          <div key={processor.id} className={`processor-card ${currentType ? 'selected' : ''}`}>
                            <div className="processor-card-header">
                              <div className="processor-avatar">
                                {processor.fullName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                              </div>
                              <div className="processor-info">
                                <div className="processor-name">{processor.fullName}</div>
                                <div className="processor-roles">{getProcessorRole(processor.id)}</div>
                              </div>
                            </div>
                            <div className="processor-type-buttons">
                              {(['XLC', 'PHXL', 'XDB'] as ProcessorType[]).map((type) => (
                                <button
                                  key={type}
                                  type="button"
                                  className={`processor-type-btn ${currentType === type ? 'active' : ''} type-${type.toLowerCase()}`}
                                  onClick={() => handleProcessorToggle(processor.id, type)}
                                  title={PROCESSOR_TYPE_LABELS[type]}
                                >
                                  {type}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ marginTop: 24 }}>
                  <label htmlFor="processingInstructions">Hướng dẫn xử lý</label>
                  <textarea
                    id="processingInstructions"
                    value={processingInstructions}
                    onChange={(e) => setProcessingInstructions(e.target.value)}
                    placeholder="Hướng dẫn cách xử lý văn bản này..."
                    rows={4}
                  />
                </div>

                {/* ── Summary ──────────────────────────────────────── */}
                <div className="submission-summary">
                  <h3>Tóm tắt nộp văn bản</h3>
                  <div className="summary-grid">
                    <div className="summary-item">
                      <span className="summary-label">Cơ quan ban hành</span>
                      <span className="summary-value">{form.issuer || '—'}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Số ký hiệu</span>
                      <span className="summary-value">{form.documentNumber || '—'}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Loại văn bản</span>
                      <span className="summary-value">{form.documentType || '—'}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Ngày văn bản</span>
                      <span className="summary-value">{form.dateLetter || '—'}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Trích yếu</span>
                      <span className="summary-value">{form.summary || '—'}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Người ký</span>
                      <span className="summary-value">
                        {form.signerName
                          ? `${form.signerName}${form.signerTitle ? ` (${form.signerTitle})` : ''}`
                          : '—'}
                      </span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Số đến</span>
                      <span className="summary-value">{arrivalNumber || 'Tự động'}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Ngày đến</span>
                      <span className="summary-value">{dateReceived}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Độ khẩn</span>
                      <span className="summary-value">{URGENCY_LABELS[urgency]}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Phòng ban</span>
                      <span className="summary-value">
                        {departments.find((d) => d.id === Number(departmentId))?.name || 'Chưa chọn'}
                      </span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Tệp đính kèm</span>
                      <span className="summary-value">{attachments.length} tệp</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Người xử lý</span>
                      <span className="summary-value">{processorsList.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="form-actions">
              {currentStep === 2 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setCurrentStep(1); setError(''); }}
                >
                  Quay lại
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate('/incoming-documents')}
              >
                Hủy
              </button>
              {currentStep === 1 && (
                <button type="button" className="btn btn-primary" onClick={handleContinue}>
                  Tiếp tục
                </button>
              )}
              {currentStep === 2 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirm}
                  disabled={submitting}
                >
                  {submitting ? 'Đang gửi...' : 'Xác nhận & Gửi'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
