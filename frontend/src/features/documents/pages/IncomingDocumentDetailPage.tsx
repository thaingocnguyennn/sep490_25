import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  incomingDocumentsApi,
  type IncomingDocumentDetail,
  type WorkflowStatus,
  type ProcessorType,
  type SpecialistAction,
} from '../../../api';
import { DocumentStatusBadge } from '../../../shared/components/DocumentBadges';
import { LoadingSpinner } from '../../../shared/components';
import { useAuth } from '../../../contexts/AuthContext';
import { formatUrgency } from '../../../shared/constants/urgency';
import { formatConfidentiality } from '../../../shared/constants/confidentiality';
import ProcessIncomingDocumentModal from '../components/ProcessIncomingDocumentModal';
import ProcessorPicker from '../components/ProcessorPicker';
import PdfPreview from '../components/PdfPreview';
import { useProcessors } from '../../../shared/hooks';

import RegisterDocumentModal from '../components/RegisterDocumentModal';

const WORKFLOW_ACTION_LABELS: Record<string, string> = {
  PENDING: 'Chưa xử lý',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
};

const WORKFLOW_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ xử lý',
  IN_PROGRESS: 'Đang xử lý',
  COMPLETED: 'Hoàn thành',
  REJECTED: 'Từ chối',
  CANCELLED: 'Hủy',
};

export default function IncomingDocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isDepartmentHead, isSpecialist, isAdmin, isDocumentClerk } = useAuth();
  const { processors: availableProcessors, fetch: fetchProcessors } = useProcessors();
  const [doc, setDoc] = useState<IncomingDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingStep, setUpdatingStep] = useState<number | null>(null);
  const [processOpen, setProcessOpen] = useState(false);
  const [specialistAction, setSpecialistAction] = useState<SpecialistAction | null>(null);
  const [spProcessorIds, setSpProcessorIds] = useState<{ userId: number; processorType: ProcessorType }[]>([]);
  const [spInstructions, setSpInstructions] = useState('');
  const [spReason, setSpReason] = useState('');
  const [spSubmitting, setSpSubmitting] = useState(false);
  const [spError, setSpError] = useState('');
  
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [registering, setRegistering] = useState(false);

  // Comments thread + PHXL supporting task state.
  type Comment = {
    id: number;
    body: string;
    createdAt: string;
    user: { id: number; fullName: string; email: string };
  };
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [phxlCompleting, setPhxlCompleting] = useState(false);

  const fetchDoc = () => {
    if (!id) return;
    setLoading(true);
    incomingDocumentsApi
      .getById(Number(id))
      .then(({ data }) => setDoc(data.data!))
      .catch(() => setError('Không thể tải văn bản'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDoc();
  }, [id]);

  useEffect(() => {
    if (searchParams.get('process') === '1' && doc) {
      setProcessOpen(true);
    }
  }, [searchParams, doc]);

  const loadComments = () => {
    if (!id) return;
    setCommentsLoading(true);
    incomingDocumentsApi
      .listComments(Number(id))
      .then(({ data }) => setComments(data.data ?? []))
      .catch(() => {
        // Silently fail — comments are non-critical.
      })
      .finally(() => setCommentsLoading(false));
  };

  useEffect(() => {
    if (doc) {
      loadComments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, doc?.id]);

  const handleSubmitComment = async () => {
    const trimmed = newComment.trim();
    if (!trimmed) return;
    setSubmittingComment(true);
    setCommentError('');
    try {
      const { data } = await incomingDocumentsApi.addComment(doc!.id, trimmed);
      const created = data.data!;
      // Optimistically prepend so the user sees the new comment immediately.
      setComments((prev) => [
        ...prev,
        {
          id: created.id,
          body: created.body,
          createdAt: created.createdAt,
          user: created.user,
        },
      ]);
      setNewComment('');
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setCommentError(apiError.response?.data?.message || 'Could not send comment.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleCompletePhxl = async () => {
    if (!user) return;
    setPhxlCompleting(true);
    try {
      await incomingDocumentsApi.completeProcessorTask(doc!.id, user.id);
      fetchDoc();
      loadComments();
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setCommentError(apiError.response?.data?.message || 'Could not complete the task.');
    } finally {
      setPhxlCompleting(false);
    }
  };

  const handleWorkflowStepAction = async (workflowId: number, action: string) => {
    if (!doc || !user) return;
    setUpdatingStep(workflowId);
    try {
      const currentStep = doc.document.workflows?.find((w) => w.id === workflowId);
      if (!currentStep) return;

      let newStatus: WorkflowStatus;
      let stepStatus: string;

      if (action === 'approve') {
        stepStatus = 'APPROVED';
        const allSteps = doc.document.workflows!;
        const currentIdx = allSteps.findIndex((w) => w.id === workflowId);
        const isLast = currentIdx === allSteps.length - 1;
        newStatus = isLast ? 'COMPLETED' : 'IN_PROGRESS';
      } else if (action === 'reject') {
        stepStatus = 'REJECTED';
        newStatus = 'REJECTED';
      } else {
        return;
      }

      await incomingDocumentsApi.updateWorkflowStep(doc.id, workflowId, {
        stepStatus,
        notes: `Bước "${currentStep.workflowStep.name}": ${WORKFLOW_ACTION_LABELS[stepStatus]}`,
      });
      fetchDoc();
    } catch {
      setError('Cập nhật thất bại');
    } finally {
      setUpdatingStep(null);
    }
  };

  const isCurrentUserXlc = (doc: IncomingDocumentDetail): boolean => {
    if (!user) return false;
    return (doc.document.processors ?? []).some(
      (p) => p.user.id === user.id && p.processorType === 'XLC'
    );
  };

  const canUserActOnStep = (
    wf: NonNullable<IncomingDocumentDetail['document']['workflows']>[number]
  ): boolean => {
    if (!user) return false;
    const stepOrder = wf.workflowStep.stepOrder;

    if (stepOrder === 1) {
      return isAdmin || !!user.roles?.includes('DOCUMENT_CLERK');
    }
    if (stepOrder === 2) {
      return isDepartmentHead || isAdmin;
    }
    if (stepOrder === 3) {
      return (isSpecialist || isAdmin) && isCurrentUserXlc(doc!);
    }
    return false;
  };

  const handleSpecialistAction = async () => {
    if (!doc || !user) return;
    const validationError = validateSpecialistAction();
    if (validationError) {
      setSpError(validationError);
      return;
    }

    setSpSubmitting(true);
    setSpError('');

    try {
      const payload: { action: SpecialistAction; processorIds?: { userId: number; processorType: ProcessorType }[]; processingInstructions?: string; reason?: string } = {
        action: specialistAction!,
      };

      if (specialistAction === 'TRANSFER') {
        payload.processorIds = spProcessorIds;
        payload.processingInstructions = spInstructions.trim() || undefined;
      } else if (specialistAction === 'COMPLETE') {
        payload.processingInstructions = spInstructions.trim() || undefined;
      } else if (specialistAction === 'RETURN_TO_HEAD') {
        payload.reason = spReason.trim();
      }

      await incomingDocumentsApi.processBySpecialist(doc.id, payload as Parameters<typeof incomingDocumentsApi.processBySpecialist>[1]);
      fetchDoc();
      setSpecialistAction(null);
      setSpProcessorIds([]);
      setSpInstructions('');
      setSpReason('');
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setSpError(apiError.response?.data?.message || 'Action failed. Please try again.');
    } finally {
      setSpSubmitting(false);
    }
  };

  const validateSpecialistAction = (): string | null => {
    if (!specialistAction) return 'Please select an action';
    if (specialistAction === 'TRANSFER') {
      if (spProcessorIds.length === 0) return 'Please select at least one processor';
      if (!spProcessorIds.some((p) => p.processorType === 'XLC')) {
        return 'At least one Primary Handler (XLC) is required';
      }
    }
    if (specialistAction === 'RETURN_TO_HEAD' && !spReason.trim()) {
      return 'A reason is required to return the document';
    }
    return null;
  };

  if (loading) {
    return (
      <>
        <div className="top-bar">
          <h1>Chi tiết Văn bản đến</h1>
          <button className="btn btn-secondary" onClick={() => navigate('/incoming-documents')}>Quay lại</button>
        </div>
        <div className="page-content"><LoadingSpinner /></div>
      </>
    );
  }

  if (error || !doc) {
    return (
      <>
        <div className="top-bar">
          <h1>Chi tiết Văn bản đến</h1>
          <button className="btn btn-secondary" onClick={() => navigate('/incoming-documents')}>Quay lại</button>
        </div>
        <div className="page-content">
          <div className="alert alert-error">{error || 'Không tìm thấy văn bản'}</div>
        </div>
      </>
    );
  }

  const d = doc.document;
  const isPending = d.status === 'PENDING';
  const isRejected = d.status === 'REJECTED';
  const isCompleted = d.status === 'COMPLETED';

  const headStep = d.workflows?.find((w) => w.workflowStep.stepOrder === 2);
  const canProcess =
    (isDepartmentHead || isAdmin) &&
    d.status === 'PENDING' &&
    !!headStep &&
    headStep.status === 'PENDING';

  const isProcessor = d.processors?.some((p) => p.user.id === user?.id);
  const canReply = isProcessor && d.status !== 'DRAFT' && d.status !== 'TRASHED';

  // Permission helpers for the role-specific action blocks below.
  const currentUserProcessorRecord = d.processors?.find(
    (p) => p.user.id === user?.id
  );
  const currentUserProcessorType = currentUserProcessorRecord?.processorType;
  const currentUserIsXlc = currentUserProcessorType === 'XLC';
  const currentUserIsPhxl = currentUserProcessorType === 'PHXL';
  const currentUserIsXdb = currentUserProcessorType === 'XDB';

  // PHXL complete-task button: only visible to a PHXL on this document, and
  // only while the task is still incomplete. The service marks the row as
  // complete (DocumentProcessor.completedAt) — we keep the assignment visible
  // but suppress the button once finished.
  const phxlCanMarkComplete =
    currentUserIsPhxl && isProcessor && d.status === 'IN_PROGRESS';
  const phxlAlreadyCompleted =
    currentUserIsPhxl && isProcessor && d.status === 'COMPLETED';

  // Comment composer is available to any participant in the workflow
  // (ADMIN bypasses). We require explicit access to the incoming document,
  // which `getById` already enforces via the backend.
  const canComment = isAdmin || isProcessor || isDocumentClerk;
  // XDB is read-only — no PHXL actions, no specialist actions, no comments.
  const isReadOnly = currentUserIsXdb;

  const handleProcessClose = () => {
    setProcessOpen(false);
    if (searchParams.get('process') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('process');
      setSearchParams(next, { replace: true });
    }
  };

  const handleRegister = async (data: { documentBookId: number; customDate?: string }) => {
    if (!doc) return;
    setRegistering(true);
    try {
      await incomingDocumentsApi.register(doc.id, {
        documentBookId: data.documentBookId,
        customArrivalDate: data.customDate,
      });
      alert('Vào sổ văn bản thành công!');
      setRegisterModalOpen(false);
      fetchDoc();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Có lỗi xảy ra khi vào sổ');
    } finally {
      setRegistering(false);
    }
  };

  const { isDocumentClerk: canRegisterGlobal } = useAuth();
  const canRegister = canRegisterGlobal && !doc.arrivalNumber && (d.status === 'PENDING' || d.status === 'APPROVED');

  return (
    <>
      <div className="top-bar">
        <h1>Chi tiết Văn bản đến</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {canRegister && (
            <button
              className="btn btn-primary"
              onClick={() => setRegisterModalOpen(true)}
              title="Cấp số và vào sổ văn bản"
            >
              Vào sổ văn bản
            </button>
          )}
          {canReply && (
            <button
              className="btn btn-outline"
              onClick={() => navigate(`/outgoing-documents/create?fromIncomingId=${doc.id}`)}
              title="Tạo văn bản đi phúc đáp cho văn bản này"
            >
              Phúc đáp văn bản
            </button>
          )}
          {canProcess && (
            <button
              className="btn btn-primary"
              onClick={() => setProcessOpen(true)}
              title="Xử lý văn bản này"
            >
              Xử lý
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => navigate('/incoming-documents')}>Quay lại danh sách</button>
        </div>
      </div>

      <div className="page-content">
        <div className="detail-layout">
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <h2>Thông tin văn bản</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <DocumentStatusBadge status={d.status} />
              </div>
            </div>
            <div className="card-body">
              <div className="detail-grid">
                {doc.arrivalNumber && (
                  <div className="detail-item">
                    <label>Số đến</label>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#667eea', fontSize: 16 }}>
                      {doc.arrivalNumber}
                    </span>
                  </div>
                )}
                <div className="detail-item">
                  <label>Số ký hiệu</label>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#667eea' }}>
                    {doc.documentNumber || '—'}
                  </span>
                </div>
                <div className="detail-item">
                  <label>Loại văn bản</label>
                  <span>{doc.documentType || '—'}</span>
                </div>
                {doc.pageCount && (
                  <div className="detail-item">
                    <label>Số trang</label>
                    <span>{doc.pageCount}</span>
                  </div>
                )}
                {doc.issuer && (
                  <div className="detail-item full-width">
                    <label>Cơ quan ban hành</label>
                    <span style={{ fontWeight: 600 }}>{doc.issuer}</span>
                  </div>
                )}
                {doc.summary && (
                  <div className="detail-item full-width">
                    <label>Trích yếu nội dung</label>
                    <span>{doc.summary}</span>
                  </div>
                )}
                <div className="detail-item">
                  <label>Ngày đến</label>
                  <span>{new Date(doc.dateReceived).toLocaleDateString('vi-VN')}</span>
                </div>
                <div className="detail-item">
                  <label>Ngày văn bản</label>
                  <span>{doc.dateLetter ? new Date(doc.dateLetter).toLocaleDateString('vi-VN') : '—'}</span>
                </div>
                <div className="detail-item">
                  <label>Độ khẩn</label>
                  <span>{doc.document.urgency ? formatUrgency(doc.document.urgency) : '—'}</span>
                </div>
                <div className="detail-item">
                  <label>Độ mật</label>
                  <span>{formatConfidentiality(doc.document.confidentiality)}</span>
                </div>
                <div className="detail-item">
                  <label>Văn thư tạo</label>
                  <span>{doc.createdByClerk?.fullName || '—'}</span>
                </div>
                <div className="detail-item">
                  <label>Ngày tạo</label>
                  <span>{new Date(d.createdAt).toLocaleString('vi-VN')}</span>
                </div>
              </div>
            </div>
          </div>

          {(doc.signerName || doc.signerTitle) && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header">
                <h2>Thông tin ký</h2>
              </div>
              <div className="card-body">
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Họ tên người ký</label>
                    <span>{doc.signerName || '—'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Chức vụ</label>
                    <span>{doc.signerTitle || '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {d.id && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header">
                <h2>Xem trước tài liệu</h2>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <PdfPreview
                  documentId={d.id}
                  fileName={d.originalFileName}
                  fileSize={d.fileSize}
                  mimeType={d.mimeType}
                  pageCount={doc.pageCount}
                />
              </div>
            </div>
          )}

          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <h2>Người xử lý được phân công</h2>
            </div>
            <div className="card-body">
              {d.processors && d.processors.length > 0 ? (
                <div className="processor-list">
                  {d.processors.map((p) => (
                    <div key={p.id} className="processor-list-item">
                      <div className="processor-list-avatar">
                        {p.user.fullName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.user.fullName}</div>
                        <div style={{ fontSize: 12, color: '#636e72' }}>{p.user.email}</div>
                      </div>
                      <div className="processor-type-badge" data-type={p.processorType.toLowerCase()}>
                        {p.processorType}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#636e72' }}>Chưa có người xử lý</p>
              )}
            </div>
          </div>

          {doc.processingInstructions && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header">
                <h2>Hướng dẫn xử lý</h2>
              </div>
              <div className="card-body">
                <p style={{ whiteSpace: 'pre-wrap' }}>{doc.processingInstructions}</p>
              </div>
            </div>
          )}

          {d.workflows && d.workflows.length > 0 && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header">
                <h2>Quy trình xử lý</h2>
                <div style={{ fontSize: 13, color: '#636e72' }}>
                  Trạng thái: <strong>{WORKFLOW_STATUS_LABELS[d.status] || d.status}</strong>
                </div>
              </div>
              <div className="card-body">
                <div className="workflow-steps-list">
                  {d.workflows.map((wf, idx) => {
                    return (
                      <div key={wf.id} className="workflow-step-row">
                        <div className="workflow-step-number">{idx + 1}</div>
                        <div className="workflow-step-info">
                          <div className="workflow-step-name">{wf.workflowStep.name}</div>
                          {wf.workflowStep.roleName && (
                            <div className="workflow-step-role">{wf.workflowStep.roleName}</div>
                          )}
                          {wf.user && (
                            <div className="workflow-step-assignee">Người thực hiện: {wf.user.fullName}</div>
                          )}
                          {wf.notes && (
                            <div className="workflow-step-notes">{wf.notes}</div>
                          )}
                          {wf.completedAt && (
                            <div className="workflow-step-completed">
                              Hoàn thành: {new Date(wf.completedAt).toLocaleString('vi-VN')}
                            </div>
                          )}
                        </div>
                        <div className="workflow-step-status">
                          <span className={`workflow-status-tag ${wf.status.toLowerCase().replace('_', '-')}`}>
                            {WORKFLOW_STATUS_LABELS[wf.status] || wf.status}
                          </span>
                        </div>
                        {canUserActOnStep(wf) && (
                          <div className="workflow-step-actions">
                            <button
                              className="btn btn-sm btn-success"
                              onClick={() => handleWorkflowStepAction(wf.id, 'approve')}
                              disabled={updatingStep === wf.id}
                              title="Duyệt bước này"
                            >
                              {updatingStep === wf.id ? '...' : 'Duyệt'}
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => handleWorkflowStepAction(wf.id, 'reject')}
                              disabled={updatingStep === wf.id}
                              title="Từ chối bước này"
                            >
                              Từ chối
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {d.attachments && d.attachments.length > 0 && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header">
                <h2>Tệp đính kèm</h2>
              </div>
              <div className="card-body">
                <div className="attachment-grid">
                  {d.attachments.map((att) => (
                    <div key={att.id} className="attachment-file-card">
                      <div className="attachment-file-icon">&#128196;</div>
                      <div className="attachment-file-info">
                        <div className="attachment-file-name">{att.fileName}</div>
                        {att.fileSize && (
                          <div className="attachment-file-size">
                            {(att.fileSize / 1024).toFixed(1)} KB
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {(isSpecialist || isAdmin) && isCurrentUserXlc(doc) && d.status === 'IN_PROGRESS' && (
            <div className="card" style={{ marginBottom: 24, border: '2px solid #667eea' }}>
              <div className="card-header">
                <h2>Hành động của Primary Handler (XLC)</h2>
              </div>
              <div className="card-body">
                {spError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{spError}</div>}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                  <button
                    type="button"
                    className={`specialist-action-btn ${specialistAction === 'COMPLETE' ? 'active' : ''}`}
                    onClick={() => setSpecialistAction(specialistAction === 'COMPLETE' ? null : 'COMPLETE')}
                    style={{ padding: 14, border: specialistAction === 'COMPLETE' ? '2px solid #27ae60' : '1px solid #dfe6e9', borderRadius: 8, background: specialistAction === 'COMPLETE' ? '#f0fff4' : '#fff', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4, color: '#27ae60' }}>Process Document</div>
                    <div style={{ fontSize: 12, color: '#636e72', lineHeight: 1.4 }}>Complete the Document</div>
                  </button>
                  <button
                    type="button"
                    className={`specialist-action-btn ${specialistAction === 'TRANSFER' ? 'active' : ''}`}
                    onClick={() => { setSpecialistAction(specialistAction === 'TRANSFER' ? null : 'TRANSFER'); if (specialistAction !== 'TRANSFER') fetchProcessors(); }}
                    style={{ padding: 14, border: specialistAction === 'TRANSFER' ? '2px solid #667eea' : '1px solid #dfe6e9', borderRadius: 8, background: specialistAction === 'TRANSFER' ? '#f0f3ff' : '#fff', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4, color: '#667eea' }}>Forward for Processing</div>
                    <div style={{ fontSize: 12, color: '#636e72', lineHeight: 1.4 }}>Assign XLC / PHXL / XDB processors</div>
                  </button>
                  <button
                    type="button"
                    className={`specialist-action-btn ${specialistAction === 'RETURN_TO_HEAD' ? 'active' : ''}`}
                    onClick={() => setSpecialistAction(specialistAction === 'RETURN_TO_HEAD' ? null : 'RETURN_TO_HEAD')}
                    style={{ padding: 14, border: specialistAction === 'RETURN_TO_HEAD' ? '2px solid #e74c3c' : '1px solid #dfe6e9', borderRadius: 8, background: specialistAction === 'RETURN_TO_HEAD' ? '#fff5f5' : '#fff', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4, color: '#e74c3c' }}>Return Document</div>
                    <div style={{ fontSize: 12, color: '#636e72', lineHeight: 1.4 }}>Send back to the previous approver</div>
                  </button>
                </div>

                {specialistAction === 'COMPLETE' && (
                  <div style={{ marginTop: 8 }}>
                    <div className="form-group">
                      <label>Completion notes (optional)</label>
                      <textarea
                        rows={3}
                        value={spInstructions}
                        onChange={(e) => setSpInstructions(e.target.value)}
                        placeholder="Add notes about completing the document..."
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-success"
                      style={{ marginTop: 8 }}
                      onClick={handleSpecialistAction}
                      disabled={spSubmitting}
                    >
                      {spSubmitting ? 'Processing...' : 'Complete the Document'}
                    </button>
                  </div>
                )}

                {specialistAction === 'TRANSFER' && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>
                      Select processors <span style={{ color: '#e74c3c' }}>*</span>
                    </div>
                    <ProcessorPicker value={spProcessorIds} onChange={setSpProcessorIds} />
                    <div className="form-group" style={{ marginTop: 12 }}>
                      <label>Processing instructions</label>
                      <textarea
                        rows={2}
                        value={spInstructions}
                        onChange={(e) => setSpInstructions(e.target.value)}
                        placeholder="Add instructions for the new processors..."
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ marginTop: 8 }}
                      onClick={handleSpecialistAction}
                      disabled={spSubmitting}
                    >
                      {spSubmitting ? 'Processing...' : 'Confirm Forward'}
                    </button>
                  </div>
                )}

                {specialistAction === 'RETURN_TO_HEAD' && (
                  <div style={{ marginTop: 8 }}>
                    <div className="form-group">
                      <label>Reason for return <span style={{ color: '#e74c3c' }}>*</span></label>
                      <textarea
                        rows={4}
                        value={spReason}
                        onChange={(e) => setSpReason(e.target.value)}
                        placeholder="Explain why the document is being returned..."
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ marginTop: 8 }}
                      onClick={handleSpecialistAction}
                      disabled={spSubmitting}
                    >
                      {spSubmitting ? 'Processing...' : 'Confirm Return'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentUserIsXdb && (
            <div className="card" style={{ marginBottom: 24, border: '1px solid #dfe6e9' }}>
              <div className="card-header">
                <h2>Quyền của bạn</h2>
              </div>
              <div className="card-body">
                <p style={{ color: '#636e72' }}>
                  Bạn đang ở vai trò <strong>Để biết (XDB)</strong>. Quyền của bạn chỉ bao gồm
                  xem thông tin văn bản và xem trước tệp đính kèm. Không thể chuyển trạng thái
                  văn bản hay thay đổi phân công xử lý.
                </p>
              </div>
            </div>
          )}

          {phxlCanMarkComplete && (
            <div className="card" style={{ marginBottom: 24, border: '2px solid #f39c12' }}>
              <div className="card-header">
                <h2>Hành động của Người phối hợp</h2>
              </div>
              <div className="card-body">
                {commentError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{commentError}</div>}
                <p style={{ marginBottom: 12, color: '#636e72' }}>
                  Sau khi hoàn thành nhiệm vụ phối hợp, bấm xác nhận để thông báo cho Trưởng phòng
                  và người xử lý chính.
                </p>
                <button
                  type="button"
                  className="btn btn-warning"
                  onClick={handleCompletePhxl}
                  disabled={phxlCompleting}
                >
                  {phxlCompleting ? 'Đang xử lý...' : 'Hoàn thành nhiệm vụ'}
                </button>
              </div>
            </div>
          )}

          {phxlAlreadyCompleted && (
            <div className="card" style={{ marginBottom: 24, border: '1px solid #dfe6e9' }}>
              <div className="card-header">
                <h2>Hành động của Người phối hợp</h2>
              </div>
              <div className="card-body">
                <p style={{ color: '#27ae60', fontWeight: 600 }}>
                  Bạn đã hoàn thành nhiệm vụ Người phối hợp (PHXL) cho văn bản này.
                </p>
              </div>
            </div>
          )}

          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <h2>Thảo luận ({comments.length})</h2>
            </div>
            <div className="card-body">
              {commentsLoading ? (
                <LoadingSpinner />
              ) : comments.length === 0 ? (
                <p style={{ color: '#636e72' }}>Chưa có bình luận nào.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {comments.map((c) => (
                    <li
                      key={c.id}
                      style={{
                        padding: '12px 0',
                        borderBottom: '1px solid #f1f2f6',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <strong style={{ color: '#2d3436' }}>{c.user.fullName}</strong>
                        <span style={{ fontSize: 12, color: '#95a5a6' }}>
                          {new Date(c.createdAt).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#34495e' }}>{c.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              {!isReadOnly && canComment && (
                <div style={{ marginTop: 16 }}>
                  {commentError && <div className="alert alert-error" style={{ marginBottom: 8 }}>{commentError}</div>}
                  <textarea
                    rows={3}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Thêm bình luận..."
                    style={{ width: '100%' }}
                    disabled={submittingComment}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ marginTop: 8 }}
                    onClick={handleSubmitComment}
                    disabled={submittingComment || !newComment.trim()}
                  >
                    {submittingComment ? 'Đang gửi...' : 'Gửi bình luận'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {doc.notes && (
            <div className="card">
              <div className="card-header">
                <h2>Ghi chú</h2>
              </div>
              <div className="card-body">
                <p style={{ whiteSpace: 'pre-wrap' }}>{doc.notes}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {doc && (
        <ProcessIncomingDocumentModal
          open={processOpen}
          doc={doc}
          onClose={handleProcessClose}
          onSuccess={() => {
            handleProcessClose();
            fetchDoc();
          }}
        />
      )}

      {registerModalOpen && (
        <RegisterDocumentModal
          type="INCOMING"
          loading={registering}
          onClose={() => setRegisterModalOpen(false)}
          onRegister={handleRegister}
        />
      )}
    </>
  );
}
