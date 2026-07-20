import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// ─── UC-57/70/71/72: Types chung cho PDF và Word ─────────────────────────────

export type SignatureFileType = 'PDF' | 'WORD';

/**
 * UC-57: Loại bằng chứng chữ ký.
 * CRYPTOGRAPHIC_SIGNATURE = chữ ký số thật nhúng trong cấu trúc file.
 * VISIBLE_SIGNATURE_OR_STAMP = hình ảnh/dấu mộc trong trang, không có giá trị mật mã.
 */
export type SignatureEvidenceType =
  | 'CRYPTOGRAPHIC_SIGNATURE'
  | 'VISIBLE_SIGNATURE_OR_STAMP'
  | 'UNKNOWN';

/**
 * Mức độ xác minh mà hệ thống thực hiện được.
 * Không thực hiện full CA/PKI validation.
 */
export type SignatureVerificationLevel =
  | 'BASIC_STRUCTURE_ONLY'
  | 'BASIC_STRUCTURE_AND_CERTIFICATE_EXTRACTION'
  | 'SIGNED_RANGE_CHECK'
  | 'XML_SIGNATURE_STRUCTURE_DETECTED'
  | 'VISUAL_ONLY_NOT_VERIFIED'
  | 'FULL_CA_PKI_VALIDATION_NOT_PERFORMED';

export type SignatureIntegrityStatus =
  | 'NO_CHANGES_AFTER_SIGNING'       // Chữ ký cuối, không có dữ liệu thêm sau vùng ký
  | 'DATA_ADDED_AFTER_SIGNING'        // Có dữ liệu sau vùng ký (chữ ký trung gian hoặc bị thêm nội dung)
  | 'INVALID_BYTE_RANGE'              // ByteRange vượt quá kích thước file — cấu trúc không hợp lệ
  | 'SIGNATURE_STRUCTURE_FOUND'       // Word: phát hiện cấu trúc chữ ký XML
  | 'UNSUPPORTED_INTEGRITY_CHECK'     // Loại file không hỗ trợ
  | 'NO_CRYPTOGRAPHIC_SIGNATURE_FOUND'// Không có chữ ký số
  | 'UNKNOWN';

/**
 * UC-57/70/71/72: Thông tin của một chữ ký số trong file.
 */
export interface DocumentSignatureItem {
  index: number;
  fileType: SignatureFileType;
  /** Loại bằng chứng chữ ký (mật mã hay hình ảnh/dấu mộc). */
  evidenceType: SignatureEvidenceType;
  /** Mức độ xác minh mà hệ thống đã thực hiện. */
  verificationLevel: SignatureVerificationLevel;
  /** Định dạng chữ ký (SubFilter PDF hoặc XML DSig Word). */
  signatureFormat: string | null;
  fieldName?: string | null;
  signerName?: string | null;
  organization?: string | null;
  email?: string | null;
  issuer?: string | null;
  serialNumber?: string | null;
  signingTime?: string | null;
  /** PDF-only: SubFilter value (adbe.pkcs7.detached, ETSI.CAdES.detached, ...). */
  subFilter?: string | null;
  /** PDF-only: ByteRange [a, b, c, d]. */
  byteRange?: [number, number, number, number] | null;
  /** PDF-only: c + d, vị trí kết thúc vùng được ký. */
  signedRevisionEnd?: number | null;
  fileSize?: number | null;
  hasChangesAfterSigning?: boolean | null;
  integrityStatus: SignatureIntegrityStatus;
  displayStatus: string;
  warning: string;
  /**
   * Thời gian lần sửa đổi cuối cùng của file PDF (từ /ModDate trong trailer).
   * null nếu không tìm thấy hoặc không parse được.
   * Kết hợp với signingTime để hiển thị "thời gian ký gốc" vs "thời gian bị sửa".
   */
  fileModDate?: string | null;
}

/**
 * Tóm tắt kết quả kiểm tra chữ ký cho toàn bộ tài liệu.
 */
export interface DocumentSignatureSummary {
  hasCryptographicSignature: boolean;
  cryptographicSignatureCount: number;
  /** null = không phân tích hình ảnh (ngoài phạm vi hệ thống). */
  hasVisualSignatureAppearance: null;
  conclusion:
    | 'CRYPTOGRAPHIC_SIGNATURE_FOUND'
    | 'NO_CRYPTOGRAPHIC_SIGNATURE_FOUND'
    | 'UNSUPPORTED_FILE_TYPE';
}

/**
 * Thông tin về dấu mộc/chữ ký hình ảnh trong trang (Visual Mark).
 * Hệ thống không xác minh đây là chữ ký số.
 */
export interface VisualMark {
  type: 'VISIBLE_SIGNATURE_OR_STAMP';
  status: 'NOT_VERIFIED';
  message: string;
}

export interface DocumentSignatureResponse {
  documentId: number;
  fileName: string;
  fileType: SignatureFileType;
  signatureCount: number;
  summary: DocumentSignatureSummary;
  signatures: DocumentSignatureItem[];
  /** Thông báo về dấu mộc/chữ ký hình ảnh (không phải chữ ký số). */
  visualMarks: VisualMark[];
  warning: string;
}

// ─── Legacy interface giữ cho backward-compat ─────────────────────────────────

/** @deprecated Dùng DocumentSignatureItem thay thế */
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

/** @deprecated Dùng DocumentSignatureItem thay thế */
export interface PdfSignatureDetail extends PdfSignatureItem {
  certificateSerialNumber: string | null;
  certificateSubject: string | null;
  signatureAlgorithm: string | null;
  byteRange: [number, number, number, number] | null;
  message: string;
}

/** @deprecated Dùng DocumentSignatureResponse thay thế */
export interface SignatureVerificationResult {
  hasSignature: boolean;
  signatureCount: number;
  isModifiedAfterSigning: boolean | null;
  integrityStatus: 'NO_SIGNATURE' | 'VALID_OR_NOT_MODIFIED' | 'MODIFIED_AFTER_SIGNING' | 'UNKNOWN';
  checkedBy: 'BYTE_RANGE_BASIC';
  message: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const SUPPORTED_SIGNATURE_EXTENSIONS = ['.pdf', '.docx', '.docm', '.xlsx', '.pptx'];
export const SUPPORTED_SIGNATURE_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

export const SIGNATURE_WARNING =
  'This result is based on basic document signature structure analysis and does not verify the certificate with a trusted Certificate Authority.';

export const WORD_INTEGRITY_WARNING =
  'Word signature structure detected. Full document integrity verification is not performed.';

export function isSupportedSignatureFile(filePath: string, mimeType = ''): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return (
    SUPPORTED_SIGNATURE_EXTENSIONS.includes(ext) ||
    SUPPORTED_SIGNATURE_MIMES.includes(mimeType)
  );
}

// ─── Phase 3: PDF Helpers ─────────────────────────────────────────────────────

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

function extractSignerName(content: string, pos: number, der: Buffer | null): string | null {
  // 1. Thử /Name trước (trường metadata do phần mềm ghi)
  const nameMatch = extractStringField(content, /\/Name\s*\(([^)]{1,200})\)/, pos);
  if (nameMatch && isValidPersonName(nameMatch) && !isCAName(nameMatch)) return nameMatch;

  // 2. Fallback: parse ASN.1 từ /Contents hex — đọc trực tiếp từ certificate nhúng trong PDF
  // (Ưu tiên phương pháp này hơn text regex vì nó chính xác hơn nếu có DER)
  const derCN = extractCNFromDER(der);
  if (derCN) return derCN;

  // 3. Fallback: CN= trong text content gần ByteRange
  const cnMatch = extractStringField(content, /CN=([^,/\r\n<"]{1,100})/, pos);
  if (cnMatch && isValidPersonName(cnMatch) && !isCAName(cnMatch)) return cnMatch;

  return null;
}

/**
 * Kiểm tra xem chuỗi có phải tên người thật không.
 * Lọc ra các false positive: version number, hex string, số thuần túy.
 */
function isValidPersonName(value: string): boolean {
  if (!value || value.trim().length < 2) return false;

  const trimmed = value.trim();

  // Lọc version number dạng X.Y.Z (e.g. 4.1.6, 1.0.0)
  if (/^\d+(\.\d+){1,4}$/.test(trimmed)) return false;

  // Lọc chuỗi toàn số
  if (/^\d+$/.test(trimmed)) return false;

  // Lọc hex string dài (thường xuất hiện trong /Contents)
  if (/^[0-9a-fA-F]{16,}$/.test(trimmed)) return false;

  // Lọc chuỗi quá ngắn (1 ký tự) hoặc chỉ ký tự đặc biệt
  if (/^[^a-zA-ZÀ-ỹ]+$/.test(trimmed)) return false;

  return true;
}

/**
 * Kiểm tra xem tên có phải là tên CA/Issuer không (không phải người ký thật).
 * Dùng để loại CA name khỏi kết quả extractCNFromContents.
 */
function isCAName(name: string): boolean {
  const upper = name.toUpperCase();
  return (
    upper.includes(' CA') ||
    upper.includes('CERTIFICATION AUTHORITY') ||
    upper.includes('CERTIFICATE AUTHORITY') ||
    upper.includes('NATIONAL ROOT') ||
    upper.includes('ROOT CA') ||
    upper.includes('TRUST CA') ||
    upper.includes('INTERMEDIATE') ||
    /^[A-Z\s]+CA$/.test(upper.trim())
  );
}

/**
 * Phương án tốt nhất trong phạm vi đồ án (không dùng thư viện ngoài):
 * Giải mã hex trong /Contents thành DER buffer, sau đó quét ASN.1 OID của CommonName.
 *
 * Trong một X.509 certificate DER:
 *   - Cấu trúc TBSCertificate: version, serial, alg, ISSUER, validity, SUBJECT, ...
 *   - Issuer DN đến TRƯỜC Subject DN trong DER encoding
 *   - Vậy: CN đầu tiên = Issuer CN (tên CA), CN thứ 2 = Subject CN (người ký)
 *
 * Giải pháp: thu thập tất cả CN, bỏ qua các cái có dấu hiệu CA.
 */
function extractCNFromDER(der: Buffer | null): string | null {
  if (!der) return null;
  try {
    // Thu thập TẤT CẢ giá trị CN trong DER blob
    const allCNs: string[] = [];
    for (let i = 0; i < der.length - 8; i++) {
      if (der[i] === 0x55 && der[i + 1] === 0x04 && der[i + 2] === 0x03) {
        for (let j = i + 3; j < Math.min(i + 12, der.length - 2); j++) {
          const tag = der[j];
          if (tag === 0x0C || tag === 0x13 || tag === 0x16 || tag === 0x14) {
            const len = der[j + 1];
            if (len >= 2 && len <= 128 && j + 2 + len <= der.length) {
              const name = der.slice(j + 2, j + 2 + len).toString('utf8').trim();
              if (isValidPersonName(name)) allCNs.push(name);
            }
            break;
          } else if (tag === 0x1e) {
            const len = der[j + 1];
            if (len >= 4 && len <= 256 && j + 2 + len <= der.length) {
              const bmpBytes = der.slice(j + 2, j + 2 + len);
              const swapped = Buffer.alloc(bmpBytes.length);
              for (let k = 0; k < bmpBytes.length - 1; k += 2) {
                swapped[k] = bmpBytes[k + 1];
                swapped[k + 1] = bmpBytes[k];
              }
              const name = swapped.toString('utf16le').trim();
              if (isValidPersonName(name)) allCNs.push(name);
            }
            break;
          }
        }
      }
    }

    if (allCNs.length === 0) return null;

    // Ưu tiên: tìm CN không phải CA name — đó là Subject CN của người ký thật
    const signerCN = allCNs.find(cn => !isCAName(cn));
    if (signerCN) return signerCN;

    // Fallback: nếu tất cả đều có vẻ CA (hiếm), trả về cái đầu tiên
    return allCNs[0];
  } catch {
    return null;
  }
}

/**
 * Tương tự extractCNFromDER nhưng lấy OID Organization (2.5.4.10 = 55 04 0A).
 * Ưu tiên lấy Org không phải CA.
 */
function extractOrgFromDER(der: Buffer | null): string | null {
  if (!der) return null;
  try {
    const allOrgs: string[] = [];

    // OID Organization: 55 04 0A
    for (let i = 0; i < der.length - 8; i++) {
      if (der[i] === 0x55 && der[i + 1] === 0x04 && der[i + 2] === 0x0a) {
        for (let j = i + 3; j < Math.min(i + 12, der.length - 2); j++) {
          const tag = der[j];
          if (tag === 0x0C || tag === 0x13 || tag === 0x16 || tag === 0x14) {
            const len = der[j + 1];
            if (len >= 2 && len <= 200 && j + 2 + len <= der.length) {
              const org = der.slice(j + 2, j + 2 + len).toString('utf8').trim();
              if (org.length >= 2) allOrgs.push(org);
            }
            break;
          }
        }
      }
    }

    if (allOrgs.length === 0) return null;
    // Trả về Org không phải CA name
    return allOrgs.find(o => !isCAName(o)) ?? allOrgs[0];
  } catch {
    return null;
  }
}

function extractOrganization(content: string, pos: number, der: Buffer | null): string | null {
  const orgInParens = extractStringField(content, /\/O\s*=\s*([^,/\r\n<"]{1,100})/, pos);
  if (orgInParens && orgInParens.length >= 2 && !isCAName(orgInParens)) return orgInParens;

  const derOrg = extractOrgFromDER(der);
  if (derOrg) return derOrg;

  const orgMatch = extractStringField(content, /O=([^,/\r\n<"]{1,100})/, pos);
  if (orgMatch && orgMatch.length >= 2 && !isCAName(orgMatch)) return orgMatch;

  return null;
}

function extractEmail(content: string, pos: number): string | null {
  return extractStringField(content, /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/, pos);
}

function extractIssuer(content: string, pos: number): string | null {
  const issuerCn = extractStringField(content, /Issuer[^,\n]*CN=([^,/\r\n]{1,100})/, pos);
  if (issuerCn) return issuerCn;
  return extractStringField(content, /\/Issuer\s*\(([^)]{1,200})\)/, pos);
}

function extractSerialNumber(content: string, pos: number): string | null {
  return extractStringField(content, /\/SerialNumber\s*\(([^)]{1,100})\)/, pos);
}

function extractSubFilter(content: string, pos: number): string | null {
  return extractStringField(content, /\/SubFilter\s*\/([^\s/\]>]{1,50})/, pos);
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

// ─── Phase 3: PDF Signature Extraction ───────────────────────────────────────

/**
 * Trích xuất /ModDate từ trailer dictionary của PDF.
 * /ModDate ghi lại lần cuối file PDF được lưu/sửa đổi.
 * Trả về chuỗi ISO-8601 hoặc null nếu không tìm thấy.
 */
function extractPdfModDate(content: string): string | null {
  // /ModDate nằm trong Info dictionary, thường ở cuối file gần %%EOF
  // Tìm từ cuối file ngược lên để tìm nhanh hơn
  const searchFrom = Math.max(0, content.length - 65536); // tìm trong 64KB cuối
  const window = content.substring(searchFrom);
  const match = window.match(
    /\/ModDate\s*\(\s*(D:\d{14}[^)]*)\)/,
  );
  if (!match) return null;
  const raw = match[1];
  if (!raw || raw.length < 16) return null;
  try {
    const y  = raw.substring(2, 6);
    const mo = raw.substring(6, 8);
    const d  = raw.substring(8, 10);
    const h  = raw.substring(10, 12);
    const mi = raw.substring(12, 14);
    const s  = raw.substring(14, 16);
    return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  } catch {
    return null;
  }
}

/**
 * UC-70/71: Trích xuất danh sách chữ ký số từ PDF theo /ByteRange.
 * Kiểm tra integrity bằng cách so sánh vị trí kết thúc ByteRange với fileSize.
 */
export function extractPdfSignatures(buffer: Buffer): DocumentSignatureItem[] {
  const content = buffer.toString('latin1');
  const fileSize = buffer.length;
  const byteRangeRegex = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  const matches = [...content.matchAll(byteRangeRegex)];

  // Trích xuất ModDate của toàn bộ file một lần để dùng chung
  const fileModDate = extractPdfModDate(content);

  if (matches.length === 0) return [];

  return matches.map((match, index) => {
    const byteRange: [number, number, number, number] = [
      Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]),
    ];
    const contextPos = match.index ?? 0;
    const isLast = index === matches.length - 1;

    // Vị trí kết thúc vùng được ký
    const signedRevisionEnd = byteRange[2] + byteRange[3];
    const tolerance = 1024;

    let hasChangesAfterSigning: boolean | null = null;
    let integrityStatus: SignatureIntegrityStatus = 'UNKNOWN';
    let displayStatus: string;

    // 1. Kiểm tra ByteRange có hợp lệ không (không vượt quá kích thước file)
    const byteRangeExceedsFile = signedRevisionEnd > fileSize + 1024;
    const byteRangeInvalid =
      byteRange[0] < 0 || byteRange[1] <= 0 || byteRange[2] <= 0 || byteRange[3] <= 0 ||
      byteRange[2] < byteRange[1] ||  // c phải > b
      byteRangeExceedsFile;

    if (byteRangeInvalid) {
      // ByteRange có giá trị bất hợp lệ
      integrityStatus = 'INVALID_BYTE_RANGE';
      displayStatus = 'Invalid ByteRange structure. Unable to verify this signature.';
      hasChangesAfterSigning = null;
    } else if (isLast) {
      // Chữ ký cuối: so sánh vùng được ký với toàn bộ file
      const diff = Math.abs(fileSize - signedRevisionEnd);
      hasChangesAfterSigning = diff > tolerance;

      if (hasChangesAfterSigning) {
        integrityStatus = 'DATA_ADDED_AFTER_SIGNING';
        displayStatus = 'Document has data after this signature\'s signed range';
      } else {
        integrityStatus = 'NO_CHANGES_AFTER_SIGNING';
        displayStatus = 'No Modification Detected After Signing';
      }
    } else {
      // Chữ ký trung gian: luôn có dữ liệu sau (vì có chữ ký đến sau nó)
      integrityStatus = 'DATA_ADDED_AFTER_SIGNING';
      displayStatus = 'Data exists after this signature (intermediate signature)';
      hasChangesAfterSigning = true;
    }

    // 2. Trích xuất DER buffer từ /Contents gần nhất với ByteRange
    let derBuffer: Buffer | null = null;
    try {
      let contentsIdx = content.lastIndexOf('/Contents', contextPos);
      
      // Nếu không tìm thấy trước (hoặc quá xa, có thể thuộc chữ ký khác), thử tìm sau
      if (contentsIdx === -1 || (contextPos - contentsIdx) > 80000) {
        const nextIdx = content.indexOf('/Contents', contextPos);
        if (nextIdx !== -1 && (nextIdx - contextPos) < 80000) {
          contentsIdx = nextIdx;
        }
      }

      if (contentsIdx !== -1 && Math.abs(contextPos - contentsIdx) < 80000) {
        const startBracket = content.indexOf('<', contentsIdx);
        const endBracket = content.indexOf('>', startBracket);
        if (startBracket !== -1 && endBracket !== -1) {
          const hex = content.substring(startBracket + 1, endBracket).replace(/\s/g, '');
          derBuffer = Buffer.from(hex, 'hex');
        }
      }
    } catch {
      // Bỏ qua lỗi extract
    }

    const signerName = extractSignerName(content, contextPos, derBuffer);
    const organization = extractOrganization(content, contextPos, derBuffer);
    const email = extractEmail(content, contextPos);
    const issuer = extractIssuer(content, contextPos);
    const serialNumber = extractSerialNumber(content, contextPos);
    const subFilter = extractSubFilter(content, contextPos);
    const signingTime = extractSigningTime(content, contextPos);

    // Xác định verificationLevel dựa trên thông tin trích xuất được
    const hasAnyCertInfo = !!(signerName || organization || issuer || serialNumber);
    const verificationLevel = hasAnyCertInfo
      ? 'BASIC_STRUCTURE_AND_CERTIFICATE_EXTRACTION' as const
      : 'SIGNED_RANGE_CHECK' as const;

    return {
      index,
      fileType: 'PDF' as SignatureFileType,
      evidenceType: 'CRYPTOGRAPHIC_SIGNATURE' as const,
      verificationLevel,
      signatureFormat: subFilter ?? null,  // e.g. adbe.pkcs7.detached, ETSI.CAdES.detached
      fieldName: null,
      signerName,
      organization,
      email,
      issuer,
      serialNumber,
      signingTime,
      subFilter,
      byteRange,
      signedRevisionEnd,
      fileSize,
      hasChangesAfterSigning,
      integrityStatus,
      displayStatus,
      // ModDate của toàn bộ file — chỉ hiển thị khi có thay đổi sau vùng ký
      fileModDate: hasChangesAfterSigning ? (fileModDate ?? null) : null,
      warning: SIGNATURE_WARNING,
    };
  });
}

/**
 * UC-72: Lấy chi tiết một chữ ký PDF theo index.
 */
export function getPdfSignatureDetail(buffer: Buffer, signatureIndex: number): DocumentSignatureItem {
  const signatures = extractPdfSignatures(buffer);

  if (signatureIndex < 0 || signatureIndex >= signatures.length) {
    throw new Error(
      `INVALID_SIGNATURE_INDEX: Index ${signatureIndex} không hợp lệ. File có ${signatures.length} chữ ký.`,
    );
  }

  return signatures[signatureIndex];
}

// ─── Phase 4: Word/OOXML Signature Extraction ─────────────────────────────────

/**
 * UC-57/70/72: Trích xuất chữ ký số từ file Word/Excel/PowerPoint (OOXML).
 *
 * File OOXML (.docx/.xlsx/.pptx) thực chất là ZIP archive.
 * Chữ ký lưu trong thư mục `_xmlsignatures/sigN.xml`.
 *
 * Cách hoạt động:
 * 1. Verify ZIP magic bytes (PK 0x50 0x4B)
 * 2. Quét Local File Header trong ZIP để tìm `_xmlsignatures/sig*.xml`
 * 3. Đọc nội dung raw file XML để tìm CN=, O=, email trong certificate
 * 4. Trả về SIGNATURE_STRUCTURE_FOUND vì không thể verify full integrity như PDF
 *
 * Trạng thái integrity luôn là SIGNATURE_STRUCTURE_FOUND vì Word dùng XML Digital Signature.
 * Để verify đầy đủ cần check digest của từng phần trong package (ngoài phạm vi DMS).
 */
export function extractWordSignatures(buffer: Buffer): DocumentSignatureItem[] {
  // Verify ZIP magic bytes: PK
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
    return [];
  }

  const content = buffer.toString('binary');

  // Quét Local File Header trong ZIP để tìm entry _xmlsignatures/sigN.xml
  // ZIP Local File Header format: PK\x03\x04 + 26 bytes (fixed) + filename length + extra length + filename
  const signatureXmlContents: string[] = [];
  let offset = 0;

  while (offset < buffer.length - 30) {
    // Tìm Local File Header signature: PK (0x50 0x4B 0x03 0x04)
    if (
      buffer[offset] === 0x50 &&
      buffer[offset + 1] === 0x4B &&
      buffer[offset + 2] === 0x03 &&
      buffer[offset + 3] === 0x04
    ) {
      // Parse header fields
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const filenameLen = buffer.readUInt16LE(offset + 26);
      const extraLen = buffer.readUInt16LE(offset + 28);

      if (filenameLen > 0 && filenameLen < 512) {
        const filenameStart = offset + 30;
        const filenameEnd = filenameStart + filenameLen;

        if (filenameEnd < buffer.length) {
          const filename = buffer.slice(filenameStart, filenameEnd).toString('utf8');

          // Chỉ lấy các file chữ ký XML
          if (filename.startsWith('_xmlsignatures/sig') && filename.endsWith('.xml')) {
            const dataStart = filenameEnd + extraLen;
            const dataEnd = dataStart + compressedSize;

            // Đọc nội dung file XML
            const compressionMethod = buffer.readUInt16LE(offset + 8);
            if (compressionMethod === 0 && dataEnd <= buffer.length) {
              // Không nén
              const xmlContent = buffer.slice(dataStart, dataEnd).toString('utf8');
              signatureXmlContents.push(xmlContent);
            } else if (compressionMethod === 8 && dataEnd <= buffer.length) {
              // Nén DEFLATE
              try {
                const compressedData = buffer.slice(dataStart, dataEnd);
                const decompressed = zlib.inflateRawSync(compressedData);
                signatureXmlContents.push(decompressed.toString('utf8'));
              } catch {
                signatureXmlContents.push('');
              }
            } else {
              // Unknown compression
              signatureXmlContents.push('');
            }
          }
        }
      }

      // Nhảy qua entry này
      const filenameLen2 = buffer.readUInt16LE(offset + 26);
      const extraLen2 = buffer.readUInt16LE(offset + 28);
      const compressedSize2 = buffer.readUInt32LE(offset + 18);
      offset = offset + 30 + filenameLen2 + extraLen2 + compressedSize2;
    } else {
      offset++;
    }
  }

  // Fallback: nếu không parse được header, dùng regex trên raw content
  if (signatureXmlContents.length === 0) {
    const zipHeaderRegex = /PK\x03\x04[\s\S]{26}(_xmlsignatures\/sig[^\x00]*\.xml)/g;
    let match;
    while ((match = zipHeaderRegex.exec(content)) !== null) {
      signatureXmlContents.push(''); // Ghi nhận entry nhưng không có XML content
    }
  }

  if (signatureXmlContents.length === 0) return [];

  // Parse từng XML để lấy certificate info
  return signatureXmlContents.map((xmlContent, index) => {
    let signerName: string | null = null;
    let organization: string | null = null;
    let email: string | null = null;
    let issuer: string | null = null;
    let serialNumber: string | null = null;
    let signingTime: string | null = null;

    if (xmlContent) {
      // Lấy tên người ký từ CN= trong X509Certificate hoặc CanonicalizationMethod
      const cnMatch = xmlContent.match(/CN=([^,<"\/\r\n]{1,100})/);
      if (cnMatch) signerName = cnMatch[1].trim();

      // Lấy tên tổ chức từ O=
      const orgMatch = xmlContent.match(/O=([^,<"\/\r\n]{1,100})/);
      if (orgMatch) organization = orgMatch[1].trim();

      // Lấy email
      const emailMatch = xmlContent.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) email = emailMatch[1];

      // Lấy issuer: thường có tag <X509IssuerName> hoặc issuer CN
      const issuerTagMatch = xmlContent.match(/<X509IssuerName>([^<]{1,300})<\/X509IssuerName>/);
      if (issuerTagMatch) {
        const issuerCnMatch = issuerTagMatch[1].match(/CN=([^,<"\/\r\n]{1,100})/);
        issuer = issuerCnMatch ? issuerCnMatch[1].trim() : issuerTagMatch[1].trim();
      }

      // Lấy serial number: có thể là <X509SerialNumber> hoặc base64 trong certificate
      const serialTagMatch = xmlContent.match(/<X509SerialNumber>([^<]{1,100})<\/X509SerialNumber>/);
      if (serialTagMatch) serialNumber = serialTagMatch[1].trim();

      // Lấy thời gian ký từ <SigningTime> hoặc <xades:SigningTime>
      const timeTagMatch = xmlContent.match(/<(?:xades:)?SigningTime>([^<]{1,50})<\/(?:xades:)?SigningTime>/);
      if (timeTagMatch) {
        // Chuẩn hóa về ISO string
        try {
          const parsed = new Date(timeTagMatch[1].trim());
          if (!isNaN(parsed.getTime())) {
            signingTime = parsed.toISOString();
          }
        } catch {
          signingTime = timeTagMatch[1].trim();
        }
      }
    }

    return {
      index,
      fileType: 'WORD' as SignatureFileType,
      evidenceType: 'CRYPTOGRAPHIC_SIGNATURE' as const,
      verificationLevel: 'XML_SIGNATURE_STRUCTURE_DETECTED' as const,
      signatureFormat: 'W3C XML Digital Signature (OOXML)',
      fieldName: `_xmlsignatures/sig${index + 1}.xml`,
      signerName,
      organization,
      email,
      issuer,
      serialNumber,
      signingTime,
      subFilter: null,           // PDF-only field
      byteRange: null,           // PDF-only field
      signedRevisionEnd: null,
      fileSize: buffer.length,
      hasChangesAfterSigning: null, // Không thể xác định với OOXML basic
      integrityStatus: 'SIGNATURE_STRUCTURE_FOUND' as SignatureIntegrityStatus,
      displayStatus: 'Word digital signature structure detected. Signer information was extracted from the embedded certificate.',
      warning: WORD_INTEGRITY_WARNING,
    };
  });
}

// ─── Dispatcher và builder helpers ───────────────────────────────────────────

/**
 * UC-57: Dispatcher tự động — phát hiện loại file và gọi extractor phù hợp.
 * Hỗ trợ: PDF (.pdf), Word (.docx, .docm), Excel (.xlsx), PowerPoint (.pptx).
 */
export function extractSignaturesFromFile(
  buffer: Buffer,
  filePath: string,
  mimeType = '',
): DocumentSignatureItem[] {
  const ext = path.extname(filePath).toLowerCase();
  const isPdf = ext === '.pdf' || mimeType === 'application/pdf';
  const isOoxml =
    ['.docx', '.docm', '.xlsx', '.pptx'].includes(ext) ||
    SUPPORTED_SIGNATURE_MIMES.slice(1).includes(mimeType);

  if (isPdf) {
    return extractPdfSignatures(buffer);
  }

  if (isOoxml) {
    return extractWordSignatures(buffer);
  }

  throw new Error('UNSUPPORTED_FILE_TYPE: Chỉ hỗ trợ PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx).');
}

/**
 * Tạo block `summary` cho DocumentSignatureResponse.
 */
export function buildSignatureSummary(
  signatures: DocumentSignatureItem[],
): DocumentSignatureSummary {
  const cryptoSigs = signatures.filter(s => s.evidenceType === 'CRYPTOGRAPHIC_SIGNATURE');
  return {
    hasCryptographicSignature: cryptoSigs.length > 0,
    cryptographicSignatureCount: cryptoSigs.length,
    hasVisualSignatureAppearance: null, // Không phân tích hình ảnh trong trang
    conclusion: cryptoSigs.length > 0
      ? 'CRYPTOGRAPHIC_SIGNATURE_FOUND'
      : 'NO_CRYPTOGRAPHIC_SIGNATURE_FOUND',
  };
}

/**
 * Tạo block `visualMarks` — luôn cảnh báo về dấu mộc/chữ ký hình ảnh.
 * Hệ thống KHÔNG phân tích hình ảnh, chỉ thông báo người dùng biết.
 */
export function buildVisualMarks(): VisualMark[] {
  return [
    {
      type: 'VISIBLE_SIGNATURE_OR_STAMP',
      status: 'NOT_VERIFIED',
      message:
        'The document may contain visible signatures or stamps. ' +
        'These are image-based visual marks and cannot be verified as digital signatures by this system. ' +
        'Full Office XML signature validation is not performed.',
    },
  ];
}

// ─── Legacy: checkPdfSignature — giữ backward compat ─────────────────────────

/**
 * @deprecated Dùng extractSignaturesFromFile() thay thế.
 * Kiểm tra cấu trúc chữ ký PDF và trả về kết quả tổng hợp.
 */
export function checkPdfSignature(filePath: string): SignatureVerificationResult {
  if (!fs.existsSync(filePath)) {
    throw new Error('File PDF không tồn tại');
  }

  const buffer = fs.readFileSync(filePath);
  const signatures = extractPdfSignatures(buffer);

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

  const lastSig = signatures[signatures.length - 1];
  const isModifiedAfterSigning = lastSig.hasChangesAfterSigning ?? null;

  if (isModifiedAfterSigning === true) {
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
    message: 'The PDF contains a digital signature and no obvious modification was detected.',
  };
}
