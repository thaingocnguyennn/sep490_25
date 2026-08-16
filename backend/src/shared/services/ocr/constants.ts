import type { BoxRegion } from './types';

/**
 * Region definitions following Decree 30/2020/NĐ-CP
 * (the official layout for Vietnamese administrative documents).
 *
 * Each "box" describes a fixed-position region on the document that
 * contains a single conceptual field. The extraction pipeline uses
 * these regions as the primary source for locating fields rather
 * than relying on text ordering alone.
 *
 * Coordinates are normalized to [0, 1] and stored as functions of the
 * page height/width so the layout remains valid for any DPI.
 */

export const PAGE_HEIGHT = 1; // normalized

/** Vietnamese month names → numeric month. */
export const MONTH_NAMES: Record<string, string> = {
  một: '01', hai: '02', ba: '03', bốn: '04', năm: '05',
  sáu: '06', bảy: '07', tám: '08', chín: '09', mười: '10',
  muoi: '10',
};

/** Recognised document types (Trích yếu / Loại văn bản). */
export const DOC_TYPES = [
  'QUYẾT ĐỊNH', 'CÔNG VĂN', 'THÔNG BÁO', 'TỜ TRÌNH', 'BÁO CÁO',
  'QUY ĐỊNH', 'QUY TRÌNH', 'CHỈ THỊ', 'KẾ HOẠCH', 'HƯỚNG DẪN',
  'NGHỊ ĐỊNH', 'LUẬT', 'NGHỊ QUYẾT', 'CHƯƠNG TRÌNH',
  'GIẤY ỦY QUYỀN', 'HỢP ĐỐNG', 'BIÊN BẢN', 'QUY CHẾ',
];

/**
 * Normalise a string for matching against DOC_TYPES so that
 * diacritic-dropped OCR output (e.g. "QUYET DINH") still matches
 * the canonical entries (e.g. "QUYẾT ĐỊNH"). We strip combining
 * marks using the canonical decomposition forms of each Vietnamese
 * vowel-digraph pair, then upper case.
 */
export function removeDiacriticsForMatch(s: string): string {
  // Map Vietnamese 2-codepoint letters (LATIN BASE + COMBINING MARK)
  // to their base form. We only care about the specific marks that
  // Tesseract reliably drops (circumflex, horn, breve, dot below).
  //
  // CRITICAL: also map U+0110 / U+0111 (Đ / đ) to D / d. These
  // single-codepoint letters are NOT decomposed by NFD — the stroke
  // is a permanent feature of the codepoint, not a combining mark.
  // Without this step, "đa" → "đa" (not "da"), and a lookup of the
  // stripped form will falsely match a vocab entry that contains
  // "đ" + combining mark (e.g. "đã" → "đa" key), corrupting inputs
  // like "đa" / "đất" / "điều" / "Cần" by silently inserting the
  // wrong diacritic. See the July-2026 bug report on the NQ
  // trích-yếu extraction for the failure mode.
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[Đđ]/g, (c) => (c === 'Đ' ? 'D' : 'd'));
}

/**
 * Closed-vocabulary regex constraints for Tesseract's `user_patterns`
 * facility. These are passed to Tesseract at *initialization* time
 * (not at recognition time) via a `user_patterns_file`, so the LSTM
 * uses them as a search-time prior.
 *
 * Tesseract's user-patterns file format: one POSIX regex per line.
 * Each pattern is tried against candidate character sequences and a
 * match boosts the candidate's score; mismatches do not eliminate
 * candidates outright, so overly-generic patterns do not degrade
 * accuracy the way a too-narrow `tessedit_char_whitelist` would.
 *
 * The vocabulary here replaces the previous `USER_WORDS` array (which
 * was wired to a no-op `user_words` parameter; the comment at the old
 * call-site incorrectly stated that LSTM ignores `user_words`, which
 * is not the case in Tesseract 5+).
 *
 * Vietnamese administrative-document patterns below cover:
 *   - State apparatus / national motto fragments
 *   - Decree 30 box labels (issuer titles, doc types)
 *   - Standardised signer positions
 *   - Issuing-body code prefixes (QĐ, NĐ, HĐND, UBND, …)
 *   - Common province / municipality tokens
 *   - Date keywords (ngày / tháng / năm)
 *
 * Keep each pattern tightly scoped: a pattern that matches everything
 * forces Tesseract to consider every candidate, slowing recognition.
 * Vietnamese tone marks are written in precomposed (NFC) form so the
 * regex compiles to a tight byte sequence; Tesseract's input is also
 * NFC by default after the .traineddata loader normalises the
 * dictionary.
 */
export const USER_PATTERNS: string[] = [
  // Country / state apparatus — full motto fragments.
  String.raw`(?:CỘNG|HÒA|XÃ|HỘI|CHỦ|NGHĨA|VIỆT|NAM)`,
  String.raw`(?:ĐỘC|LẬP|TỰ|HẠNH|PHÚC)`,
  String.raw`HỘI\s+ĐỒNG\s+NHÂN\s+DÂN`,
  String.raw`ỦY\s+BAN\s+NHÂN\s+DÂN`,
  String.raw`(?:UBND|HĐND|MTTQ|TTCP)`,
  // Issuing-body code prefixes — closed vocabulary.
  String.raw`QĐ-(?:UBND|BGDĐT|BTP|BYT|BKHĐT|BTNMT|BXD|BCA)`,
  String.raw`NĐ-CP`,
  String.raw`(?:CV|TB|TT|BC|NQ|QĐ)-(?:UBND|HĐND|CP)`,
  // Decree 30 box labels (document types).
  String.raw`QUYẾT\s+ĐỊNH`,
  String.raw`NGHỊ\s+QUYẾT`,
  String.raw`NGHỊ\s+ĐỊNH`,
  String.raw`THÔNG\s+BÁO`,
  String.raw`TỜ\s+TRÌNH`,
  String.raw`BÁO\s+CÁO`,
  String.raw`QUY\s+ĐỊNH`,
  String.raw`CHỈ\s+THỊ`,
  String.raw`KẾ\s+HOẠCH`,
  String.raw`HƯỚNG\s+DẪN`,
  String.raw`CHƯƠNG\s+TRÌNH`,
  String.raw`GIẤY\s+ỦY\s+QUYỀN`,
  String.raw`HỢP\s+ĐỒNG`,
  String.raw`BIÊN\s+BẢN`,
  String.raw`QUY\s+CHẾ`,
  String.raw`CÔNG\s+VĂN`,
  // Signer positions.
  String.raw`(?:CHỦ|PHÓ)\s+TỊCH`,
  String.raw`GIÁM\s+ĐỐC`,
  String.raw`TRƯỞNG\s+PHÒNG`,
  String.raw`THỦ\s+TRƯỞNG`,
  String.raw`HIỆU\s+TRƯỞNG`,
  String.raw`TỔNG\s+GIÁM\s+ĐỐC`,
  String.raw`PHÓ\s+GIÁM\s+ĐỐC`,
  String.raw`(?:CỤC|VỤ)\s+TRƯỞNG`,
  String.raw`BỘ\s+TRƯỞNG`,
  String.raw`THỨ\s+TRƯỞNG`,
  // Standard doc-number shape.
  String.raw`\d+/\d+/[A-ZĐÂĂÊÔƠƯ-]+`,
  // Date keywords.
  String.raw`ngày`,
  String.raw`tháng`,
  String.raw`năm`,
  // Recipient-list openers.
  String.raw`Kính\s+gửi`,
  String.raw`Nơi\s+nhận`,
  String.raw`Căn\s+cứ`,
  String.raw`Theo\s+đề\s+nghị`,
  // Issuing-authority province fragments (the longest patterns so
  // they bind tightly; shorter fragments are above).
  String.raw`(?:HÀ|NỘI)`,
  String.raw`(?:HỒ|CHÍ|MINH)`,
  String.raw`(?:ĐÀ|NẴNG)`,
  String.raw`(?:CẦN|THƠ)`,
  String.raw`(?:HẢI|PHÒNG)`,
  String.raw`(?:AN|GIANG)`,
  String.raw`(?:BÌNH|ĐỊNH)`,
  String.raw`(?:BÌNH|DƯƠNG)`,
  String.raw`(?:BÌNH|PHƯỚC)`,
  String.raw`(?:BÌNH|THUẬN)`,
  String.raw`(?:QUẢNG|NAM)`,
  String.raw`(?:QUẢNG|NGÃI)`,
  String.raw`(?:QUẢNG|BÌNH)`,
  String.raw`(?:QUẢNG|TRỊ)`,
  String.raw`(?:NINH|BÌNH)`,
  String.raw`(?:KIÊN|GIANG)`,
  String.raw`(?:LONG|AN)`,
  String.raw`(?:TIỀN|GIANG)`,
  String.raw`(?:TỈNH|TỈNH)`,
  String.raw`(?:THÀNH|PHỐ)`,
  String.raw`(?:SỞ|BAN|NGÀNH|QUẬN|HUYỆN|XÃ|PHƯỜNG|ĐẶC\s+KHU)`,
];

/**
 * Render the `USER_PATTERNS` array into the on-disk format
 * `tesseract` expects: one POSIX regex per line, LF line endings,
 * trailing blank line. Returned as a Buffer so the caller can hand
 * it to `worker.writeText()` for the in-memory FS.
 */
export function userPatternsFile(): Buffer {
  return Buffer.from(USER_PATTERNS.join('\n') + '\n\n', 'utf8');
}

/** Title keywords used to identify signer position (chức vụ / Box 7a).
 *
 * Ordered most-specific-first so that the tier-1 matcher prefers
 * "PHÓ THỦ TƯỚNG" over "THỦ TƯỚNG" when both could match the same
 * substring. The previous list omitted the Prime Minister and
 * Deputy Prime Minister titles, which silently caused PM-issued
 * Nghị định documents to fall back to the wrong title (e.g. the
 * body-text "Chủ tịch" phrase replaced the missing signature-block
 * title).
 */
export const TITLE_KEYWORDS = [
  'PHÓ THỦ TƯỚNG', 'THỦ TƯỚNG',
  'PHÓ CHỦ TỊCH', 'CHỦ TỊCH',
  'GIÁM ĐỐC', 'PHÓ GIÁM ĐỐC', 'TỔNG GIÁM ĐỐC',
  'TRƯỞNG PHÒNG', 'PHÓ TRƯỞNG PHÒNG',
  'THỦ TRƯỞNG', 'HIỆU TRƯỞNG', 'PHÓ HIỆU TRƯỞNG',
  'CỤC TRƯỞNG', 'PHÓ CỤC TRƯỞNG',
  'VỤ TRƯỞNG', 'PHÓ VỤ TRƯỞNG',
  'BỘ TRƯỞNG', 'THỨ TRƯỞNG',
];

/** Confidentiality keywords (Box 10a). */
export const CONFIDENTIALITY_KEYWORDS = [
  'TUYỆT MẬT', 'TUYET MAT',
  'MẬT', 'TỐI MẬT',
  'MẬT',
  'THƯỜNG', 'THUONG',
];

/** Urgency keywords (Box 10b). */
export const URGENCY_KEYWORDS = [
  'HOẢ TỐC', 'HOA TOC',
  'KHẨN', 'KHAN',
  'THƯỜNG', 'THUONG',
];

/**
 * Known issuing bodies (Box 2) for Vietnamese administrative documents.
 *
 * Each entry is the canonical phrase; matching is diacritic-insensitive
 * (Tesseract frequently drops tone marks on small-font government
 * letterhead, so we also list the no-diacritic form when it's likely to
 * be unique). The list is used by the issuer extractor to:
 *
 *   1. Validate that a top-band line is plausibly an issuer (vs.
 *      an imprint / artifact / misread).
 *   2. Pick the right column when the column detector's default
 *      left-column assumption is wrong (some layouts put the
 *      issuer on the right and the national motto on the left).
 *
 * Order matters: more-specific entries ("HỘI ĐỒNG NHÂN DÂN",
 * "ỦY BAN NHÂN DÂN") come before generic ones ("BỘ ...") so that
 * "BỘ TÀI CHÍNH" doesn't get matched by a premature generic rule.
 */
export const ISSUER_KEYWORDS: readonly string[] = [
  // National level
  'CHÍNH PHỦ', 'CHINH PHU',
  'QUỐC HỘI', 'QUOC HOI',
  'HỘI ĐỒNG NHÂN DÂN', 'HOI DONG NHAN DAN',
  'ỦY BAN NHÂN DÂN', 'UY BAN NHAN DAN',
  'VĂN PHÒNG CHÍNH PHỦ', 'VAN PHONG CHINH PHU',
  'VĂN PHÒNG QUỐC HỘI', 'VAN PHONG QUOC HOI',
  // Provincial / municipal level (partial — the suffix is appended
  // separately by the issuer detector after canonicalisation).
  'UBND TỈNH', 'UBND TINH',
  'UBND THÀNH PHỐ', 'UBND THANH PHO',
  'HĐND TỈNH', 'HDND TINH',
  'HĐND THÀNH PHỐ', 'HDND THANH PHO',
  // Ministries — listed as the keyword prefix; matching is done as a
  // prefix-with-noun pattern so "BỘ TÀI CHÍNH" matches even when OCR
  // mangles the noun.
  'BỘ', 'BO',
  'TỔNG CỤC', 'TONG CUC',
  'CỤC', 'CUC',
  'VỤ', 'VU',
  'SỞ', 'SO',
  'PHÒNG', 'PHONG',
];

/**
 * Decree 30 fixed-position layout.
 *
 * Layout (front side, portrait) in normalized [0, 1] page coords:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │                                                             │
 *   │  Box 1  : Quốc hiệu, tiêu ngữ                  (top center) │
 *   │  Box 2  : Tên cơ quan ban hành                  (top-left)  │
 *   │  Box 3  : Số, ký hiệu                           (below 2)   │
 *   │  Box 4  : Địa danh, ngày tháng năm              (right)     │
 *   │                                                             │
 *   │  Box 5a : Tên loại văn bản + Trích yếu          (centered)  │
 *   │  Box 5b : Nội dung                              (body)      │
 *   │                                                             │
 *   │  Box 6  : Chức vụ, họ tên người ký             (right)     │
 *   │  Box 7a : Chức vụ người ký                      (right)     │
 *   │  Box 7b : Họ tên người ký                       (right)     │
 *   │                                                             │
 *   │  Box 8  : Dấu, chữ ký                           (right)     │
 *   │  Box 9  : Nơi nhận                              (left)      │
 *   │                                                             │
 *   │  Box 10a: Độ mật                                (left)      │
 *   │  Box 10b: Độ khẩn                               (left)      │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * The regions below are coarse rectangles that contain the relevant
 * field text; the exact bounding box of the value is refined at
 * extraction time using OCR word coordinates.
 */
export const DECREE_30_REGIONS: Record<string, BoxRegion> = {
  /** Box 2 — Tên cơ quan ban hành (Issuer). Top-left, first thing on page.
   *
   * This region is identified purely by vertical position rather than
   * textual content (issuer names are arbitrary), so no match()
   * predicate is needed. The extractor filters lines by bbox. */
  '2': {
    code: '2',
    label: 'Tên cơ quan ban hành',
    match: (_word, _line) => true,
  },

  /** Box 3 — Số ký hiệu văn bản (Document Number). Below box 2. */
  '3': {
    code: '3',
    label: 'Số ký hiệu văn bản',
    // OCR noise tolerance: "Số" is frequently read as "S6", "So",
    // "Sö", "Sa", etc.
    match: (_word, line) => /^s[\dốoöa-zà-ỹ]\s*[:.\-]?/i.test(line.trim()),
  },

  /** Box 4 — Ngày tháng năm (Document Date). Right side, below logo area. */
  '4': {
    code: '4',
    label: 'Địa danh, ngày tháng năm',
    match: (_word, line) =>
      /ng[àa]y\s+\d/i.test(line) || /\bth[áa]ng\s+\d/i.test(line) || /\bn[ăa]m\s+\d{4}/i.test(line),
  },

  /** Box 5a — Tên loại văn bản + Trích yếu (Type + Summary). */
  '5a': {
    code: '5a',
    label: 'Tên loại văn bản / Trích yếu',
    match: (_word, line) => {
      // OCR frequently drops the diacritic on Ế in "QUYẾT ĐỊNH"
      // (e.g. "QUYET ĐINH" or "QUYET ĐỊNH") and reads B in "BÁO"
      // as D ("THÔNG BÁO" → "THONG BAD"). We normalise both the
      // candidate line and the canonical DOC_TYPES so a Levenshtein
      // match with score ≥ 0.7 is accepted.
      const norm = (s: string): string =>
        removeDiacriticsForMatch(s.toUpperCase()).replace(/[^A-Z]/g, '');
      const candidates = [line, ...line.split(/[\s|]+/).filter((w) => w.length >= 4)];
      for (const c of candidates) {
        const cn = norm(c);
        for (const dt of DOC_TYPES) {
          const dtn = norm(dt);
          if (cn.includes(dtn) || dtn.includes(cn)) return true;
          // Sliding-window distance to allow a single letter drop.
          if (Math.abs(cn.length - dtn.length) <= 2 && cn.length >= 5) {
            let diffs = 0;
            const len = Math.min(cn.length, dtn.length);
            for (let i = 0; i < len; i++) {
              if (cn[i] !== dtn[i]) diffs++;
              if (diffs > 2) break;
            }
            if (diffs <= 2) return true;
          }
        }
      }
      return false;
    },
  },

  /** Box 7a — Chức vụ người ký (Signer Title). Above the signer name. */
  '7a': {
    code: '7a',
    label: 'Chức vụ người ký',
    match: (_word, line) => {
      const upper = line.toUpperCase();
      return TITLE_KEYWORDS.some((k) => upper.includes(k));
    },
  },

  /** Box 7b — Họ tên người ký (Signer Name). Below signer title. */
  '7b': {
    code: '7b',
    label: 'Họ tên người ký',
    match: (word, _line) => isPersonNameWord(word.text),
  },

  /** Box 10a — Độ mật (Confidentiality). Below signature area, left side. */
  '10a': {
    code: '10a',
    label: 'Độ mật',
    match: (_word, line) => {
      const upper = line.toUpperCase();
      return CONFIDENTIALITY_KEYWORDS.some((k) => upper.includes(k))
        || /\bđ[ộo]\s*m[ậa]t\b/i.test(line)
        || /\bs[oọ]m[ậa]t\b/i.test(line);
    },
  },

  /** Box 10b — Độ khẩn (Urgency). Below signature area, left side. */
  '10b': {
    code: '10b',
    label: 'Độ khẩn',
    match: (_word, line) => {
      const upper = line.toUpperCase();
      return URGENCY_KEYWORDS.some((k) => upper.includes(k))
        || /\bđ[ộo]\s*kh[ẩâ]n\b/i.test(line)
        || /\bkh[ẩâ]n\b/i.test(line);
    },
  },
};

/** Recognized regions for Vietnamese person name words. */
const NAME_WORD_RE = /^[A-ZÀ-Ỹ][a-zà-ỹA-ZÀ-Ỹ']{1,20}$/;

export function isPersonNameWord(text: string): boolean {
  const t = text.trim().replace(/[.,]/g, '');
  return NAME_WORD_RE.test(t);
}

/** Approximate vertical position of a numbered box on the page (in [0, 1]). */
export const BOX_VERTICAL_HINT: Record<string, number> = {
  '2': 0.03,  // Top of the page
  '3': 0.10,
  '4': 0.13,
  '5a': 0.22,
  '5b': 0.32,
  '7a': 0.82,
  '7b': 0.87,
  '10a': 0.92,
  '10b': 0.95,
};

/**
 * Approximate horizontal band of a numbered box on the page (in [0, 1]).
 *
 * Decree 30 layouts are two-column: the left column holds the issuer,
 * document number, and recipient list; the right column holds the date,
 * signer title/name, and signature. Adding horizontal priors prevents the
 * layout extractor from accidentally attributing a right-column line to a
 * left-column region (or vice versa), which was the root cause of the
 * "issuer includes national motto" and "signer name bleeds into
 * recipient list" failure modes.
 *
 * Tolerance: ±0.05 on each edge so the filter doesn't reject lines that
 * just barely spill over the nominal column boundary.
 */
export const BOX_HORIZONTAL_HINT: Record<string, { x0: number; x1: number }> = {
  '2':   { x0: 0.00, x1: 0.55 },  // Issuer — left half (left-col) + small overlap
  '3':   { x0: 0.00, x1: 0.55 },  // Doc-number label — left half
  '4':   { x0: 0.50, x1: 1.00 },  // Date — right half
  '5a':  { x0: 0.25, x1: 0.75 },  // Doc-type heading — centred
  '7a':  { x0: 0.50, x1: 1.00 },  // Signer title — right column
  '7b':  { x0: 0.50, x1: 1.00 },  // Signer name — right column
  '10a': { x0: 0.00, x1: 0.50 },  // Confidentiality — bottom-left
  '10b': { x0: 0.00, x1: 0.50 },  // Urgency — bottom-left
};

export const SUPPORTED_TYPES = [
  'image/png', 'image/jpeg', 'image/jpg', 'image/tiff',
  'image/bmp', 'image/webp', 'application/pdf',
];

/**
 * Per-word OCR confidence gate for signer-name extraction.
 *
 * Tesseract emits a 0–100 confidence per word; values below this
 * threshold are discarded before classification. 50 is empirical:
 * it removes the bulk of signature-scan noise without dropping
 * legitimate but slightly-blurred characters.
 */
export const LOW_CONFIDENCE_WORD_THRESHOLD = 50;

/**
 * Inclusive bounds on the number of tokens in a candidate name
 * span.
 *
 * Vietnamese names almost always have 2–4 tokens (surname +
 * optional middle + given). 1-token names are usually noise
 * (e.g. a single character of a recipient bullet); 5+-token spans
 * are almost always multi-line bleed-through.
 */
export const MIN_NAME_SPAN_LENGTH = 2;
export const MAX_NAME_SPAN_LENGTH = 4;

/**
 * Score deltas used by the signer-name scorer in
 * `signer-name-extractor.ts`. They are deliberately generous —
 * scoring beats hard-coded rules precisely because we can
 * tolerate some noise in exchange for higher recall.
 */
export const SCORE_HAS_SURNAME_AT_0_AND_VALID_LENGTH = 100;
export const SCORE_LENGTH_3_OR_4 = 50;
export const SCORE_ENDS_WITH_GIVEN_OR_MIDDLE = 20;
export const SCORE_PER_MIDDLE_AFTER_FIRST = 30;
export const SCORE_PENALTY_PER_UNKNOWN = -10;
export const SCORE_BONUS_PER_CONF_BUCKET = 5;
export const SCORE_FROM_RE_OCR_BLOCK = 200;
export const SCORE_PENALTY_RECIPIENT_LIST = -500;
export const SCORE_PENALTY_TOPLINE_FRAGMENT = -200;
