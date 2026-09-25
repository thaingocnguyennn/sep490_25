import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getOutgoingDocumentById, deleteOutgoingDocument, sendOutgoingEmail, SendEmailResult } from '../../../api/modules/outgoing-documents';
import SignaturePanel from '../components/SignaturePanel';
import { useOutgoingDocumentActions } from '../../../shared/hooks';
import { DocumentStatusBadge, UrgencyBadge } from '../../../shared/components/DocumentBadges';
import { formatConfidentiality } from '../../../shared/constants/confidentiality';
import { LoadingSpinner } from '../../../shared/components';
import { useAuth } from '../../../contexts/AuthContext';
import type {
  OutgoingDocument,
  UpdateOutgoingStatusRequest,
  User,
} from '../../../types';
import { usersApi } from '../../../api/modules/users';
import { api } from '../../../api';
import RegisterDocumentModal from '../components/RegisterDocumentModal';
import ProcessOutgoingDocumentModal, {
  OutgoingActionType,
  ProcessOutgoingDocumentPayload,
} from '../components/ProcessOutgoingDocumentModal';

async function openAuthenticatedFile(url: string): Promise<void> {
  try {
    const res = await api.get<Blob>(url, { responseType: 'blob' });
    const blob = res.data;
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
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

// Helper format ngày
const formatDate = (dateStr?: string | Date | null): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('vi-VN');
};

const formatDateTime = (dateStr?: string | Date | null): string => {
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
  const { loading: actionLoading, uploadProgress, error: actionError, uploadFile, updateStatus, clearError } = useOutgoingDocumentActions();

  const [doc, setDoc] = useState<OutgoingDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOcrResult, setShowOcrResult] = useState(false);

  // State modal trạng thái đồng bộ
  const [statusModal, setStatusModal] = useState<{
    open: boolean;
    action: OutgoingActionType | null;
  }>({ open: false, action: null });
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [approvers, setApprovers] = useState<User[]>([]);
  const [clerks, setClerks] = useState<User[]>([]);

  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [registering, setRegistering] = useState(false);

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
  const canSubmit = (isSpecialist || isClerk || isAdmin) && doc?.document.status === 'DRAFT';
  const canApprove = (isDeptHead || isAdmin) && doc?.document.status === 'SUBMITTED';
  const canReturn = (isDeptHead || isAdmin) && doc?.document.status === 'SUBMITTED';
  const canRegister = (isClerk || isAdmin) && doc?.document.status === 'APPROVED' && (doc.assignedClerkId === user?.id || doc.document.createdByUser?.id === user?.id || !doc.assignedClerkId || (doc.document.department?.id !== undefined && doc.document.department?.id === user?.department?.id));
  const canIssue = (isClerk || isAdmin) && doc?.document.status === 'WAITING_FOR_ISSUE';
  const canRecall = (isClerk || isAdmin) && doc?.document.status === 'ISSUED';
  const canSendEmail = (isSpecialist || isClerk || isDeptHead || isAdmin) && doc?.document.status === 'ISSUED';
  const canTrash = (isSpecialist || isClerk || isAdmin) && doc?.document.status === 'DRAFT';
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

  // ─── Process & Status update handler ─────────────────────────────────────

  const handleProcessConfirm = async (payload: ProcessOutgoingDocumentPayload) => {
    if (!doc) return;

    if (payload.action === 'trash') {
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

    const statusMap: Record<OutgoingActionType, string> = {
      submit: 'SUBMITTED',
      approve: 'APPROVED',
      return: 'RETURNED',
      issue: 'ISSUED',
      recall: 'RECALLED',
      trash: 'TRASHED',
      restore: 'DRAFT',
    };

    const updatePayload: UpdateOutgoingStatusRequest = {
      status: statusMap[payload.action] as any,
      returnReason: payload.returnReason,
      recallReason: payload.recallReason,
      sentDate: payload.sentDate,
      urgency: (payload.issueUrgency || undefined) as any,
      confidentialityLevel: (payload.issueConfidentiality || undefined) as any,
      assignedApproverId: payload.assignedApproverId,
      assignedClerkId: payload.assignedClerkId,
      note: payload.note,
    };

    const result = await updateStatus(doc.id, updatePayload);
    if (result) {
      setDoc(result);
      setStatusModal({ open: false, action: null });
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

  const handleOpenStatusModal = async (action: OutgoingActionType) => {
    setStatusModal({ open: true, action });
    if (action === 'submit') {
      setLoadingUsers(true);
      try {
        const deptId = doc?.document.department?.id;
        const res = await usersApi.getApprovers(deptId ? { departmentId: deptId } : undefined);
        setApprovers(res.data.data || []);
      } catch (err) {
        console.error('Failed to load approvers', err);
      } finally {
        setLoadingUsers(false);
      }
    }
    if (action === 'approve') {
      setLoadingUsers(true);
      try {
        const deptId = doc?.document.department?.id;
        const res = await usersApi.getClerks(deptId ? { departmentId: deptId } : undefined);
        setClerks(res.data.data || []);
      } catch (err) {
        console.error('Failed to load clerks', err);
      } finally {
        setLoadingUsers(false);
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
            <p style={{ color: '#e74c3c' }}>{error || 'Không tìm thấy văn bản đi'}</p>
            <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => navigate('/outgoing-documents')}>
              Quay lại danh sách
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
            Quay lại
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
              Chỉnh sửa
            </button>
          )}
          {canSubmit && (
            <button id="btn-submit-doc" className="btn btn-primary" onClick={() => handleOpenStatusModal('submit')}>
              Trình duyệt
            </button>
          )}
          {canApprove && (
            <button id="btn-approve-doc" className="btn btn-primary" onClick={() => handleOpenStatusModal('approve')}
              style={{ background: '#27ae60' }}>
              Phê duyệt
            </button>
          )}
          {canReturn && (
            <button id="btn-return-doc" className="btn btn-secondary" onClick={() => handleOpenStatusModal('return')}
              style={{ borderColor: '#e67e22', color: '#e67e22' }}>
              Trả lại
            </button>
          )}
          {canRegister && (
            <button id="btn-register-doc" className="btn btn-primary" onClick={() => setRegisterModalOpen(true)}
              style={{ background: '#f39c12' }}>
              Vào sổ văn bản
            </button>
          )}
          {canIssue && (
            <button id="btn-issue-doc" className="btn btn-primary" onClick={() => handleOpenStatusModal('issue')}
              style={{ background: '#8e44ad' }}>
              Phát hành
            </button>
          )}
          {canRecall && (
            <button id="btn-recall-doc" className="btn btn-secondary" onClick={() => handleOpenStatusModal('recall')}
              style={{ borderColor: '#c0392b', color: '#c0392b' }}>
              Thu hồi
            </button>
          )}
          {canRestore && (
            <button id="btn-restore-doc" className="btn btn-secondary" onClick={() => setStatusModal({ open: true, action: 'restore' })}
              style={{ borderColor: '#27ae60', color: '#27ae60' }}>
              Khôi phục
            </button>
          )}
          {canTrash && (
            <button id="btn-trash-doc" className="btn btn-secondary" onClick={() => setStatusModal({ open: true, action: 'trash' })}
              style={{ borderColor: '#e74c3c', color: '#e74c3c' }}>
              Thùng rác
            </button>
          )}
          {canSendEmail && (
            <button
              id="btn-send-email"
              className="btn btn-primary"
              onClick={() => { setEmailModal(true); setEmailResult(null); setEmailList([]); setEmailInput(doc?.recipientEmail || ''); }}
              style={{ background: '#16a085' }}
            >
              Gửi Email
            </button>
          )}
        </div>
      </div>

      <div className="page-content">
        {justCreated && (
          <div style={{ background: '#d4edda', border: '1px solid #28a745', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#155724' }}>
            Văn bản đi đã được tạo thành công!
          </div>
        )}

        {(actionError) && (
          <div style={{ background: '#fdf0f0', border: '1px solid #fcc', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#e74c3c', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{actionError}</span>
            <button onClick={clearError} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c', fontSize: 16, fontWeight: 700 }}>×</button>
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
                  {/* 1. Cơ quan ban hành */}
                  {doc.document.issuer && (
                    <div className="detail-item">
                      <label>1. Cơ quan ban hành</label>
                      <span style={{ fontWeight: 600 }}>{doc.document.issuer}</span>
                    </div>
                  )}

                  {/* 2. Số ký hiệu */}
                  {(doc.documentNumber || doc.document.documentNumber) && (
                    <div className="detail-item">
                      <label>2. Số ký hiệu</label>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#667eea' }}>
                        {doc.document.documentNumber || doc.documentNumber}
                      </span>
                    </div>
                  )}

                  {/* Số đi chính thức (khi đã vào sổ/ban hành) */}
                  {doc.dispatchNumber && (
                    <div className="detail-item">
                      <label>Số đi chính thức</label>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#667eea', fontSize: 16 }}>
                        {doc.dispatchNumber}
                      </span>
                    </div>
                  )}

                  {/* 3. Ngày tháng năm văn bản */}
                  <div className="detail-item">
                    <label>3. Ngày văn bản</label>
                    <span>{formatDate(doc.document.issuedDate || doc.issuanceDate)}</span>
                  </div>

                  {/* 4. Loại văn bản */}
                  <div className="detail-item">
                    <label>4. Loại văn bản</label>
                    <span>{doc.document.documentTypeRef?.name || '—'}</span>
                  </div>

                  {/* 5. Trích yếu */}
                  <div className="detail-item full-width">
                    <label>5. Trích yếu văn bản</label>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#2d3748' }}>{doc.document.subject}</span>
                  </div>

                  {/* 6. Chức vụ & 7. Họ tên người ký */}
                  <div className="detail-item">
                    <label>6 & 7. Người ký & Chức vụ</label>
                    <span style={{ fontWeight: 600 }}>
                      {doc.document.signerName || '—'}
                      {doc.document.signerTitle ? ` (${doc.document.signerTitle})` : ''}
                    </span>
                  </div>

                  {/* 8. Độ khẩn */}
                  <div className="detail-item">
                    <label>8. Độ khẩn</label>
                    <span><UrgencyBadge urgency={doc.document.urgency} /></span>
                  </div>

                  {/* 9. Độ mật */}
                  <div className="detail-item">
                    <label>9. Độ mật</label>
                    <span style={{ fontWeight: 500 }}>
                      {formatConfidentiality(doc.document.confidentiality)}
                    </span>
                  </div>

                  {/* Nơi nhận */}
                  {doc.recipientName && (
                    <div className="detail-item full-width">
                      <label>Nơi nhận (Kính gửi)</label>
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

                  {/* Số trang */}
                  {doc.pageCount && (
                    <div className="detail-item">
                      <label>Số trang</label>
                      <span>{doc.pageCount} trang</span>
                    </div>
                  )}

                  {/* Phòng ban & Lĩnh vực */}
                  <div className="detail-item">
                    <label>Phòng ban soạn thảo</label>
                    <span>{doc.document.department?.name || '—'}</span>
                  </div>

                  {doc.document.category && (
                    <div className="detail-item">
                      <label>Lĩnh vực văn bản</label>
                      <span>{doc.document.category.name}</span>
                    </div>
                  )}

                  {/* Trạng thái văn bản */}
                  <div className="detail-item">
                    <label>Trạng thái</label>
                    <span><DocumentStatusBadge status={docStatus} /></span>
                  </div>

                  {doc.sentDate && (
                    <div className="detail-item">
                      <label>Ngày gửi</label>
                      <span>{formatDate(doc.sentDate)}</span>
                    </div>
                  )}

                  <div className="detail-item">
                    <label>Người tạo</label>
                    <span>{doc.document.createdByUser?.fullName || '—'}</span>
                  </div>

                  <div className="detail-item">
                    <label>Ngày tạo</label>
                    <span>{formatDateTime(doc.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Upload file */}
            {canUpload && (
              <div className="card">
                <div className="card-header">
                  <h2>Upload file nháp</h2>
                  <p style={{ color: '#636e72', fontSize: 13, margin: 0 }}>
                    Hỗ trợ: PDF, DOCX, JPG, PNG, TIFF, BMP (tối đa 50MB)
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

            {/* File đính kèm */}
            {doc.document.fileUrl && (
              <div className="card">
                <div className="card-header">
                  <h2>Tệp đính kèm</h2>
                </div>
                <div className="card-body">
                  <div className="attachment-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                    <div className="attachment-file-card">
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
                          Xem tệp
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Xem kết quả text OCR đã quét từ lúc tạo nếu có */}
                  {doc.document.ocrText && (
                    <div style={{ marginTop: 12 }}>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 13 }}
                        onClick={() => setShowOcrResult(!showOcrResult)}
                      >
                        {showOcrResult ? 'Ẩn nội dung OCR' : 'Xem nội dung OCR'}
                      </button>

                      {showOcrResult && (
                        <div
                          style={{
                            marginTop: 12,
                            padding: 14,
                            background: '#f8fafc',
                            borderRadius: 8,
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              maxHeight: 220,
                              overflow: 'auto',
                              whiteSpace: 'pre-wrap',
                              color: '#334155',
                              background: 'white',
                              padding: 12,
                              borderRadius: 6,
                              border: '1px solid #cbd5e1',
                            }}
                          >
                            {doc.document.ocrText}
                          </div>
                        </div>
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
                    fileName={doc.document.originalFileName || doc.document.fileUrl}
                    mimeType={doc.document.mimeType}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Cột phải: lịch sử workflow */}
          <div className="card">
            <div className="card-header"><h2>Lịch sử xử lý</h2></div>
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
                            {item.user && <div style={{ fontSize: 12, color: '#667eea' }}>{item.user}</div>}
                            {item.note && (
                              <div style={{ fontSize: 12, color: '#e67e22', marginTop: 2 }}>
                                {item.note}
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

      {/* Modal xử lý quy trình văn bản đi (đồng bộ với văn bản đến) */}
      {doc && (
        <ProcessOutgoingDocumentModal
          open={statusModal.open}
          action={statusModal.action}
          doc={doc}
          approvers={approvers}
          clerks={clerks}
          loadingUsers={loadingUsers}
          submitting={actionLoading}
          onClose={() => setStatusModal({ open: false, action: null })}
          onConfirm={handleProcessConfirm}
        />
      )}

      {/* ── Modal Gửi Email ──────────────────────────────────────────────── */}
      {emailModal && doc && (
        <div className="modal-overlay" onClick={() => setEmailModal(false)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 540, width: '95%' }}
          >
            <div className="modal-header">
              <h2>Gửi văn bản qua Email</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setEmailModal(false)}
                disabled={emailSending}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div
                style={{
                  marginBottom: 16,
                  padding: '12px 14px',
                  background: '#f8f9fa',
                  borderRadius: 8,
                  border: '1px solid #dfe6e9',
                }}
              >
                <div style={{ fontSize: 12, color: '#636e72', marginBottom: 2 }}>
                  Văn bản gửi kèm
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#2d3436' }}>
                  {doc.document.subject}
                </div>
                <div style={{ fontSize: 12, color: '#636e72', marginTop: 4 }}>
                  Số ký hiệu: <strong>{doc.document.documentNumber || '—'}</strong>
                </div>
              </div>

              {!emailResult ? (
                <>
                  <label
                    style={{
                      fontWeight: 600,
                      display: 'block',
                      marginBottom: 4,
                      fontSize: 14,
                    }}
                  >
                    Danh sách Email người nhận <span style={{ color: '#e74c3c' }}>*</span>
                  </label>
                  <p style={{ margin: '0 0 12px', color: '#636e72', fontSize: 13 }}>
                    Nhập địa chỉ email người nhận và nhấn Enter hoặc nút Thêm.
                  </p>

                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          const val = emailInput.trim();
                          if (val && !emailList.includes(val)) {
                            setEmailList((prev) => [...prev, val]);
                            setEmailInput('');
                          }
                        }
                      }}
                      placeholder="example@email.com (Enter để thêm)"
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        border: '1px solid #dfe6e9',
                        borderRadius: 8,
                        fontSize: 14,
                        boxSizing: 'border-box',
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        const val = emailInput.trim();
                        if (val && !emailList.includes(val)) {
                          setEmailList((prev) => [...prev, val]);
                          setEmailInput('');
                        }
                      }}
                      style={{ padding: '10px 16px' }}
                    >
                      Thêm
                    </button>
                  </div>

                  {emailList.length > 0 && (
                    <div
                      style={{
                        marginBottom: 16,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                      }}
                    >
                      {emailList.map((email) => (
                        <span
                          key={email}
                          style={{
                            background: '#e8f4fd',
                            color: '#2980b9',
                            borderRadius: 20,
                            padding: '4px 12px',
                            fontSize: 13,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          {email}
                          <button
                            type="button"
                            onClick={() => setEmailList((prev) => prev.filter((e) => e !== email))}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#e74c3c',
                              fontWeight: 700,
                              padding: 0,
                              lineHeight: 1,
                              fontSize: 14,
                            }}
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div
                    style={{
                      background: emailResult.failedCount === 0 ? '#d4edda' : '#fff3cd',
                      borderRadius: 8,
                      padding: 16,
                      marginBottom: 16,
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 600,
                        color: emailResult.failedCount === 0 ? '#155724' : '#856404',
                      }}
                    >
                      {emailResult.failedCount === 0
                        ? 'Gửi email thành công!'
                        : 'Gửi email hoàn tất (có lỗi)'}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 14, color: '#636e72' }}>
                      Thành công: {emailResult.sentCount} | Thất bại: {emailResult.failedCount}
                    </p>
                  </div>
                  {emailResult.failedEmails.length > 0 && (
                    <div style={{ marginBottom: 12, textAlign: 'left' }}>
                      <p
                        style={{
                          fontSize: 13,
                          color: '#e74c3c',
                          margin: '0 0 4px',
                          fontWeight: 600,
                        }}
                      >
                        Email gửi thất bại:
                      </p>
                      {emailResult.failedEmails.map((e) => (
                        <p key={e} style={{ margin: '2px 0', fontSize: 13, color: '#636e72' }}>
                          • {e}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-cancel"
                onClick={() => setEmailModal(false)}
                disabled={emailSending}
              >
                {emailResult ? 'Đóng' : 'Hủy'}
              </button>
              {!emailResult && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={emailSending || emailList.length === 0}
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
                  {emailSending ? 'Đang gửi...' : `Gửi cho ${emailList.length} người nhận`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {registerModalOpen && (
        <RegisterDocumentModal
          type="OUTGOING"
          loading={registering}
          onClose={() => setRegisterModalOpen(false)}
          onRegister={handleRegister}
          documentSymbol={doc?.documentNumber || ''}
          departmentId={doc?.document.department?.id}
        />
      )}
    </>
  );
}
