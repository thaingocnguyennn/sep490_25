import fs from 'fs';
import path from 'path';


export interface SignatureVerificationResult {
  hasSignature: boolean;
  signatureCount: number;
  isModifiedAfterSigning: boolean | null;
  integrityStatus: 'NO_SIGNATURE' | 'VALID_OR_NOT_MODIFIED' | 'MODIFIED_AFTER_SIGNING' | 'UNKNOWN';
  checkedBy: 'BYTE_RANGE_BASIC';
  message: string;
}

// ─── UC-70: Danh sách chữ ký số ──────────────────────────────────────────────

/**
 * Kết quả của từng chữ ký số trong file PDF.
 * validityStatus không bao giờ khẳng định VALID tuyệt đối vì chưa xác thực CA.
 */
export interface PdfSignatureItem {
  index: number;
  signerName: string | null;
  organization: string | null;
  certificateIssuer: string | null;
  signingTime: string | null;
  certificateValidFrom: string | null;
  certificateValidTo: string | null;
  isModifiedAfterSigning: boolean | null;
  integrityStatus:
    | 'VALID_OR_NOT_MODIFIED'
    | 'MODIFIED_AFTER_SIGNING'
    | 'NO_SIGNATURE'
    | 'UNKNOWN';
  validityStatus: 'VALID' | 'INVALID' | 'MODIFIED_AFTER_SIGNING' | 'UNKNOWN';
  signatureOrder: number;
}

// ─── Helpers trích xuất metadata từ nội dung PDF ─────────────────────────────

function extractStringField(
  content: string,
  pattern: RegExp,
  contextStart: number,
  windowSize = 8192,
): string | null {
  const searchWindow = content.substring(
    Math.max(0, contextStart - windowSize),
    contextStart + windowSize,
  );
  const match = searchWindow.match(pattern);
  return match ? match[1]?.trim() || null : null;
}

function extractSignerName(content: string, pos: number): string | null {
  const nameMatch = extractStringField(content, /\/Name\s*\(([^)]{1,200})\)/, pos);
  if (nameMatch) return nameMatch;
  const cnMatch = extractStringField(content, /CN=([^,/\r\n]{1,100})/, pos);
  return cnMatch || null;
}

function extractOrganization(content: string, pos: number): string | null {
  return extractStringField(content, /\/O=([^,/\r\n]{1,100})/, pos);
}

function extractIssuer(content: string, pos: number): string | null {
  const issuerCn = extractStringField(content, /Issuer[^,\n]*CN=([^,/\r\n]{1,100})/, pos);
  if (issuerCn) return issuerCn;
  return extractStringField(content, /\/Issuer\s*\(([^)]{1,200})\)/, pos);
}

function extractSigningTime(content: string, pos: number): string | null {
  const raw =
    extractStringField(content, /\/M\s*\(\s*(D:\d{14}[^)]*)\)/, pos) ||
    extractStringField(content, /\/SigningTime\s*\(\s*(D:\d{14}[^)]*)\)/, pos);
  if (!raw) return null;
  const y = raw.substring(2, 6);
  const mo = raw.substring(6, 8);
  const d = raw.substring(8, 10);
  const h = raw.substring(10, 12);
  const mi = raw.substring(12, 14);
  const s = raw.substring(14, 16);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

// ─── UC-70: Parse danh sách chữ ký ───────────────────────────────────────────

/**
 * Trích xuất danh sách chữ ký số từ buffer PDF dựa trên cấu trúc /ByteRange.
 * Đây là bước kiểm tra cấu trúc cơ bản, KHÔNG xác thực chứng thư CA.
 */
export function extractPdfSignatures(buffer: Buffer): PdfSignatureItem[] {
  const content = buffer.toString('latin1');
  const byteRangeRegex = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  const matches = [...content.matchAll(byteRangeRegex)];

  if (matches.length === 0) return [];

  return matches.map((match, index) => {
    const byteRange: [number, number, number, number] = [
      Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]),
    ];
    const contextPos = match.index ?? 0;
    const isLast = index === matches.length - 1;
    const endOfSigned = byteRange[2] + byteRange[3];
    const isModifiedAfterSigning = isLast
      ? Math.abs(endOfSigned - buffer.length) > 1024
      : null;

    const integrityStatus = isLast
      ? (isModifiedAfterSigning ? 'MODIFIED_AFTER_SIGNING' : 'VALID_OR_NOT_MODIFIED')
      : 'UNKNOWN';

    const validityStatus = isLast && isModifiedAfterSigning
      ? 'MODIFIED_AFTER_SIGNING'
      : 'UNKNOWN';

    return {
      index,
      signerName: extractSignerName(content, contextPos),
      organization: extractOrganization(content, contextPos),
      certificateIssuer: extractIssuer(content, contextPos),
      signingTime: extractSigningTime(content, contextPos),
      certificateValidFrom: null,
      certificateValidTo: null,
      isModifiedAfterSigning,
      integrityStatus,
      validityStatus,
      signatureOrder: index + 1,
    };
  });
}

// ─── Legacy: giữ lại để không break code cũ ──────────────────────────────────

/**
 * Kiểm tra xem tệp PDF có chứa chữ ký số và có dấu hiệu bị sửa đổi hay không.
 * Đây là bước kiểm tra cấu trúc cơ bản, KHÔNG xác thực chứng thư số CA.
 */
export function checkPdfSignature(filePath: string): SignatureVerificationResult {
  if (!fs.existsSync(filePath)) {
    throw new Error('File PDF không tồn tại');
  }

  const buffer = fs.readFileSync(filePath);
  const content = buffer.toString('latin1');

  const byteRangeRegex = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  const contentsRegex = /\/Contents/g;

  let match;
  const signatures = [];
  while ((match = byteRangeRegex.exec(content)) !== null) {
    signatures.push({
      a: parseInt(match[1], 10),
      b: parseInt(match[2], 10),
      c: parseInt(match[3], 10),
      d: parseInt(match[4], 10),
    });
  }

  const hasContents = contentsRegex.test(content);

  if (signatures.length === 0) {
    return {
      hasSignature: false,
      signatureCount: 0,
      isModifiedAfterSigning: null,
      integrityStatus: 'NO_SIGNATURE',
      checkedBy: 'BYTE_RANGE_BASIC',
      message: 'No digital signature structure was found in this PDF.',
    };
  }

  if (!hasContents) {
    return {
      hasSignature: true,
      signatureCount: signatures.length,
      isModifiedAfterSigning: null,
      integrityStatus: 'UNKNOWN',
      checkedBy: 'BYTE_RANGE_BASIC',
      message: 'Found /ByteRange but missing /Contents. Signature structure is unknown or invalid.',
    };
  }

  const lastSig = signatures[signatures.length - 1];
  const tolerance = 1024;
  const signatureEndPosition = lastSig.c + lastSig.d;
  const diff = Math.abs(buffer.length - signatureEndPosition);
  const isModifiedAfterSigning = diff > tolerance;

  if (isModifiedAfterSigning) {
    return {
      hasSignature: true,
      signatureCount: signatures.length,
      isModifiedAfterSigning: true,
      integrityStatus: 'MODIFIED_AFTER_SIGNING',
      checkedBy: 'BYTE_RANGE_BASIC',
      message: 'The PDF contains a digital signature but modification was detected after the last signature.',
    };
  }

  return {
    hasSignature: true,
    signatureCount: signatures.length,
    isModifiedAfterSigning: false,
    integrityStatus: 'VALID_OR_NOT_MODIFIED',
    checkedBy: 'BYTE_RANGE_BASIC',
    message: 'The PDF contains a digital signature and no obvious modification was detected after the last signature.',
  };
}

// ─── UC-70: Word Document Signature Support ───────────────────────────────────

/**
 * Các định dạng file được hỗ trợ kiểm tra chữ ký số.
 */
export const SUPPORTED_SIGNATURE_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.pptx'];
export const SUPPORTED_SIGNATURE_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

/**
 * Kiểm tra xem file có phải định dạng hỗ trợ kiểm tra chữ ký không.
 */
export function isSupportedSignatureFile(filePath: string, mimeType = ''): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return (
    SUPPORTED_SIGNATURE_EXTENSIONS.includes(ext) ||
    SUPPORTED_SIGNATURE_MIMES.includes(mimeType)
  );
}

/**
 * UC-70: Trích xuất danh sách chữ ký số từ file Word/Excel/PowerPoint (OOXML).
 *
 * File .docx, .xlsx, .pptx là các ZIP archive chứa XML bên trong.
 * Chữ ký số được lưu trong thư mục `_xmlsignatures/` (OOXML Digital Signatures).
 * Em quét raw bytes của file ZIP để tìm marker `_xmlsignatures/sig` mà không cần
 * giải nén toàn bộ file (tiết kiệm bộ nhớ).
 *
 * Lưu ý: Không thể xác thực tính toàn vẹn (ByteRange) như PDF.
 * Chỉ phát hiện sự tồn tại của chữ ký và metadata cơ bản từ tên entry ZIP.
 */
export function extractWordSignatures(buffer: Buffer): PdfSignatureItem[] {
  // File OOXML bắt đầu bằng ZIP magic bytes: PK (0x50 0x4B)
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
    return [];
  }

  const content = buffer.toString('binary');

  // Tìm tất cả các entry có tên bắt đầu bằng '_xmlsignatures/sig'
  // ZIP Local File Header: PK\x03\x04 + 26 bytes header + filename
  const zipLocalHeader = /PK\x03\x04[\s\S]{26}(_xmlsignatures\/[^\x00]+)/g;
  const sigEntries: string[] = [];

  let match;
  while ((match = zipLocalHeader.exec(content)) !== null) {
    sigEntries.push(match[1]);
  }

  if (sigEntries.length === 0) return [];

  // Tìm CN= trong nội dung file để lấy tên người ký (nếu có thể đọc được)
  const signerCnMatch = content.match(/CN=([^,/\r\n<"]{1,100})/);
  const signerName = signerCnMatch ? signerCnMatch[1].trim() : null;

  const orgMatch = content.match(/O=([^,/\r\n<"]{1,100})/);
  const organization = orgMatch ? orgMatch[1].trim() : null;

  return sigEntries.map((entryName, index) => ({
    index,
    signerName,
    organization,
    certificateIssuer: null,
    signingTime: null,
    certificateValidFrom: null,
    certificateValidTo: null,
    isModifiedAfterSigning: null, // Không thể xác định với OOXML basic
    integrityStatus: 'UNKNOWN' as const,
    validityStatus: 'UNKNOWN' as const,
    signatureOrder: index + 1,
  }));
}

/**
 * UC-70: Dispatcher tự động — phát hiện loại file và gọi hàm phù hợp.
 * Hỗ trợ: PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx).
 */
export function extractSignaturesFromFile(
  buffer: Buffer,
  filePath: string,
  mimeType = '',
): PdfSignatureItem[] {
  const ext = path.extname(filePath).toLowerCase();
  const isPdf = ext === '.pdf' || mimeType === 'application/pdf';
  const isOoxml =
    ['.docx', '.xlsx', '.pptx'].includes(ext) ||
    SUPPORTED_SIGNATURE_MIMES.slice(1).includes(mimeType);

  if (isPdf) {
    return extractPdfSignatures(buffer);
  }

  if (isOoxml) {
    return extractWordSignatures(buffer);
  }

  return [];
}
