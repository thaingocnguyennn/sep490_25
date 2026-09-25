import { useEffect, useState } from 'react';

/**
 * Lightweight confirmation modal for the single FINISH action that
 * Department Heads and Specialists share. The specialist XLC path used
 * to open the full `ProcessIncomingDocumentModal` modal just to surface
 * the FINISH button; that was over-engineered. Specialists only ever
 * FINISH — they don't forward or return — so a one-field confirmation
 * modal is enough.
 *
 * Both call sites (`processByHead` for heads, `processBySpecialist` for
 * specialists) accept an optional `processingInstructions` field on the
 * FINISH branch, so the modal stays API-agnostic: the parent decides
 * which endpoint to call when `onConfirm` fires.
 */
interface QuickFinishModalProps {
  open: boolean;
  /** Who is finishing — only used for the modal copy. */
  actor: 'head' | 'specialist';
  docTitle: string;
  submitting: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (payload: { processingInstructions?: string }) => Promise<void> | void;
}

const ACTOR_COPY: Record<'head' | 'specialist', { title: string; description: string }> = {
  head: {
    title: 'Hoàn thành văn bản',
    description:
      'Đánh dấu văn bản đã hoàn thành xử lý ở bước Trưởng phòng. Tài liệu sẽ được đóng nếu không còn bước nào đang chờ.',
  },
  specialist: {
    title: 'Hoàn thành văn bản',
    description:
      'Đánh dấu văn bản đã hoàn thành xử lý. Văn bản sẽ được đóng và kết thúc toàn bộ luồng xử lý.',
  },
};

export default function QuickFinishModal({
  open,
  actor,
  docTitle,
  submitting,
  error,
  onClose,
  onConfirm,
}: QuickFinishModalProps) {
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  if (!open) return null;

  const copy = ACTOR_COPY[actor];

  const handleSubmit = async () => {
    await onConfirm({ processingInstructions: note.trim() || undefined });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, width: '95%' }}
      >
        <div className="modal-header">
          <h2>{copy.title}</h2>
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

          <p style={{ marginBottom: 16, color: '#636e72', fontSize: 13 }}>
            {copy.description}
          </p>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

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
            className="btn btn-success"
            onClick={handleSubmit}
            disabled={submitting}
            style={{ backgroundColor: '#27ae60', borderColor: '#27ae60' }}
          >
            {submitting ? 'Đang xử lý...' : 'Hoàn thành'}
          </button>
        </div>
      </div>
    </div>
  );
}
