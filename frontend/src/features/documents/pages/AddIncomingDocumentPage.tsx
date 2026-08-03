import { useState, useRef, useEffect } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  documentsApi,
  incomingDocumentsApi,
  type ProcessorType,
  type Urgency,
} from '../../../api';
import { useProcessors } from '../../../shared/hooks';
import { useAuth } from '../../../contexts/AuthContext';
import { URGENCY_OPTIONS } from '../../../shared/constants/urgency';
import { CONFIDENTIALITY_OPTIONS } from '../../../shared/constants/confidentiality';
import DocumentViewer from '../components/DocumentViewer';
import OrganizationAssignmentTree from '../components/OrganizationAssignmentTree';
import { useDocumentTypeOptions } from '../../document-types/hooks/useDocumentTypes';
import type { LayoutContextValue } from '../../../layouts/MainLayout';
import type { ConfidentialityCodeOrName, OcrResult } from '../../../types';

interface ProcessorAssignment {
  userId: number;
  processorType: ProcessorType;
}

interface AddIncomingDocumentPageProps {
  editMode?: boolean;
}

const PROCESSOR_TYPE_LABELS: Record<ProcessorType, string> = {
  XLC: 'XLC - Người xử lý chính',
  PHXL: 'PHXL - Người phối hợp xử lý',
  XDB: 'XDB - Để biết',
};

const URGENCY_LABELS: Record<Urgency, string> = {
  THUONG: 'Thường',
  KHAN: 'Khẩn',
  THUONG_KHAU: 'Thượng khẩu',
  THUONG_KHAN: 'Thượng khẩn',
  HOA_TOC: 'Hỏa tốc',
};

function normalizeDate(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const dmy = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    const iso = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    if (!Number.isNaN(new Date(iso).getTime())) return iso;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return trimmed;
}

type Step = 1 | 2;

export default function AddIncomingDocumentPage({ editMode = false }: AddIncomingDocumentPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDocumentClerk, isAdmin } = useAuth();
  const hasAccess = isDocumentClerk || isAdmin;
  const { processors, loading: loadingProcessors, fetch: fetchProcessors } = useProcessors();
  const { options: documentTypeOptions, fetchOptions: fetchDocumentTypes } = useDocumentTypeOptions();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(editMode);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrSuccess, setOcrSuccess] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState<string | null>(null);
  const [existingFileUrl, setExistingFileUrl] = useState<string | null>(null); // Track existing file from draft
  const [existingFileName, setExistingFileName] = useState<string | null>(null);
  const [existingFileSize, setExistingFileSize] = useState<number | null>(null);
  const [existingMimeType, setExistingMimeType] = useState<string | null>(null);
  // Mock file object for existing files (needed for OCR upload)
  const [existingFileForOcr, setExistingFileForOcr] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    issuer: '',
    documentNumber: '',
    dateLetter: '',
    documentTypeId: '',
    summary: '',
    pageCount: '',
    signerName: '',
    signerTitle: '',
  });

  const [arrivalNumber, setArrivalNumber] = useState('');
  const [dateReceived, setDateReceived] = useState(new Date().toISOString().split('T')[0]);
  const [urgency, setUrgency] = useState<Urgency>('THUONG');
  const [confidentiality, setConfidentiality] = useState<ConfidentialityCodeOrName>('THUONG');
  const [notes, setNotes] = useState('');
  const [processingInstructions, setProcessingInstructions] = useState('');

  const [attachments, setAttachments] = useState<{ name: string; url: string }[]>([]);
  const [processorsList, setProcessorsList] = useState<ProcessorAssignment[]>([]);

  const layoutRef = useRef<LayoutContextValue | null>(null);
  layoutRef.current = useOutletContext<LayoutContextValue>();

  // Track if we've set the initial sidebar state for this mount
  const initialStateSetRef = useRef(false);

  useEffect(() => {
    fetchProcessors();
    fetchDocumentTypes();
  }, [fetchProcessors, fetchDocumentTypes]);

  // Load draft document data when in edit mode
  useEffect(() => {
    if (!editMode || !id) return;

    const loadDraft = async () => {
      try {
        const { data } = await incomingDocumentsApi.getById(Number(id));
        const doc = data.data;
        if (!doc) {
          setError('Không tìm thấy văn bản');
          setLoadingDraft(false);
          return;
        }

        // Populate form fields
        setForm({
          issuer: doc.issuer || '',
          documentNumber: doc.documentNumber || '',
          dateLetter: doc.dateLetter || '',
          documentTypeId: doc.documentTypeId?.toString() || '',
          summary: doc.summary || '',
          pageCount: doc.pageCount?.toString() || '',
          signerName: doc.signerName || '',
          signerTitle: doc.signerTitle || '',
        });

        setArrivalNumber(doc.arrivalNumber?.toString() || '');
        setDateReceived(doc.dateReceived?.split('T')[0] || new Date().toISOString().split('T')[0]);
        setNotes(doc.notes || '');
        setProcessingInstructions(doc.processingInstructions || '');

        // Set urgency and confidentiality if available
        if (doc.document.urgency) {
          setUrgency(doc.document.urgency.name as Urgency);
        }
        if (doc.document.confidentiality) {
          setConfidentiality(doc.document.confidentiality.name as ConfidentialityCodeOrName);
        }

        // Set preview URL if there's a file
        if (doc.document.fileUrl) {
          setDocumentPreviewUrl(doc.document.fileUrl);
          setExistingFileUrl(doc.document.fileUrl); // Track existing file URL
          setExistingFileName(doc.document.originalFileName || doc.document.fileUrl.split('/').pop() || null);
          setExistingFileSize(doc.document.fileSize || null);
          setExistingMimeType(doc.document.mimeType || null);

          // Fetch the file to create a File object for OCR
          try {
            const baseUrl = import.meta.env.VITE_API_URL || '';
            const fileResponse = await fetch(`${baseUrl}${doc.document.fileUrl}`);
            if (fileResponse.ok) {
              const blob = await fileResponse.blob();
              const fileName = doc.document.originalFileName || doc.document.fileUrl.split('/').pop() || 'document';
              const mimeType = doc.document.mimeType || 'application/pdf';
              const file = new File([blob], fileName, { type: mimeType });
              setExistingFileForOcr(file);
            }
          } catch (err) {
            console.warn('Could not fetch file for OCR:', err);
          }
        }
      } catch (err) {
        setError('Không thể tải dữ liệu bản nháp');
      } finally {
        setLoadingDraft(false);
      }
    };

    loadDraft();
  }, [editMode, id]);

  // Auto-collapse sidebar when entering OCR workspace (step 1), restore on unmount
  useEffect(() => {
    // Only auto-collapse on initial mount (step 1)
    if (currentStep === 1 && !initialStateSetRef.current) {
      initialStateSetRef.current = true;
      layoutRef.current?.setSidebarCollapsed(true);
    } else if (currentStep === 2) {
      layoutRef.current?.setSidebarCollapsed(false);
    }
  }, [currentStep]);

  // Restore sidebar on page unmount (navigate away)
  useEffect(() => {
    return () => {
      layoutRef.current?.setSidebarCollapsed(false);
    };
  }, []);

  const handleContinue = () => {
    const validationError = validateStep1();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setCurrentStep(2);
  };

  useEffect(() => {
    return () => {
      if (documentPreviewUrl) {
        URL.revokeObjectURL(documentPreviewUrl);
      }
    };
  }, [documentPreviewUrl]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (documentPreviewUrl) {
        URL.revokeObjectURL(documentPreviewUrl);
      }
      setSelectedFile(file);
      setDocumentPreviewUrl(URL.createObjectURL(file));
      setError('');
      setOcrSuccess('');
    }
  };

  const handleOcr = async () => {
    const fileToOcr = selectedFile || existingFileForOcr;
    if (!fileToOcr) {
      setError('Vui lòng tải tệp lên trước khi chạy OCR.');
      return;
    }

    setOcrLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', fileToOcr);
      formData.append('mimeType', fileToOcr.type);

      const { data } = await documentsApi.getOcr(formData);
      const result: OcrResult = data.data!;
      const fields = result.extractedFields;

      setForm((prev) => ({
        ...prev,
        issuer: fields.issuer || prev.issuer,
        documentNumber: fields.documentNumber || prev.documentNumber,
        dateLetter: fields.dateLetter || prev.dateLetter,
        // Optional: you can map documentType string to documentTypeId if you have the list
        summary: fields.summary || prev.summary,
        pageCount: fields.pageCount || prev.pageCount,
        signerName: fields.signerName || prev.signerName,
        signerTitle: fields.signerTitle || prev.signerTitle,
      }));

      const extractedKeys = Object.keys(fields);
      if (extractedKeys.length === 0) {
        setOcrSuccess('');
        setError('Không trích xuất được trường nào từ tài liệu. Vui lòng điền thông tin thủ công.');
      } else {
        setOcrSuccess(`Đã trích xuất thành công ${extractedKeys.length} trường: ${extractedKeys.join(', ')}.`);
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
    if (!form.issuer?.trim()) return 'Cơ quan ban hành là bắt buộc';
    if (!form.documentNumber?.trim()) return 'Số ký hiệu là bắt buộc';
    if (!form.dateLetter?.trim()) return 'Ngày văn bản là bắt buộc';
    if (!form.documentTypeId) return 'Loại văn bản là bắt buộc';
    if (!form.pageCount || Number(form.pageCount) < 1) return 'Số trang là bắt buộc';
    if (!form.summary?.trim()) return 'Trích yếu nội dung là bắt buộc';
    if (!form.signerName?.trim()) return 'Họ tên người ký là bắt buộc';
    if (!form.signerTitle?.trim()) return 'Chức vụ người ký là bắt buộc';
    if (!arrivalNumber?.trim()) return 'Số đến là bắt buộc';
    if (!dateReceived) return 'Ngày đến là bắt buộc';
    return null;
  };

  const validateStep2 = (): string | null => {
    if (processorsList.length === 0) return 'Phải chọn ít nhất một người xử lý';
    const hasXLC = processorsList.some((p) => p.processorType === 'XLC');
    if (!hasXLC) return 'Phải chọn ít nhất một Người xử lý chính (XLC)';
    return null;
  };

  const handleConfirm = async () => {
    const validationError = validateStep2();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError('');

    const payload = {
      issuer: form.issuer || undefined,
      documentTypeId: form.documentTypeId ? Number(form.documentTypeId) : undefined,
      documentNumber: form.documentNumber || undefined,
      arrivalNumber: arrivalNumber ? Number(arrivalNumber) : undefined,
      signerName: form.signerName || undefined,
      signerTitle: form.signerTitle || undefined,
      dateLetter: normalizeDate(form.dateLetter),
      dateReceived,
      summary: form.summary || undefined,
      pageCount: form.pageCount ? Number(form.pageCount) : undefined,
      urgency,
      confidentialityLevel: confidentiality,
      notes: notes || undefined,
      processingInstructions: processingInstructions || undefined,
      processorIds: processorsList,
      attachments: attachments.map((a) => ({
        fileName: a.name,
        fileUrl: a.url,
      })),
    };

    try {
      // In edit mode, first update the draft, then submit
      if (editMode && id) {
        // Update existing draft with file if changed
        if (selectedFile) {
          await incomingDocumentsApi.updateDraftWithFile(Number(id), payload, selectedFile);
        } else {
          await incomingDocumentsApi.updateDraft(Number(id), payload);
        }
        // Mark document as submitted (PENDING status)
        await incomingDocumentsApi.updateStatus(Number(id), { status: 'PENDING' });
        navigate('/incoming-documents');
      } else {
        // Normal create flow
        if (selectedFile) {
          // Persist the PDF file and create the incoming document in one request
          await incomingDocumentsApi.createWithFile(payload, selectedFile);
        } else {
          // No file — create without attachment
          await incomingDocumentsApi.create(payload);
        }
        navigate('/incoming-documents');
      }
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setError(apiError.response?.data?.message || 'Tạo văn bản đến thất bại. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    setError('');

    const payload = {
      issuer: form.issuer || undefined,
      documentTypeId: form.documentTypeId ? Number(form.documentTypeId) : undefined,
      documentNumber: form.documentNumber || undefined,
      arrivalNumber: arrivalNumber ? Number(arrivalNumber) : undefined,
      signerName: form.signerName || undefined,
      signerTitle: form.signerTitle || undefined,
      dateLetter: normalizeDate(form.dateLetter),
      dateReceived,
      summary: form.summary || undefined,
      pageCount: form.pageCount ? Number(form.pageCount) : undefined,
      urgency,
      confidentialityLevel: confidentiality,
      notes: notes || undefined,
      attachments: attachments.map((a) => ({
        fileName: a.name,
        fileUrl: a.url,
      })),
    };

    try {
      if (editMode && id) {
        // Update existing draft
        if (selectedFile) {
          await incomingDocumentsApi.updateDraftWithFile(Number(id), payload, selectedFile);
        } else {
          await incomingDocumentsApi.updateDraft(Number(id), payload);
        }
      } else {
        // Create new draft
        if (selectedFile) {
          await incomingDocumentsApi.saveDraftWithFile(payload, selectedFile);
        } else {
          await incomingDocumentsApi.saveDraft(payload);
        }
      }
      navigate('/incoming-documents');
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setError(apiError.response?.data?.message || 'Lưu bản nháp thất bại. Vui lòng thử lại.');
    } finally {
      setSavingDraft(false);
    }
  };

  if (!hasAccess) {
    return (
      <>
        <div className="top-bar">
          <h1>{editMode ? 'Sửa Văn bản đến' : 'Thêm Văn bản đến mới'}</h1>
          <button className="btn btn-secondary" onClick={() => navigate('/incoming-documents')}>Quay lại</button>
        </div>
        <div className="page-content">
          <div className="alert alert-error">Bạn không có quyền tạo văn bản đến.</div>
        </div>
      </>
    );
  }

  // Show loading spinner while fetching draft data in edit mode
  if (loadingDraft) {
    return (
      <>
        <div className="top-bar">
          <h1>Sửa Văn bản đến</h1>
          <button className="btn btn-secondary" onClick={() => navigate('/incoming-documents')}>Quay lại</button>
        </div>
        <div className="page-content">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
            <div className="spinner" />
          </div>
        </div>
      </>
    );
  }

  // ─── Step 1: OCR Workspace ────────────────────────────────────────────────
  if (currentStep === 1) {
    return (
      <div className="ocr-page-shell">
        {/* Compact topbar */}
        <div className="ocr-workspace-topbar">
          <h1>{editMode ? 'Sửa Văn bản đến' : 'Thêm Văn bản đến mới'}</h1>
          <div className="ocr-status-pill">
            <span className="ocr-status-dot" />
            OCR
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/incoming-documents')}
          >
            Quay lại
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="alert alert-error" style={{ margin: '8px 16px', flexShrink: 0 }}>
            {error}
          </div>
        )}

        {/* Grid: viewer+upload | form panel */}
        <div className="ocr-workspace">
          {/* ── LEFT: Document viewer + upload toolbar ───────────────────── */}
          <div className="ocr-workspace-viewer-col">
            <DocumentViewer
              file={selectedFile}
              fileUrl={documentPreviewUrl}
              isExistingFile={!!existingFileUrl && !selectedFile}
              existingFileName={existingFileName || undefined}
              existingFileSize={existingFileSize || undefined}
              existingMimeType={existingMimeType || undefined}
            />

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
                disabled={ocrLoading}
              >
                {selectedFile ? 'Đổi tệp' : existingFileUrl ? 'Đổi tệp' : 'Tải tệp lên'}
              </button>
              {selectedFile ? (
                <span className="file-name-display">{selectedFile.name}</span>
              ) : existingFileName ? (
                <span className="file-name-display">{existingFileName}</span>
              ) : null}
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleOcr}
                disabled={ocrLoading || (!selectedFile && !existingFileForOcr)}
              >
                {ocrLoading ? 'Đang xử lý...' : 'OCR'}
              </button>

              {ocrLoading && (
                <div className="ocr-progress-bar">
                  <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  <span>Đang trích xuất...</span>
                  <div className="progress-track">
                    <div className="progress-fill" />
                  </div>
                </div>
              )}

              {ocrSuccess && !error && (
                <div
                  className="alert alert-success"
                  style={{ margin: 0, padding: '4px 10px', fontSize: 12 }}
                >
                  {ocrSuccess}
                </div>
              )}

              <p>Hỗ trợ: PDF, PNG, JPEG, TIFF</p>
            </div>
          </div>

          {/* ── RIGHT: Form panel ────────────────────────────────────────── */}
          <div className="ocr-workspace-form-col">
            <div className="ocr-form-scroll">
              <div className="card">
                <div className="card-body">
                  {/* OCR-extracted fields */}
                  <div className="form-group">
                    <label htmlFor="issuer">Cơ quan ban hành <span className="required">*</span></label>
                    <input
                      id="issuer"
                      name="issuer"
                      type="text"
                      value={form.issuer}
                      onChange={handleChange}
                      placeholder="VD: ỦY BAN NHÂN DÂN TỈNH NINH BÌNH"
                    />
                  </div>

                  <div className="signer-row">
                    <div className="form-group">
                      <label htmlFor="documentNumber">Số ký hiệu <span className="required">*</span></label>
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
                      <label htmlFor="dateLetter">Ngày văn bản <span className="required">*</span></label>
                      <input
                        id="dateLetter"
                        name="dateLetter"
                        type="text"
                        value={form.dateLetter}
                        onChange={handleChange}
                        placeholder="26/05/2026"
                      />
                    </div>
                  </div>

                  <div className="signer-row">
                    <div className="form-group">
                      <label htmlFor="documentTypeId">Loại văn bản <span className="required">*</span></label>
                      <select
                        id="documentTypeId"
                        name="documentTypeId"
                        value={form.documentTypeId}
                        onChange={handleChange}
                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14 }}
                      >
                        <option value="">-- Chọn loại văn bản --</option>
                        {documentTypeOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="pageCount">Số trang <span className="required">*</span></label>
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
                  </div>

                  <div className="form-group summary-field">
                    <label htmlFor="summary">Trích yếu nội dung <span className="required">*</span></label>
                    <textarea
                      id="summary"
                      name="summary"
                      value={form.summary}
                      onChange={handleChange}
                      placeholder="VD: Ban hành Quy chế đào tạo, bồi dưỡng cán bộ, công chức, viên chức trên địa bàn tỉnh..."
                      rows={5}
                    />
                  </div>

                  <div className="signer-row">
                    <div className="form-group">
                      <label htmlFor="signerName">Họ tên người ký <span className="required">*</span></label>
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
                      <label htmlFor="signerTitle">Chức vụ người ký <span className="required">*</span></label>
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
                  </div>

                  {/* Divider — phân tách nhẹ giữa OCR fields và metadata */}
                  

                  {/* Document metadata (incoming information) */}
                  <div className="signer-row">
                    <div className="form-group">
                      <label htmlFor="arrivalNumber">Số đến <span className="required">*</span></label>
                      <input
                        id="arrivalNumber"
                        type="number"
                        min="1"
                        value={arrivalNumber}
                        onChange={(e) => setArrivalNumber(e.target.value)}
                        placeholder="Tự động tăng"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="dateReceived">
                        Ngày đến <span className="required">*</span>
                      </label>
                      <input
                        id="dateReceived"
                        type="date"
                        value={dateReceived}
                        onChange={(e) => setDateReceived(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="urgency">Độ khẩn</label>
                    <select
                      id="urgency"
                      value={urgency}
                      onChange={(e) =>
                        setUrgency(e.target.value as Urgency)
                      }
                    >
                      {URGENCY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="confidentiality">Độ mật</label>
                    <select
                      id="confidentiality"
                      value={confidentiality}
                      onChange={(e) =>
                        setConfidentiality(e.target.value as ConfidentialityCodeOrName)
                      }
                    >
                      {CONFIDENTIALITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="notes">Ghi chú</label>
                    <textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ghi chú bổ sung..."
                      rows={3}
                    />
                  </div>

                  {/* Divider — phân tách nhẹ trước phần tệp đính kèm */}
                  <hr className="form-divider" />

                  {/* Attachments */}
                  <div className="form-group">
                    <label htmlFor="attachments">Tệp đính kèm</label>
                    <input
                      id="attachments"
                      type="file"
                      multiple
                      onChange={handleAddAttachment}
                    />
                    {attachments.length > 0 && (
                      <div className="attachment-list" style={{ marginTop: 10 }}>
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
              </div>
            </div>
          </div>
        </div>

        {/* Action bar — full width below the workspace grid */}
        <div className="ocr-actions-bar">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/incoming-documents')}
          >
            Hủy
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginRight: 8, borderColor: '#6c757d', color: '#495057' }}
            onClick={handleSaveDraft}
            disabled={savingDraft}
          >
            {savingDraft ? 'Đang lưu...' : 'Lưu bản nháp'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleContinue}
          >
            {editMode ? 'Cập nhật & Tiếp tục' : 'Tiếp tục →'}
          </button>
        </div>
      </div>
    );
  }

  // ─── Step 2: Processing Assignment ────────────────────────────────────────
  return (
    <>
      <div className="top-bar">
        <h1>{editMode ? 'Sửa Văn bản đến' : 'Thêm Văn bản đến mới'}</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/incoming-documents')}>
          Quay lại
        </button>
      </div>

      <div className="page-content">
        <div className="step-indicator">
          <div className="step-item completed">
            <div className="step-number">1</div>
            <div className="step-label">Thông tin văn bản</div>
          </div>
          <div className="step-line" />
          <div className="step-item active">
            <div className="step-number">2</div>
            <div className="step-label">Phân công xử lý</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Bước 2: Phân công xử lý & Gửi</h2>
          </div>

          <div className="card-body">
            {error && <div className="alert alert-error">{error}</div>}

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
                <OrganizationAssignmentTree
                  users={processors}
                  assignments={processorsList}
                  roleLabels={PROCESSOR_TYPE_LABELS}
                  onAssignmentChange={handleProcessorToggle}
                />
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

            {/* Summary */}
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
                  <span className="summary-value">
                    {documentTypeOptions.find(t => t.id === Number(form.documentTypeId))?.name || '—'}
                  </span>
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
                  <span className="summary-label">Độ mật</span>
                  <span className="summary-value">
                    {CONFIDENTIALITY_OPTIONS.find((o) => o.value === confidentiality)?.label ?? confidentiality}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Tệp đính kèm</span>
                  <span className="summary-value">
                    {attachments.length + (existingFileUrl && !selectedFile ? 1 : 0)} tệp
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Người xử lý</span>
                  <span className="summary-value">{processorsList.length}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Tệp đính kèm chính</span>
                  <span className="summary-value">
                    {selectedFile ? selectedFile.name : existingFileName || 'Không có'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => { setCurrentStep(1); setError(''); }}
          >
            Quay lại
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/incoming-documents')}
          >
            Hủy
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? 'Đang gửi...' : 'Xác nhận & Gửi'}
          </button>
        </div>
      </div>
    </>
  );
}
