import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { incomingDocumentsApi, type IncomingDocumentDetail, type WorkflowStatus } from '../../../api';
import { DocumentStatusBadge } from '../../../shared/components/DocumentBadges';
import { LoadingSpinner } from '../../../shared/components';
import { useAuth } from '../../../contexts/AuthContext';
import ProcessIncomingDocumentModal from '../components/ProcessIncomingDocumentModal';

const WORKFLOW_ACTION_LABELS: Record<string, string> = {
  PENDING: 'Chưa xử lý',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  SKIPPED: 'Bỏ qua',
};

const WORKFLOW_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ xử lý',
  IN_PROGRESS: 'Đang xử lý',
  COMPLETED: 'Hoàn thành',
  REJECTED: 'Từ chối',
  CANCELLED: 'Hủy',
};

const URGENCY_LABELS: Record<string, string> = {
  THUONG: 'Thường',
  KHAN: 'Khẩn',
  THUONG_KHAU: 'Thượng khẩn',
  HOA_TOC: 'Hỏa tốc',
};

export default function IncomingDocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isDepartmentHead, isAdmin } = useAuth();
  const [doc, setDoc] = useState<IncomingDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingStep, setUpdatingStep] = useState<number | null>(null);
  const [processOpen, setProcessOpen] = useState(false);

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
      } else if (action === 'skip') {
        stepStatus = 'SKIPPED';
        newStatus = 'PENDING';
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

  const handleProcessClose = () => {
    setProcessOpen(false);
    if (searchParams.get('process') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('process');
      setSearchParams(next, { replace: true });
    }
  };

  return (
    <>
      <div className="top-bar">
        <h1>Chi tiết Văn bản đến</h1>
        <div style={{ display: 'flex', gap: 8 }}>
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
                <div className="detail-item full-width">
                  <label>Tiêu đề</label>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{d.title}</span>
                </div>
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
                  <span>{doc.urgency ? URGENCY_LABELS[doc.urgency] || doc.urgency : '—'}</span>
                </div>
                <div className="detail-item">
                  <label>Phòng ban tiếp nhận</label>
                  <span>{doc.document.department?.name || '—'}</span>
                </div>
                <div className="detail-item">
                  <label>Người tạo</label>
                  <span>{d.createdByUser?.fullName || '—'}</span>
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
                  {doc.signerName && (
                    <div className="detail-item">
                      <label>Họ tên người ký</label>
                      <span>{doc.signerName}</span>
                    </div>
                  )}
                  {doc.signerTitle && (
                    <div className="detail-item">
                      <label>Chức vụ</label>
                      <span>{doc.signerTitle}</span>
                    </div>
                  )}
                </div>
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
                    const isCompleted = wf.status === 'COMPLETED';
                    const isRejected = wf.status === 'REJECTED';
                    const isPending = wf.status === 'PENDING';
                    const isInProgress = wf.status === 'IN_PROGRESS';
                    const isSkipped = wf.status === 'SKIPPED';
                    const canAct = !isCompleted && !isRejected && !isSkipped && (isInProgress || isPending);

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
                        {canAct && (
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
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => handleWorkflowStepAction(wf.id, 'skip')}
                              disabled={updatingStep === wf.id}
                              title="Bỏ qua bước này"
                            >
                              Bỏ qua
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
    </>
  );
}
