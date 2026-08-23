import React, { useState, useEffect } from 'react';
import type { OutgoingDocument, User } from '../../../types';

export type OutgoingActionType =
  | 'submit'
  | 'approve'
  | 'return'
  | 'issue'
  | 'recall'
  | 'trash'
  | 'restore';

export interface ProcessOutgoingDocumentPayload {
  action: OutgoingActionType;
  assignedApproverId?: number;
  assignedClerkId?: number;
  returnReason?: string;
  recallReason?: string;
  sentDate?: string;
  issueUrgency?: string;
  issueConfidentiality?: string;
  note?: string;
}

interface ProcessOutgoingDocumentModalProps {
  open: boolean;
  action: OutgoingActionType | null;
  doc: OutgoingDocument;
  approvers: User[];
  clerks: User[];
  loadingUsers?: boolean;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (payload: ProcessOutgoingDocumentPayload) => Promise<void>;
}

const ACTION_TITLES: Record<OutgoingActionType, string> = {
  submit: 'Trình duyệt văn bản đi',
  approve: 'Phê duyệt văn bản đi',
  return: 'Trả lại văn bản đi',
  issue: 'Phát hành văn bản đi',
  recall: 'Thu hồi văn bản đi',
  trash: 'Chuyển vào thùng rác',
  restore: 'Khôi phục văn bản',
};

const ACTION_BUTTON_LABELS: Record<OutgoingActionType, string> = {
  submit: 'Trình duyệt',
  approve: 'Phê duyệt',
  return: 'Trả lại',
  issue: 'Phát hành',
  recall: 'Thu hồi',
  trash: 'Xóa vào thùng rác',
  restore: 'Khôi phục',
};

export default function ProcessOutgoingDocumentModal({
  open,
  action,
  doc,
  approvers,
  clerks,
  loadingUsers = false,
  submitting,
  onClose,
  onConfirm,
}: ProcessOutgoingDocumentModalProps) {
  const [assignedApproverId, setAssignedApproverId] = useState<number | ''>('');
  const [assignedClerkId, setAssignedClerkId] = useState<number | ''>('');
  const [returnReason, setReturnReason] = useState('');
  const [recallReason, setRecallReason] = useState('');
  const [sentDate, setSentDate] = useState(new Date().toISOString().split('T')[0]);
  const [issueUrgency, setIssueUrgency] = useState('');
  const [issueConfidentiality, setIssueConfidentiality] = useState('');
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (open) {
      setAssignedApproverId(approvers.length > 0 ? approvers[0].id : '');
      setAssignedClerkId(clerks.length > 0 ? clerks[0].id : '');
      setReturnReason('');
      setRecallReason('');
      setSentDate(new Date().toISOString().split('T')[0]);
      setIssueUrgency('');
      setIssueConfidentiality('');
      setNote('');
      setValidationError('');
    }
  }, [open, action, approvers, clerks]);

  if (!open || !action) return null;

  const validate = (): boolean => {
    if (action === 'submit') {
      if (!assignedApproverId) {
        setValidationError('Vui lòng chọn Lãnh đạo phê duyệt');
        return false;
      }
    }
    if (action === 'approve') {
      if (!assignedClerkId) {
        setValidationError('Vui lòng chọn Văn thư tiếp nhận');
        return false;
      }
    }
    if (action === 'return') {
      if (!returnReason.trim()) {
        setValidationError('Vui lòng nhập lý do trả lại văn bản');
        return false;
      }
    }
    if (action === 'recall') {
      if (!recallReason.trim()) {
        setValidationError('Vui lòng nhập lý do thu hồi văn bản');
        return false;
      }
    }
    setValidationError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    await onConfirm({
      action,
      assignedApproverId: assignedApproverId ? Number(assignedApproverId) : undefined,
      assignedClerkId: assignedClerkId ? Number(assignedClerkId) : undefined,
      returnReason: returnReason.trim() || undefined,
      recallReason: recallReason.trim() || undefined,
      sentDate: sentDate || undefined,
      issueUrgency: issueUrgency || undefined,
      issueConfidentiality: issueConfidentiality || undefined,
      note: note.trim() || undefined,
    });
  };

  const getButtonBg = () => {
    switch (action) {
      case 'approve':
        return '#27ae60';
      case 'return':
        return '#e67e22';
      case 'recall':
        return '#c0392b';
      case 'trash':
        return '#e74c3c';
      default:
        return '#667eea';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 680, width: '95%' }}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <h2>{ACTION_TITLES[action]}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={submitting}
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Thẻ tóm tắt thông tin văn bản */}
            <div
              style={{
                marginBottom: 20,
                padding: '14px 16px',
                background: '#f8f9fa',
                borderRadius: 8,
                border: '1px solid #dfe6e9',
              }}
            >
              <div style={{ fontSize: 12, color: '#636e72', marginBottom: 4 }}>
                Văn bản đang xử lý
              </div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 15,
                  color: '#2d3436',
                  lineHeight: 1.4,
                }}
              >
                {doc.document.subject}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#636e72',
                  marginTop: 6,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <span>
                  Số ký hiệu:{' '}
                  <strong>{doc.document.documentNumber || 'Chưa cấp số'}</strong>
                </span>
                {doc.document.issuer && (
                  <span>
                    Cơ quan ban hành: <strong>{doc.document.issuer}</strong>
                  </span>
                )}
                {doc.document.department && (
                  <span>
                    Phòng ban: <strong>{doc.document.department.name}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* Thông báo lỗi nếu có */}
            {validationError && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                {validationError}
              </div>
            )}

            {/* ─── HÀNH ĐỘNG: TRÌNH DUYỆT ────────────────────────────────────── */}
            {action === 'submit' && (
              <div>
                <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 14 }}>
                  Chọn Lãnh đạo phê duyệt <span style={{ color: '#e74c3c' }}>*</span>
                </div>
                <div style={{ fontSize: 12, color: '#636e72', marginBottom: 12 }}>
                  Văn bản sẽ được chuyển đến Lãnh đạo được chọn để xem xét và duyệt nội dung.
                </div>

                {loadingUsers ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: '#636e72' }}>
                    <div className="spinner" style={{ margin: '0 auto 8px' }} />
                    Đang tải danh sách Lãnh đạo...
                  </div>
                ) : approvers.length === 0 ? (
                  <div className="alert alert-error" style={{ marginBottom: 16 }}>
                    Không tìm thấy Lãnh đạo nào trong hệ thống. Vui lòng liên hệ Quản trị viên.
                  </div>
                ) : (
                  <div
                    className="processor-grid"
                    style={{ maxHeight: 220, overflowY: 'auto', padding: 2, marginBottom: 16 }}
                  >
                    {approvers.map((u) => {
                      const isSelected = assignedApproverId === u.id;
                      const initials = u.fullName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2);

                      return (
                        <div
                          key={u.id}
                          className={`processor-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setAssignedApproverId(u.id)}
                          style={{
                            cursor: 'pointer',
                            borderColor: isSelected ? '#667eea' : '#dfe6e9',
                            background: isSelected ? '#f8f9ff' : '#fff',
                            padding: '12px 14px',
                          }}
                        >
                          <div className="processor-card-header" style={{ marginBottom: 0 }}>
                            <div className="processor-avatar">{initials}</div>
                            <div className="processor-info">
                              <div className="processor-name">{u.fullName}</div>
                              <div className="processor-roles">{u.email}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="form-group" style={{ marginTop: 12 }}>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Ý kiến trình duyệt / Ghi chú (tuỳ chọn)
                  </label>
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Nhập nội dung đề xuất hoặc ghi chú gửi Lãnh đạo..."
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
            )}

            {/* ─── HÀNH ĐỘNG: PHÊ DUYỆT ──────────────────────────────────────── */}
            {action === 'approve' && (
              <div>
                <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 14 }}>
                  Chọn Văn thư tiếp nhận <span style={{ color: '#e74c3c' }}>*</span>
                </div>
                <div style={{ fontSize: 12, color: '#636e72', marginBottom: 12 }}>
                  Văn bản sau khi phê duyệt sẽ được chuyển cho Văn thư để vào sổ và phát hành.
                </div>

                {loadingUsers ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: '#636e72' }}>
                    <div className="spinner" style={{ margin: '0 auto 8px' }} />
                    Đang tải danh sách Văn thư...
                  </div>
                ) : clerks.length === 0 ? (
                  <div className="alert alert-error" style={{ marginBottom: 16 }}>
                    Không tìm thấy tài khoản Văn thư nào trong hệ thống.
                  </div>
                ) : (
                  <div
                    className="processor-grid"
                    style={{ maxHeight: 220, overflowY: 'auto', padding: 2, marginBottom: 16 }}
                  >
                    {clerks.map((u) => {
                      const isSelected = assignedClerkId === u.id;
                      const initials = u.fullName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2);

                      return (
                        <div
                          key={u.id}
                          className={`processor-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setAssignedClerkId(u.id)}
                          style={{
                            cursor: 'pointer',
                            borderColor: isSelected ? '#27ae60' : '#dfe6e9',
                            background: isSelected ? '#eafaf1' : '#fff',
                            padding: '12px 14px',
                          }}
                        >
                          <div className="processor-card-header" style={{ marginBottom: 0 }}>
                            <div
                              className="processor-avatar"
                              style={{ background: '#27ae60' }}
                            >
                              {initials}
                            </div>
                            <div className="processor-info">
                              <div className="processor-name">{u.fullName}</div>
                              <div className="processor-roles">{u.email}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="form-group" style={{ marginTop: 12 }}>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Ý kiến phê duyệt / Chỉ đạo (tuỳ chọn)
                  </label>
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Nhập ý kiến phê duyệt hoặc chỉ đạo cho Văn thư..."
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
            )}

            {/* ─── HÀNH ĐỘNG: TRẢ LẠI ────────────────────────────────────────── */}
            {action === 'return' && (
              <div className="form-group">
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Lý do trả lại <span style={{ color: '#e74c3c' }}>*</span>
                </label>
                <textarea
                  id="return-reason-input"
                  rows={4}
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Nhập chi tiết lý do trả lại để chuyên viên chỉnh sửa và bổ sung..."
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

            {/* ─── HÀNH ĐỘNG: THU HỒI ────────────────────────────────────────── */}
            {action === 'recall' && (
              <div className="form-group">
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Lý do thu hồi <span style={{ color: '#e74c3c' }}>*</span>
                </label>
                <textarea
                  id="recall-reason-input"
                  rows={4}
                  value={recallReason}
                  onChange={(e) => setRecallReason(e.target.value)}
                  placeholder="Nhập lý do thu hồi văn bản đã phát hành..."
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

            {/* ─── HÀNH ĐỘNG: PHÁT HÀNH ──────────────────────────────────────── */}
            {action === 'issue' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 16 }}>
                  <div className="form-group">
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                      Ngày gửi chính thức
                    </label>
                    <input
                      id="sent-date-input"
                      type="date"
                      value={sentDate}
                      onChange={(e) => setSentDate(e.target.value)}
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div className="form-group">
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                      Độ khẩn khi phát hành
                    </label>
                    <select
                      id="issue-urgency-select"
                      value={issueUrgency}
                      onChange={(e) => setIssueUrgency(e.target.value)}
                      disabled={submitting}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        border: '1px solid #dfe6e9',
                        borderRadius: 8,
                        fontSize: 14,
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="">— Giữ nguyên hiện tại —</option>
                      <option value="THUONG">Thường</option>
                      <option value="KHAN">Khẩn</option>
                      <option value="THUONG_KHAN">Thượng khẩn</option>
                      <option value="HOA_TOC">Hỏa tốc</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                      Độ mật khi phát hành
                    </label>
                    <select
                      id="issue-confidentiality-select"
                      value={issueConfidentiality}
                      onChange={(e) => setIssueConfidentiality(e.target.value)}
                      disabled={submitting}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        border: '1px solid #dfe6e9',
                        borderRadius: 8,
                        fontSize: 14,
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="">— Giữ nguyên hiện tại —</option>
                      <option value="THUONG">Thường</option>
                      <option value="MAT">Mật</option>
                      <option value="TOI_MAT">Tối mật</option>
                      <option value="TUYET_MAT">Tuyệt mật</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ─── HÀNH ĐỘNG: THÙNG RÁC ──────────────────────────────────────── */}
            {action === 'trash' && (
              <div
                style={{
                  background: '#fdf0f0',
                  border: '1px solid #fad2cf',
                  borderRadius: 8,
                  padding: '14px 16px',
                  color: '#c0392b',
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                Văn bản này sẽ được chuyển vào thùng rác. Các liên kết và trạng thái hiện tại sẽ bị tạm dừng. Bạn có thể khôi phục văn bản này sau nếu cần.
              </div>
            )}

            {/* ─── HÀNH ĐỘNG: KHÔI PHỤC ──────────────────────────────────────── */}
            {action === 'restore' && (
              <div
                style={{
                  background: '#eafaf1',
                  border: '1px solid #27ae6040',
                  borderRadius: 8,
                  padding: '14px 16px',
                  color: '#1e8449',
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                Văn bản sẽ được khôi phục từ thùng rác về trạng thái Bản nháp để người dùng tiếp tục chỉnh sửa và xử lý.
              </div>
            )}
          </div>

          {/* Modal Footer */}
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
              id="btn-confirm-action"
              type="submit"
              className="btn btn-primary"
              disabled={
                submitting ||
                (action === 'submit' && (approvers.length === 0 || !assignedApproverId)) ||
                (action === 'approve' && (clerks.length === 0 || !assignedClerkId)) ||
                (action === 'return' && !returnReason.trim()) ||
                (action === 'recall' && !recallReason.trim())
              }
              style={{
                backgroundColor: getButtonBg(),
                borderColor: getButtonBg(),
              }}
            >
              {submitting ? 'Đang xử lý...' : ACTION_BUTTON_LABELS[action]}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
