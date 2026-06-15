import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentActions } from '../../../shared/hooks';

/**
 * DocumentUploadPage – Upload a new document with file + metadata.
 * Features drag-and-drop upload area and inline file preview.
 */
export default function DocumentUploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadDocument, actionLoading, actionError } = useDocumentActions();

  // ─── Form state ───────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [documentNumber, setDocumentNumber] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('INCOMING');
  const [issuanceDate, setIssuanceDate] = useState('');
  const [sendingAgency, setSendingAgency] = useState('');
  const [urgencyLevel, setUrgencyLevel] = useState('NORMAL');
  const [confidentialityLevel, setConfidentialityLevel] = useState('NORMAL');
  const [category, setCategory] = useState('');

  // ─── Drag & drop state ────────────────────────────────────────────────
  const [isDragOver, setIsDragOver] = useState(false);
  const [formError, setFormError] = useState('');

  // ─── File handlers ────────────────────────────────────────────────────

  const handleFileSelect = (selectedFile: File) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/tiff',
      'image/bmp',
    ];
    if (!allowedTypes.includes(selectedFile.type)) {
      setFormError('Unsupported file type. Please upload PDF, DOCX, or image files.');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setFormError('File size exceeds 10MB limit.');
      return;
    }
    setFile(selectedFile);
    setFormError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ─── Format file size ────────────────────────────────────────────────
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ─── Submit handler ──────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!file) {
      setFormError('Please select a file to upload.');
      return;
    }
    if (!documentNumber.trim()) {
      setFormError('Document number is required.');
      return;
    }
    if (!title.trim()) {
      setFormError('Title is required.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentNumber', documentNumber.trim());
    formData.append('title', title.trim());
    if (description.trim()) formData.append('description', description.trim());
    formData.append('type', type);
    if (issuanceDate) formData.append('issuanceDate', new Date(issuanceDate).toISOString());
    if (sendingAgency.trim()) formData.append('sendingAgency', sendingAgency.trim());
    formData.append('urgencyLevel', urgencyLevel);
    formData.append('confidentialityLevel', confidentialityLevel);
    if (category.trim()) formData.append('category', category.trim());

    try {
      const doc = await uploadDocument(formData);
      navigate(`/documents/${doc?.id || ''}`);
    } catch {
      // Error is already handled by the hook
    }
  };

  return (
    <>
      <div className="top-bar">
        <h1>📤 Tải lên tài liệu</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/documents')}>
          ← Quay lại
        </button>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <h2>Tài liệu mới</h2>
          </div>
          <div className="card-body">
            {(formError || actionError) && (
              <div className="alert alert-error">{formError || actionError}</div>
            )}

            <form onSubmit={handleSubmit}>
              {/* ─── File Upload Area ──────────────────────────────── */}
              <div className="form-group">
                <label>File tài liệu *</label>
                <div
                  className={`upload-dropzone ${isDragOver ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {file ? (
                    <div className="upload-file-info">
                      <div className="upload-file-icon">📄</div>
                      <div>
                        <div className="upload-file-name">{file.name}</div>
                        <div className="upload-file-size">{formatFileSize(file.size)}</div>
                      </div>
                      <button
                        type="button"
                        className="upload-remove-btn"
                        onClick={(e) => { e.stopPropagation(); removeFile(); }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="upload-placeholder">
                      <div className="upload-icon">📁</div>
                      <p>Kéo & thả file của bạn vào đây, hoặc <strong>nhấp để duyệt</strong></p>
                      <p className="upload-hint">Hỗ trợ: PDF, DOCX, JPEG, PNG, TIFF, BMP (tối đa 10MB)</p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tiff,.bmp"
                    onChange={handleFileInputChange}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>

              {/* ─── Metadata Fields ──────────────────────────────── */}
              <div className="form-grid">
                <div className="form-group">
                  <label>Số ký hiệu *</label>
                  <input
                    type="text"
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    placeholder="e.g. CV-2024-001"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Tiêu đề *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Tiêu đề tài liệu"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Loại tài liệu *</label>
                  <select value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="INCOMING">Văn bản đến</option>
                    <option value="OUTGOING">Văn bản đi</option>
                    <option value="INTERNAL">Nội bộ</option>
                    <option value="ARCHIVAL">Lưu trữ</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Ngày ban hành</label>
                  <input
                    type="date"
                    value={issuanceDate}
                    onChange={(e) => setIssuanceDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Cơ quan gửi/ban hành</label>
                  <input
                    type="text"
                    value={sendingAgency}
                    onChange={(e) => setSendingAgency(e.target.value)}
                    placeholder="Tên cơ quan/tổ chức"
                  />
                </div>
                <div className="form-group">
                  <label>Độ khẩn</label>
                  <select value={urgencyLevel} onChange={(e) => setUrgencyLevel(e.target.value)}>
                    <option value="LOW">Thấp</option>
                    <option value="NORMAL">Bình thường</option>
                    <option value="HIGH">Cao</option>
                    <option value="URGENT">Khẩn cấp</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Độ bảo mật</label>
                  <select value={confidentialityLevel} onChange={(e) => setConfidentialityLevel(e.target.value)}>
                    <option value="NORMAL">Bình thường</option>
                    <option value="CONFIDENTIAL">Bảo mật</option>
                    <option value="TOP_SECRET">Tuyệt mật</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Danh mục</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Danh mục tùy chọn"
                  />
                </div>
                <div className="form-group full-width">
                  <label>Trích yếu nội dung</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Tóm tắt ngắn gọn hoặc trích yếu nội dung của tài liệu..."
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid #dfe6e9',
                      borderRadius: 8,
                      fontSize: 14,
                      resize: 'vertical',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              </div>

              {/* ─── Submit ────────────────────────────────────────── */}
              <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate('/documents')}
                >
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading} style={{ width: 'auto' }}>
                  {actionLoading ? 'Đang tải lên...' : '📤 Tải lên tài liệu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
