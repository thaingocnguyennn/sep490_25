import { useState, useEffect } from 'react';
import { getOutgoingSignatures } from '../../../api/modules/outgoing-documents';
import type { PdfSignatureItem } from '../../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSigningTime(isoStr: string | null): string {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleString('vi-VN');
  } catch {
    return isoStr;
  }
}

function getStatusBadge(status: PdfSignatureItem['integrityStatus']) {
  switch (status) {
    case 'VALID_OR_NOT_MODIFIED':
      return { label: 'Không bị chỉnh sửa', color: '#27ae60', bg: '#eafaf1', icon: '✅' };
    case 'MODIFIED_AFTER_SIGNING':
      return { label: 'Đã bị chỉnh sửa sau khi ký', color: '#c0392b', bg: '#fdedec', icon: '⚠️' };
    default:
      return { label: 'Không xác định', color: '#7f8c8d', bg: '#f4f6f7', icon: '❓' };
  }
}

// ─── UC-71: Signature Status Panel ───────────────────────────────────────────

interface SignatureStatusPanelProps {
  sig: PdfSignatureItem;
}

/**
 * UC-71: Hiển thị trạng thái chi tiết của một chữ ký đã chọn.
 * Gồm: người ký, thời gian ký, và trạng thái toàn vẹn tài liệu sau khi ký.
 */
function SignatureStatusPanel({ sig }: SignatureStatusPanelProps) {
  const badge = getStatusBadge(sig.integrityStatus);

  return (
    <div
      style={{
        border: '1px solid #dfe6e9',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'white',
        height: '100%',
      }}
    >
      {/* Panel header */}
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
            Signature Status
          </div>
          <div style={{ color: '#bdc3c7', fontSize: 11 }}>
            Signature #{sig.signatureOrder}
          </div>
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {/* Signed by */}
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
            Signed by
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#2d3436' }}>
            {sig.signerName || '—'}
          </div>
          {sig.organization && (
            <div style={{ fontSize: 12, color: '#636e72', marginTop: 2 }}>
              {sig.organization}
            </div>
          )}
          {sig.certificateIssuer && (
            <div style={{ fontSize: 11, color: '#95a5a6', marginTop: 2 }}>
              Issued by: {sig.certificateIssuer}
            </div>
          )}
        </div>

        {/* Signing time (UC-71) */}
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
            Signing time
          </div>
          <div style={{ fontSize: 13, color: '#2d3436' }}>
            {formatSigningTime(sig.signingTime)}
          </div>
        </div>

        {/* Document modification status after signing (UC-71) */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#95a5a6',
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              marginBottom: 6,
            }}
          >
            Document modification status after signing
          </div>

          {/* Integrity badge */}
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
            }}
          >
            {badge.icon} {badge.label}
          </div>

          {/* Warning box nếu bị chỉnh sửa */}
          {sig.integrityStatus === 'MODIFIED_AFTER_SIGNING' && (
            <div
              style={{
                marginTop: 10,
                background: '#fef9e7',
                border: '1px solid #f39c12',
                borderRadius: 6,
                padding: '10px 12px',
                fontSize: 12,
                color: '#7d6608',
                lineHeight: 1.5,
              }}
            >
              ⚠️ <strong>Cảnh báo:</strong> Tài liệu có thể đã bị thay đổi sau khi chữ
              ký này được áp dụng. Chữ ký không còn đảm bảo tính toàn vẹn của toàn bộ
              nội dung.
            </div>
          )}

          {/* Info box nếu là UNKNOWN (chữ ký trung gian) */}
          {sig.integrityStatus === 'UNKNOWN' && (
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
              ℹ️ Đây là chữ ký trung gian. Trạng thái toàn vẹn chỉ có thể xác định
              cho chữ ký cuối cùng.
            </div>
          )}

          {/* Info box nếu không bị sửa */}
          {sig.integrityStatus === 'VALID_OR_NOT_MODIFIED' && (
            <div
              style={{
                marginTop: 10,
                background: '#eafaf1',
                border: '1px solid #27ae6030',
                borderRadius: 6,
                padding: '10px 12px',
                fontSize: 12,
                color: '#1e8449',
                lineHeight: 1.5,
              }}
            >
              ✅ Không phát hiện chỉnh sửa tài liệu sau khi ký (dựa trên cấu trúc
              ByteRange).
            </div>
          )}
        </div>

        {/* CA disclaimer */}
        <div
          style={{
            background: '#f8f9fa',
            borderRadius: 6,
            padding: '8px 10px',
            border: '1px solid #dfe6e9',
          }}
        >
          <p style={{ margin: 0, fontSize: 10, color: '#95a5a6', lineHeight: 1.5 }}>
            Kết quả dựa trên kiểm tra cấu trúc ByteRange, chưa xác thực chứng thư số
            với nhà cung cấp CA.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── SignaturePanel ───────────────────────────────────────────────────────────

interface SignaturePanelProps {
  documentId: number;
}

/**
 * UC-70 + UC-71: Hiển thị danh sách chữ ký số và trạng thái toàn vẹn.
 * Click vào một chữ ký để xem Signature Status Panel bên phải.
 */
export default function SignaturePanel({ documentId }: SignaturePanelProps) {
  const [signatures, setSignatures] = useState<PdfSignatureItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSig, setActiveSig] = useState<PdfSignatureItem | null>(null);

  const loadSignatures = async () => {
    setLoading(true);
    setError(null);
    setSignatures([]);
    setMessage(null);
    setActiveSig(null);
    try {
      const result = await getOutgoingSignatures(documentId);
      setSignatures(result.signatures);
      setMessage(result.message);
      // Tự động chọn chữ ký đầu tiên nếu có
      if (result.signatures.length > 0) {
        setActiveSig(result.signatures[0]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi khi tải danh sách chữ ký số');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSignatures();
  }, [documentId]);

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <h4
          style={{
            margin: 0,
            fontSize: 15,
            color: '#2c3e50',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          🔐 Digital Signatures
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

      {/* Error */}
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

      {/* Loading */}
      {loading && (
        <div
          style={{ textAlign: 'center', padding: '24px', color: '#636e72', fontSize: 13 }}
        >
          ⏳ Đang phân tích chữ ký số...
        </div>
      )}

      {/* No signatures */}
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
          📭 {message}
        </div>
      )}

      {/* UC-70 + UC-71: 2-column layout */}
      {!loading && signatures.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: activeSig ? '1fr 1fr' : '1fr',
            gap: 12,
            alignItems: 'start',
          }}
        >
          {/* Left: Signature list (UC-70) */}
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
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{ fontWeight: 600, fontSize: 14, color: '#2d3436', marginBottom: 2 }}
                      >
                        #{sig.signatureOrder} {sig.signerName || 'Unknown signer'}
                      </div>
                      {sig.organization && (
                        <div style={{ fontSize: 12, color: '#636e72' }}>{sig.organization}</div>
                      )}
                      {sig.certificateIssuer && (
                        <div style={{ fontSize: 12, color: '#636e72' }}>
                          Issuer: {sig.certificateIssuer}
                        </div>
                      )}
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
                  <div style={{ fontSize: 12, color: '#636e72', marginTop: 6 }}>
                    🕒 {formatSigningTime(sig.signingTime)}
                  </div>
                  {isActive && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        color: '#667eea',
                        fontWeight: 500,
                      }}
                    >
                      ← Đang xem trạng thái
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right: Signature Status Panel (UC-71) */}
          {activeSig && <SignatureStatusPanel sig={activeSig} />}
        </div>
      )}
    </div>
  );
}
