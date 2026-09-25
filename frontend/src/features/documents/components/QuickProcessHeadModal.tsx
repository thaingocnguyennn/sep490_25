import { useEffect, useState } from 'react';

export type QuickHeadAction = 'FINISH' | 'RETURN';

interface QuickProcessHeadModalProps {
  open: boolean;
  action: QuickHeadAction | null;
  docTitle: string;
  submitting: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (payload: { processingInstructions?: string; reason?: string }) => Promise<void> | void;
}

/**
 * Lightweight modal for the two simple "head" actions:
 *  • FINISH — optional completion note (mapped to `processingInstructions`).
 *  • RETURN — required reason explaining why the document is rolled back.
 *
 * The FORWARD case is intentionally NOT handled here because it requires
 * the processor picker (XLC/PHXL/XDB) and is already covered by
 * `ProcessIncomingDocumentModal` in `head` mode.
 */
export default function QuickProcessHeadModal({
  open,
  action,
  docTitle,
  submitting,
  error,
  onClose,
  onConfirm,
}: QuickProcessHeadModalProps) {
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');

  // Reset fields whenever the modal is opened for a new action.
  useEffect(() => {
    if (open) {
      setNote('');
      setReason('');
    }
  }, [open, action]);

  if (!open || !action) return null;

  const isFinish = action === 'FINISH';
  const title = isFinish ? 'Hoàn thành văn bản' : 'Chuyển trả văn bản';
  const confirmLabel = isFinish ? 'Hoàn thành' : 'Chuyển trả';
  // FINISH only needs an optional note, RETURN needs a non-empty reason.
  const canConfirm = isFinish ? true : reason.trim().length > 0;

  const handleSubmit = async () => {
    if (!canConfirm) return;
    await onConfirm(
      isFinish
        ? { processingInstructions: note.trim() || undefined }
        : { reason: reason.trim() }
    );
  };

  const accent = isFinish ? '#27ae60' : '#e67e22';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, width: '95%' }}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Đóng"
          >
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              background: '#f8f9fa',
              borderRadius: 8,
              border: '1px solid #dfe6e9',
            }}
          >
            <div style={{ fontSize: 12, color: '#636e72', marginBottom: 4 }}>
              Văn bản đang xử lý
            </div>
            <div style={{ fontWeight: 600, color: '#2d3436' }}>{docTitle}</div>
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          {isFinish ? (
            <div className="form-group">
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Ghi chú hoàn thành (tuỳ chọn)
              </label>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Có thể nhập ghi chú về việc hoàn thành..."
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #dfe6e9',
                  borderRadius: 8,
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ) : (
            <div className="form-group">
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Lý do trả lại <span style={{ color: '#e74c3c' }}>*</span>
              </label>
              <textarea
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Nhập lý do cần trả lại cho văn thư..."
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #dfe6e9',
                  borderRadius: 8,
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-cancel"
            onClick={onClose}
            disabled={submitting}
          >
            Hủy
          </button>
          <button
            type="button"
            className={isFinish ? 'btn btn-success' : 'btn btn-warning'}
            onClick={handleSubmit}
            disabled={submitting || !canConfirm}
            style={{
              backgroundColor: accent,
              borderColor: accent,
            }}
          >
            {submitting ? 'Đang xử lý...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}