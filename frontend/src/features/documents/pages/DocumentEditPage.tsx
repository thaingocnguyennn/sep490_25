import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { documentsApi } from '../../../api';
import { LoadingSpinner } from '../../../shared/components';
import type { Document, UpdateDocumentRequest } from '../../../types';

/**
 * DocumentEditPage – Edit document metadata (file is not changed).
 */
export default function DocumentEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // ─── Form fields ──────────────────────────────────────────────────────
  const [documentNumber, setDocumentNumber] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('INCOMING');
  const [issuanceDate, setIssuanceDate] = useState('');
  const [sendingAgency, setSendingAgency] = useState('');
  const [urgencyLevel, setUrgencyLevel] = useState('NORMAL');
  const [confidentialityLevel, setConfidentialityLevel] = useState('THUONG');
  const [category, setCategory] = useState('');

  // ─── Load existing document data ──────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    documentsApi
      .getById(Number(id))
      .then(({ data }) => {
        const d = data.data!;
        setDoc(d);
        setDocumentNumber(d.documentNumber);
        setTitle(d.title);
        setDescription(d.description || '');
        setType(d.type);
        setIssuanceDate(d.issuanceDate ? d.issuanceDate.split('T')[0] : '');
        setSendingAgency(d.sendingAgency || '');
        setUrgencyLevel(d.urgencyLevel);
        setConfidentialityLevel(d.confidentialityLevel);
        setCategory(d.category || '');
      })
      .catch(() => setError('Lỗi khi tải tài liệu'))
      .finally(() => setLoading(false));
  }, [id]);

  // ─── Submit handler ──────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !doc) return;

    setError('');
    setSuccessMsg('');
    setSaving(true);

    const updateData: UpdateDocumentRequest = {
      documentNumber: documentNumber.trim(),
      title: title.trim(),
      description: description.trim() || undefined,
      type: type as any,
      issuanceDate: issuanceDate ? new Date(issuanceDate).toISOString() : null,
      sendingAgency: sendingAgency.trim() || undefined,
      urgencyLevel: urgencyLevel as any,
      confidentialityLevel: confidentialityLevel as any,
      category: category.trim() || undefined,
    };

    try {
      await documentsApi.update(Number(id), updateData);
      setSuccessMsg('Đã cập nhật tài liệu thành công!');
      // Navigate back to detail page after a short delay
      setTimeout(() => navigate(`/documents/${id}`), 1000);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Cập nhật tài liệu thất bại';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page-content"><LoadingSpinner /></div>;
  if (!doc) {
    return (
      <div className="page-content">
        <div className="alert alert-error">{error || 'Không tìm thấy tài liệu'}</div>
        <button className="btn btn-secondary" onClick={() => navigate('/documents')}>← Quay lại</button>
      </div>
    );
  }

  return (
    <>
      <div className="top-bar">
        <h1>✏️ Sửa tài liệu</h1>
        <button className="btn btn-secondary" onClick={() => navigate(`/documents/${id}`)}>
          ← Quay lại chi tiết
        </button>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <h2>Sửa: {doc.documentNumber}</h2>
          </div>
          <div className="card-body">
            {error && <div className="alert alert-error">{error}</div>}
            {successMsg && <div className="alert alert-success">{successMsg}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Số ký hiệu *</label>
                  <input
                    type="text"
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Tiêu đề *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
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
                    <option value="THUONG">Thường</option>
                    <option value="MAT">Mật (C)</option>
                    <option value="TOI_MAT">Tối mật (B)</option>
                    <option value="TUYET_MAT">Tuyệt mật (A)</option>
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

              {/* ─── File Info (read-only) ─────────────────────────── */}
              {doc.originalFileName && (
                <div style={{
                  padding: 16,
                  background: '#f8f9fa',
                  borderRadius: 8,
                  marginTop: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  <span style={{ fontSize: 24 }}>📄</span>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{doc.originalFileName}</div>
                    <div style={{ fontSize: 12, color: '#636e72' }}>
                      Không thể thay đổi file. Tải lên một tài liệu mới để thay thế.
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Submit ────────────────────────────────────────── */}
              <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate(`/documents/${id}`)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                  style={{ width: 'auto' }}
                >
                  {saving ? 'Đang lưu...' : '💾 Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
