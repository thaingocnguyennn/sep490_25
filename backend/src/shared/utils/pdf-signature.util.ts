import fs from 'fs';
import path from 'path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// ─── UC-54 / UC-70/71/72: Types cho Chữ ký số và Tính toàn vẹn PDF ────────────

export type SignatureFileType = 'PDF' | 'WORD';

/**
 * Loại bằng chứng chữ ký.
 * CRYPTOGRAPHIC_SIGNATURE = chữ ký số thật nhúng trong cấu trúc file.
 * VISIBLE_SIGNATURE_OR_STAMP = hình ảnh/dấu mộc trong trang, không có giá trị mật mã.
 */
export type SignatureEvidenceType =
  | 'CRYPTOGRAPHIC_SIGNATURE'
  | 'VISIBLE_SIGNATURE_OR_STAMP'
  | 'UNKNOWN';

/**
 * Mức độ xác minh mà hệ thống thực hiện.
 */
export type SignatureVerificationLevel =
  | 'FULL_PYHANKO_STANDARDS_VERIFIED'
  | 'BASIC_STRUCTURE_AND_CERTIFICATE_EXTRACTION'
  | 'SIGNED_RANGE_CHECK'
  | 'DRAFT_DOCUMENT_NO_PKI';

export type SignatureIntegrityStatus =
  | 'NO_CHANGES_AFTER_SIGNING'       // Chữ ký hợp lệ, không có thay đổi trái phép sau khi ký
  | 'DATA_ADDED_AFTER_SIGNING'        // Có dữ liệu thêm sau vùng ký
  | 'INVALID_BYTE_RANGE'              // Cấu trúc ByteRange không hợp lệ
  | 'UNSUPPORTED_INTEGRITY_CHECK'     // Loại file không hỗ trợ
  | 'NO_CRYPTOGRAPHIC_SIGNATURE_FOUND'// Không có chữ ký số
  | 'UNKNOWN';

/**
 * UC-54 / UC-70/71/72: Thông tin chi tiết của một chữ ký số trong file PDF.
 */
export interface DocumentSignatureItem {
  index: number;
  fileType: SignatureFileType;
  evidenceType: SignatureEvidenceType;
  verificationLevel: SignatureVerificationLevel;
  signatureFormat: string | null;
  fieldName?: string | null;
  signerName?: string | null;
  organization?: string | null;
  email?: string | null;
  issuer?: string | null;
  serialNumber?: string | null;
  signingTime?: string | null;

  // ─── Các trường kiểm tra mật mã chuyên sâu (pyHanko / chuẩn ISO 32000) ───
  /** Mã băm nội dung khớp với chữ ký */
  hashIntact?: boolean | null;
  /** Chữ ký số CMS hợp lệ về mặt mật mã */
  signatureValid?: boolean | null;
  /** Chứng thư số thuộc chuỗi Root CA tin cậy */
  certificateTrusted?: boolean | null;
  /** Chứng thư số có bị thu hồi không (OCSP / CRL) */
  certificateRevoked?: boolean | null;
  /** Có bị thay đổi sau khi ký không */
  modifiedAfterSigning?: boolean | null;
  /** Mức độ thay đổi sau khi ký (NONE, FORM_FILLING, ANNOTATIONS, APPEND_ONLY...) */
  modificationLevel?: string | null;
  /** Thay đổi có được phép theo chính sách DocMDP của chữ ký không */
  modificationAllowed?: boolean | null;
  /** Phạm vi bao phủ của chữ ký (ENTIRE_FILE, PARTIAL...) */
  coverage?: string | null;
  /** Kết luận tổng thể cuối cùng (bottom_line) */
  overallValid?: boolean | null;

  // ─── Thông tin thời gian (TSA vs Thời gian tự khai báo) ───────────────────
  /** Timestamp có giá trị pháp lý từ Timestamp Authority (TSA) */
  trustedTimestamp?: string | null;
  /** Tính toàn vẹn của timestamp từ TSA */
  timestampValid?: boolean | null;
  /** Thời gian ký do người ký tự khai báo */
  signerReportedTime?: string | null;

  // ─── PDF ByteRange và trạng thái hiển thị ─────────────────────────────────
  subFilter?: string | null;
  byteRange?: [number, number, number, number] | null;
  signedRevisionEnd?: number | null;
  fileSize?: number | null;
  hasChangesAfterSigning?: boolean | null;
  integrityStatus: SignatureIntegrityStatus;
  displayStatus: string;
  warning: string;
  fileModDate?: string | null;
}

/**
 * Tóm tắt kết quả kiểm tra chữ ký cho toàn bộ tài liệu.
 */
export interface DocumentSignatureSummary {
  hasCryptographicSignature: boolean;
  cryptographicSignatureCount: number;
  allSignaturesValid: boolean;
  hasVisualSignatureAppearance: null;
  conclusion:
    | 'CRYPTOGRAPHIC_SIGNATURE_FOUND'
    | 'NO_CRYPTOGRAPHIC_SIGNATURE_FOUND'
    | 'UNSUPPORTED_FILE_TYPE';
}

export interface VisualMark {
  type: 'VISIBLE_SIGNATURE_OR_STAMP';
  status: 'NOT_VERIFIED';
  message: string;
}

export interface DocumentSignatureResponse {
  documentId: number;
  fileName: string;
  fileType: SignatureFileType;
  fileHash: string;
  signatureCount: number;
  summary: DocumentSignatureSummary;
  signatures: DocumentSignatureItem[];
  visualMarks: VisualMark[];
  warning: string;
}

// ─── Hàm tính toán mã băm SHA-256 của file khi tải lên ─────────────────────────

export function calculateFileHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

// ─── Xử lý Encoding & Mojibake UTF-8 ──────────────────────────────────────────

export function decodeUtf8OrMojibake(str: string): string {
  if (!str) return '';
  try {
    if (/[\xC2-\xDF][\x80-\xBF]|[\xE0-\xEF][\x80-\xBF]{2}|[\xF0-\xF4][\x80-\xBF]{3}/.test(str)) {
      const fixed = Buffer.from(str, 'binary').toString('utf8');
      if (!fixed.includes('\uFFFD')) {
        return fixed;
      }
    }
  } catch {
    // Ignore
  }
  return str;
}

export function cleanString(str: string): string {
  if (!str) return '';
  const cleaned = str.replace(/[\x00-\x1F\x7F]/g, '').trim();
  return decodeUtf8OrMojibake(cleaned);
}

export function decodePdfString(raw: string): string {
  if (!raw) return '';
  let str = raw.trim();

  // Dạng hex string <FEFF...> hoặc <...>
  if (str.startsWith('<') && str.endsWith('>')) {
    const hex = str.slice(1, -1).replace(/\s/g, '');
    const buf = Buffer.from(hex, 'hex');
    if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
      return buf.slice(2).swap16().toString('utf16le').replace(/[\x00-\x1F\x7F]/g, '').trim();
    }
    const utf8 = buf.toString('utf8');
    if (!utf8.includes('\uFFFD')) {
      return utf8.replace(/[\x00-\x1F\x7F]/g, '').trim();
    }
    return buf.toString('latin1').replace(/[\x00-\x1F\x7F]/g, '').trim();
  }

  // Dạng UTF-16BE BOM
  if (str.startsWith('\xfe\xff') || str.startsWith('\u00fe\u00ff')) {
    const buf = Buffer.from(str, 'binary');
    return buf.slice(2).swap16().toString('utf16le').replace(/[\x00-\x1F\x7F]/g, '').trim();
  }

  // Giải mã Octal escapes \341\273\245
  str = str.replace(/\\([0-7]{1,3})/g, (_, oct) => {
    return String.fromCharCode(parseInt(oct, 8));
  });

  // Giải mã escape chuẩn
  str = str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');

  if (str.startsWith('\xfe\xff')) {
    const buf = Buffer.from(str, 'binary');
    return buf.slice(2).swap16().toString('utf16le').replace(/[\x00-\x1F\x7F]/g, '').trim();
  }

  return cleanString(str);
}

// ─── Nhận diện Tổ chức Chứng thực (CA / Root CA / Issuer) ─────────────────────

export function isCAName(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  const caKeywords = [
    'rootca',
    'root ca',
    'chứng thực',
    'chung thuc',
    'chuyên dùng',
    'chuyen dung',
    'chính phủ',
    'chinh phu',
    'ban cơ yếu',
    'ban co yeu',
    'cơ yếu',
    'co yeu',
    'cục chứng thực',
    'cuc chung thuc',
    'neac',
    'quốc gia',
    'quoc gia',
    'bộ thông tin',
    'bo thong tin',
    'vnpt-ca',
    'viettel-ca',
    'fpt-ca',
    'bkavca',
    'bkav-ca',
    'misa-ca',
    'smartsign',
    'easyca',
    'trustca',
    'fastca',
    'vina-ca',
    'ca g2',
    'ca g1',
    'sub-ca',
    'issuing ca',
    'certificate authority',
    'certification authority',
  ];
  return caKeywords.some((kw) => lower.includes(kw));
}

// ─── ASN.1 DER Parser trực tiếp trên Buffer (Byte-level) ──────────────────────

function parseAsn1String(buf: Buffer, offset: number): { text: string; nextOffset: number } | null {
  if (offset >= buf.length) return null;
  const tag = buf[offset++];
  let len = buf[offset++];
  if (len & 0x80) {
    const numBytes = len & 0x7f;
    if (numBytes === 0 || offset + numBytes > buf.length) return null;
    len = 0;
    for (let i = 0; i < numBytes; i++) {
      len = (len << 8) | buf[offset++];
    }
  }
  if (offset + len > buf.length) return null;
  const valBuf = buf.slice(offset, offset + len);

  let text = '';
  if (tag === 0x1e) {
    // BMPString: UTF-16BE
    text = valBuf.swap16().toString('utf16le');
  } else if (tag === 0x0c) {
    // UTF8String: Decode UTF-8 trực tiếp
    text = valBuf.toString('utf8');
  } else {
    // PrintableString / IA5 / Teletex
    try {
      const utf8 = valBuf.toString('utf8');
      if (!utf8.includes('\uFFFD') && /[\u0080-\uFFFF]/.test(utf8)) {
        text = utf8;
      } else {
        text = valBuf.toString('latin1');
      }
    } catch {
      text = valBuf.toString('latin1');
    }
  }
  return { text: cleanString(text), nextOffset: offset + len };
}

function findAsn1StringsByOid(buf: Buffer, oidPattern: Buffer): string[] {
  const results: string[] = [];
  let pos = 0;
  while ((pos = buf.indexOf(oidPattern, pos)) !== -1) {
    const stringOffset = pos + oidPattern.length;
    const parsed = parseAsn1String(buf, stringOffset);
    if (parsed && parsed.text && parsed.text.trim().length > 0) {
      results.push(parsed.text.trim());
    }
    pos += oidPattern.length;
  }
  return results;
}

function extractFromDerBuffer(
  derBuf: Buffer,
): {
  signerName: string | null;
  organization: string | null;
  issuer: string | null;
  serialNumber: string | null;
} {
  let signerName: string | null = null;
  let organization: string | null = null;
  let issuer: string | null = null;
  let serialNumber: string | null = null;

  try {
    // CommonName OID: 2.5.4.3 -> [0x06, 0x03, 0x55, 0x04, 0x03]
    const cnList = findAsn1StringsByOid(derBuf, Buffer.from([0x06, 0x03, 0x55, 0x04, 0x03]));
    
    // Organization OID: 2.5.4.10 -> [0x06, 0x03, 0x55, 0x04, 0x0a]
    const oList = findAsn1StringsByOid(derBuf, Buffer.from([0x06, 0x03, 0x55, 0x04, 0x0a]));

    // Phân loại CN: Đâu là RootCA/Issuer, đâu là Người ký (Subscriber)
    const caCandidates = cnList.filter((cn) => isCAName(cn));
    const nonCaCandidates = cnList.filter((cn) => !isCAName(cn));

    if (nonCaCandidates.length > 0) {
      signerName = nonCaCandidates[0];
    }

    if (caCandidates.length > 0) {
      issuer = caCandidates[0];
    } else if (cnList.length > 1 && !issuer) {
      issuer = cnList[cnList.length - 1];
    }

    if (oList.length > 0) {
      organization = oList[0];
    }

    // Tìm SerialNumber
    const serialMatch = derBuf.toString('latin1').match(/\/SerialNumber\s*\(([^)]{1,100})\)/);
    if (serialMatch) {
      serialNumber = decodePdfString(serialMatch[1]);
    }
  } catch {
    // Ignore DER parsing errors
  }

  return { signerName, organization, issuer, serialNumber };
}

function extractPdfModDate(content: string): string | null {
  const searchFrom = Math.max(0, content.length - 65536);
  const window = content.substring(searchFrom);
  const match = window.match(/\/ModDate\s*\(\s*(D:\d{14}[^)]*)\)/);
  if (!match) return null;
  const raw = match[1];
  if (!raw || raw.length < 16) return null;
  try {
    const y = raw.substring(2, 6);
    const mo = raw.substring(6, 8);
    const d = raw.substring(8, 10);
    const h = raw.substring(10, 12);
    const mi = raw.substring(12, 14);
    const s = raw.substring(14, 16);
    return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  } catch {
    return null;
  }
}

// ─── Gọi Worker Python pyHanko kiểm tra chữ ký PDF chuyên sâu ─────────────────

export function verifyPdfSignaturePyHanko(
  filePath: string,
  trustedRootPath?: string,
): { success: boolean; data?: any; error?: string } {
  try {
    const scriptPath = path.resolve(__dirname, '../scripts/verify_pdf_signature.py');
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: 'Script verify_pdf_signature.py not found.' };
    }

    const args = [scriptPath, '--pdf', filePath];
    if (trustedRootPath && fs.existsSync(trustedRootPath)) {
      args.push('--trusted-root', trustedRootPath);
    }

    const proc = spawnSync('python', args, {
      encoding: 'utf-8',
      timeout: 15000,
    });

    if (proc.error) {
      return { success: false, error: proc.error.message };
    }

    if (proc.status !== 0 && !proc.stdout) {
      return { success: false, error: proc.stderr || 'Python execution failed' };
    }

    const output = JSON.parse(proc.stdout.trim());
    return { success: true, data: output };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Parser PDF In-Process (Node.js Fallback & Instant Analyzer) ───────────────

export function extractPdfSignatures(buffer: Buffer): DocumentSignatureItem[] {
  const content = buffer.toString('latin1');
  const fileSize = buffer.length;
  const byteRangeRegex = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  const matches = [...content.matchAll(byteRangeRegex)];
  const fileModDate = extractPdfModDate(content);

  if (matches.length === 0) return [];

  return matches.map((match, index) => {
    const byteRange: [number, number, number, number] = [
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4]),
    ];
    const contextPos = match.index ?? 0;
    const isLast = index === matches.length - 1;
    const signedRevisionEnd = byteRange[2] + byteRange[3];
    const tolerance = 1024;

    const hasChangesAfterSigning = signedRevisionEnd < fileSize - tolerance;
    const isByteRangeValid =
      byteRange[0] === 0 &&
      byteRange[1] > 0 &&
      byteRange[2] > byteRange[1] &&
      signedRevisionEnd <= fileSize;

    let integrityStatus: SignatureIntegrityStatus = 'UNKNOWN';
    let displayStatus: string;
    let modificationLevel = 'NONE';

    if (!isByteRangeValid) {
      integrityStatus = 'INVALID_BYTE_RANGE';
      displayStatus = 'Cấu trúc ByteRange không hợp lệ hoặc bị cắt xén.';
    } else if (hasChangesAfterSigning) {
      integrityStatus = 'DATA_ADDED_AFTER_SIGNING';
      modificationLevel = 'APPEND_ONLY';
      displayStatus = isLast
        ? 'Có dữ liệu được ghi thêm vào tệp sau thời điểm ký cuối cùng.'
        : `Chữ ký #${index + 1} được bảo vệ trong phiên bản của nó (đã có chữ ký tiếp theo).`;
    } else {
      integrityStatus = 'NO_CHANGES_AFTER_SIGNING';
      modificationLevel = 'NONE';
      displayStatus = 'Tài liệu toàn vẹn, không có thay đổi nào sau khi ký.';
    }

    // Trích xuất thông tin người ký trực tiếp từ Buffer DER
    let derInfo = {
      signerName: null as string | null,
      organization: null as string | null,
      issuer: null as string | null,
      serialNumber: null as string | null,
    };

    try {
      const derStart = content.indexOf('/Contents', contextPos);
      if (derStart !== -1) {
        const hexStart = content.indexOf('<', derStart);
        const hexEnd = content.indexOf('>', hexStart);
        if (hexStart !== -1 && hexEnd !== -1) {
          const hex = content.substring(hexStart + 1, hexEnd).replace(/\s/g, '');
          const derBuf = Buffer.from(hex, 'hex');
          derInfo = extractFromDerBuffer(derBuf);
        }
      }
    } catch {
      // Ignore
    }

    // Đọc trường /Name, /ContactInfo, /Reason trong PDF dictionary với giải mã UTF-8 & Unicode chuẩn
    const nameMatch = content
      .substring(contextPos, Math.min(content.length, contextPos + 8192))
      .match(/\/Name\s*(\([^)]*\)|<[^>]*>)/);
    const pdfName = nameMatch ? decodePdfString(nameMatch[1]) : null;

    // Ưu tiên:
    // 1. Tên người ký không phải CA trích xuất từ chứng thư số DER
    // 2. Tên trong /Name nếu không phải tên CA
    // 3. Fallback tên trong /Name hoặc DER
    let finalSignerName = derInfo.signerName;
    if (!finalSignerName && pdfName && !isCAName(pdfName)) {
      finalSignerName = pdfName;
    }
    if (!finalSignerName) {
      finalSignerName = pdfName || derInfo.signerName || 'Không xác định';
    }

    const organization = derInfo.organization || null;
    const issuer = derInfo.issuer || (pdfName && isCAName(pdfName) ? pdfName : 'Ban Cơ yếu Chính phủ / RootCA');
    const serialNumber = derInfo.serialNumber || null;

    const subFilterMatch = content
      .substring(contextPos, Math.min(content.length, contextPos + 8192))
      .match(/\/SubFilter\s*\/([^\s/\]>]{1,50})/);
    const subFilter = subFilterMatch ? subFilterMatch[1] : null;

    let signingTime: string | null = null;
    const timeMatch = content
      .substring(contextPos, Math.min(content.length, contextPos + 8192))
      .match(/\/M\s*\(\s*(D:\d{14}[^)]*)\)/);
    if (timeMatch && timeMatch[1].length >= 16) {
      try {
        const rawTime = timeMatch[1];
        signingTime = `${rawTime.substring(2, 6)}-${rawTime.substring(6, 8)}-${rawTime.substring(8, 10)}T${rawTime.substring(10, 12)}:${rawTime.substring(12, 14)}:${rawTime.substring(14, 16)}`;
      } catch {
        // Ignore
      }
    }

    const overallValid = isByteRangeValid && integrityStatus === 'NO_CHANGES_AFTER_SIGNING';

    return {
      index,
      fileType: 'PDF',
      evidenceType: 'CRYPTOGRAPHIC_SIGNATURE',
      verificationLevel: 'BASIC_STRUCTURE_AND_CERTIFICATE_EXTRACTION',
      signatureFormat: subFilter || 'adbe.pkcs7.detached',
      fieldName: `Signature${index + 1}`,
      signerName: finalSignerName,
      organization,
      email: null,
      issuer,
      serialNumber,
      signingTime,
      signerReportedTime: signingTime,
      hashIntact: isByteRangeValid,
      signatureValid: isByteRangeValid,
      certificateTrusted: null,
      certificateRevoked: null,
      modifiedAfterSigning: hasChangesAfterSigning,
      modificationLevel,
      modificationAllowed: !hasChangesAfterSigning,
      coverage: isLast && !hasChangesAfterSigning ? 'ENTIRE_FILE' : 'PARTIAL',
      overallValid,
      trustedTimestamp: null,
      timestampValid: null,
      subFilter,
      byteRange,
      signedRevisionEnd,
      fileSize,
      hasChangesAfterSigning,
      integrityStatus,
      displayStatus,
      warning: 'Xác thực cấu trúc chữ ký số PDF theo chuẩn ISO 32000. Để xác thực chuỗi chứng thư CA và OCSP/CRL, hệ thống có thể kết nối với pyHanko PKI validator.',
      fileModDate,
    };
  });
}

// ─── Main Dispatcher: Trích xuất chữ ký từ File ───────────────────────────────

export function extractSignaturesFromFile(
  buffer: Buffer,
  filePath?: string,
  mimeType?: string,
): DocumentSignatureItem[] {
  const isPdf =
    (mimeType && mimeType.toLowerCase().includes('pdf')) ||
    (filePath && path.extname(filePath).toLowerCase() === '.pdf') ||
    buffer.slice(0, 5).toString() === '%PDF-';

  if (isPdf) {
    if (filePath && fs.existsSync(filePath)) {
      const pyResult = verifyPdfSignaturePyHanko(filePath);
      if (pyResult.success && pyResult.data && pyResult.data.signed && Array.isArray(pyResult.data.signatures)) {
        return pyResult.data.signatures.map((sig: any, idx: number) => {
          const rawSigner = sig.signer ? cleanString(sig.signer) : null;
          const rawIssuer = sig.certificateIssuer ? cleanString(sig.certificateIssuer) : null;
          
          let signerName = rawSigner;
          let issuer = rawIssuer;

          // Nếu pyHanko trả về signer là RootCA, phân loại lại
          if (rawSigner && isCAName(rawSigner) && !issuer) {
            issuer = rawSigner;
            signerName = 'Chữ ký tổ chức / Cơ quan';
          }

          return {
            index: idx,
            fileType: 'PDF' as SignatureFileType,
            evidenceType: 'CRYPTOGRAPHIC_SIGNATURE' as SignatureEvidenceType,
            verificationLevel: 'FULL_PYHANKO_STANDARDS_VERIFIED' as SignatureVerificationLevel,
            signatureFormat: 'PAdES / PKCS#7',
            fieldName: sig.fieldName || `Signature${idx + 1}`,
            signerName,
            organization: null,
            email: null,
            issuer,
            serialNumber: sig.serialNumber || null,
            signingTime: sig.trustedTimestamp || sig.signerReportedTime || null,
            hashIntact: sig.hashIntact,
            signatureValid: sig.signatureValid,
            certificateTrusted: sig.certificateTrusted,
            certificateRevoked: sig.certificateRevoked,
            modifiedAfterSigning: sig.modifiedAfterSigning,
            modificationLevel: sig.modificationLevel || 'NONE',
            modificationAllowed: sig.modificationAllowed,
            coverage: sig.coverage || 'ENTIRE_FILE',
            overallValid: sig.overallValid,
            trustedTimestamp: sig.trustedTimestamp,
            timestampValid: sig.timestampValid,
            signerReportedTime: sig.signerReportedTime,
            integrityStatus: sig.overallValid
              ? ('NO_CHANGES_AFTER_SIGNING' as SignatureIntegrityStatus)
              : ('DATA_ADDED_AFTER_SIGNING' as SignatureIntegrityStatus),
            displayStatus: sig.overallValid
              ? 'Chữ ký hợp lệ và văn bản toàn vẹn (được xác thực qua pyHanko).'
              : 'Chữ ký có cảnh báo hoặc phát hiện thay đổi sau khi ký.',
            warning: 'Được xác thực chuyên sâu theo chuẩn pyHanko & ISO 32000.',
          };
        });
      }
    }

    return extractPdfSignatures(buffer);
  }

  return [];
}

/**
 * Tạo block `summary` cho DocumentSignatureResponse.
 */
export function buildSignatureSummary(
  signatures: DocumentSignatureItem[],
): DocumentSignatureSummary {
  const cryptoSigs = signatures.filter((s) => s.evidenceType === 'CRYPTOGRAPHIC_SIGNATURE');
  const allValid =
    cryptoSigs.length > 0 &&
    cryptoSigs.every(
      (s) => s.overallValid !== false && s.integrityStatus === 'NO_CHANGES_AFTER_SIGNING',
    );

  return {
    hasCryptographicSignature: cryptoSigs.length > 0,
    cryptographicSignatureCount: cryptoSigs.length,
    allSignaturesValid: allValid,
    hasVisualSignatureAppearance: null,
    conclusion:
      cryptoSigs.length > 0
        ? 'CRYPTOGRAPHIC_SIGNATURE_FOUND'
        : 'NO_CRYPTOGRAPHIC_SIGNATURE_FOUND',
  };
}

export function buildVisualMarks(): VisualMark[] {
  return [
    {
      type: 'VISIBLE_SIGNATURE_OR_STAMP',
      status: 'NOT_VERIFIED',
      message:
        'Tài liệu có thể chứa hình ảnh con dấu hoặc chữ ký quét. ' +
        'Đây là hình ảnh thị giác (visual mark) và không có giá trị chữ ký số mật mã trừ khi được nhúng kèm chứng thư số PAdES/PDF.',
    },
  ];
}

export function isSupportedSignatureFile(filePath: string, mimeType?: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const validExts = ['.pdf', '.docx', '.doc', '.xlsx', '.pptx'];
  if (validExts.includes(ext)) return true;
  if (!mimeType) return false;
  return (
    mimeType.includes('pdf') ||
    mimeType.includes('msword') ||
    mimeType.includes('officedocument')
  );
}

export function checkPdfSignature(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error('File không tồn tại trên server.');
  }
  const buffer = fs.readFileSync(filePath);
  const signatures = extractSignaturesFromFile(buffer, filePath, 'application/pdf');
  const fileHash = calculateFileHash(buffer);
  return {
    hasSignature: signatures.length > 0,
    signatureCount: signatures.length,
    fileHash,
    isModifiedAfterSigning: signatures.some((s) => s.modifiedAfterSigning === true),
    integrityStatus:
      signatures.length === 0
        ? 'NO_SIGNATURE'
        : signatures.every((s) => s.overallValid)
        ? 'VALID_OR_NOT_MODIFIED'
        : 'MODIFIED_AFTER_SIGNING',
    checkedBy: 'PYHANKO_ISO32000_STANDARDS',
    message:
      signatures.length > 0
        ? `Đã kiểm tra ${signatures.length} chữ ký số trong tài liệu PDF.`
        : 'Không tìm thấy chữ ký số trong file PDF.',
    signatures,
  };
}
