import { useState, useEffect } from 'react';
import {
  getOutgoingSignatures,
  getOutgoingSignatureDetail,
} from '../../../api/modules/outgoing-documents';
import type { PdfSignatureItem, PdfSignatureDetail } from '../../../types';

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

// ─── UC-72: Signature Detail Modal ───────────────────────────────────────────

interface SignatureDetailModalProps {
  detail: PdfSignatureDetail;
  onClose: () => void;
}

function SignatureDetailModal({ detail, onClose }: SignatureDetailModalProps) {
  const badge = getStatusBadge(detail.integrityStatus);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 12,
          width: 560, maxWidth: '95vw', maxHeight: '88vh',
          overflow: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
        }}
      >
        {/* Modal header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            padding: '20px 24px',
            borderRadius: '12px 12px 0 0',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: 'white', fontSize: 16 }}>
              🔐 Signature Details
            </h3>
            <p style={{ margin: '4px 0 0', color: '#8892b0', fontSize: 12 }}>
              Signature #{detail.signatureOrder}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
              width: 32, height: 32, borderRadius: 6, cursor: 'pointer',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Integrity status banner */}
          <div
            style={{
              background: badge.bg, border: `1px solid ${badge.color}40`,
              borderRadius: 8, padding: '12px 16px', marginBottom: 20,
            }}
          >
            <div style={{ fontWeight: 700, color: badge.color, fontSize: 14 }}>
              {badge.icon} {badge.label}
            </div>
            <div style={{ fontSize: 12, color: '#636e72', marginTop: 4 }}>
              {detail.message}
            </div>
          </div>

          {/* Section: Signer */}
          <SectionTitle title="👤 Signer" />
          <InfoTable
            rows={[
              ['Name', detail.signerName || '—'],
              ['Organization', detail.organization || '—'],
            ]}
          />

          {/* Section: Certificate */}
          <SectionTitle title="🏛️ Certificate" />
          <InfoTable
            rows={[
              ['Issuer', detail.certificateIssuer || '—'],
              ['Valid from', detail.certificateValidFrom ? formatSigningTime(detail.certificateValidFrom) : '—'],
              ['Valid to', detail.certificateValidTo ? formatSigningTime(detail.certificateValidTo) : '—'],
              ['Serial number', detail.certificateSerialNumber || '—'],
              ['Subject', detail.certificateSubject || '—'],
            ]}
          />

          {/* Section: Signing info */}
          <SectionTitle title="✍️ Signing" />
          <InfoTable
            rows={[
              ['Signing time', formatSigningTime(detail.signingTime)],
              ['Algorithm', detail.signatureAlgorithm || '—'],
            ]}
          />

          {/* Document modification status after signing */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#636e72', padding: '6px 0', width: 160, display: 'inline-block' }}>
              Document modified after signing
            </div>
            <span style={{ fontSize: 13 }}>
              {detail.isModifiedAfterSigning === true ? (
                <span style={{ color: '#c0392b', fontWeight: 600 }}>
                  ⚠️ Yes — document may have been changed
                </span>
              ) : detail.isModifiedAfterSigning === false ? (
                <span style={{ color: '#27ae60', fontWeight: 600 }}>✅ No</span>
              ) : (
                <span style={{ color: '#7f8c8d' }}>— (intermediate signature)</span>
              )}
            </span>
          </div>

          {/* ByteRange (technical) */}
          {detail.byteRange && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11, fontWeight: 700, color: '#95a5a6',
                  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6,
                }}
              >
                ByteRange (technical)
              </div>
              <code
                style={{
                  fontSize: 11, color: '#636e72',
                  background: '#f8f9fa', padding: '6px 10px',
                  borderRadius: 4, display: 'block',
                  border: '1px solid #dfe6e9',
                }}
              >
                [{detail.byteRange.join(', ')}]
              </code>
            </div>
          )}

          {/* CA disclaimer */}
          <div
            style={{
              background: '#f8f9fa', borderRadius: 6, padding: '10px 14px',
              border: '1px solid #dfe6e9',
            }}
          >
            <p style={{ margin: 0, fontSize: 11, color: '#636e72', lineHeight: 1.5 }}>
              ⚠️ <strong>Lưu ý:</strong> Kết quả này dựa trên kiểm tra cấu trúc ByteRange,
              chưa xác thực chứng thư số với nhà cung cấp CA.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper sub-components
function SectionTitle({ title }: { title: string }) {
  return (
    <h4
      style={{
        margin: '0 0 10px', fontSize: 13, fontWeight: 700,
        color: '#2c3e50', textTransform: 'uppercase', letterSpacing: '0.5px',
        borderBottom: '1px solid #ecf0f1', paddingBottom: 6,
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
            <td style={{ padding: '5px 0', color: '#636e72', width: 160, fontSize: 12 }}>
              {label}
            </td>
            <td style={{ padding: '5px 0', fontSize: 13, color: '#2d3436', wordBreak: 'break-all' }}>
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── UC-71: Signature Status Panel ───────────────────────────────────────────

interface SignatureStatusPanelProps {
  sig: PdfSignatureItem;
  documentId: number;
}

function SignatureStatusPanel({ sig, documentId }: SignatureStatusPanelProps) {
  const badge = getStatusBadge(sig.integrityStatus);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detail, setDetail] = useState<PdfSignatureDetail | null>(null);

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
          border: '1px solid #dfe6e9', borderRadius: 8,
          overflow: 'hidden', background: 'white', height: '100%',
        }}
      >
        {/* Panel header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
            padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
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
          <FieldBlock label="Signed by">
            <div style={{ fontSize: 14, fontWeight: 600, color: '#2d3436' }}>
              {sig.signerName || '—'}
            </div>
            {sig.organization && (
              <div style={{ fontSize: 12, color: '#636e72', marginTop: 2 }}>{sig.organization}</div>
            )}
            {sig.certificateIssuer && (
              <div style={{ fontSize: 11, color: '#95a5a6', marginTop: 2 }}>
                Issued by: {sig.certificateIssuer}
              </div>
            )}
          </FieldBlock>

          {/* Signing time */}
          <FieldBlock label="Signing time">
            <div style={{ fontSize: 13, color: '#2d3436' }}>
              {formatSigningTime(sig.signingTime)}
            </div>
          </FieldBlock>

          {/* Document modification status after signing */}
          <FieldBlock label="Document modification status after signing">
            <div
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 600, color: badge.color,
                background: badge.bg, padding: '5px 10px',
                borderRadius: 6, border: `1px solid ${badge.color}30`,
              }}
            >
              {badge.icon} {badge.label}
            </div>

            {sig.integrityStatus === 'MODIFIED_AFTER_SIGNING' && (
              <div
                style={{
                  marginTop: 10, background: '#fef9e7', border: '1px solid #f39c12',
                  borderRadius: 6, padding: '10px 12px', fontSize: 12,
                  color: '#7d6608', lineHeight: 1.5,
                }}
              >
                ⚠️ <strong>Cảnh báo:</strong> Tài liệu có thể đã bị thay đổi sau khi
                chữ ký này được áp dụng.
              </div>
            )}
            {sig.integrityStatus === 'UNKNOWN' && (
              <div
                style={{
                  marginTop: 10, background: '#f8f9fa', border: '1px solid #dfe6e9',
                  borderRadius: 6, padding: '10px 12px', fontSize: 12,
                  color: '#636e72', lineHeight: 1.5,
                }}
              >
                ℹ️ Đây là chữ ký trung gian. Trạng thái toàn vẹn chỉ xác định cho
                chữ ký cuối.
              </div>
            )}
            {sig.integrityStatus === 'VALID_OR_NOT_MODIFIED' && (
              <div
                style={{
                  marginTop: 10, background: '#eafaf1', border: '1px solid #27ae6030',
                  borderRadius: 6, padding: '10px 12px', fontSize: 12,
                  color: '#1e8449', lineHeight: 1.5,
                }}
              >
                ✅ Không phát hiện chỉnh sửa sau khi ký (dựa trên ByteRange).
              </div>
            )}
          </FieldBlock>

          {/* UC-72: View Detail button */}
          <button
            className="btn btn-primary"
            style={{ width: '100%', fontSize: 13, marginTop: 4 }}
            onClick={handleOpenDetail}
            disabled={loadingDetail}
          >
            {loadingDetail ? '⏳ Đang tải...' : '🔍 Xem Signature Details'}
          </button>

          {/* CA disclaimer */}
          <div
            style={{
              marginTop: 12, background: '#f8f9fa', borderRadius: 6,
              padding: '8px 10px', border: '1px solid #dfe6e9',
            }}
          >
            <p style={{ margin: 0, fontSize: 10, color: '#95a5a6', lineHeight: 1.5 }}>
              Kết quả dựa trên ByteRange, chưa xác thực CA.
            </p>
          </div>
        </div>
      </div>

      {/* UC-72: Detail Modal */}
      {detail && (
        <SignatureDetailModal detail={detail} onClose={() => setDetail(null)} />
      )}
    </>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 10, fontWeight: 700, color: '#95a5a6',
          textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

// ─── SignaturePanel ───────────────────────────────────────────────────────────

interface SignaturePanelProps {
  documentId: number;
}

/**
 * UC-70 + UC-71 + UC-72: Danh sách chữ ký, trạng thái, và chi tiết.
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 15, color: '#2c3e50', display: 'flex', alignItems: 'center', gap: 6 }}>
          🔐 Digital Signatures
          {signatures.length > 0 && (
            <span style={{ background: '#667eea', color: 'white', borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
              {signatures.length}
            </span>
          )}
        </h4>
        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={loadSignatures} disabled={loading}>
          {loading ? '⏳' : '🔄'} Tải lại
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fdf0f0', border: '1px solid #fad2cf', borderRadius: 8, padding: '12px 14px', marginBottom: 12, fontSize: 13, color: '#c0392b' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '24px', color: '#636e72', fontSize: 13 }}>
          ⏳ Đang phân tích chữ ký số...
        </div>
      )}

      {/* No signatures */}
      {!loading && !error && signatures.length === 0 && message && (
        <div style={{ background: '#f8f9fa', border: '1px solid #dfe6e9', borderRadius: 8, padding: '16px', textAlign: 'center', color: '#636e72', fontSize: 13 }}>
          📭 {message}
        </div>
      )}

      {/* UC-70 + UC-71 + UC-72: 2-column layout */}
      {!loading && signatures.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: activeSig ? '1fr 1fr' : '1fr', gap: 12, alignItems: 'start' }}>
          {/* Left: Signature list */}
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
                    borderRadius: 8, padding: '12px 14px', cursor: 'pointer',
                    background: isActive ? '#f0f2ff' : 'white',
                    boxShadow: isActive ? '0 0 0 2px #667eea25' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#2d3436', marginBottom: 2 }}>
                        #{sig.signatureOrder} {sig.signerName || 'Unknown signer'}
                      </div>
                      {sig.organization && <div style={{ fontSize: 12, color: '#636e72' }}>{sig.organization}</div>}
                      {sig.certificateIssuer && <div style={{ fontSize: 12, color: '#636e72' }}>Issuer: {sig.certificateIssuer}</div>}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: badge.color, background: badge.bg, padding: '2px 8px', borderRadius: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {badge.icon} {badge.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#636e72', marginTop: 6 }}>
                    🕒 {formatSigningTime(sig.signingTime)}
                  </div>
                  {isActive && <div style={{ marginTop: 6, fontSize: 11, color: '#667eea', fontWeight: 500 }}>← Đang xem trạng thái</div>}
                </div>
              );
            })}
          </div>

          {/* Right: Status + Detail button */}
          {activeSig && <SignatureStatusPanel sig={activeSig} documentId={documentId} />}
        </div>
      )}
    </div>
  );
}
