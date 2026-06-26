import fs from 'fs';

export interface SignatureVerificationResult {
  hasSignature: boolean;
  signatureCount: number;
  isModifiedAfterSigning: boolean | null;
  integrityStatus: 'NO_SIGNATURE' | 'VALID_OR_NOT_MODIFIED' | 'MODIFIED_AFTER_SIGNING' | 'UNKNOWN';
  checkedBy: 'BYTE_RANGE_BASIC';
  message: string;
}

/**
 * Kiểm tra xem tệp PDF có chứa chữ ký số và có dấu hiệu bị sửa đổi hay không.
 * Đây là bước kiểm tra cấu trúc cơ bản, KHÔNG xác thực chứng thư số CA.
 */
export function checkPdfSignature(filePath: string): SignatureVerificationResult {
  if (!fs.existsSync(filePath)) {
    throw new Error('File PDF không tồn tại');
  }

  const buffer = fs.readFileSync(filePath);
  // Đọc file dưới dạng binary string để bảo toàn cấu trúc byte
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

  // Nếu không có ByteRange
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

  // Có ByteRange nhưng không có Contents -> cấu trúc không rõ ràng
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

  // Lấy chữ ký cuối cùng (thường là chữ ký mới nhất)
  const lastSig = signatures[signatures.length - 1];
  
  // Tính độ phủ của chữ ký cuối cùng so với tổng kích thước file
  // c + d phải bằng hoặc gần bằng buffer.length
  // Tolerance khoảng 1024 bytes (1KB) để bù trừ newline, EOF
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
