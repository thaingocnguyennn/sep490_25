import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getOutgoingDocumentById, deleteOutgoingDocument, sendOutgoingEmail, SendEmailResult } from '../../../api/modules/outgoing-documents';
import SignaturePanel from '../components/SignaturePanel';
import { useOutgoingDocumentActions } from '../../../shared/hooks';
import { DocumentStatusBadge, UrgencyBadge } from '../../../shared/components/DocumentBadges';
import { LoadingSpinner } from '../../../shared/components';
import { useAuth } from '../../../contexts/AuthContext';
import type {
  OutgoingDocument,
  UpdateOutgoingStatusRequest,
  OcrResult,
  User,
} from '../../../types';
import { usersApi } from '../../../api/modules/users';
import { api } from '../../../api';
import RegisterDocumentModal from '../components/RegisterDocumentModal';

async function openAuthenticatedFile(url: string): Promise<void> {
  // Routes the request through axios so the Bearer token is attached.
  // Falls back to a direct window.open() only if the upstream call fails
  // so that an expired token does not silently break the link.
  try {
    const res = await api.get<Blob>(url, { responseType: 'blob' });
    const blob = res.data;
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
    // Revoke after a delay so the new tab has time to load the blob.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (err) {
    console.error('Authenticated file fetch failed, falling back to direct URL:', err);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

async function downloadAuthenticatedFile(url: string, fileName: string): Promise<void> {
  try {
    const res = await api.get<Blob>(url, { responseType: 'blob' });
    const blob = res.data;
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (err) {
    console.error('Authenticated file download failed:', err);
  }
}

// Helper: định dạng ngày giờ tiếng Việt
const formatDateTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('vi-VN');
};

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('vi-VN');
};

// Helper: tên trạng thái tiếng Việt
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Bản nháp',
  SUBMITTED: 'Chờ duyệt',
  RETURNED: 'Trả lại',
  APPROVED: 'Đã duyệt',
  WAITING_FOR_ISSUE: 'Chờ phát hành',
  ISSUED: 'Đã phát hành',
  COMPLETED: 'Hoàn tất',
  RECALLED: 'Thu hồi',
  TRASHED: 'Thùng rác',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
};

export default function OutgoingDocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { loading: actionLoading, uploadProgress, error: actionError, uploadFile, runOcr, updateStatus, clearError } = useOutgoingDocumentActions();

  const [doc, setDoc] = useState<OutgoingDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [showOcrResult, setShowOcrResult] = useState(false);

  // State modal trạng thái
  const [statusModal, setStatusModal] = useState<{
    open: boolean;
    action: 'submit' | 'approve' | 'return' | 'issue' | 'recall' | 'trash' | 'restore' | null;
  }>({ open: false, action: null });
  const [returnReason, setReturnReason] = useState('');
  const [recallReason, setRecallReason] = useState('');
  
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [registering, setRegistering] = useState(false);

  const [sentDate, setSentDate] = useState('');
  const [issueUrgency, setIssueUrgency] = useState<string>('');
  const [issueConfidentiality, setIssueConfidentiality] = useState<string>('');
  const [assignedApproverId, setAssignedApproverId] = useState<string>('');
  const [assignedClerkId, setAssignedClerkId] = useState<string>('');
  const [approvers, setApprovers] = useState<User[]>([]);
  const [clerks, setClerks] = useState<User[]>([]);

  // Drag & Drop upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Email modal state
  const [emailModal, setEmailModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailList, setEmailList] = useState<string[]>([]);
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<SendEmailResult | null>(null);

  const justCreated = (location.state as { justCreated?: boolean })?.justCreated;

  // Xác định role
  const isSpecialist = user?.roles.includes('SPECIALIST');
  const isDeptHead = user?.roles.includes('DEPARTMENT_HEAD');
  const isClerk = user?.roles.includes('DOCUMENT_CLERK');
  const isAdmin = user?.roles.includes('ADMIN');

  const canEdit = (isSpecialist || isClerk) && ['DRAFT', 'RETURNED'].includes(doc?.document.status ?? '');
  const canUpload = (isSpecialist || isClerk) && ['DRAFT', 'RETURNED'].includes(doc?.document.status ?? '');
  const canOcr = canUpload && !!doc?.document.fileUrl;
  const canSubmit = isSpecialist && doc?.document.status === 'DRAFT';
  const canApprove = isDeptHead && doc?.document.status === 'SUBMITTED';
  const canReturn = isDeptHead && doc?.document.status === 'SUBMITTED';
  const canRegister = isClerk && doc?.document.status === 'APPROVED' && doc.assignedClerkId === user?.id;
  const canIssue = isClerk && doc?.document.status === 'WAITING_FOR_ISSUE';
  const canRecall = isClerk && doc?.document.status === 'ISSUED';
  const canSendEmail = (isSpecialist || isClerk || isDeptHead || isAdmin) && doc?.document.status === 'ISSUED';
  const canTrash = (isSpecialist || isClerk || isDeptHead) && !['COMPLETED', 'TRASHED', 'CANCELLED'].includes(doc?.document.status ?? '');
  const canRestore = (isClerk || isAdmin) && doc?.document.status === 'TRASHED';

  const loadDoc = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getOutgoingDocumentById(parseInt(id));
      setDoc(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không tải được thông tin văn bản đi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDoc();
  }, [id]);

  // ─── Upload file handler ──────────────────────────────────────────────────

  const handleFileUpload = async (file: File) => {
    if (!doc) return;
    const result = await uploadFile(doc.id, file);
    if (result) setDoc(result);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  // ─── OCR handler ─────────────────────────────────────────────────────────

  const handleRunOcr = async () => {
    if (!doc) return;
    const result = await runOcr(doc.id);
    if (result) {
      setOcrResult(result);
      setShowOcrResult(true);
    }
  };

  // ─── Status update handler ───────────────────────────────────────────────

  const handleStatusUpdate = async () => {
    if (!doc || !statusModal.action) return;

    if (statusModal.action === 'trash') {
      try {
        const result = await deleteOutgoingDocument(doc.id);
        setDoc(result);
        setStatusModal({ open: false, action: null });
        return;
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Không thể xóa văn bản');
        return;
      }
    }

    const statusMap: Record<string, string> = {
      submit: 'SUBMITTED',
      approve: 'APPROVED',
      return: 'RETURNED',
      issue: 'ISSUED',
      recall: 'RECALLED',
      restore: 'DRAFT',
    };

    const payload: UpdateOutgoingStatusRequest = {
      status: statusMap[statusModal.action] as any,
      returnReason: returnReason || undefined,
      recallReason: recallReason || undefined,
      sentDate: sentDate || undefined,
      urgency: (issueUrgency || undefined) as any,
      confidentialityLevel: (issueConfidentiality || undefined) as any,
      assignedApproverId: assignedApproverId ? parseInt(assignedApproverId) : undefined,
      assignedClerkId: assignedClerkId ? parseInt(assignedClerkId) : undefined,
    };

    const result = await updateStatus(doc.id, payload);
    if (result) {
      setDoc(result);
      setStatusModal({ open: false, action: null });
      setReturnReason('');
      setRecallReason('');
      setSentDate('');
      setIssueUrgency('');
      setIssueConfidentiality('');
      setAssignedApproverId('');
      setAssignedClerkId('');
    }
  };

  const handleRegister = async (data: { documentBookId: number; customDate?: string }) => {
    if (!doc) return;
    setRegistering(true);
    try {
      const { registerOutgoingDocument } = await import('../../../api/modules/outgoing-documents');
      await registerOutgoingDocument(doc.id, {
        documentBookId: data.documentBookId,
        customIssuanceDate: data.customDate,
      });
      alert('Vào sổ văn bản thành công!');
      setRegisterModalOpen(false);
      loadDoc();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Có lỗi xảy ra khi vào sổ');
    } finally {
      setRegistering(false);
    }
  };

  const handleOpenStatusModal = async (action: 'submit' | 'approve' | 'return' | 'issue' | 'recall' | 'trash' | 'restore') => {
    setStatusModal({ open: true, action });
    if (action === 'submit') {
      try {
        const res = await usersApi.getApprovers();
        setApprovers(res.data.data || []);
      } catch (err) {
        console.error('Failed to load approvers', err);
      }
    }
    if (action === 'approve') {
      try {
        const res = await usersApi.getClerks();
        setClerks(res.data.data || []);
      } catch (err) {
        console.error('Failed to load clerks', err);
      }
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) return <LoadingSpinner />;
  if (error || !doc) {
    return (
      <div className="page-content">
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: '#e74c3c' }}>⚠️ {error || 'Không tìm thấy văn bản đi'}</p>
            <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => navigate('/outgoing-documents')}>
              ← Quay lại danh sách
            </button>
          </div>
        </div>
      </div>
    );
  }

  const docStatus = doc.document.status;

  return (
    <>
      {/* Top bar */}
      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/outgoing-documents')} style={{ padding: '6px 12px' }}>
            ← Quay lại
          </button>
          <div>
            <h1 style={{ margin: 0 }}>Chi tiết Văn bản đi</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <code style={{ fontSize: 13, color: '#667eea' }}>{doc.document.documentNumber}</code>
              <DocumentStatusBadge status={docStatus} />
            </div>
          </div>
        </div>
        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canEdit && (
            <button id="btn-edit-doc" className="btn btn-secondary" onClick={() => navigate(`/outgoing-documents/${doc.id}/edit`)}>
              ✏️ Chỉnh sửa
            </button>
          )}
          {canSubmit && (
            <button id="btn-submit-doc" className="btn btn-primary" onClick={() => handleOpenStatusModal('submit')}>
              📤 Trình duyệt
            </button>
          )}
          {canApprove && (
            <button id="btn-approve-doc" className="btn btn-primary" onClick={() => handleOpenStatusModal('approve')}
              style={{ background: '#27ae60' }}>
              ✅ Phê duyệt
            </button>
          )}
          {canReturn && (
            <button id="btn-return-doc" className="btn btn-secondary" onClick={() => handleOpenStatusModal('return')}
              style={{ borderColor: '#e67e22', color: '#e67e22' }}>
              ↩️ Trả lại
            </button>
          )}
          {canRegister && (
            <button id="btn-register-doc" className="btn btn-primary" onClick={() => setRegisterModalOpen(true)}
              style={{ background: '#f39c12' }}>
              📝 Vào sổ
            </button>
          )}
          {canIssue && (
            <button id="btn-issue-doc" className="btn btn-primary" onClick={() => handleOpenStatusModal('issue')}
              style={{ background: '#8e44ad' }}>
              🚀 Phát hành
            </button>
          )}
          {canRecall && (
            <button id="btn-recall-doc" className="btn btn-secondary" onClick={() => handleOpenStatusModal('recall')}
              style={{ borderColor: '#c0392b', color: '#c0392b' }}>
              🔙 Thu hồi
            </button>
          )}
          {canRestore && (
            <button id="btn-restore-doc" className="btn btn-secondary" onClick={() => setStatusModal({ open: true, action: 'restore' })}
              style={{ borderColor: '#27ae60', color: '#27ae60' }}>
              ♻️ Khôi phục
            </button>
          )}
          {canTrash && (
            <button id="btn-trash-doc" className="btn btn-secondary" onClick={() => setStatusModal({ open: true, action: 'trash' })}
              style={{ borderColor: '#e74c3c', color: '#e74c3c' }}>
              🗑️ Thùng rác
            </button>
          )}
          {canSendEmail && (
            <button
              id="btn-send-email"
              className="btn btn-primary"
              onClick={() => { setEmailModal(true); setEmailResult(null); setEmailList([]); setEmailInput(doc?.recipientEmail || ''); }}
              style={{ background: '#16a085' }}
            >
              📧 Gửi Email
            </button>
          )}
        </div>
      </div>

      <div className="page-content">
        {justCreated && (
          <div style={{ background: '#d4edda', border: '1px solid #28a745', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#155724' }}>
            ✅ Văn bản đi đã được tạo thành công! Bạn có thể upload file và chạy OCR bên dưới.
          </div>
        )}

        {(actionError) && (
          <div style={{ background: '#fdf0f0', border: '1px solid #fcc', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#e74c3c' }}>
            ⚠️ {actionError}
            <button onClick={clearError} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c' }}>✕</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>

          {/* Cột trái: thông tin chính */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Thông tin cơ bản */}
            <div className="card">
              <div className="card-header">
                <h2>Thông tin văn bản</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <DocumentStatusBadge status={docStatus} />
                </div>
              </div>
              <div className="card-body">
                <div className="detail-grid">
                  {doc.documentNumber && (
                    <div className="detail-item">
                      <label>Số ký hiệu</label>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#667eea' }}>
                        {doc.documentNumber}
                      </span>
                    </div>
                  )}
                  {doc.dispatchNumber && (
                    <div className="detail-item">
                      <label>Số phát hành</label>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#667eea', fontSize: 16 }}>
                        {doc.dispatchNumber}
                      </span>
                    </div>
                  )}
                  {doc.documentTypeRef ? (
                    <div className="detail-item">
                      <label>Loại văn bản</label>
                      <span>{doc.documentTypeRef.name}</span>
                    </div>
                  ) : null}
                  {doc.pageCount && (
                    <div className="detail-item">
                      <label>Số trang</label>
                      <span>{doc.pageCount} trang</span>
                    </div>
                  )}
                  <div className="detail-item full-width">
                    <label>Tiêu đề văn bản</label>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{doc.document.title}</span>
                  </div>
                  {doc.document.description && (
                    <div className="detail-item full-width">
                      <label>Mô tả</label>
                      <span>{doc.document.description}</span>
                    </div>
                  )}
                  <div className="detail-item">
                    <label>Độ khẩn</label>
                    <span><UrgencyBadge urgency={doc.document.urgency} /></span>
                  </div>
                  <div className="detail-item">
                    <label>Trạng thái</label>
                    <span><DocumentStatusBadge status={docStatus} /></span>
                  </div>
                  {doc.document.signerName && (
                    <div className="detail-item">
                      <label>Người ký</label>
                      <span style={{ fontWeight: 600 }}>
                        {doc.document.signerName}{doc.document.signerTitle ? ` (${doc.document.signerTitle})` : ''}
                      </span>
                    </div>
                  )}
                  {doc.issuanceDate && (
                    <div className="detail-item">
                      <label>Ngày ban hành</label>
                      <span>{formatDate(doc.issuanceDate)}</span>
                    </div>
                  )}
                  {doc.recipientName && (
                    <div className="detail-item full-width">
                      <label>Người/Cơ quan nhận</label>
                      <span style={{ fontWeight: 600 }}>{doc.recipientName}</span>
                    </div>
                  )}
                  {doc.recipientAddress && (
                    <div className="detail-item full-width">
                      <label>Địa chỉ người nhận</label>
                      <span>{doc.recipientAddress}</span>
                    </div>
                  )}
                  {doc.recipientEmail && (
                    <div className="detail-item">
                      <label>Email người nhận</label>
                      <span>{doc.recipientEmail}</span>
                    </div>
                  )}
                  {doc.sentDate && (
                    <div className="detail-item">
                      <label>Ngày gửi</label>
                      <span>{formatDate(doc.sentDate)}</span>
                    </div>
                  )}
                  <div className="detail-item">
                    <label>Phòng ban</label>
                    <span>{doc.document.department?.name || '—'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Người tạo</label>
                    <span>{doc.document.createdByUser?.fullName || '—'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Ngày tạo</label>
                    <span>{formatDateTime(doc.createdAt)}</span>
                  </div>
                  {doc.document.notes && (
                    <div className="detail-item full-width">
                      <label>Ghi chú</label>
                      <span style={{ whiteSpace: 'pre-wrap' }}>{doc.document.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Upload file */}
            {canUpload && (
              <div className="card">
                <div className="card-header">
                  <h2>📎 Upload file nháp</h2>
                  <p style={{ color: '#636e72', fontSize: 13, margin: 0 }}>
                    Hỗ trợ: PDF, DOCX, JPG, PNG, TIFF, BMP (tối đa 10MB)
                  </p>
                </div>
                <div className="card-body">
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: `2px dashed ${dragOver ? '#667eea' : '#dfe6e9'}`,
                      borderRadius: 12,
                      padding: '32px 16px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: dragOver ? '#f0f2ff' : '#f8f9fa',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontSize: 32, marginBottom: 8 }}>☁️</div>
                    <p style={{ margin: 0, fontWeight: 600, color: '#2d3436' }}>
                      Kéo thả file vào đây hoặc <span style={{ color: '#667eea' }}>chọn file</span>
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#636e72' }}>PDF, DOCX, JPG, PNG, TIFF, BMP</p>
                    <input
                      ref={fileInputRef}
                      id="file-upload-input"
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tiff,.bmp"
                      style={{ display: 'none' }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
                    />
                  </div>

                  {actionLoading && uploadProgress > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                        <span>Đang upload...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div style={{ height: 8, background: '#ecf0f1', borderRadius: 4 }}>
                        <div style={{ height: '100%', width: `${uploadProgress}%`, background: '#667eea', borderRadius: 4, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* File đính kèm + OCR */}
            {doc.document.fileUrl && (
              <div className="card">
                <div className="card-header">
                  <h2>Tệp đính kèm</h2>
                </div>
                <div className="card-body">
                  <div className="attachment-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                    <div className="attachment-file-card">
                      <div className="attachment-file-icon">&#128196;</div>
                      <div className="attachment-file-info">
                        <div className="attachment-file-name" title={doc.document.originalFileName || 'File đính kèm'}>
                          {doc.document.originalFileName || 'File đính kèm'}
                        </div>
                        {doc.document.fileSize && (
                          <div className="attachment-file-size">
                            {(doc.document.fileSize / 1024).toFixed(1)} KB
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => openAuthenticatedFile(doc.document.fileUrl ?? '')}
                          className="btn btn-secondary"
                          style={{ fontSize: 13, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          👁️ Xem
                        </button>
                        {/* <button
                          type="button"
                          onClick={() =>
                            downloadAuthenticatedFile(
                              `/api/documents/${doc.documentId}/download`,
                              doc.document.originalFileName || `document-${doc.documentId}`,
                            )
                          }
                          className="btn btn-secondary"
                          style={{ fontSize: 13, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          ⬇️ Tải về
                        </button> */}
                      </div>
                    </div>
                  </div>

                  {/* Trạng thái OCR */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                    <div style={{ fontSize: 13, color: '#636e72' }}>
                      OCR:{' '}
                      <strong>
                        {doc.document.ocrStatus === 'COMPLETED'
                          ? '✅ Hoàn tất'
                          : doc.document.ocrStatus === 'PROCESSING'
                          ? '⏳ Đang xử lý'
                          : doc.document.ocrStatus === 'FAILED'
                          ? '❌ Thất bại'
                          : '⏸️ Chưa chạy'}
                      </strong>
                    </div>
                    {canOcr && (
                      <button
                        id="btn-run-ocr"
                        className="btn btn-secondary"
                        style={{ fontSize: 13 }}
                        onClick={handleRunOcr}
                        disabled={actionLoading}
                      >
                        {actionLoading ? '⏳ Đang xử lý...' : '🔍 Chạy OCR'}
                      </button>
                    )}
                    {doc.document.ocrStatus === 'COMPLETED' && doc.document.ocrText && (
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 13 }}
                        onClick={() => setShowOcrResult(!showOcrResult)}
                      >
                        {showOcrResult ? '🙈 Ẩn kết quả OCR' : '📋 Xem kết quả OCR'}
                      </button>
                    )}
                  </div>

                  {/* Kết quả OCR */}
                  {showOcrResult && (ocrResult || doc.document.ocrText) && (
                    <div
                      style={{
                        marginTop: 16,
                        padding: 16,
                        background: '#f0f2ff',
                        borderRadius: 8,
                        border: '1px solid #c7d2fe',
                      }}
                    >
                      <h4 style={{ margin: '0 0 12px', color: '#4c1d95' }}>Kết quả OCR</h4>
                      {ocrResult?.extractedFields && (
                        <div
                          style={{
                            marginBottom: 12,
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: 8,
                          }}
                        >
                          {Object.entries(ocrResult.extractedFields).map(([key, val]) =>
                            val ? (
                              <div key={key} style={{ fontSize: 13 }}>
                                <strong>{key}:</strong> {val}
                              </div>
                            ) : null,
                          )}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: 12,
                          maxHeight: 200,
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                          color: '#4b5563',
                          background: 'white',
                          padding: 12,
                          borderRadius: 6,
                        }}
                      >
                        {doc.document.ocrText}
                      </div>
                      {canEdit && ocrResult && (
                        <button
                          className="btn btn-primary"
                          style={{ marginTop: 12, fontSize: 13 }}
                          onClick={() =>
                            navigate(`/outgoing-documents/${doc.id}/edit`, {
                              state: { ocrFields: ocrResult.extractedFields },
                            })
                          }
                        >
                          ✍️ Điền vào form từ OCR
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Chữ ký số — tự động disable nếu không phải PDF/Word */}
            {doc.document.fileUrl && (
              <div className="card">
                <div className="card-header">
                  <h2>Chữ ký số</h2>
                </div>
                <div className="card-body">
                  <SignaturePanel
                    documentId={doc.id}
                    mimeType={doc.document.mimeType}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Cột phải: lịch sử workflow */}
          <div className="card">
            <div className="card-header"><h2>📈 Lịch sử xử lý</h2></div>
            <div className="card-body">
              <div style={{ position: 'relative' }}>
                {[
                  { label: 'Tạo văn bản', date: doc.createdAt, user: doc.document.createdByUser?.fullName, status: 'DRAFT', always: true },
                  { label: 'Trình duyệt', date: doc.submittedAt, user: doc.submittedByUser?.fullName, status: 'SUBMITTED' },
                  { label: 'Phê duyệt', date: doc.approvedAt, user: doc.approvedByUser?.fullName, status: 'APPROVED' },
                  { label: 'Trả lại', date: doc.returnedAt, user: doc.returnedByUser?.fullName, status: 'RETURNED', note: doc.returnReason },
                  { label: 'Chuyển văn thư', date: doc.forwardedAt, user: doc.forwardedByUser?.fullName, status: 'WAITING_FOR_ISSUE' },
                  { label: 'Phát hành', date: doc.issuedAt, user: doc.issuedByUser?.fullName, status: 'ISSUED' },
                  { label: 'Thu hồi', date: doc.recalledAt, user: doc.recalledByUser?.fullName, status: 'RECALLED', note: doc.recallReason },
                  { label: 'Thùng rác', date: doc.trashedAt, user: doc.trashedByUser?.fullName, status: 'TRASHED' },
                ]
                  .filter((item) => item.always || item.date)
                  .map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: item.date ? '#667eea' : '#ecf0f1',
                        color: item.date ? 'white' : '#bdc3c7',
                        fontSize: 14, flexShrink: 0,
                      }}>
                        {idx + 1}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{item.label}</div>
                        {item.date ? (
                          <>
                            <div style={{ fontSize: 12, color: '#636e72' }}>{formatDateTime(item.date)}</div>
                            {item.user && <div style={{ fontSize: 12, color: '#667eea' }}>👤 {item.user}</div>}
                            {item.note && (
                              <div style={{ fontSize: 12, color: '#e67e22', marginTop: 2 }}>
                                💬 {item.note}
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ fontSize: 12, color: '#bdc3c7' }}>Chưa thực hiện</div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal xác nhận hành động */}
      {statusModal.open && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
          onClick={() => setStatusModal({ open: false, action: null })}
        >
          <div
            style={{ background: 'white', borderRadius: 12, padding: 32, width: 480, maxWidth: '90vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>
              {statusModal.action === 'submit' && '📤 Trình văn bản để duyệt'}
              {statusModal.action === 'approve' && '✅ Phê duyệt văn bản'}
              {statusModal.action === 'return' && '↩️ Trả lại văn bản'}
              {statusModal.action === 'issue' && '🚀 Phát hành văn bản'}
              {statusModal.action === 'recall' && '🔙 Thu hồi văn bản đã phát hành'}
              {statusModal.action === 'trash' && '🗑️ Chuyển vào thùng rác'}
              {statusModal.action === 'restore' && '♻️ Khôi phục từ thùng rác'}
            </h3>

            {/* Trình duyệt: chọn người duyệt */}
            {statusModal.action === 'submit' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Chọn Lãnh đạo phê duyệt <span style={{ color: '#e74c3c' }}>*</span>
                </label>
                <select
                  value={assignedApproverId}
                  onChange={(e) => setAssignedApproverId(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14 }}
                >
                  <option value="">— Chọn Lãnh đạo —</option>
                  {approvers.map(a => (
                    <option key={a.id} value={a.id}>{a.fullName} ({a.email})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Phê duyệt: chọn văn thư */}
            {statusModal.action === 'approve' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Chọn Văn thư tiếp nhận <span style={{ color: '#e74c3c' }}>*</span>
                </label>
                <select
                  value={assignedClerkId}
                  onChange={(e) => setAssignedClerkId(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14 }}
                >
                  <option value="">— Chọn Văn thư —</option>
                  {clerks.map(c => (
                    <option key={c.id} value={c.id}>{c.fullName} ({c.email})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Trả lại: bắt buộc nhập lý do */}
            {statusModal.action === 'return' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Lý do trả lại <span style={{ color: '#e74c3c' }}>*</span>
                </label>
                <textarea
                  id="return-reason-input"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Nhập lý do trả lại để tác giả chỉnh sửa..."
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {/* Thu hồi: bắt buộc nhập lý do */}
            {statusModal.action === 'recall' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Lý do thu hồi <span style={{ color: '#e74c3c' }}>*</span>
                </label>
                <textarea
                  id="recall-reason-input"
                  value={recallReason}
                  onChange={(e) => setRecallReason(e.target.value)}
                  placeholder="Nhập lý do thu hồi văn bản..."
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {/* Phát hành: nhập thông tin gửi */}
            {statusModal.action === 'issue' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Ngày gửi</label>
                    <input
                      id="sent-date-input"
                      type="date"
                      value={sentDate}
                      onChange={(e) => setSentDate(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                {/* Độ khẩn và Độ mật khi phát hành */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Độ khẩn</label>
                    <select
                      id="issue-urgency-select"
                      value={issueUrgency}
                      onChange={(e) => setIssueUrgency(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                    >
                      <option value="">— Giữ nguyên —</option>
                      <option value="THUONG">Thường</option>
                      <option value="KHAN">Khẩn</option>
                      <option value="THUONG_KHAN">Thượng khẩn</option>
                      <option value="HOA_TOC">Hỏa tốc</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Độ mật</label>
                    <select
                      id="issue-confidentiality-select"
                      value={issueConfidentiality}
                      onChange={(e) => setIssueConfidentiality(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                    >
                      <option value="">— Giữ nguyên —</option>
                      <option value="THUONG">Thường</option>
                      <option value="MAT">Mật</option>
                      <option value="TOI_MAT">Tối mật</option>
                      <option value="TUYET_MAT">Tuyệt mật</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Xác nhận chung */}
            {!['return', 'recall'].includes(statusModal.action || '') && (
              <p style={{ color: '#636e72', marginBottom: 20 }}>
                {statusModal.action === 'submit' && 'Xác nhận trình văn bản lên Lãnh đạo để duyệt?'}
                {statusModal.action === 'approve' && 'Xác nhận phê duyệt văn bản và chuyển cho Văn thư?'}
                {statusModal.action === 'issue' && 'Xác nhận phát hành văn bản chính thức?'}
                {statusModal.action === 'trash' && 'Văn bản sẽ được chuyển vào thùng rác. Có thể khôi phục sau.'}
                {statusModal.action === 'restore' && 'Khôi phục văn bản này từ thùng rác về trạng thái Bản nháp?'}
              </p>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                className="btn btn-secondary"
                onClick={() => setStatusModal({ open: false, action: null })}
                disabled={actionLoading}
              >
                Hủy
              </button>
              <button
                id="btn-confirm-action"
                className="btn btn-primary"
                onClick={handleStatusUpdate}
                disabled={
                  actionLoading || 
                  (statusModal.action === 'return' && !returnReason.trim()) || 
                  (statusModal.action === 'recall' && !recallReason.trim()) ||
                  (statusModal.action === 'submit' && !assignedApproverId) ||
                  (statusModal.action === 'approve' && !assignedClerkId)
                }
                style={{
                  background: statusModal.action === 'trash' ? '#e74c3c' :
                    statusModal.action === 'recall' ? '#c0392b' :
                      statusModal.action === 'approve' ? '#27ae60' : undefined,
                }}
              >
                {actionLoading ? '⏳ Đang xử lý...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Gửi Email ──────────────────────────────────────────────── */}
      {emailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 20 }}>📧 Gửi văn bản qua Email</h2>
            <p style={{ margin: '0 0 20px', color: '#636e72', fontSize: 14 }}>Nhập địa chỉ email người nhận. Có thể thêm nhiều email.</p>

            {!emailResult ? (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        const val = emailInput.trim();
                        if (val && !emailList.includes(val)) {
                          setEmailList(prev => [...prev, val]);
                          setEmailInput('');
                        }
                      }
                    }}
                    placeholder="example@email.com (Enter để thêm)"
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14 }}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      const val = emailInput.trim();
                      if (val && !emailList.includes(val)) {
                        setEmailList(prev => [...prev, val]);
                        setEmailInput('');
                      }
                    }}
                    style={{ padding: '8px 14px' }}
                  >
                    + Thêm
                  </button>
                </div>

                {emailList.length > 0 && (
                  <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {emailList.map(email => (
                      <span key={email} style={{ background: '#e8f4fd', color: '#2980b9', borderRadius: 20, padding: '4px 10px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                        ✉️ {email}
                        <button onClick={() => setEmailList(prev => prev.filter(e => e !== email))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c', fontWeight: 700, padding: 0, lineHeight: 1 }}>✕</button>
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setEmailModal(false)} disabled={emailSending}>Hủy</button>
                  <button
                    className="btn btn-primary"
                    disabled={emailSending || emailList.length === 0}
                    style={{ background: '#16a085' }}
                    onClick={async () => {
                      if (!doc) return;
                      setEmailSending(true);
                      try {
                        const result = await sendOutgoingEmail(doc.id, emailList);
                        setEmailResult(result);
                      } catch (err: unknown) {
                        alert(err instanceof Error ? err.message : 'Gửi email thất bại');
                      } finally {
                        setEmailSending(false);
                      }
                    }}
                  >
                    {emailSending ? '⏳ Đang gửi...' : `📨 Gửi cho ${emailList.length} người nhận`}
                  </button>
                </div>
              </>
            ) : (
              /* Hiển thị kết quả gửi */
              <div>
                <div style={{ background: emailResult.failedCount === 0 ? '#d4edda' : '#fff3cd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                  <p style={{ margin: 0, fontWeight: 600, color: emailResult.failedCount === 0 ? '#155724' : '#856404' }}>
                    {emailResult.failedCount === 0 ? '✅ Gửi email thành công!' : '⚠️ Gửi email hoàn tất (có lỗi)'}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 14, color: '#636e72' }}>
                    Thành công: {emailResult.sentCount} | Thất bại: {emailResult.failedCount}
                  </p>
                </div>
                {emailResult.failedEmails.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 13, color: '#e74c3c', margin: '0 0 4px', fontWeight: 600 }}>Email gửi thất bại:</p>
                    {emailResult.failedEmails.map(e => <p key={e} style={{ margin: '2px 0', fontSize: 13, color: '#636e72' }}>• {e}</p>)}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" onClick={() => setEmailModal(false)}>Đóng</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {registerModalOpen && (
        <RegisterDocumentModal
          type="OUTGOING"
          loading={registering}
          onClose={() => setRegisterModalOpen(false)}
          onRegister={handleRegister}
        />
      )}
    </>
  );
}
