import { useState, useEffect } from 'react';
import { getOutgoingSignatures } from '../../../api/modules/outgoing-documents';
import type { PdfSignatureItem } from '../../../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── SignaturePanel ───────────────────────────────────────────────────────────

interface SignaturePanelProps {
  documentId: number;
}

/**
 * UC-70: Hiển thị danh sách chữ ký số trong file PDF.
 * Kết quả dựa trên phân tích cấu trúc /ByteRange, chưa xác thực CA.
 */
export default function SignaturePanel({ documentId }: SignaturePanelProps) {
  const [signatures, setSignatures] = useState<PdfSignatureItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSignatures = async () => {
    setLoading(true);
    setError(null);
    setSignatures([]);
    setMessage(null);
    try {
      const result = await getOutgoingSignatures(documentId);
      setSignatures(result.signatures);
      setMessage(result.message);
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 15, color: '#2c3e50', display: 'flex', alignItems: 'center', gap: 6 }}>
          🔐 Digital Signatures
          {signatures.length > 0 && (
            <span style={{
              background: '#667eea', color: 'white', borderRadius: 12,
              padding: '2px 8px', fontSize: 12, fontWeight: 600,
            }}>
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
        <div style={{
          background: '#fdf0f0', border: '1px solid #fad2cf',
          borderRadius: 8, padding: '12px 14px', marginBottom: 12,
          fontSize: 13, color: '#c0392b',
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '24px', color: '#636e72', fontSize: 13 }}>
          ⏳ Đang phân tích chữ ký số trong PDF...
        </div>
      )}

      {/* No signatures */}
      {!loading && !error && signatures.length === 0 && message && (
        <div style={{
          background: '#f8f9fa', border: '1px solid #dfe6e9',
          borderRadius: 8, padding: '16px', textAlign: 'center',
          color: '#636e72', fontSize: 13,
        }}>
          📭 {message}
        </div>
      )}

      {/* UC-70: Signature list */}
      {!loading && signatures.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {signatures.map((sig) => {
            const badge = getStatusBadge(sig.integrityStatus);
            return (
              <div
                key={sig.index}
                style={{
                  border: '1px solid #dfe6e9', borderRadius: 8,
                  padding: '12px 14px', background: 'white',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#2d3436', marginBottom: 2 }}>
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
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: badge.color,
                    background: badge.bg, padding: '2px 8px', borderRadius: 12,
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {badge.icon} {badge.label}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#636e72', marginTop: 6 }}>
                  🕒 Signing time: {formatSigningTime(sig.signingTime)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CA Disclaimer */}
      {!loading && signatures.length > 0 && (
        <div style={{
          marginTop: 12, background: '#f8f9fa', borderRadius: 6,
          padding: '8px 12px', border: '1px solid #dfe6e9',
        }}>
          <p style={{ margin: 0, fontSize: 11, color: '#636e72', lineHeight: 1.5 }}>
            ℹ️ Kết quả này dựa trên kiểm tra cấu trúc chữ ký PDF ở mức cơ bản, chưa xác thực chứng thư số với nhà cung cấp CA.
          </p>
        </div>
      )}
    </div>
  );
}
