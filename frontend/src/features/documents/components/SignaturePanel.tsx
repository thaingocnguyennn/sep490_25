import { useState, useEffect } from 'react';
import {
  getOutgoingSignatures,
  getOutgoingSignatureDetail,
} from '../../../api/modules/outgoing-documents';
import type {
  DocumentSignatureItem,
  DocumentSignatureResponse,
  DocumentSignatureSummary,
  VisualMark,
} from '../../../types';

// ─── Hằng số loại file hỗ trợ ────────────────────────────────────────────────

const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

function isSupportedFileType(mimeType?: string | null): boolean {
  if (!mimeType) return false;
  return SUPPORTED_MIME_TYPES.includes(mimeType.toLowerCase());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSigningTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleString('vi-VN');
  } catch {
    return isoStr;
  }
}

function getStatusBadge(status: DocumentSignatureItem['integrityStatus']) {
  switch (status) {
    case 'NO_CHANGES_AFTER_SIGNING':
      return { label: 'Không phát hiện thay đổi', color: '#27ae60', bg: '#eafaf1', icon: '✅' };
    case 'DATA_ADDED_AFTER_SIGNING':
      return { label: 'Có dữ liệu thêm sau vùng ký', color: '#e67e22', bg: '#fef5e7', icon: '⚠️' };
    case 'INVALID_BYTE_RANGE':
      return { label: 'Cấu trúc ByteRange không hợp lệ', color: '#c0392b', bg: '#fdedec', icon: '❌' };
    case 'SIGNATURE_STRUCTURE_FOUND':
      return { label: 'Phát hiện chữ ký (Word)', color: '#2980b9', bg: '#ebf5fb', icon: '📝' };
    default:
      return { label: 'Không xác định', color: '#7f8c8d', bg: '#f4f6f7', icon: '❓' };
  }
}

// ─── Banner tính toàn vẹn tổng thể ───────────────────────────────────────────

interface IntegrityBannerProps {
  signatures: DocumentSignatureItem[];
}

function IntegrityBanner({ signatures }: IntegrityBannerProps) {
  if (signatures.length === 0) return null;

  // Chữ ký cuối cùng xác định tình trạng toàn vẹn tổng thể
  const lastSig = signatures[signatures.length - 1];
  const allValid = signatures.every(
    (s) =>
      s.integrityStatus === 'NO_CHANGES_AFTER_SIGNING' ||
      s.integrityStatus === 'SIGNATURE_STRUCTURE_FOUND',
  );

  if (lastSig.integrityStatus === 'NO_CHANGES_AFTER_SIGNING' && allValid) {
    return (
      <div
        style={{
          background: '#eafaf1',
          border: '1px solid #27ae6040',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 20 }}>✅</span>
        <div>
          <div style={{ fontWeight: 700, color: '#1e8449', fontSize: 14 }}>
            Văn bản chưa bị thay đổi
          </div>
          <div style={{ fontSize: 12, color: '#27ae60', marginTop: 2 }}>
            Tất cả {signatures.length} chữ ký xác nhận nội dung toàn vẹn kể từ thời điểm ký.
          </div>
        </div>
      </div>
    );
  }

  if (
    lastSig.integrityStatus === 'DATA_ADDED_AFTER_SIGNING' ||
    lastSig.integrityStatus === 'INVALID_BYTE_RANGE'
  ) {
    return (
      <div
        style={{
          background: '#fdedec',
          border: '1px solid #e74c3c40',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 20 }}>⚠️</span>
        <div>
          <div style={{ fontWeight: 700, color: '#c0392b', fontSize: 14 }}>
            Văn bản có thể đã bị chỉnh sửa sau khi ký
          </div>
          <div style={{ fontSize: 12, color: '#e74c3c', marginTop: 2 }}>
            Phát hiện dữ liệu ngoài vùng được bảo vệ bởi chữ ký cuối. Cần kiểm tra lại tính xác thực.
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Modal chi tiết chữ ký ────────────────────────────────────────────────────

interface SignatureDetailModalProps {
  detail: DocumentSignatureItem;
  onClose: () => void;
}

function SignatureDetailModal({ detail, onClose }: SignatureDetailModalProps) {
  const badge = getStatusBadge(detail.integrityStatus);
  const isWord = detail.fileType === 'WORD';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 12,
          width: 560,
          maxWidth: '95vw',
          maxHeight: '88vh',
          overflow: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header modal */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            padding: '20px 24px',
            borderRadius: '12px 12px 0 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: 'white', fontSize: 16 }}>
              🔐 Chi tiết chữ ký số
            </h3>
            <p style={{ margin: '4px 0 0', color: '#8892b0', fontSize: 12 }}>
              Chữ ký #{detail.index + 1}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: 'white',
              width: 32,
              height: 32,
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Banner trạng thái toàn vẹn */}
          <div
            style={{
              background: badge.bg,
              border: `1px solid ${badge.color}40`,
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 20,
            }}
          >
            <div style={{ fontWeight: 700, color: badge.color, fontSize: 14 }}>
              {badge.icon} {badge.label}
            </div>
            <div style={{ fontSize: 12, color: '#636e72', marginTop: 4 }}>
              {detail.displayStatus}
            </div>
          </div>

          {/* Thông tin người ký */}
          <SectionTitle title="👤 Thông tin người ký" />
          <InfoTable
            rows={[
              ['Họ tên', detail.signerName || '—'],
              ['Tổ chức', detail.organization || '—'],
              ['Email', detail.email || '—'],
            ]}
          />

          {/* Thông tin chứng chỉ */}
          <SectionTitle title="🏛️ Thông tin chứng chỉ số" />
          <InfoTable
            rows={[
              ['Đơn vị cấp (Issuer)', detail.issuer || '—'],
              ['Số serial', detail.serialNumber || '—'],
            ]}
          />

          {/* Thông tin chữ ký */}
          <SectionTitle title="✍️ Thông tin chữ ký" />
          <InfoTable
            rows={[
              ['Loại bằng chứng', detail.evidenceType === 'CRYPTOGRAPHIC_SIGNATURE' ? '🔐 Chữ ký số mật mã' : detail.evidenceType ?? '—'],
              ['Loại file', detail.fileType],
              ['Định dạng chữ ký', detail.signatureFormat || '—'],
              ['Tên trường ký', detail.fieldName || '—'],
              ['Thời gian ký gốc', formatSigningTime(detail.signingTime)],
              ...(!isWord ? [['Thuật toán (SubFilter)', detail.subFilter || '—'] as [string, string]] : []),
            ]}
          />

          {/* Thời gian sửa đổi file — chỉ hiển khi có thờời gian ModDate */}
          {detail.fileModDate && (
            <div
              style={{
                background: '#fef5e7',
                border: '1px solid #e67e2260',
                borderRadius: 8,
                padding: '12px 14px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 20 }}>⏰</span>
              <div>
                <div style={{ fontWeight: 700, color: '#d35400', fontSize: 13, marginBottom: 4 }}>
                  File đã bị sửa sau khi ký
                </div>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <tbody>
                    <tr>
                      <td style={{ fontSize: 12, color: '#636e72', paddingRight: 16, paddingBottom: 4, whiteSpace: 'nowrap' }}>
                        🔐 Thời gian ký gốc
                      </td>
                      <td style={{ fontSize: 12, fontWeight: 600, color: '#27ae60' }}>
                        {formatSigningTime(detail.signingTime)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontSize: 12, color: '#636e72', paddingRight: 16, whiteSpace: 'nowrap' }}>
                        ⚠️ Thời gian sửa đổi file
                      </td>
                      <td style={{ fontSize: 12, fontWeight: 600, color: '#e67e22' }}>
                        {formatSigningTime(detail.fileModDate)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ fontSize: 11, color: '#95a5a6', marginTop: 6 }}>
                  /ModDate trong PDF cho thấy file đã được lưu lại sau thời điểm ký.
                </div>
              </div>
            </div>
          )}

          {/* Mức xác minh */}
          <div
            style={{
              background: '#f0f4ff',
              border: '1px solid #c5d3f5',
              borderRadius: 6,
              padding: '8px 12px',
              marginBottom: 16,
              fontSize: 11,
              color: '#3a57ab',
            }}
          >
            🔍 <strong>Mức xác minh:</strong> {detail.verificationLevel?.replace(/_/g, ' ')}
          </div>

          {/* Thông tin kỹ thuật PDF */}
          {!isWord && detail.byteRange && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#95a5a6',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: 6,
                }}
              >
                ByteRange (kỹ thuật)
              </div>
              <code
                style={{
                  fontSize: 11,
                  color: '#636e72',
                  background: '#f8f9fa',
                  padding: '6px 10px',
                  borderRadius: 4,
                  display: 'block',
                  border: '1px solid #dfe6e9',
                }}
              >
                [{detail.byteRange.join(', ')}]
              </code>
              <div style={{ fontSize: 11, color: '#636e72', marginTop: 6 }}>
                Cuối vùng ký: {detail.signedRevisionEnd} / Kích thước file: {detail.fileSize}
              </div>
            </div>
          )}

          {/* Thông tin kỹ thuật Word */}
          {isWord && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#95a5a6',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: 6,
                }}
              >
                Cấu trúc OOXML
              </div>
              <div style={{ fontSize: 12, color: '#636e72' }}>
                File XML chữ ký: <code>{detail.fieldName}</code>
              </div>
            </div>
          )}

          {/* Lưu ý */}
          <div
            style={{
              background: '#f8f9fa',
              borderRadius: 6,
              padding: '10px 14px',
              border: '1px solid #dfe6e9',
              marginTop: 8,
            }}
          >
            <p style={{ margin: 0, fontSize: 11, color: '#636e72', lineHeight: 1.5 }}>
              ⚠️ <strong>Lưu ý:</strong> {detail.warning}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components dùng chung ────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  return (
    <h4
      style={{
        margin: '0 0 10px',
        fontSize: 13,
        fontWeight: 700,
        color: '#2c3e50',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        borderBottom: '1px solid #ecf0f1',
        paddingBottom: 6,
      }}
    >
      {title}
    </h4>
  );
}

function InfoTable({ rows }: { rows: [string, string][] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td style={{ padding: '5px 0', color: '#636e72', width: 180, fontSize: 12, verticalAlign: 'top' }}>
              {label}
            </td>
            <td style={{ padding: '5px 0', fontSize: 13, color: '#2d3436', wordBreak: 'break-word', fontWeight: 500 }}>
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: '#95a5a6',
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

// ─── Panel trạng thái một chữ ký ─────────────────────────────────────────────

interface SignatureStatusPanelProps {
  sig: DocumentSignatureItem;
  documentId: number;
}

function SignatureStatusPanel({ sig, documentId }: SignatureStatusPanelProps) {
  const badge = getStatusBadge(sig.integrityStatus);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detail, setDetail] = useState<DocumentSignatureItem | null>(null);

  const handleOpenDetail = async () => {
    setLoadingDetail(true);
    try {
      const d = await getOutgoingSignatureDetail(documentId, sig.index);
      setDetail(d);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi khi tải chi tiết chữ ký');
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <>
      <div
        style={{
          border: '1px solid #dfe6e9',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'white',
          height: '100%',
        }}
      >
        {/* Header panel */}
        <div
          style={{
            background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 14 }}>🔐</span>
          <div>
            <div style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>
              Trạng thái chữ ký
            </div>
            <div style={{ color: '#bdc3c7', fontSize: 11 }}>
              Chữ ký #{sig.index + 1}
            </div>
          </div>
        </div>

        <div style={{ padding: '16px' }}>
          {/* Người ký */}
          <FieldBlock label="Người ký">
            <div style={{ fontSize: 14, fontWeight: 600, color: '#2d3436' }}>
              {sig.signerName || '—'}
            </div>
          </FieldBlock>

          {/* Thời gian ký */}
          <FieldBlock label="Thời gian ký">
            <div style={{ fontSize: 13, color: '#2d3436' }}>
              {formatSigningTime(sig.signingTime)}
            </div>
            {sig.fileModDate && (
              <div
                style={{
                  marginTop: 8,
                  background: '#fef5e7',
                  border: '1px solid #e67e2240',
                  borderRadius: 6,
                  padding: '8px 10px',
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: '#e67e22', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                  ⏰ File bị sửa sau khi ký
                </div>
                <div style={{ fontSize: 12, color: '#7d4e00', fontWeight: 500 }}>
                  {formatSigningTime(sig.fileModDate)}
                </div>
                <div style={{ fontSize: 11, color: '#95a5a6', marginTop: 3 }}>
                  /ModDate của PDF cho thấy file đã được lưu lại sau khi ký
                </div>
              </div>
            )}
          </FieldBlock>

          {/* Trạng thái */}
          <FieldBlock label="Trạng thái">
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: badge.color,
                background: badge.bg,
                padding: '5px 10px',
                borderRadius: 6,
                border: `1px solid ${badge.color}30`,
                marginBottom: 8,
              }}
            >
              {badge.icon} {badge.label}
            </div>

            <div style={{ fontSize: 12, color: '#636e72', lineHeight: 1.4 }}>
              {sig.displayStatus}
            </div>

            {sig.integrityStatus === 'SIGNATURE_STRUCTURE_FOUND' && (
              <div
                style={{
                  marginTop: 10,
                  background: '#f8f9fa',
                  border: '1px solid #dfe6e9',
                  borderRadius: 6,
                  padding: '10px 12px',
                  fontSize: 12,
                  color: '#636e72',
                  lineHeight: 1.5,
                }}
              >
                ℹ️ Xác minh toàn vẹn đầy đủ không được thực hiện với file Word.
              </div>
            )}
          </FieldBlock>

          {/* Nút xem chi tiết */}
          <button
            className="btn btn-primary"
            style={{ width: '100%', fontSize: 13, marginTop: 4 }}
            onClick={handleOpenDetail}
            disabled={loadingDetail}
          >
            {loadingDetail ? '⏳ Đang tải...' : '🔍 Xem chi tiết chữ ký'}
          </button>
        </div>
      </div>

      {/* Modal chi tiết */}
      {detail && (
        <SignatureDetailModal detail={detail} onClose={() => setDetail(null)} />
      )}
    </>
  );
}

// ─── SignaturePanel chính ─────────────────────────────────────────────────────

interface SignaturePanelProps {
  documentId: number;
  /** mimeType của file để kiểm tra hỗ trợ. Nếu null/undefined → coi là không hỗ trợ */
  mimeType?: string | null;
}

/**
 * UC-70 + UC-71 + UC-72: Danh sách chữ ký, trạng thái và chi tiết (PDF + Word).
 * Disable tự động nếu file không phải PDF hoặc Word.
 */
export default function SignaturePanel({ documentId, mimeType }: SignaturePanelProps) {
  const [signatures, setSignatures] = useState<DocumentSignatureItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSig, setActiveSig] = useState<DocumentSignatureItem | null>(null);
  const [summary, setSummary] = useState<DocumentSignatureSummary | null>(null);
  const [visualMarks, setVisualMarks] = useState<VisualMark[]>([]);
  const [responseWarning, setResponseWarning] = useState<string | null>(null);

  // Nếu file không phải PDF/Word → không tải dữ liệu
  const supported = isSupportedFileType(mimeType);

  const loadSignatures = async () => {
    if (!supported) return;
    setLoading(true);
    setError(null);
    setSignatures([]);
    setMessage(null);
    setActiveSig(null);
    setSummary(null);
    setVisualMarks([]);
    setResponseWarning(null);
    try {
      const result: DocumentSignatureResponse = await getOutgoingSignatures(documentId);
      setSignatures(result.signatures);
      setSummary(result.summary);
      setVisualMarks(result.visualMarks || []);
      setResponseWarning(result.warning);

      if (result.signatures.length > 0) {
        setActiveSig(result.signatures[0]);
        setMessage(
          `Tìm thấy ${result.signatureCount} chữ ký số mật mã trong tài liệu ${result.fileType}.`,
        );
      } else {
        setMessage('Không tìm thấy chữ ký số mật mã trong tài liệu này.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi khi tải danh sách chữ ký số');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSignatures();
  }, [documentId, supported]);

  // ── Trường hợp file không hỗ trợ ──────────────────────────────────────────
  if (!supported) {
    return (
      <div
        style={{
          background: '#f8f9fa',
          border: '1px solid #dfe6e9',
          borderRadius: 8,
          padding: '16px',
          textAlign: 'center',
          color: '#636e72',
          fontSize: 13,
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 8 }}>🚫</div>
        <div style={{ fontWeight: 600, marginBottom: 4, color: '#2d3436' }}>
          Không hỗ trợ định dạng này
        </div>
        <div style={{ fontSize: 12 }}>
          Chức năng kiểm tra chữ ký số chỉ hỗ trợ file <strong>PDF</strong> và <strong>Word (.docx)</strong>.
        </div>
        {mimeType && (
          <div style={{ fontSize: 11, color: '#95a5a6', marginTop: 6 }}>
            Định dạng hiện tại: <code>{mimeType}</code>
          </div>
        )}
      </div>
    );
  }

  // ── Render chính ──────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 15, color: '#2c3e50', display: 'flex', alignItems: 'center', gap: 6 }}>
          🔐 Chữ ký số
          {signatures.length > 0 && (
            <span
              style={{
                background: '#667eea',
                color: 'white',
                borderRadius: 12,
                padding: '2px 8px',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {signatures.length}
            </span>
          )}
        </h4>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={loadSignatures}
          disabled={loading}
        >
          {loading ? '⏳' : '🔄'} Tải lại
        </button>
      </div>

      {/* Lỗi */}
      {error && (
        <div
          style={{
            background: '#fdf0f0',
            border: '1px solid #fad2cf',
            borderRadius: 8,
            padding: '12px 14px',
            marginBottom: 12,
            fontSize: 13,
            color: '#c0392b',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Đang tải */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '24px', color: '#636e72', fontSize: 13 }}>
          ⏳ Đang phân tích cấu trúc chữ ký...
        </div>
      )}

      {/* Không có chữ ký */}
      {!loading && !error && signatures.length === 0 && message && (
        <div
          style={{
            background: '#f8f9fa',
            border: '1px solid #dfe6e9',
            borderRadius: 8,
            padding: '16px',
            textAlign: 'center',
            color: '#636e72',
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>📭 Không có chữ ký số</div>
          <div style={{ fontSize: 12 }}>{message}</div>
          <div
            style={{
              marginTop: 12,
              background: '#fef9e7',
              border: '1px solid #f39c1240',
              borderRadius: 6,
              padding: '10px 12px',
              textAlign: 'left',
              fontSize: 11,
              color: '#7d6608',
            }}
          >
            ⚠️ Tài liệu có thể chứa chữ ký/con dấu hình ảnh nhưng đây không phải chữ ký số mật mã và không thể xác minh bởi hệ thống.
          </div>
        </div>
      )}

      {/* Danh sách chữ ký + trạng thái */}
      {!loading && signatures.length > 0 && (
        <>
          {/* Banner tính toàn vẹn tổng thể */}
          <IntegrityBanner signatures={signatures} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: activeSig ? '1fr 1fr' : '1fr',
              gap: 12,
              alignItems: 'start',
            }}
          >
            {/* Cột trái: danh sách chữ ký */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {signatures.map((sig) => {
                const badge = getStatusBadge(sig.integrityStatus);
                const isActive = activeSig?.index === sig.index;
                return (
                  <div
                    key={sig.index}
                    onClick={() => setActiveSig(sig)}
                    style={{
                      border: `1px solid ${isActive ? '#667eea' : '#dfe6e9'}`,
                      borderRadius: 8,
                      padding: '12px 14px',
                      cursor: 'pointer',
                      background: isActive ? '#f0f2ff' : 'white',
                      boxShadow: isActive ? '0 0 0 2px #667eea25' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#2d3436', marginBottom: 2 }}>
                          Chữ ký {sig.index + 1}
                        </div>
                        <div style={{ fontSize: 13, color: '#2d3436', marginBottom: 4 }}>
                          Người ký: {sig.signerName || 'Không xác định'}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: badge.color,
                          background: badge.bg,
                          padding: '2px 8px',
                          borderRadius: 12,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {badge.icon} {badge.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#636e72', marginTop: 2 }}>
                      Thời gian: {formatSigningTime(sig.signingTime)}
                    </div>
                  </div>
                );
              })}

              {/* Tóm tắt loại bằng chứng */}
              {summary && (
                <div
                  style={{
                    background: summary.hasCryptographicSignature ? '#eafaf1' : '#fdf5e6',
                    border: `1px solid ${summary.hasCryptographicSignature ? '#27ae6040' : '#f39c1240'}`,
                    borderRadius: 6,
                    padding: '8px 12px',
                    marginBottom: 4,
                    fontSize: 12,
                    color: summary.hasCryptographicSignature ? '#1e8449' : '#7d6608',
                  }}
                >
                  {summary.hasCryptographicSignature ? '🔐' : '⚠️'}{' '}
                  <strong>Loại bằng chứng:</strong> Chữ ký số mật mã{' '}
                  ({summary.cryptographicSignatureCount} tìm thấy)
                </div>
              )}

              {responseWarning && (
                <div style={{ fontSize: 10, color: '#95a5a6', marginTop: 4, lineHeight: 1.4 }}>
                  ⚠️ {responseWarning}
                </div>
              )}

              {/* Thông báo dấu mộc hình ảnh */}
              {visualMarks.length > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    background: '#fef9e7',
                    border: '1px solid #f39c1240',
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontSize: 11,
                    color: '#7d6608',
                    lineHeight: 1.5,
                  }}
                >
                  ⚠️ {visualMarks[0].message}
                </div>
              )}
            </div>

            {/* Cột phải: panel trạng thái */}
            {activeSig && (
              <SignatureStatusPanel sig={activeSig} documentId={documentId} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
