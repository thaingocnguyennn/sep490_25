import { useEffect, useState, useRef } from 'react';
import {
  incomingDocumentsApi,
  type IncomingDocumentDetail,
  type HeadAction,
  type ProcessorType,
  type ProcessIncomingDocumentRequest,
  type ProcessSpecialistDocumentRequest,
} from '../../../api';
import { useProcessors } from '../../../shared/hooks';
import ProcessorRoleSection from './ProcessorRoleSection';

/**
 * Mode controls which role's action set is exposed and how RETURN behaves.
 *  • `head`        — Trưởng phòng (PENDING stage, stepOrder=2). RETURN rolls
 *    the document back to the document clerk.
 *  • `specialist`  — Chuyên viên (IN_PROGRESS stage, stepOrder=3). RETURN rolls
 *    the document back to the department head, and the deadline/attachments
 *    inputs are hidden to keep the form focused.
 */
export type ProcessMode = 'head' | 'specialist';

interface ProcessIncomingDocumentModalProps {
  open: boolean;
  doc: IncomingDocumentDetail;
  mode?: ProcessMode;
  onClose: () => void;
  onSuccess: () => void;
  /**
   * Optional pre-selected action. When provided (head mode only), the
   * modal skips the 3-action picker grid and opens directly on the
   * matching form section. Used by the detail-page "Chuyển xử lý"
   * button so the user lands straight on the FORWARD form rather than
   * having to pick the same action again from the picker.
   *
   * - Undefined → render the full FORWARD/FINISH/RETURN picker (legacy
   *   behaviour, used by the `?process=1` URL deep-link).
   * - 'FORWARD' → render the org-tree picker + instructions + attachments
   *   directly. The picker grid is hidden but the rest of the modal is
   *   identical.
   * - Other values are accepted but treated the same as undefined for
   *   now (FINISH/RETURN are routed through `QuickProcessHeadModal` on
   *   the detail page and should not open this modal pre-pinned).
   */
  defaultAction?: HeadAction;
  /**
   * When set, the FORWARD step in head mode scopes the org tree to this
   * department (the acting user's home department and all of its
   * descendants). The Department Head forwarding flow uses this so they
   * can only delegate inside their own subtree. Ignored in specialist
   * mode (specialists only FINISH).
   */
  headUserDepartmentId?: number | null;
  /**
   * Display name of the head's department — surfaced in the FORWARD
   * section header so the user understands the scope of the picker.
   */
  headUserDepartmentName?: string | null;
}

interface LocalAttachment {
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
}

interface ActionOption {
  value: HeadAction;
  title: string;
  description: string;
  buttonClass: string;
}

const HEAD_ACTION_OPTIONS: ActionOption[] = [
  {
    value: 'FORWARD',
    title: 'Chuyển xử lý',
    description: 'Chọn người xử lý chính, người phối hợp và/hoặc người để biết, nhập hướng dẫn và hạn xử lý.',
    buttonClass: 'btn-primary',
  },
  {
    value: 'FINISH',
    title: 'Hoàn thành văn bản',
    description: 'Đánh dấu văn bản đã được xử lý xong, không chuyển tiếp cho chuyên viên.',
    buttonClass: 'btn-success',
  },
  {
    value: 'RETURN',
    title: 'Trả lại văn thư',
    description: 'Gửi văn bản về cho văn thư để chỉnh sửa hoặc bổ sung.',
    buttonClass: 'btn-warning',
  },
];

// Specialist shares FORWARD / FINISH with the head; RETURN rolls the document
// back to the department head (no clerk involvement at this stage).
const SPECIALIST_ACTION_OPTIONS: ActionOption[] = [
  {
    value: 'FORWARD',
    title: 'Chuyển xử lý',
    description: 'Chọn người xử lý chính, người phối hợp và/hoặc người để biết, nhập hướng dẫn xử lý.',
    buttonClass: 'btn-primary',
  },
  {
    value: 'FINISH',
    title: 'Hoàn thành văn bản',
    description: 'Đánh dấu văn bản đã được xử lý xong.',
    buttonClass: 'btn-success',
  },
  {
    value: 'RETURN',
    title: 'Chuyển trả văn bản',
    description: 'Chuyển trả văn bản cho Trưởng phòng xem xét lại.',
    buttonClass: 'btn-warning',
  },
];

export default function ProcessIncomingDocumentModal({
  open,
  doc,
  mode = 'head',
  onClose,
  onSuccess,
  defaultAction,
  headUserDepartmentId = null,
  headUserDepartmentName = null,
}: ProcessIncomingDocumentModalProps) {
  const isSpecialist = mode === 'specialist';
  const actionOptions = isSpecialist ? SPECIALIST_ACTION_OPTIONS : HEAD_ACTION_OPTIONS;
  // Only FORWARD is honoured as a pre-selected action in head mode.
  // Specialist mode only ever uses FINISH (already hard-wired below).
  // When `defaultAction` is set we skip the action-picker grid entirely.
  const skipActionPicker = !isSpecialist && defaultAction === 'FORWARD';
  // When the caller pre-pinned the action, surface it in the modal
  // header so the user can confirm what's happening. The generic title
  // is preserved for the deep-link / picker entry point.
  const modalTitle = isSpecialist
    ? 'Xử lý văn bản đến (Chuyên viên)'
    : skipActionPicker
      ? 'Chuyển xử lý văn bản'
      : 'Xử lý văn bản đến';
  const returnReasonLabel = isSpecialist ? 'Lý do chuyển trả' : 'Lý do trả lại';
  const returnReasonPlaceholder = isSpecialist
    ? 'Nhập lý do cần chuyển trả cho Trưởng phòng...'
    : 'Nhập lý do cần trả lại cho văn thư...';
  const returnReasonRequiredMessage = isSpecialist
    ? 'Vui lòng nhập lý do chuyển trả'
    : 'Vui lòng nhập lý do trả lại';

  const { processors, loading: loadingProcessors, fetch: fetchProcessors } = useProcessors();

  const [action, setAction] = useState<HeadAction | null>(null);
  const [processorIds, setProcessorIds] = useState<{ userId: number; processorType: ProcessorType }[]>([]);
  const [processingInstructions, setProcessingInstructions] = useState('');
  const [reason, setReason] = useState('');
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      fetchProcessors();
      // Pre-select the action when the caller asked for it (e.g. the
      // detail-page "Chuyển xử lý" button). Otherwise start blank and
      // wait for the user to pick from the picker grid.
      setAction(skipActionPicker ? 'FORWARD' : null);
      setProcessorIds([]);
      setProcessingInstructions('');
      setReason('');
      setAttachments([]);
      setError('');
    }
    // `skipActionPicker` is derived from props (`defaultAction` + `mode`)
    // so it doesn't need to be in the deps — including `open` covers
    // the common case and we intentionally re-read it on every open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fetchProcessors]);

  if (!open) return null;

  const getProcessorType = (userId: number): ProcessorType | null => {
    const p = processorIds.find((x) => x.userId === userId);
    return p ? p.processorType : null;
  };

  const handleProcessorToggle = (userId: number, type: ProcessorType) => {
    setProcessorIds((prev) => {
      const existing = prev.find((p) => p.userId === userId);
      if (existing) {
        if (existing.processorType === type) {
          return prev.filter((p) => p.userId !== userId);
        }
        return prev.map((p) => (p.userId === userId ? { ...p, processorType: type } : p));
      }
      return [...prev, { userId, processorType: type }];
    });
  };

  const handleAddAttachments = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: LocalAttachment[] = Array.from(files).map((file) => ({
      fileName: file.name,
      fileUrl: URL.createObjectURL(file),
      fileSize: file.size,
      mimeType: file.type,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = '';
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => {
      URL.revokeObjectURL(prev[index].fileUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const validate = (): string | null => {
    if (!action) return 'Vui lòng chọn hành động xử lý';
    if (action === 'FORWARD') {
      if (processorIds.length === 0) return 'Phải chọn ít nhất một người xử lý';
      if (!processorIds.some((p) => p.processorType === 'XLC')) {
        return 'Phải chọn ít nhất một Người xử lý chính (XLC)';
      }
    }
    if (action === 'RETURN' && !reason.trim()) {
      return returnReasonRequiredMessage;
    }
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      if (isSpecialist) {
        // Specialist flow only allows FINISH (per the backend contract).
        // FORWARD/RETURN branches were removed — no need to build payloads
        // for actions the server rejects anyway.
        const payload: ProcessSpecialistDocumentRequest = {
          action: 'FINISH',
          processingInstructions: processingInstructions.trim() || undefined,
        };
        await incomingDocumentsApi.processBySpecialist(doc.id, payload);
      } else {
        const payload: ProcessIncomingDocumentRequest = {
          action: action!,
        };
        if (action === 'FORWARD') {
          payload.processorIds = processorIds;
          payload.processingInstructions = processingInstructions.trim() || undefined;
          if (attachments.length > 0) {
            payload.attachments = attachments;
          }
        } else if (action === 'RETURN') {
          payload.reason = reason.trim();
        } else if (action === 'FINISH') {
          payload.processingInstructions = processingInstructions.trim() || undefined;
        }
        await incomingDocumentsApi.processByHead(doc.id, payload);
      }

      attachments.forEach((a) => URL.revokeObjectURL(a.fileUrl));
      onSuccess();
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setError(apiError.response?.data?.message || 'Xử lý thất bại. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedAction = action ? actionOptions.find((a) => a.value === action) : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: isSpecialist ? 720 : 880, width: '95%' }}
      >
        <div className="modal-header">
          <h2>{modalTitle}</h2>
          <button className="modal-close" onClick={onClose} disabled={submitting}>&times;</button>
        </div>

        <div className="modal-body">
          <div style={{ marginBottom: 16, padding: 12, background: '#f8f9fa', borderRadius: 8 }}>
            <div style={{ fontSize: 13, color: '#636e72', marginBottom: 4 }}>Văn bản đang xử lý</div>
            <div style={{ fontWeight: 600 }}>{doc.document.subject}</div>
            <div style={{ fontSize: 12, color: '#636e72', marginTop: 4 }}>
              Số ký hiệu: <strong>{doc.document.documentNumber || '—'}</strong>
              {doc.document.issuer && <> &nbsp;•&nbsp; Cơ quan ban hành: <strong>{doc.document.issuer}</strong></>}
            </div>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

          {/* When the caller pre-selects an action (e.g. the detail-page
              "Chuyển xử lý" button), hide the picker grid entirely and
              surface the chosen action as a small header chip above the
              form. The form sections below are gated on `action`
              anyway, so this is purely a UX shortcut — no API or
              payload logic changes. */}
          {!skipActionPicker && (
            <>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>Chọn hành động xử lý</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                {actionOptions.map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setAction(opt.value)}
                    disabled={submitting}
                    style={{
                      textAlign: 'left',
                      padding: 14,
                      border: action === opt.value ? '2px solid #667eea' : '1px solid #dfe6e9',
                      borderRadius: 8,
                      background: action === opt.value ? '#f0f3ff' : '#fff',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4, color: action === opt.value ? '#667eea' : '#2d3436' }}>
                      {opt.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#636e72', lineHeight: 1.4 }}>{opt.description}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {action === 'FORWARD' && (
            <div>
              {skipActionPicker && (
                // Compact action indicator replacing the picker grid so
                // the user can confirm what's selected and cancel out
                // without scrolling to the footer.
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 16,
                    padding: '8px 12px',
                    background: '#f0f3ff',
                    border: '1px solid #667eea',
                    borderRadius: 8,
                    fontSize: 13,
                    color: '#2d3436',
                  }}
                >
                  <span style={{ fontWeight: 600, color: '#667eea' }}>Hành động:</span>
                  <span>Chuyển xử lý</span>
                </div>
              )}
              {isSpecialist ? (
                // Specialist path: keep the legacy flat picker (rarely used
                // because specialists effectively only FINISH, but kept for
                // backwards compatibility with the older mode).
                <>
                  <div style={{ marginBottom: 8, fontWeight: 600 }}>
                    Chọn người xử lý <span style={{ color: '#e74c3c' }}>*</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#636e72', marginBottom: 10 }}>
                    Phải chọn ít nhất 1 XLC (Người xử lý chính). Có thể chọn thêm PHXL và XDB.
                  </div>
                  {loadingProcessors ? (
                    <div className="loading-spinner"><div className="spinner" /></div>
                  ) : (
                    <div className="processor-grid" style={{ maxHeight: 240, overflowY: 'auto', padding: 4 }}>
                      {processors.map((processor) => {
                        const currentType = getProcessorType(processor.id);
                        return (
                          <div key={processor.id} className={`processor-card ${currentType ? 'selected' : ''}`}>
                            <div className="processor-card-header">
                              <div className="processor-avatar">
                                {processor.fullName
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .toUpperCase()
                                  .slice(0, 2)}
                              </div>
                              <div className="processor-info">
                                <div className="processor-name">{processor.fullName}</div>
                                <div className="processor-roles">{processor.roles.join(', ')}</div>
                              </div>
                            </div>
                            <div className="processor-type-buttons">
                              {(['XLC', 'PHXL', 'XDB'] as ProcessorType[]).map((type) => (
                                <button
                                  key={type}
                                  type="button"
                                  className={`processor-type-btn ${currentType === type ? 'active' : ''} type-${type.toLowerCase()}`}
                                  onClick={() => handleProcessorToggle(processor.id, type)}
                                  title={type}
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
                </>
              ) : (
                // Head path: use the org-tree picker. Scope to the head's
                // own department subtree and only show Specialist-role users.
                // Department Heads can only delegate inside their own
                // organisation branch, and the forwarded handler is the
                // XLC (single-select).
                <>
                  <div style={{ fontSize: 12, color: '#636e72', marginBottom: 10 }}>
                    Chọn <strong>1 chuyên viên</strong> trong{' '}
                    {headUserDepartmentName ? (
                      <strong>phòng ban {headUserDepartmentName}</strong>
                    ) : (
                      <strong>phòng ban của bạn</strong>
                    )}{' '}
                    (và các phòng ban con) làm Người xử lý chính (XLC).
                  </div>
                  <ProcessorRoleSection
                    title="Người xử lý chính (XLC)"
                    description={
                      headUserDepartmentName
                        ? `Danh sách chuyên viên thuộc phòng ban ${headUserDepartmentName} và các phòng ban con.`
                        : 'Danh sách chuyên viên thuộc phòng ban của bạn và các phòng ban con.'
                    }
                    variant="xlc"
                    users={processors}
                    blockedUserIds={[]}
                    allowedRoles={['SPECIALIST']}
                    selectedIds={
                      // The current picker only ever stores one XLC at a
                      // time (the head forwards to a single primary
                      // handler). Surface the current selection so the
                      // tree highlights the right node.
                      (() => {
                        const current = processorIds.find((p) => p.processorType === 'XLC');
                        return current ? [current.userId] : [];
                      })()
                    }
                    mode="single"
                    max={1}
                    onChange={(next) => {
                      // Replace the XLC selection in the unified
                      // processorIds array so the submit payload stays
                      // consistent.
                      const previousXlc = processorIds.find((p) => p.processorType === 'XLC');
                      const filtered = processorIds.filter((p) => p.processorType !== 'XLC');
                      if (next.length === 0 || !next[0]) {
                        setProcessorIds(filtered);
                        return;
                      }
                      setProcessorIds([
                        ...filtered,
                        { userId: next[0], processorType: 'XLC' },
                      ]);
                      // We intentionally drop any "previousXlc" replacement
                      // warnings — the single-select UI doesn't expose
                      // them. This keeps the change handler a pure
                      // idempotent transform.
                      void previousXlc;
                    }}
                    rootDepartmentId={headUserDepartmentId}
                  />
                </>
              )}

              <div className="form-grid" style={{ marginTop: 16 }}>
                <div className="form-group full-width">
                  <label>Hướng dẫn xử lý</label>
                  <textarea
                    rows={3}
                    value={processingInstructions}
                    onChange={(e) => setProcessingInstructions(e.target.value)}
                    placeholder="Nhập nội dung hướng dẫn xử lý cho người xử lý..."
                    disabled={submitting}
                  />
                </div>
                {!isSpecialist && (
                  <>
                    <div className="form-group">
                      <label>Tệp đính kèm bổ sung</label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        onChange={handleAddAttachments}
                        disabled={submitting}
                      />
                    </div>
                    {attachments.length > 0 && (
                      <div className="form-group full-width">
                        <label>Tệp đã chọn ({attachments.length})</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {attachments.map((a, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '6px 10px',
                                background: '#f8f9fa',
                                borderRadius: 6,
                                fontSize: 13,
                              }}
                            >
                              <span>{a.fileName}</span>
                              <button
                                type="button"
                                className="action-btn delete"
                                onClick={() => handleRemoveAttachment(idx)}
                                disabled={submitting}
                                title="Xoá"
                              >
                                &times;
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {action === 'FINISH' && (
            <div className="form-group">
              <label>Ghi chú hoàn thành (tuỳ chọn)</label>
              <textarea
                rows={3}
                value={processingInstructions}
                onChange={(e) => setProcessingInstructions(e.target.value)}
                placeholder="Có thể nhập ghi chú về việc hoàn thành..."
                disabled={submitting}
              />
            </div>
          )}

          {action === 'RETURN' && (
            <div className="form-group">
              <label>{returnReasonLabel} <span style={{ color: '#e74c3c' }}>*</span></label>
              <textarea
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={returnReasonPlaceholder}
                disabled={submitting}
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-cancel" onClick={onClose} disabled={submitting}>
            Hủy
          </button>
          <button
            type="button"
            className={`btn ${selectedAction?.buttonClass || 'btn-primary'}`}
            onClick={handleSubmit}
            disabled={submitting || !action}
          >
            {submitting ? 'Đang xử lý...' : 'Xác nhận'}
          </button>
        </div>
      </div>
    </div>
  );
}