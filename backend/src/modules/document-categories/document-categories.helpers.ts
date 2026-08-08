/**
 * Chuẩn hoá tên lĩnh vực văn bản:
 * - Bỏ dấu tiếng Việt (NFD decomposition)
 * - Chuyển thành chữ thường
 * - Gộp nhiều khoảng trắng thành một
 *
 * Ví dụ: "Công Nghệ   Thông Tin" → "cong nghe thong tin"
 */
export function normalizeDocumentCategoryName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Chuẩn hoá mã lĩnh vực văn bản:
 * - Trim khoảng trắng hai đầu
 * - Chuyển thành chữ hoa
 * - Thay khoảng trắng bằng dấu gạch dưới
 *
 * Ví dụ: "Tai chinh" → "TAI_CHINH"
 * Lưu ý: Không tự xoá ký tự đặc biệt, chỉ chuẩn hoá khoảng trắng.
 * Validation sẽ kiểm tra định dạng và trả lỗi nếu không hợp lệ.
 */
export function normalizeDocumentCategoryCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}
