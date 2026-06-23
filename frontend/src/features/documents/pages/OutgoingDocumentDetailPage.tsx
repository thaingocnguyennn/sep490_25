import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getOutgoingDocumentById, deleteOutgoingDocument } from '../../../api/modules/outgoing-documents';
import { useOutgoingDocumentActions } from '../../../shared/hooks';
import { DocumentStatusBadge, UrgencyBadge } from '../../../shared/components/DocumentBadges';
import { LoadingSpinner } from '../../../shared/components';
import { useAuth } from '../../../contexts/AuthContext';
import type {
  OutgoingDocument,
  UpdateOutgoingStatusRequest,
  OcrResult,
} from '../../../types';

const API_BASE = 'http://localhost:3000';

// Helper: định dạng ngày giờ tiếng Việt
const formatDateTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('vi-VN');
};

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('vi-VN');
};

// Helper: tên trạng thái tiếng Việt
const STATUS_LABEL: Record<string, string> = {
  DRAFT:             'Bản nháp',
  SUBMITTED:         'Chờ duyệt',
  RETURNED:          'Trả lại',
  APPROVED:          'Đã duyệt',
  WAITING_FOR_ISSUE: 'Chờ phát hành',
  ISSUED:            'Đã phát hành',
  COMPLETED:         'Hoàn tất',
  RECALLED:          'Thu hồi',
  TRASHED:           'Thùng rác',
  REJECTED:          'Từ chối',
  CANCELLED:         'Đã hủy',
};

export default function OutgoingDocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { loading: actionLoading, uploadProgress, error: actionError, uploadFile, runOcr, updateStatus, clearError } = useOutgoingDocumentActions();

  const [doc, setDoc] = useState<OutgoingDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [showOcrResult, setShowOcrResult] = useState(false);

  // Modal trạng thái
  const [statusModal, setStatusModal] = useState<{
    open: boolean;
    action: 'submit' | 'approve' | 'return' | 'forward' | 'issue' | 'recall' | 'trash' | 'restore' | null;
  }>({ open: false, action: null });
  const [returnReason, setReturnReason] = useState('');
  const [recallReason, setRecallReason] = useState('');
  const [dispatchNumber, setDispatchNumber] = useState('');
  const [issuanceDate, setIssuanceDate] = useState('');
  const [sentDate, setSentDate] = useState('');
  const [issueUrgency, setIssueUrgency] = useState<string>('');
  const [issueConfidentiality, setIssueConfidentiality] = useState<string>('');

  // Drag & Drop upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const justCreated = (location.state as { justCreated?: boolean })?.justCreated;

  // Xác định role
  const isSpecialist   = user?.roles.includes('SPECIALIST');
  const isDeptHead     = user?.roles.includes('DEPARTMENT_HEAD');
  const isClerk        = user?.roles.includes('DOCUMENT_CLERK');
  const isAdmin        = user?.roles.includes('ADMIN');

  const canEdit   = (isSpecialist || isClerk) && ['DRAFT', 'RETURNED'].includes(doc?.document.status ?? '');
  const canUpload = (isSpecialist || isClerk) && ['DRAFT', 'RETURNED'].includes(doc?.document.status ?? '');
  const canOcr    = canUpload && !!doc?.document.fileUrl;
  const canSubmit = isSpecialist && doc?.document.status === 'DRAFT';
  const canApprove = isDeptHead && doc?.document.status === 'SUBMITTED';
  const canReturn  = isDeptHead && doc?.document.status === 'SUBMITTED';
  const canForward = isDeptHead && doc?.document.status === 'APPROVED';
  const canIssue   = isClerk && doc?.document.status === 'WAITING_FOR_ISSUE';
  const canRecall  = isClerk && doc?.document.status === 'ISSUED';
  const canTrash   = (isSpecialist || isClerk || isDeptHead) && !['COMPLETED', 'TRASHED', 'CANCELLED'].includes(doc?.document.status ?? '');
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

  // ─── OCR handler ─────────────────────────────────────────────────────────

  const handleRunOcr = async () => {
    if (!doc) return;
    const result = await runOcr(doc.id);
    if (result) {
      setOcrResult(result);
      setShowOcrResult(true);
    }
  };

  // ─── Status update handler ───────────────────────────────────────────────

  const handleStatusUpdate = async () => {
    if (!doc || !statusModal.action) return;

    if (statusModal.action === 'trash') {
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

    const statusMap: Record<string, string> = {
      submit:  'SUBMITTED',
      approve: 'APPROVED',
      return:  'RETURNED',
      forward: 'WAITING_FOR_ISSUE',
      issue:   'ISSUED',
      recall:  'RECALLED',
      restore: 'DRAFT',
    };

    const payload: UpdateOutgoingStatusRequest = {
      status: statusMap[statusModal.action] as any,
      returnReason: returnReason || undefined,
      recallReason: recallReason || undefined,
      dispatchNumber: dispatchNumber || undefined,
      issuanceDate: issuanceDate || undefined,
      sentDate: sentDate || undefined,
      urgency: issueUrgency || undefined,
      confidentialityLevel: issueConfidentiality || undefined,
    };

    const result = await updateStatus(doc.id, payload);
    if (result) {
      setDoc(result);
      setStatusModal({ open: false, action: null });
      setReturnReason('');
      setRecallReason('');
      setDispatchNumber('');
      setIssuanceDate('');
      setSentDate('');
      setIssueUrgency('');
      setIssueConfidentiality('');
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) return <LoadingSpinner />;
  if (error || !doc) {
    return (
      <div className="page-content">
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: '#e74c3c' }}>⚠️ {error || 'Không tìm thấy văn bản đi'}</p>
            <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => navigate('/outgoing-documents')}>
              ← Quay lại danh sách
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
            ← Quay lại
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
              ✏️ Chỉnh sửa
            </button>
          )}
          {canSubmit && (
            <button id="btn-submit-doc" className="btn btn-primary" onClick={() => setStatusModal({ open: true, action: 'submit' })}>
              📤 Trình duyệt
            </button>
          )}
          {canApprove && (
            <button id="btn-approve-doc" className="btn btn-primary" onClick={() => setStatusModal({ open: true, action: 'approve' })}
              style={{ background: '#27ae60' }}>
              ✅ Phê duyệt
            </button>
          )}
          {canReturn && (
            <button id="btn-return-doc" className="btn btn-secondary" onClick={() => setStatusModal({ open: true, action: 'return' })}
              style={{ borderColor: '#e67e22', color: '#e67e22' }}>
              ↩️ Trả lại
            </button>
          )}
          {canForward && (
            <button id="btn-forward-doc" className="btn btn-primary" onClick={() => setStatusModal({ open: true, action: 'forward' })}>
              📨 Chuyển văn thư
            </button>
          )}
          {canIssue && (
            <button id="btn-issue-doc" className="btn btn-primary" onClick={() => setStatusModal({ open: true, action: 'issue' })}
              style={{ background: '#8e44ad' }}>
              🚀 Phát hành
            </button>
          )}
          {canRecall && (
            <button id="btn-recall-doc" className="btn btn-secondary" onClick={() => setStatusModal({ open: true, action: 'recall' })}
              style={{ borderColor: '#c0392b', color: '#c0392b' }}>
              🔙 Thu hồi
            </button>
          )}
          {canRestore && (
            <button id="btn-restore-doc" className="btn btn-secondary" onClick={() => setStatusModal({ open: true, action: 'restore' })}
              style={{ borderColor: '#27ae60', color: '#27ae60' }}>
              ♻️ Khôi phục
            </button>
          )}
          {canTrash && (
            <button id="btn-trash-doc" className="btn btn-secondary" onClick={() => setStatusModal({ open: true, action: 'trash' })}
              style={{ borderColor: '#e74c3c', color: '#e74c3c' }}>
              🗑️ Thùng rác
            </button>
          )}
        </div>
      </div>

      <div className="page-content">
        {justCreated && (
          <div style={{ background: '#d4edda', border: '1px solid #28a745', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#155724' }}>
            ✅ Văn bản đi đã được tạo thành công! Bạn có thể upload file và chạy OCR bên dưới.
          </div>
        )}

        {(actionError) && (
          <div style={{ background: '#fdf0f0', border: '1px solid #fcc', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#e74c3c' }}>
            ⚠️ {actionError}
            <button onClick={clearError} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c' }}>✕</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>

          {/* Cột trái: thông tin chính */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Thông tin cơ bản */}
            <div className="card">
              <div className="card-header"><h2>📋 Thông tin văn bản</h2></div>
              <div className="card-body">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['📌 Tiêu đề', doc.document.title],
                      ['🏷️ Loại văn bản', doc.documentType || '—'],
                      ['🔢 Số ký hiệu (gốc)', doc.documentNumber || '—'],
                      ['🚀 Số phát hành', doc.dispatchNumber || '—'],
                      ['📅 Ngày ban hành', formatDate(doc.issuanceDate)],
                      ['👤 Người ký', doc.signerName ? `${doc.signerName}${doc.signerTitle ? ` (${doc.signerTitle})` : ''}` : '—'],
                      ['🏢 Người/Cơ quan nhận', doc.recipientName || '—'],
                      ['📍 Địa chỉ người nhận', doc.recipientAddress || '—'],
                      ['✉️ Email người nhận', doc.recipientEmail || '—'],
                      ['📤 Ngày gửi', formatDate(doc.sentDate)],
                      ['📄 Số trang', doc.pageCount ? `${doc.pageCount} trang` : '—'],
                      ['⚠️ Độ khẩn', null], // render manually
                      ['🚥 Trạng thái', null],
                      ['🏛️ Phòng ban', doc.document.department?.name || '—'],
                      ['✍️ Người tạo', doc.document.createdByUser?.fullName || '—'],
                      ['🕒 Ngày tạo', formatDateTime(doc.createdAt)],
                    ].map(([label, value]) => {
                      if (label === '⚠️ Độ khẩn') {
                        return (
                          <tr key={label as string}>
                            <td style={{ padding: '8px 0', color: '#636e72', width: 220, fontWeight: 500 }}>{label}</td>
                            <td style={{ padding: '8px 0' }}><UrgencyBadge urgency={doc.urgency} /></td>
                          </tr>
                        );
                      }
                      if (label === '🚥 Trạng thái') {
                        return (
                          <tr key={label as string}>
                            <td style={{ padding: '8px 0', color: '#636e72', width: 220, fontWeight: 500 }}>{label}</td>
                            <td style={{ padding: '8px 0' }}><DocumentStatusBadge status={docStatus} /></td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={label as string}>
                          <td style={{ padding: '8px 0', color: '#636e72', width: 220, fontWeight: 500 }}>{label}</td>
                          <td style={{ padding: '8px 0' }}>{value}</td>
                        </tr>
                      );
                    })}
                    {doc.notes && (
                      <tr>
                        <td style={{ padding: '8px 0', color: '#636e72', fontWeight: 500, verticalAlign: 'top' }}>Ghi chú</td>
                        <td style={{ padding: '8px 0', whiteSpace: 'pre-wrap' }}>{doc.notes}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Upload file */}
            {canUpload && (
              <div className="card">
                <div className="card-header">
                  <h2>📎 Upload file nháp</h2>
                  <p style={{ color: '#636e72', fontSize: 13, margin: 0 }}>
                    Hỗ trợ: PDF, DOCX, JPG, PNG, TIFF, BMP (tối đa 10MB)
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
                    <div style={{ fontSize: 32, marginBottom: 8 }}>☁️</div>
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

            {/* File hiện tại + OCR */}
            {doc.document.fileUrl && (
              <div className="card">
                <div className="card-header">
                  <h2>📄 File đính kèm</h2>
                </div>
                <div className="card-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#f8f9fa', borderRadius: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 24 }}>📃</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{doc.document.originalFileName || 'File đính kèm'}</div>
                      {doc.document.fileSize && (
                        <div style={{ fontSize: 12, color: '#636e72' }}>
                          {(doc.document.fileSize / 1024).toFixed(1)} KB
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <a
                        href={`${API_BASE}${doc.document.fileUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary"
                        style={{ fontSize: 13 }}
                      >
                        👁️ Xem
                      </a>
                      <a
                        href={`${API_BASE}/api/documents/${doc.documentId}/download`}
                        className="btn btn-secondary"
                        style={{ fontSize: 13 }}
                      >
                        ⬇️ Tải về
                      </a>
                    </div>
                  </div>

                  {/* OCR status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 13, color: '#636e72' }}>
                      OCR: <strong>{
                        doc.document.ocrStatus === 'COMPLETED' ? '✅ Hoàn tất' :
                        doc.document.ocrStatus === 'PROCESSING' ? '⏳ Đang xử lý' :
                        doc.document.ocrStatus === 'FAILED' ? '❌ Thất bại' : '⏸️ Chưa chạy'
                      }</strong>
                    </div>
                    {canOcr && (
                      <button
                        id="btn-run-ocr"
                        className="btn btn-secondary"
                        style={{ fontSize: 13 }}
                        onClick={handleRunOcr}
                        disabled={actionLoading}
                      >
                        {actionLoading ? '⏳ Đang xử lý...' : '🔍 Chạy OCR'}
                      </button>
                    )}
                    {doc.document.ocrStatus === 'COMPLETED' && doc.document.ocrText && (
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 13 }}
                        onClick={() => setShowOcrResult(!showOcrResult)}
                      >
                        {showOcrResult ? '🙈 Ẩn kết quả OCR' : '📋 Xem kết quả OCR'}
                      </button>
                    )}
                  </div>

                  {/* OCR result */}
                  {(showOcrResult && (ocrResult || doc.document.ocrText)) && (
                    <div style={{ marginTop: 16, padding: 16, background: '#f0f2ff', borderRadius: 8, border: '1px solid #c7d2fe' }}>
                      <h4 style={{ margin: '0 0 12px', color: '#4c1d95' }}>Kết quả OCR</h4>
                      {ocrResult?.extractedFields && (
                        <div style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {Object.entries(ocrResult.extractedFields).map(([key, val]) => val ? (
                            <div key={key} style={{ fontSize: 13 }}>
                              <strong>{key}:</strong> {val}
                            </div>
                          ) : null)}
                        </div>
                      )}
                      <div style={{ fontSize: 12, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', color: '#4b5563', background: 'white', padding: 12, borderRadius: 6 }}>
                        {ocrResult?.ocrText || doc.document.ocrText}
                      </div>
                      {canEdit && ocrResult && (
                        <button
                          className="btn btn-primary"
                          style={{ marginTop: 12, fontSize: 13 }}
                          onClick={() => navigate(`/outgoing-documents/${doc.id}/edit`, { state: { ocrFields: ocrResult.extractedFields } })}
                        >
                          ✍️ Điền vào form từ OCR
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Cột phải: lịch sử workflow */}
          <div className="card">
            <div className="card-header"><h2>📈 Lịch sử xử lý</h2></div>
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
                            {item.user && <div style={{ fontSize: 12, color: '#667eea' }}>👤 {item.user}</div>}
                            {item.note && (
                              <div style={{ fontSize: 12, color: '#e67e22', marginTop: 2 }}>
                                💬 {item.note}
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

      {/* Modal xác nhận hành động */}
      {statusModal.open && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
          onClick={() => setStatusModal({ open: false, action: null })}
        >
          <div
            style={{ background: 'white', borderRadius: 12, padding: 32, width: 480, maxWidth: '90vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>
              {statusModal.action === 'submit'  && '📤 Trình văn bản để duyệt'}
              {statusModal.action === 'approve' && '✅ Phê duyệt văn bản'}
              {statusModal.action === 'return'  && '↩️ Trả lại văn bản'}
              {statusModal.action === 'forward' && '📨 Chuyển cho văn thư phát hành'}
              {statusModal.action === 'issue'   && '🚀 Phát hành văn bản'}
              {statusModal.action === 'recall'  && '🔙 Thu hồi văn bản đã phát hành'}
              {statusModal.action === 'trash'   && '🗑️ Chuyển vào thùng rác'}
              {statusModal.action === 'restore' && '♻️ Khôi phục từ thùng rác'}
            </h3>

            {/* Trả lại: bắt buộc nhập lý do */}
            {statusModal.action === 'return' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Lý do trả lại <span style={{ color: '#e74c3c' }}>*</span>
                </label>
                <textarea
                  id="return-reason-input"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Nhập lý do trả lại để tác giả chỉnh sửa..."
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {/* Thu hồi: bắt buộc nhập lý do */}
            {statusModal.action === 'recall' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Lý do thu hồi <span style={{ color: '#e74c3c' }}>*</span>
                </label>
                <textarea
                  id="recall-reason-input"
                  value={recallReason}
                  onChange={(e) => setRecallReason(e.target.value)}
                  placeholder="Nhập lý do thu hồi văn bản..."
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {/* Phát hành: nhập số phát hành */}
            {statusModal.action === 'issue' && (
              <>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Số phát hành chính thức</label>
                  <input
                    id="dispatch-number-input"
                    type="text"
                    value={dispatchNumber}
                    onChange={(e) => setDispatchNumber(e.target.value)}
                    placeholder="Vd: 123/QĐ-UBND"
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Ngày ban hành</label>
                    <input
                      id="issuance-date-input"
                      type="date"
                      value={issuanceDate}
                      onChange={(e) => setIssuanceDate(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Ngày gửi</label>
                    <input
                      id="sent-date-input"
                      type="date"
                      value={sentDate}
                      onChange={(e) => setSentDate(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                {/* Độ khẩn và Độ mật khi phát hành */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Độ khẩn</label>
                    <select
                      id="issue-urgency-select"
                      value={issueUrgency}
                      onChange={(e) => setIssueUrgency(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                    >
                      <option value="">— Giữ nguyên —</option>
                      <option value="THUONG">Thường</option>
                      <option value="KHAN">Khẩn</option>
                      <option value="THUONG_KHAN">Thượng khẩn</option>
                      <option value="HOA_TOC">Hỏa tốc</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Độ mật</label>
                    <select
                      id="issue-confidentiality-select"
                      value={issueConfidentiality}
                      onChange={(e) => setIssueConfidentiality(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', border: '1px solid #dfe6e9', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                    >
                      <option value="">— Giữ nguyên —</option>
                      <option value="THUONG">Thường</option>
                      <option value="MAT">Mật</option>
                      <option value="TOI_MAT">Tối mật</option>
                      <option value="TUYET_MAT">Tuyệt mật</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Xác nhận chung */}
            {!['return', 'recall', 'issue'].includes(statusModal.action || '') && (
              <p style={{ color: '#636e72', marginBottom: 20 }}>
                {statusModal.action === 'submit'  && 'Xác nhận trình văn bản lên Trưởng phòng để duyệt?'}
                {statusModal.action === 'approve' && 'Xác nhận phê duyệt văn bản này?'}
                {statusModal.action === 'forward' && 'Xác nhận chuyển văn bản cho Văn thư để cấp số và phát hành?'}
                {statusModal.action === 'trash'   && 'Văn bản sẽ được chuyển vào thùng rác. Có thể khôi phục sau.'}
                {statusModal.action === 'restore' && 'Khôi phục văn bản này từ thùng rác về trạng thái Bản nháp?'}
              </p>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                className="btn btn-secondary"
                onClick={() => setStatusModal({ open: false, action: null })}
                disabled={actionLoading}
              >
                Hủy
              </button>
              <button
                id="btn-confirm-action"
                className="btn btn-primary"
                onClick={handleStatusUpdate}
                disabled={actionLoading || (statusModal.action === 'return' && !returnReason.trim()) || (statusModal.action === 'recall' && !recallReason.trim())}
                style={{
                  background: statusModal.action === 'trash' ? '#e74c3c' :
                               statusModal.action === 'recall' ? '#c0392b' :
                               statusModal.action === 'approve' ? '#27ae60' : undefined,
                }}
              >
                {actionLoading ? '⏳ Đang xử lý...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
