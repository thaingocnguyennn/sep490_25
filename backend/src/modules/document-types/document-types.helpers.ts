/**
 * Normalise document kind name:
 * - Strip Vietnamese diacritics (NFD decomposition)
 * - Convert to lowercase
 * - Collapse multiple spaces
 *
 * Example: "Công   Văn" → "cong van"
 */
export function normalizeDocumentKindName(value: string): string {
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
 * Normalise document kind code:
 * - Trim whitespace
 * - Convert to uppercase
 * - Remove all internal whitespace
 *
 * Example: "q đ" → "QĐ"
 * Note: We use NFC so composed Vietnamese chars like Đ are preserved.
 */
export function normalizeDocumentKindCode(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/** Pattern: letters / digits / Vietnamese chars, optionally separated by hyphens. No slash allowed. */
export const DOCUMENT_KIND_CODE_PATTERN = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
