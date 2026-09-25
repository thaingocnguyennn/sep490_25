import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  incomingDocumentsApi,
  type IncomingDocumentDetail,
} from '../../../api';
import { incomingUnreadSignal } from '../state/incomingUnreadSignal';
import { DocumentStatusBadge } from '../../../shared/components/DocumentBadges';
import { LoadingSpinner } from '../../../shared/components';
import { useAuth } from '../../../contexts/AuthContext';
import { formatUrgency } from '../../../shared/constants/urgency';
import { formatConfidentiality } from '../../../shared/constants/confidentiality';
import ProcessIncomingDocumentModal from '../components/ProcessIncomingDocumentModal';
import QuickProcessHeadModal, { type QuickHeadAction } from '../components/QuickProcessHeadModal';
import QuickFinishModal from '../components/QuickFinishModal';
import PdfPreview from '../components/PdfPreview';

import RegisterDocumentModal from '../components/RegisterDocumentModal';

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
  const [processOpen, setProcessOpen] = useState(false);
  const [processMode, setProcessMode] = useState<'head' | 'specialist'>('head');

  // Quick head-action modal (FINISH / RETURN). FORWARD still reuses
  // `ProcessIncomingDocumentModal` because it needs the processor picker.
  const [quickAction, setQuickAction] = useState<QuickHeadAction | null>(null);
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [quickError, setQuickError] = useState('');

  // Specialist FINISH modal. The specialist path used to share the
  // full ProcessIncomingDocumentModal, but per the new flow design the
  // specialist XLC only has one action (FINISH), so we surface a single
  // confirmation button on the page and route through this lightweight
  // modal instead of the multi-action picker.
  const [specialistFinishOpen, setSpecialistFinishOpen] = useState(false);
  const [specialistFinishSubmitting, setSpecialistFinishSubmitting] =
    useState(false);
  const [specialistFinishError, setSpecialistFinishError] = useState('');

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

  // Mark the document as viewed by the current user the first time the
  // detail page mounts. Idempotent — the backend only sets `viewedAt`
  // when the user has not opened the document yet, so re-mounting and
  // reloads are safe.
  //
  // On success we optimistically drop the sidebar unread badge via the
  // `incomingUnreadSignal` pub/sub. This is the single, simple place
  // where the badge is decremented — no prior-status check, no
  // doc-arrives effect. Why no guard:
  //
  //  - A previous implementation read `doc.document.viewerStatus` to
  //    decide whether to decrement. But `doc` is fetched AFTER
  //    `markViewed()` has already updated `viewedAt` server-side, so
  //    the resolver now returns `IN_PROGRESS` instead of `PENDING`,
  //    and the guard bypassed itself exactly when it should have
  //    fired — causing the badge to stay stale for up to 15s.
  //
  //  - `markViewed` is server-side idempotent (re-marking an
  //    already-viewed doc is a no-op). If the user re-opens an
  //    already-read doc the optimistic decrement is over by 1 — the
  //    15s polling tick reconciles it back to truth via
  //    `syncFromBackend`.
  //
  //  - For DRAFT documents we skip the call entirely (no "unread"
  //    semantics for the editing clerk) AND skip the decrement, so
  //    the badge is unaffected.
  useEffect(() => {
    if (!id || !user) return;
    // Don't bother calling /view for DRAFT documents — the clerk is the
    // editor and there's no "unread" semantics for them.
    if (doc?.document.status === 'DRAFT') return;
    let cancelled = false;
    incomingDocumentsApi
      .markViewed(Number(id))
      .then(() => {
        if (cancelled) return;
        // Drop the badge by 1 immediately. The polling hook
        // (running every 15s) will reconcile with the backend truth
        // — any small drift is corrected within `intervalMs`.
        incomingUnreadSignal.decrement(1);
      })
      .catch(() => {
        // Silently ignore — the resolver will still work without
        // viewedAt (it just won't switch PENDING → IN_PROGRESS on this
        // load). A failed POST should NEVER block showing the doc.
      });
    return () => {
      cancelled = true;
    };
    // We intentionally only depend on `id` and `user?.id`; we don't
    // want to re-fire when `doc` updates after the view call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

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

  // Specialist FINISH handler. Routes through `processBySpecialist` with
  // the only legal action (`FINISH`). The backend closes the workflow
  // step, cancels remaining PENDING/IN_PROGRESS steps, and flips the
  // document to COMPLETED — i.e. the entire workflow ends here.
  const handleSpecialistFinishConfirm = async (payload: {
    processingInstructions?: string;
  }) => {
    if (!doc) return;
    setSpecialistFinishSubmitting(true);
    setSpecialistFinishError('');
    try {
      await incomingDocumentsApi.processBySpecialist(doc.id, {
        action: 'FINISH',
        processingInstructions: payload.processingInstructions,
      });
      setSpecialistFinishOpen(false);
      fetchDoc();
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setSpecialistFinishError(
        apiError.response?.data?.message || 'Hoàn thành thất bại. Vui lòng thử lại.'
      );
    } finally {
      setSpecialistFinishSubmitting(false);
    }
  };

  // Direct head-action handler used by the three inline buttons on the
  // detail page (Hoàn thành / Chuyển trả / Chuyển xử lý). The FINISH and
  // RETURN cases go through a lightweight modal; FORWARD reuses the full
  // ProcessIncomingDocumentModal in `head` mode.
  const handleQuickHeadConfirm = async (payload: { processingInstructions?: string; reason?: string }) => {
    if (!doc || !quickAction) return;
    setQuickSubmitting(true);
    setQuickError('');
    try {
      const data: { action: QuickHeadAction; processingInstructions?: string; reason?: string } = {
        action: quickAction,
      };
      if (quickAction === 'FINISH' && payload.processingInstructions) {
        data.processingInstructions = payload.processingInstructions;
      }
      if (quickAction === 'RETURN' && payload.reason) {
        data.reason = payload.reason;
      }
      await incomingDocumentsApi.processByHead(doc.id, data);
      setQuickAction(null);
      fetchDoc();
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setQuickError(apiError.response?.data?.message || 'Xử lý thất bại. Vui lòng thử lại.');
    } finally {
      setQuickSubmitting(false);
    }
  };

  const isCurrentUserXlc = (doc: IncomingDocumentDetail): boolean => {
    if (!user) return false;
    return (doc.document.processors ?? []).some(
      (p) => p.user.id === user.id && p.processorType === 'XLC'
    );
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

  // Department Head processing only applies when the user is the assigned
  // primary processor (XLC). Heads who are listed as PHXL or XDB on this
  // document are participants in their supporting roles and must not see
  // the FORWARD/FINISH/RETURN trio — the head actions are reserved for
  // the user who actually owns the document at stepOrder=2.
  const canProcessAsHead =
    (isDepartmentHead || isAdmin) &&
    d.status === 'PENDING' &&
    !!headStep &&
    headStep.status === 'PENDING' &&
    isCurrentUserXlc(doc);

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
            <>
              {canProcessAsHead ? (
                <>
                  <button
                    className="btn btn-success"
                    onClick={() => setQuickAction('FINISH')}
                    title="Đánh dấu văn bản đã hoàn thành"
                  >
                    Hoàn thành
                  </button>
                  <button
                    className="btn btn-warning"
                    onClick={() => setQuickAction('RETURN')}
                    title="Trả lại văn bản cho văn thư"
                  >
                    Chuyển trả
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => openProcessModal('head')}
                    title="Chuyển xử lý cho chuyên viên / phối hợp / để biết"
                  >
                    Chuyển xử lý
                  </button>
                </>
              ) : (
                // Specialist XLC path: a single FINISH button. The
                // previous design opened the full ProcessIncomingDocumentModal
                // here so the specialist could pick FORWARD/FINISH/RETURN,
                // but per the new flow design the only action specialists
                // can take is FINISH. Returning to the head has been
                // removed from the specialist workflow, and forwarding
                // to another specialist was never supported. Surfacing
                // a single "Hoàn thành" button keeps the UX focused and
                // matches the backend `SpecialistAction = 'FINISH'` type.
                <button
                  className="btn btn-success"
                  onClick={() => {
                    setSpecialistFinishError('');
                    setSpecialistFinishOpen(true);
                  }}
                  title="Đánh dấu văn bản đã hoàn thành xử lý và kết thúc luồng"
                >
                  Hoàn thành
                </button>
              )}
            </>
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
                <DocumentStatusBadge status={d.viewerStatus ?? d.status} />
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

          {/* Audit trail for the current viewer. Shows every participation
              row the caller owns on this document so they can see what
              happened on their branch of the workflow — e.g. "I acted as
              DEPARTMENT_HEAD and completed it on 18/09/2026". This is
              what keeps a Department Head from "losing" a document after
              they FORWARD it to a Specialist: even though they're no
              longer in the live `DocumentProcessor` set, their historical
              participation rows are still here. */}
          {d.participations && d.participations.length > 0 && (
            <div className="card" style={{ marginBottom: 24, border: '1px solid #dfe6e9' }}>
              <div className="card-header">
                <h2>Lịch sử xử lý của bạn</h2>
                <div style={{ fontSize: 13, color: '#636e72' }}>
                  Theo dõi các vai trò bạn đã đảm nhận trên văn bản này
                </div>
              </div>
              <div className="card-body">
                <div className="workflow-steps-list">
                  {d.participations.map((p) => {
                    const roleLabel: Record<string, string> = {
                      CLERK: 'Văn thư',
                      DEPARTMENT_HEAD: 'Trưởng phòng',
                      SPECIALIST: 'Chuyên viên',
                      XLC: 'Người xử lý chính',
                      PHXL: 'Người phối hợp',
                      XDB: 'Xem Để biết',
                    };
                    const pStatus = String(p.status).toUpperCase();
                    const statusLabel = WORKFLOW_STATUS_LABELS[pStatus] ?? pStatus;
                    const statusClass = pStatus.toLowerCase().replace('_', '-');
                    return (
                      <div key={p.id} className="workflow-step-row">
                        <div className="workflow-step-info">
                          <div style={{ fontWeight: 600 }}>
                            {roleLabel[p.participationRole] ?? p.participationRole}
                          </div>
                          {p.completedAt && (
                            <div style={{ fontSize: 13, color: '#27ae60' }}>
                              Hoàn thành lúc: {new Date(p.completedAt).toLocaleString('vi-VN')}
                            </div>
                          )}
                          {p.returnedAt && (
                            <div style={{ fontSize: 13, color: '#c0392b' }}>
                              Đã trả lại lúc: {new Date(p.returnedAt).toLocaleString('vi-VN')}
                            </div>
                          )}
                          {p.returnReason && (
                            <div style={{ fontSize: 13, color: '#636e72' }}>
                              Lý do: {p.returnReason}
                            </div>
                          )}
                          {p.viewedAt && !p.completedAt && !p.returnedAt && (
                            <div style={{ fontSize: 13, color: '#636e72' }}>
                              Đã xem lúc: {new Date(p.viewedAt).toLocaleString('vi-VN')}
                            </div>
                          )}
                        </div>
                        <div className="workflow-step-status">
                          <span className={`workflow-status-tag ${statusClass}`}>
                            {statusLabel}
                          </span>
                        </div>
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
          // For the Department Head "Chuyển xử lý" flow, scope the
          // org-tree picker to the head's home department (and its
          // descendants). We prefer `departmentMemberships[0]` so users
          // who sit in multiple branches still get a deterministic root;
          // fall back to the legacy `department` field if memberships
          // aren't loaded. Admin (no department) gets no scope and sees
          // the full tree.
          headUserDepartmentId={
            processMode === 'head'
              ? (user?.departmentMemberships?.[0]?.departmentId ?? user?.department?.id ?? null)
              : null
          }
          headUserDepartmentName={
            processMode === 'head'
              ? (user?.departmentMemberships?.[0]?.name ?? user?.department?.name ?? null)
              : null
          }
          onClose={handleProcessClose}
          onSuccess={() => {
            handleProcessClose();
            fetchDoc();
          }}
        />
      )}

      {doc && (
        <QuickProcessHeadModal
          open={quickAction !== null}
          action={quickAction}
          docTitle={doc.document.subject || 'Văn bản đến'}
          submitting={quickSubmitting}
          error={quickError}
          onClose={() => {
            if (!quickSubmitting) {
              setQuickAction(null);
              setQuickError('');
            }
          }}
          onConfirm={handleQuickHeadConfirm}
        />
      )}

      {doc && (
        <QuickFinishModal
          open={specialistFinishOpen}
          actor="specialist"
          docTitle={doc.document.subject || 'Văn bản đến'}
          submitting={specialistFinishSubmitting}
          error={specialistFinishError}
          onClose={() => {
            if (!specialistFinishSubmitting) {
              setSpecialistFinishOpen(false);
              setSpecialistFinishError('');
            }
          }}
          onConfirm={handleSpecialistFinishConfirm}
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
