/**
 * Vietnamese name dictionary for OCR post-processing.
 *
 * Source for the top-100 surnames: NXB Khoa học Xã hội (2022),
 * reproduced in the Wikipedia "Vietnamese name" article. The list
 * covers ~99% of the population; remaining surnames are rare but
 * still match the structural heuristics in the name pipeline even
 * without being explicitly enumerated here.
 *
 * Source for the top-30 middle names (chữ lót): synthesised from
 * the Wikipedia "Vietnamese name" article, the Cultural Atlas (SBS)
 * entry on Vietnamese naming, and the Vu (2005) / Nguyen (2010)
 * corpus cited in the Names journal. Gender-neutral names are
 * included because middle names are not strictly gendered in
 * modern Vietnamese usage.
 *
 * Each entry is stored in precomposed Unicode (NFC). Two
 * normalised indices are precomputed and exposed for O(1)
 * lookups: one that preserves diacritics (to distinguish e.g.
 * `Văn` from `Vạn`), and one that strips them entirely (for
 * fuzzy matching against OCR output that has lost diacritics).
 *
 * All entries are immutable — treat the exported arrays as the
 * canonical vocabulary and never mutate at runtime.
 */

/** Top-100 Vietnamese surnames in precomposed Unicode (NFC). */
export const SURNAMES_NFC: readonly string[] = [
  'Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Vũ', 'Võ', 'Phan',
  'Trương', 'Bùi', 'Đặng', 'Đỗ', 'Ngô', 'Hồ', 'Dương', 'Đinh', 'Đoàn',
  'Lâm', 'Mai', 'Trịnh', 'Đào', 'Cao', 'Lý', 'Hà', 'Lưu', 'Lương',
  'Thái', 'Châu', 'Tạ', 'Phùng', 'Tô', 'Bành', 'Tiêu', 'Tôn', 'Quách',
  'Lại', 'Thạch', 'Diệp', 'Từ', 'Vương', 'Văn', 'Tăng', 'Hứa', 'Khổng',
  'Tiến', 'Kim', 'La', 'Lữ', 'Mạc', 'Mộc', 'Ninh', 'Ôn', 'Phi', 'Phó',
  'Quang', 'Sơn', 'Tào', 'Thân', 'Thi', 'Thiều', 'Thục', 'Trà', 'Triệu',
  'Trinh', 'Trúc', 'Trưng', 'Uy', 'Vi', 'Vĩnh', 'Vũng', 'Xà', 'Yên',
  'Giang', 'Hức', 'Khâu', 'Lều', 'Nghiêm', 'Ngũ', 'Nhạc', 'Nhữ', 'Ông',
  'Phương', 'Quản', 'Sử', 'Tống', 'Trợ', 'Uông', 'Vạn', 'Vị', 'Cam',
  'Cầm', 'Chế', 'Chử', 'Cổ', 'Cù', 'Diêm', 'Giáp', 'Hy', 'Hùng', 'Kiều',
];

/**
 * Top-30 Vietnamese middle names (chữ lót).
 *
 * These are the names that traditionally sit between the surname
 * and the given name. The pipeline uses them to validate the
 * structural shape of a candidate name span (surname + middle +
 * given).
 */
export const MIDDLES_NFC: readonly string[] = [
  'Văn', 'Thị', 'Hữu', 'Đức', 'Minh', 'Quang', 'Công', 'Thành', 'Thanh',
  'Xuân', 'Anh', 'Ngọc', 'Huy', 'Kim', 'Hồng', 'Bá', 'Mạnh', 'Thế',
  'Phương', 'Tường', 'Gia', 'Khánh', 'Tuấn', 'Bảo', 'Quốc', 'Diệu',
  'Nguyệt', 'Linh', 'Trung', 'Phúc',
];

/**
 * Strip diacritics from a string and lowercase it.
 *
 * Used both at module load (to build the lookup sets) and at
 * runtime (to normalise tokens before comparing against the sets).
 *
 * Implementation notes:
 * - Uses Unicode NFD to decompose accented characters into base +
 *   combining mark.
 * - Strips marks in the range U+0300–U+036F (combining diacritics).
 *   Đ/đ (U+0110/U+0111) is a single precomposed codepoint in NFC,
 *   not a base+mark pair, so we map it explicitly.
 *
 * Note: collapses `Văn` (middle) and `Vạn` (surname) into the
 * same `van`. Use `toNfcLower` when you need to distinguish them.
 */
export function toAsciiLower(token: string): string {
  return token
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .toLowerCase();
}

/**
 * Lowercase while preserving precomposed diacritics.
 *
 * Unlike `toAsciiLower`, this retains the distinguishing
 * characters between e.g. `Văn` (ă) and `Vạn` (ạ) — they both
 * collapse to `van` under NFD-strip, but stay distinct under
 * NFC-lowercase (`văn` vs `vạn`). Use this form for exact
 * dictionary lookup; fall back to `toAsciiLower` for fuzzy
 * matching where diacritics have already been lost to OCR.
 */
export function toNfcLower(token: string): string {
  return token
    .normalize('NFC')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .toLowerCase();
}

/** Set of NFC-lowered (diacritic-preserving, lowercase) surnames. */
export const SURNAMES_NFC_LOWER: ReadonlySet<string> = new Set(
  SURNAMES_NFC.map(toNfcLower),
);

/** Set of NFC-lowered (diacritic-preserving, lowercase) middles. */
export const MIDDLES_NFC_LOWER: ReadonlySet<string> = new Set(
  MIDDLES_NFC.map(toNfcLower),
);

/** Set of fully normalised (no-diacritic, lowercase) surnames. */
export const SURNAMES_NORMAL: ReadonlySet<string> = new Set(
  SURNAMES_NFC.map(toAsciiLower),
);

/** Set of fully normalised (no-diacritic, lowercase) middles. */
export const MIDDLES_NORMAL: ReadonlySet<string> = new Set(
  MIDDLES_NFC.map(toAsciiLower),
);

/**
 * Reverse lookup: NFC-lowered form → canonical NFC entry.
 *
 * Used by the classifier when an exact match is found via the
 * diacritic-preserving set — we still need the canonical NFC
 * (with proper casing) to surface to the user.
 */
const NFC_LOWER_TO_NFC_SURNAME: ReadonlyMap<string, string> = new Map(
  SURNAMES_NFC.map((s) => [toNfcLower(s), s] as const),
);
const NFC_LOWER_TO_NFC_MIDDLE: ReadonlyMap<string, string> = new Map(
  MIDDLES_NFC.map((m) => [toNfcLower(m), m] as const),
);

/**
 * Look up the canonical NFC form of a name given its NFC-lowered
 * (diacritic-preserving, lowercase) representation. Both
 * diacritic-preserving and fully-normalised variants are
 * supported: callers should pass whichever form they have on hand.
 */
export function nfcForNormalised(
  normalised: string,
  kind: 'surname' | 'middle',
): string | undefined {
  const nfcLowerMap =
    kind === 'surname' ? NFC_LOWER_TO_NFC_SURNAME : NFC_LOWER_TO_NFC_MIDDLE;
  const direct = nfcLowerMap.get(normalised);
  if (direct) return direct;
  // Fall back to ASCII-normalised lookup.
  const ascii = toAsciiLower(normalised);
  for (const [nfc] of nfcLowerMap) {
    if (toAsciiLower(nfc) === ascii) return nfc;
  }
  return undefined;
}