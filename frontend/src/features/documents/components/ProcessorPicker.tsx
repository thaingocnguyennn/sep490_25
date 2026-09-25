import type { ProcessorType } from '../../../api';
import { useProcessors } from '../../../shared/hooks';

interface ProcessorPickerProps {
  /** Selected processor assignments. Multiple users, each with their own type. */
  value: { userId: number; processorType: ProcessorType }[];
  /** Append / replace / remove handlers. */
  onChange: (next: { userId: number; processorType: ProcessorType }[]) => void;
  /** Optional list of processor candidates. Defaults to `useProcessors()`. */
  candidates?: { id: number; fullName: string; roles: string[] }[];
  /** Hide the helper description. */
  hideHint?: boolean;
  /** Optional CSS class on the grid container. */
  className?: string;
  /** Disable interaction (e.g. while submitting). */
  disabled?: boolean;
}

const PROC_TYPES: ProcessorType[] = ['XLC', 'PHXL', 'XDB'];

/**
 * Three-state processor picker shared between the head-process modal and the
 * specialist TRANSFER block. Each selected user is assigned a ProcessorType
 * (XLC / PHXL / XDB); clicking the active pill removes the user from the
 * selection.
 */
export default function ProcessorPicker({
  value,
  onChange,
  candidates,
  hideHint,
  className,
  disabled,
}: ProcessorPickerProps) {
  const { processors: fetched, loading } = useProcessors();
  const list = candidates ?? fetched;

  const getType = (userId: number): ProcessorType | null =>
    value.find((v) => v.userId === userId)?.processorType ?? null;

  const toggle = (userId: number, type: ProcessorType) => {
    if (disabled) return;
    const current = getType(userId);
    if (current === type) {
      onChange(value.filter((v) => v.userId !== userId));
    } else if (current) {
      onChange(value.map((v) => (v.userId === userId ? { ...v, processorType: type } : v)));
    } else {
      onChange([...value, { userId, processorType: type }]);
    }
  };

  return (
    <>
      {!hideHint && (
        <div style={{ fontSize: 12, color: '#636e72', marginBottom: 10 }}>
          Phải chọn ít nhất 1 XLC (Người xử lý chính). Có thể chọn thêm PHXL và XDB.
        </div>
      )}
      {loading && !candidates ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : (
        <div className={`processor-grid ${className ?? ''}`} style={{ maxHeight: 240, overflowY: 'auto', padding: 4 }}>
          {list.map((p) => {
            const t = getType(p.id);
            return (
              <div key={p.id} className={`processor-card ${t ? 'selected' : ''}`}>
                <div className="processor-card-header">
                  <div className="processor-avatar">
                    {p.fullName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)}
                  </div>
                  <div className="processor-info">
                    <div className="processor-name">{p.fullName}</div>
                    <div className="processor-roles">{p.roles.join(', ')}</div>
                  </div>
                </div>
                <div className="processor-type-buttons">
                  {PROC_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={`processor-type-btn ${t === type ? 'active' : ''} type-${type.toLowerCase()}`}
                      onClick={() => toggle(p.id, type)}
                      disabled={disabled}
                      title={
                        type === 'XLC'
                          ? 'Người xử lý chính'
                          : type === 'PHXL'
                            ? 'Người phối hợp'
                            : 'Xem Để biết'
                      }
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
  );
}
