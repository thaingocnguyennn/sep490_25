import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  incomingDocumentsApi,
  type IncomingDocumentDetail,
  type WorkflowStatus,
} from '../../../api';
import { DocumentStatusBadge } from '../../../shared/components/DocumentBadges';
import { LoadingSpinner } from '../../../shared/components';
import { useAuth } from '../../../contexts/AuthContext';
import { formatUrgency } from '../../../shared/constants/urgency';
import { formatConfidentiality } from '../../../shared/constants/confidentiality';
import ProcessIncomingDocumentModal from '../components/ProcessIncomingDocumentModal';
import PdfPreview from '../components/PdfPreview';

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
  const [doc, setDoc] = useState<IncomingDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingStep, setUpdatingStep] = useState<number | null>(null);
  const [processOpen, setProcessOpen] = useState(false);
  const [processMode, setProcessMode] = useState<'head' | 'specialist'>('head');

  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [registering, setRegistering] = useState(false);

  const [phxlCompleting, setPhxlCompleting] = useState(false);
  const [phxlNote, setPhxlNote] = useState('');
  const [phxlError, setPhxlError] = useState('');

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
      const modeParam = searchParams.get('mode');
      setProcessMode(modeParam === 'specialist' ? 'specialist' : 'head');
    }
  }, [searchParams, doc]);

  const handleCompletePhxl = async () => {
    if (!user) return;
    setPhxlCompleting(true);
    setPhxlError('');
    try {
      await incomingDocumentsApi.completeProcessorTask(doc!.id, user.id, phxlNote);
      setPhxlNote('');
      fetchDoc();
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setPhxlError(apiError.response?.data?.message || 'Could not complete the task.');
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
  const specialistStep = d.workflows?.find((w) => w.workflowStep.stepOrder === 3);

  const canProcessAsHead =
    (isDepartmentHead || isAdmin) &&
    d.status === 'PENDING' &&
    !!headStep &&
    headStep.status === 'PENDING';

  // Specialist acts at the IN_PROGRESS stage on the stepOrder=3 row. The
  // caller must be the assigned XLC processor (mirrors the backend gating).
  const canProcessAsSpecialist =
    (isSpecialist || isAdmin) &&
    d.status === 'IN_PROGRESS' &&
    !!specialistStep &&
    specialistStep.status === 'PENDING' &&
    isCurrentUserXlc(doc);

  const canProcess = canProcessAsHead || canProcessAsSpecialist;

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
    currentUserIsPhxl && isProcessor && !currentUserProcessorRecord?.completedAt;
  const phxlAlreadyCompleted =
    currentUserIsPhxl && isProcessor && !!currentUserProcessorRecord?.completedAt;

  // Comment composer is available to any participant in the workflow
  // (ADMIN bypasses). We require explicit access to the incoming document,
  // which `getById` already enforces via the backend.
  // XDB is read-only — no PHXL actions, no specialist actions, no comments.
  const isReadOnly = currentUserIsXdb;

  const handleProcessClose = () => {
    setProcessOpen(false);
    if (searchParams.get('process') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('process');
      next.delete('mode');
      setSearchParams(next, { replace: true });
    }
  };

  const openProcessModal = (mode: 'head' | 'specialist') => {
    setProcessMode(mode);
    setProcessOpen(true);
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
              onClick={() => openProcessModal(canProcessAsHead ? 'head' : 'specialist')}
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
                    {doc.document.documentNumber || '—'}
                  </span>
                </div>
                <div className="detail-item">
                  <label>Loại văn bản</label>
                  <span>{doc.document.documentTypeRef?.name || '—'}</span>
                </div>
                {doc.pageCount && (
                  <div className="detail-item">
                    <label>Số trang</label>
                    <span>{doc.pageCount}</span>
                  </div>
                )}
                {doc.document.issuer && (
                  <div className="detail-item full-width">
                    <label>Cơ quan ban hành</label>
                    <span style={{ fontWeight: 600 }}>{doc.document.issuer}</span>
                  </div>
                )}
                {(doc.document.signerName || doc.document.signerTitle) && (
                  <>
                    <div className="detail-item">
                      <label>Họ tên người ký</label>
                      <span>{doc.document.signerName || '—'}</span>
                    </div>
                    <div className="detail-item">
                      <label>Chức vụ</label>
                      <span>{doc.document.signerTitle || '—'}</span>
                    </div>
                  </>
                )}
                {doc.document.subject && (
                  <div className="detail-item full-width">
                    <label>Trích yếu nội dung</label>
                    <span>{doc.document.subject}</span>
                  </div>
                )}
                <div className="detail-item">
                  <label>Ngày đến</label>
                  <span>{new Date(doc.dateReceived).toLocaleDateString('vi-VN')}</span>
                </div>
                <div className="detail-item">
                  <label>Ngày ban hành</label>
                  <span>{doc.document.issuedDate ? new Date(doc.document.issuedDate).toLocaleDateString('vi-VN') : '—'}</span>
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
                  <span>{doc.document.createdByUser?.fullName || '—'}</span>
                </div>
                <div className="detail-item">
                  <label>Ngày tạo</label>
                  <span>{new Date(d.createdAt).toLocaleString('vi-VN')}</span>
                </div>
              </div>
            </div>
          </div>

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
                  attachments={d.attachments ?? []}
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
                <h2>Hành động của Người phối hợp (PHXL)</h2>
              </div>
              <div className="card-body">
                {phxlError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{phxlError}</div>}
                <p style={{ marginBottom: 12, color: '#636e72' }}>
                  Bạn có thể ghi một ghi chú cho văn bản này. Ghi chú sẽ được lưu lại để XLC và XDB có thể xem.
                </p>
                <div className="form-group">
                  <label>Ghi chú của bạn</label>
                  <textarea
                    rows={3}
                    value={phxlNote}
                    onChange={(e) => setPhxlNote(e.target.value)}
                    placeholder="Nhập ghi chú của bạn (không bắt buộc)..."
                    style={{ width: '100%' }}
                    disabled={phxlCompleting}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-warning"
                  onClick={handleCompletePhxl}
                  disabled={phxlCompleting}
                >
                  {phxlCompleting ? 'Đang xử lý...' : 'Xác nhận và đóng'}
                </button>
              </div>
            </div>
          )}

          {phxlAlreadyCompleted && (
            <div className="card" style={{ marginBottom: 24, border: '1px solid #dfe6e9' }}>
              <div className="card-header">
                <h2>Hành động của Người phối hợp (PHXL)</h2>
              </div>
              <div className="card-body">
                <p style={{ color: '#27ae60', fontWeight: 600 }}>
                  Bạn đã hoàn thành nhiệm vụ Người phối hợp (PHXL) cho văn bản này.
                </p>
                {currentUserProcessorRecord?.notes && (
                  <div style={{ marginTop: 12, padding: 12, background: '#f8f9fa', borderRadius: 6 }}>
                    <strong>Ghi chú của bạn:</strong>
                    <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{currentUserProcessorRecord.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <h2>Ghi chú PHXL ({d.processors?.filter(p => p.processorType === 'PHXL' && p.notes).length || 0})</h2>
            </div>
            <div className="card-body">
              {(() => {
                const phxlProcessors = d.processors?.filter(p => p.processorType === 'PHXL' && p.notes) || [];
                if (phxlProcessors.length === 0) {
                  return <p style={{ color: '#636e72' }}>Chưa có ghi chú PHXL nào.</p>;
                }
                return (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {phxlProcessors.map((p) => (
                      <li key={p.id} style={{ padding: '12px 0', borderBottom: '1px solid #f1f2f6' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <strong style={{ color: '#2d3436' }}>{p.user.fullName}</strong>
                          <span style={{ fontSize: 12, color: '#95a5a6' }}>
                            {p.completedAt ? new Date(p.completedAt).toLocaleString('vi-VN') : ''}
                          </span>
                        </div>
                        <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#34495e' }}>{p.notes}</p>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>
          </div>

          {doc.processingInstructions && (
            <div className="card">
              <div className="card-header">
                <h2>Hướng dẫn xử lý</h2>
              </div>
              <div className="card-body">
                <p style={{ whiteSpace: 'pre-wrap' }}>{doc.processingInstructions}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {doc && (
        <ProcessIncomingDocumentModal
          open={processOpen}
          doc={doc}
          mode={processMode}
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
