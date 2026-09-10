/**
 * Utility định dạng Số đi văn bản đi và Số đến văn bản đến
 * tuân thủ chuẩn Nghị định 30/2020/NĐ-CP và hệ thống Quản trị văn phòng điện tử (E-Office).
 */

export interface FormatOfficialNumberOptions {
  sequenceNumber: number;
  typeCode?: string | null;
  departmentCode?: string | null;
  documentSymbol?: string | null;
  customFormat?: string | null;
}

/**
 * Tạo số đi chính thức chuẩn:
 * Cấu trúc: [Số thứ tự]/[Ký hiệu loại VB]-[Ký hiệu đơn vị soạn thảo]
 * VD: 5, "QĐ", "NS" -> "05/QĐ-NS"
 *     125, "CV", "KT" -> "125/CV-KT"
 *     15, documentSymbol "QĐ-UBND" -> "15/QĐ-UBND"
 */
export function formatOfficialNumber(options: FormatOfficialNumberOptions): string {
  const { sequenceNumber, typeCode, departmentCode, documentSymbol, customFormat } = options;

  // Đệm số 0 nếu < 10 (VD: 5 -> "05", 125 -> "125")
  const paddedNumber =
    sequenceNumber < 10
      ? String(sequenceNumber).padStart(2, '0')
      : String(sequenceNumber);

  // Nếu người dùng cung cấp custom template format
  if (customFormat) {
    const cleanType = (typeCode || '').trim().toUpperCase();
    const cleanDept = (departmentCode || '').trim().toUpperCase();
    return customFormat
      .replace('{NUMBER}', paddedNumber)
      .replace('{TYPE}', cleanType)
      .replace('{DEPT}', cleanDept);
  }

  // Nếu đã có ký hiệu văn bản đầy đủ (VD: "QĐ-UBND" hoặc "CV-VP")
  if (documentSymbol && documentSymbol.trim()) {
    const cleanSymbol = documentSymbol.trim();
    // Nếu trong symbol đã có dấu gạch chéo (VD: "123/QĐ-UBND"), chỉ lấy phần ký hiệu sau dấu /
    const pureSymbol = cleanSymbol.includes('/') ? cleanSymbol.split('/').slice(1).join('/') : cleanSymbol;
    return `${paddedNumber}/${pureSymbol}`;
  }

  // Ghép từ typeCode và departmentCode
  const cleanType = (typeCode || 'VB').trim().toUpperCase();
  const cleanDept = (departmentCode || '').trim().toUpperCase();

  if (cleanDept) {
    return `${paddedNumber}/${cleanType}-${cleanDept}`;
  }
  return `${paddedNumber}/${cleanType}`;
}

/**
 * Chuẩn hóa số đến (Arrival Number) cho Văn bản đến
 */
export function formatArrivalNumber(arrivalNumber: number): string {
  return String(arrivalNumber);
}
