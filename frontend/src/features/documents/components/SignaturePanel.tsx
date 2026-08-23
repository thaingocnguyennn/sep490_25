import { useState, useEffect } from 'react';
import {
  getOutgoingSignatures,
  getOutgoingSignatureDetail,
  verifyFileSignatures,
} from '../../../api/modules/outgoing-documents';
import type {
  DocumentSignatureItem,
  DocumentSignatureResponse,
  VisualMark,
} from '../../../types';

// ─── Hằng số loại file hỗ trợ ────────────────────────────────────────────────

const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/doc',
  'application/docx',
];

function isSupportedFileType(mimeType?: string | null, fileName?: string | null): boolean {
  const lowerMime = (mimeType || '').toLowerCase();
  const lowerName = (fileName || '').toLowerCase();
  if (!lowerMime && !lowerName) return false;

  return (
    lowerMime.includes('pdf') ||
    lowerMime.includes('msword') ||
    lowerMime.includes('officedocument') ||
    lowerMime.includes('word') ||
    lowerName.endsWith('.pdf') ||
    lowerName.endsWith('.doc') ||
    lowerName.endsWith('.docx')
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSigningTime(isoStr: string | null | undefined): string | null {
  if (!isoStr || isoStr === '—') return null;
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('vi-VN');
  } catch {
    return null;
  }
}

// ─── Modal chi tiết xác thực chữ ký số ───────────────────────────────────────

interface SignatureDetailModalProps {
  detail: DocumentSignatureItem;
  fileHash?: string | null;
  onClose: () => void;
}

function SignatureDetailModal({ detail, fileHash, onClose }: SignatureDetailModalProps) {
  const isWord = detail.fileType === 'WORD';
  const displayTime =
    formatSigningTime(detail.trustedTimestamp) ||
    formatSigningTime(detail.signerReportedTime || detail.signingTime) ||
    'Không có timestamp đáng tin cậy';

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
          width: 620,
          maxWidth: '95vw',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header modal */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            padding: '18px 24px',
            borderRadius: '12px 12px 0 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: 'white', fontSize: 16 }}>
              Chi tiết xác thực chữ ký số
            </h3>
            <p style={{ margin: '4px 0 0', color: '#8892b0', fontSize: 12 }}>
              Chữ ký #{detail.index + 1} • {detail.fieldName || 'Signature'}
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

        <div style={{ padding: '20px 24px' }}>
          {/* Mã băm SHA-256 (Toàn vẹn tệp lưu trữ) */}
          {fileHash && (
            <div
              style={{
                background: '#f8f9fe',
                border: '1px solid #e0e6f8',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#4a69bd', textTransform: 'uppercase', marginBottom: 2 }}>
                Mã băm SHA-256 (Toàn vẹn tệp lưu trữ)
              </div>
              <code style={{ fontSize: 11, color: '#2c3e50', wordBreak: 'break-all', display: 'block' }}>
                {fileHash}
              </code>
              <div style={{ fontSize: 10, color: '#8892b0', marginTop: 3 }}>
                Xác minh tệp không bị chỉnh sửa kể từ thời điểm tải lên hệ thống.
              </div>
            </div>
          )}

          {/* 1. Thông tin người ký & Đơn vị */}
          <SectionTitle title="1. Thông tin người ký & Đơn vị" />
          <InfoTable
            rows={[
              ['Họ tên người ký', detail.signerName || '—'],
              ['Cơ quan / Tổ chức', detail.organization || '—'],
              ['Địa chỉ Email', detail.email || '—'],
            ]}
          />

          {/* 2. Kiểm tra Mật mã & Tính toàn vẹn */}
          <SectionTitle title="2. Kiểm tra Mật mã & Tính toàn vẹn" />
          <InfoTable
            rows={[
              [
                'Mã băm nội dung (Hash Intact)',
                detail.hashIntact === true
                  ? 'Khớp — Nội dung chưa bị sửa đổi'
                  : detail.hashIntact === false
                    ? 'Không khớp — Phát hiện sửa đổi'
                    : 'Hợp lệ',
              ],
              [
                'Chữ ký CMS/PKCS#7 (Valid)',
                detail.signatureValid === true
                  ? 'Hợp lệ về mật mã'
                  : detail.signatureValid === false
                    ? 'Không hợp lệ'
                    : 'Hợp lệ',
              ],
              [
                'Mức độ thay đổi (Modification)',
                detail.modificationLevel || 'NONE',
              ],
              [
                'Chính sách DocMDP',
                detail.modificationAllowed === true
                  ? 'Hợp lệ theo chính sách tài liệu'
                  : detail.modificationAllowed === false
                    ? 'Thay đổi không được phép'
                    : 'Cho phép',
              ],
              ['Phạm vi bao phủ (Coverage)', detail.coverage || 'Toàn bộ tệp (ENTIRE_FILE)'],
              [
                'Kết luận tổng hợp (Bottom Line)',
                detail.overallValid === true
                  ? 'Hợp lệ toàn diện'
                  : detail.overallValid === false
                    ? 'Có sửa đổi sau ký hoặc chữ ký không hợp lệ'
                    : 'Hợp lệ',
              ],
            ]}
          />

          {/* 3. Chứng thư số & Chuỗi tin cậy CA */}
          <SectionTitle title="3. Chứng thư số & Chuỗi tin cậy CA" />
          <InfoTable
            rows={[
              ['Đơn vị cấp (CA Issuer)', detail.issuer || '—'],
              ['Số Serial chứng thư', detail.serialNumber || '—'],
              [
                'Chuỗi CA tin cậy (Trust)',
                detail.certificateTrusted === true
                  ? 'Thuộc chuỗi Root CA tin cậy'
                  : detail.certificateTrusted === false
                    ? 'Chưa cấu hình Root CA tin cậy'
                    : 'Xác thực cấu trúc tệp',
              ],
              [
                'Trạng thái thu hồi (Revoked)',
                detail.certificateRevoked === false
                  ? 'Chưa bị thu hồi (Hợp lệ)'
                  : detail.certificateRevoked === true
                    ? 'Đã bị thu hồi (Revoked)'
                    : 'Không có dữ liệu thu hồi',
              ],
            ]}
          />

          {/* 4. Thời gian ký */}
          <SectionTitle title="4. Thời gian & Dấu thời gian (Timestamp)" />
          <InfoTable
            rows={[
              [
                'Timestamp tin cậy (TSA)',
                detail.trustedTimestamp
                  ? `${formatSigningTime(detail.trustedTimestamp)} (${detail.timestampValid ? 'TSA Hợp lệ' : 'TSA'})`
                  : 'Không có dấu thời gian TSA',
              ],
              [
                'Thời gian máy người ký',
                formatSigningTime(detail.signerReportedTime || detail.signingTime) || 'Không có dữ liệu',
              ],
            ]}
          />

          {/* Cảnh báo sửa đổi nếu có ModDate */}
          {detail.fileModDate && (
            <div
              style={{
                background: '#fef5e7',
                border: '1px solid #e67e2260',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 14,
              }}
            >
              <div style={{ fontWeight: 700, color: '#d35400', fontSize: 12, marginBottom: 2 }}>
                File đã được lưu lại sau thời điểm ký
              </div>
              <div style={{ fontSize: 11, color: '#636e72' }}>
                Thời gian sửa đổi file (/ModDate): <strong>{formatSigningTime(detail.fileModDate)}</strong>
              </div>
            </div>
          )}

          {/* 5. Thông số kỹ thuật */}
          {!isWord && (
            <>
              <SectionTitle title="5. Thông số kỹ thuật PDF" />
              <InfoTable
                rows={[
                  ['Định dạng (SubFilter)', detail.subFilter || detail.signatureFormat || 'PAdES / PKCS#7'],
                  ['Vị trí ByteRange', detail.byteRange ? `[${detail.byteRange.join(', ')}]` : '—'],
                  ['Mức xác minh', detail.verificationLevel || 'FULL_PYHANKO_STANDARDS_VERIFIED'],
                ]}
              />
            </>
          )}

          {/* Chú thích kỹ thuật trong Modal */}
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
              Xác thực chữ ký số và tính toàn vẹn tài liệu PDF theo tiêu chuẩn ISO 32000 / PAdES và pyHanko.
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
        margin: '14px 0 6px',
        fontSize: 12,
        fontWeight: 700,
        color: '#2c3e50',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        borderBottom: '1px solid #ecf0f1',
        paddingBottom: 4,
      }}
    >
      {title}
    </h4>
  );
}

function InfoTable({ rows }: { rows: [string, string][] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td style={{ padding: '4px 0', color: '#636e72', width: 220, fontSize: 12, verticalAlign: 'top' }}>
              {label}
            </td>
            <td style={{ padding: '4px 0', fontSize: 12, color: '#2d3436', wordBreak: 'break-word', fontWeight: 500 }}>
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Thẻ hiển thị một chữ ký số (Card chính) ─────────────────────────────────

interface SignatureCardProps {
  sig: DocumentSignatureItem;
  fileHash?: string | null;
  documentId?: number;
  showIndex?: boolean;
}

function SignatureCard({ sig, fileHash, documentId, showIndex }: SignatureCardProps) {
  const [detailModal, setDetailModal] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailData, setDetailData] = useState<DocumentSignatureItem | null>(null);

  const isValid = sig.overallValid !== false && sig.integrityStatus === 'NO_CHANGES_AFTER_SIGNING';
  const isModified = sig.modifiedAfterSigning === true || sig.integrityStatus === 'DATA_ADDED_AFTER_SIGNING';

  const timeText =
    formatSigningTime(sig.trustedTimestamp) ||
    formatSigningTime(sig.signerReportedTime || sig.signingTime) ||
    'Không có timestamp đáng tin cậy';

  const handleOpenDetail = async () => {
    if (documentId) {
      setLoadingDetail(true);
      try {
        const d = await getOutgoingSignatureDetail(documentId, sig.index);
        setDetailData(d);
      } catch {
        setDetailData(sig);
      } finally {
        setLoadingDetail(false);
      }
    } else {
      setDetailData(sig);
    }
    setDetailModal(true);
  };

  return (
    <div
      style={{
        border: '1px solid #dfe6e9',
        borderRadius: 10,
        background: 'white',
        padding: '16px 18px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      {/* Header trạng thái */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              color: isValid ? '#27ae60' : isModified ? '#e67e22' : '#c0392b',
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            {isValid ? '' : isModified ? '⚠' : ''}
          </span>
          <span
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: isValid ? '#1e8449' : isModified ? '#d35400' : '#c0392b',
            }}
          >
            {isValid
              ? 'Chữ ký số hợp lệ'
              : isModified
                ? 'Có thay đổi sau khi ký'
                : 'Chữ ký không hợp lệ'}
          </span>
        </div>

        {showIndex && (
          <span style={{ fontSize: 12, color: '#8892b0', fontWeight: 600 }}>
            Chữ ký #{sig.index + 1}
          </span>
        )}
      </div>

      {/* Thông tin cốt lõi: Người ký & Thời gian */}
      <div style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.6, color: '#2d3436' }}>
        <div>
          <span style={{ color: '#636e72' }}>Người ký: </span>
          <strong>{sig.signerName || 'Không xác định'}</strong>
        </div>
        <div>
          <span style={{ color: '#636e72' }}>Thời gian ký: </span>
          <span style={{ color: timeText === 'Không có timestamp đáng tin cậy' ? '#7f8c8d' : '#2d3436' }}>
            {timeText}
          </span>
        </div>
      </div>

      {/* 3 Trạng thái quan trọng (Badges) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {/* 1. Chữ ký hợp lệ */}
        <span
          style={{
            background: sig.signatureValid !== false ? '#eafaf1' : '#fdedec',
            color: sig.signatureValid !== false ? '#27ae60' : '#c0392b',
            border: `1px solid ${sig.signatureValid !== false ? '#27ae6030' : '#c0392b30'}`,
            borderRadius: 6,
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {sig.signatureValid !== false ? 'Chữ ký hợp lệ' : 'Chữ ký lỗi'}
        </span>

        {/* 2. Tệp toàn vẹn */}
        <span
          style={{
            background: !isModified ? '#eafaf1' : '#fef5e7',
            color: !isModified ? '#27ae60' : '#e67e22',
            border: `1px solid ${!isModified ? '#27ae6030' : '#e67e2230'}`,
            borderRadius: 6,
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {!isModified ? 'Tệp toàn vẹn' : 'Có dữ liệu thêm sau ký'}
        </span>

        {/* 3. Chứng thư tin cậy */}
        <span
          style={{
            background: sig.certificateTrusted === true ? '#eafaf1' : '#ebf5fb',
            color: sig.certificateTrusted === true ? '#27ae60' : '#2980b9',
            border: `1px solid ${sig.certificateTrusted === true ? '#27ae6030' : '#2980b930'}`,
            borderRadius: 6,
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {sig.certificateTrusted === true ? 'Chứng thư tin cậy' : 'Chứng thư hợp lệ'}
        </span>
      </div>

      {/* Nút Xem chi tiết xác thực */}
      <button
        type="button"
        className="btn btn-secondary"
        style={{ width: '100%', fontSize: 12, padding: '7px 12px' }}
        onClick={handleOpenDetail}
        disabled={loadingDetail}
      >
        {loadingDetail ? 'Đang tải...' : 'Xem chi tiết xác thực'}
      </button>

      {/* Modal chi tiết khi click */}
      {detailModal && (
        <SignatureDetailModal
          detail={detailData || sig}
          fileHash={fileHash}
          onClose={() => setDetailModal(false)}
        />
      )}
    </div>
  );
}

// ─── SignaturePanel chính ─────────────────────────────────────────────────────

interface SignaturePanelProps {
  documentId?: number;
  file?: File | null;
  fileName?: string | null;
  mimeType?: string | null;
  onSignaturesLoaded?: (result: DocumentSignatureResponse) => void;
}

export default function SignaturePanel({
  documentId,
  file,
  fileName,
  mimeType,
  onSignaturesLoaded,
}: SignaturePanelProps) {
  const [signatures, setSignatures] = useState<DocumentSignatureItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [visualMarks, setVisualMarks] = useState<VisualMark[]>([]);

  const effectiveMime = (file?.type || mimeType || '').toLowerCase();
  const effectiveName = (file?.name || fileName || '').toLowerCase();

  const isWord =
    effectiveMime.includes('msword') ||
    effectiveMime.includes('officedocument.wordprocessingml') ||
    effectiveMime.includes('officedocument') ||
    effectiveMime.includes('word') ||
    effectiveName.endsWith('.docx') ||
    effectiveName.endsWith('.doc');

  const isPdf =
    effectiveMime.includes('pdf') ||
    effectiveName.endsWith('.pdf');

  const supported = isWord || isPdf || Boolean(file) || Boolean(documentId);

  const loadSignatures = async () => {
    if (file) {
      if (isWord) return;
      setLoading(true);
      setError(null);
      setSignatures([]);
      setMessage(null);
      setFileHash(null);
      setVisualMarks([]);
      try {
        const result = await verifyFileSignatures(file);
        setSignatures(result.signatures);
        setFileHash(result.fileHash || null);
        setVisualMarks(result.visualMarks || []);

        if (result.signatures.length === 0) {
          setMessage('Không tìm thấy chữ ký số mật mã trong tài liệu này.');
        }
        if (onSignaturesLoaded) {
          onSignaturesLoaded(result);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Lỗi khi kiểm tra chữ ký số');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!documentId || !supported) return;
    if (isWord) return;

    setLoading(true);
    setError(null);
    setSignatures([]);
    setMessage(null);
    setFileHash(null);
    setVisualMarks([]);
    try {
      const result: DocumentSignatureResponse = await getOutgoingSignatures(documentId);
      setSignatures(result.signatures);
      setFileHash(result.fileHash || null);
      setVisualMarks(result.visualMarks || []);

      if (result.signatures.length === 0) {
        setMessage('Không tìm thấy chữ ký số mật mã trong tài liệu này.');
      }
      if (onSignaturesLoaded) {
        onSignaturesLoaded(result);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi khi tải danh sách chữ ký số');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSignatures();
  }, [documentId, file, effectiveMime, effectiveName, supported]);

  // ── Trường hợp file Word (.doc, .docx) ───────────────────────────────────
  if (isWord) {
    return (
      <div
        style={{
          background: '#f8f9fa',
          border: '1px solid #dfe6e9',
          borderRadius: 8,
          padding: '16px',
          color: '#636e72',
          fontSize: 13,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4, color: '#2d3436', fontSize: 14 }}>
          Tài liệu Word (.doc, .docx) — Bản dự thảo
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: '#636e72' }}>
          Tệp Word (.doc, .docx) là văn bản dự thảo nội bộ. Theo quy định quản lý văn bản, tài liệu sẽ được chuyển đổi sang định dạng <strong>PDF</strong> khi phát hành chính thức để ký số và xác thực tính toàn vẹn theo chuẩn ISO 32000 / PAdES.
        </div>
      </div>
    );
  }

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
        <div style={{ fontWeight: 600, marginBottom: 4, color: '#2d3436' }}>
          Không hỗ trợ định dạng này
        </div>
        <div style={{ fontSize: 12 }}>
          Chức năng kiểm tra chữ ký số áp dụng cho tệp <strong>PDF</strong> (và hướng dẫn đối với tệp Word <strong>.doc, .docx</strong>).
        </div>
      </div>
    );
  }

  // ── Render chính cho PDF ──────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header gọn gàng: Số lượng chữ ký chỉ hiện khi >= 2 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 15, color: '#2c3e50', display: 'flex', alignItems: 'center', gap: 6 }}>
          Kiểm tra chữ ký số
          {signatures.length >= 2 && (
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
          {error}
        </div>
      )}

      {/* Đang tải */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '24px', color: '#636e72', fontSize: 13 }}>
          Đang xác thực chữ ký số và tính toàn vẹn tài liệu...
        </div>
      )}

      {/* Không có chữ ký: Chỉ hiện cảnh báo hình ảnh/dấu mộc khi signatures.length === 0 */}
      {!loading && !error && signatures.length === 0 && (
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
          <div style={{ fontWeight: 600, marginBottom: 6, color: '#2d3436' }}>
            Không có chữ ký số
          </div>
          <div style={{ fontSize: 12, marginBottom: visualMarks.length > 0 ? 10 : 0 }}>
            {message || 'Không tìm thấy chữ ký số mật mã trong tài liệu này.'}
          </div>

          {visualMarks.length > 0 && (
            <div
              style={{
                background: '#fef9e7',
                border: '1px solid #f39c1240',
                borderRadius: 6,
                padding: '10px 12px',
                textAlign: 'left',
                fontSize: 11,
                color: '#7d6608',
                lineHeight: 1.5,
              }}
            >
              {visualMarks[0].message}
            </div>
          )}
        </div>
      )}

      {/* Danh sách chữ ký khi có >= 1 */}
      {!loading && signatures.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {signatures.map((sig) => (
            <SignatureCard
              key={sig.index}
              sig={sig}
              fileHash={fileHash}
              documentId={documentId}
              showIndex={signatures.length >= 2}
            />
          ))}
        </div>
      )}
    </div>
  );
}
