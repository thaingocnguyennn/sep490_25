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
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Common Vietnamese administrative document terms that the LSTM
 * frequently mis-recognises. Hand-fed into Tesseract via the
 * `user_words` parameter so it prefers these dictionary entries
 * over free-form guesses. Each term is a single token or hyphenated
 * compound exactly as it appears in the source document.
 */
export const USER_WORDS: string[] = [
  // Country / state apparatus
  'CỘNG', 'HÒA', 'XÃ', 'HỘI', 'CHỦ', 'NGHĨA', 'VIỆT', 'NAM',
  'ĐỘC', 'LẬP', 'TỰ', 'DO', 'HẠNH', 'PHÚC',
  'HỘI', 'ĐỒNG', 'NHÂN', 'DÂN',
  'ỦY', 'BAN', 'NHÂN', 'DÂN', 'UBND',
  'HĐND', 'MTTQ', 'TQ', 'TTCP',
  // Issuing agency suffixes
  'QĐ-UBND', 'QĐ-BGDĐT', 'QĐ-BTP', 'QĐ-BYT', 'QĐ-BKHĐT',
  'QĐ-BTNMT', 'QĐ-BXD', 'QĐ-BCA',
  'CV-UBND', 'TB-UBND', 'TT-UBND', 'BC-UBND', 'TT',
  // Decree 30 box labels
  'QUYẾT', 'ĐỊNH', 'NGHỊ', 'QUYẾT', 'THÔNG', 'BÁO',
  'TỜ', 'TRÌNH', 'CÔNG', 'VĂN', 'BÁO', 'CÁO',
  'CHỈ', 'THỊ', 'KẾ', 'HOẠCH', 'HƯỚNG', 'DẪN',
  'QUY', 'ĐỊNH', 'TRÌNH', 'CHƯƠNG', 'TRÌNH',
  'GIẤY', 'ỦY', 'QUYỀN', 'HỢP', 'ĐỒNG', 'BIÊN', 'BẢN',
  // Signer positions
  'CHỦ', 'TỊCH', 'PHÓ', 'GIÁM', 'ĐỐC', 'TRƯỞNG', 'PHÒNG',
  'THỦ', 'TRƯỞNG', 'HIỆU', 'TRƯỞNG', 'TỔNG', 'CỤC',
  'VỤ', 'BỘ', 'THỨ',
  // Date tokens
  'ngày', 'tháng', 'năm',
  // Common verbs / label fragments
  'Căn', 'cứ', 'Theo', 'đề', 'nghị', 'Nơi', 'nhận',
  'Kính', 'gửi', 'Tin', 'chắc', 'kính',
  // Issuing-authority codes
  'AN', 'GIANG', 'BẮC', 'GIANG', 'NINH', 'BÌNH',
  'KIÊN', 'GIANG', 'HỒ', 'CHÍ', 'MINH', 'CẦN', 'THƠ',
  'HÀ', 'NỘI', 'ĐÀ', 'NẴNG', 'LONG', 'AN', 'BÌNH',
  'ĐỊNH', 'TIỀN', 'GIANG',
  // Recipient entity names (hand-curated; rank before freetext)
  'SỞ', 'BAN', 'NGÀNH', 'TỈNH', 'THÀNH', 'PHỐ', 'HUYỆN',
  'QUẬN', 'XÃ', 'PHƯỜNG', 'ĐẶC', 'KHU',
];

/** Title keywords used to identify signer position (chức vụ / Box 7a). */
export const TITLE_KEYWORDS = [
  'PHÓ CHỦ TỊCH', 'CHỦ TỊCH', 'GIÁM ĐỐC', 'TRƯỞNG PHÒNG',
  'THỦ TRƯỞNG', 'HIỆU TRƯỞNG', 'TỔNG GIÁM ĐỐC', 'PHÓ GIÁM ĐỐC',
  'CỤC TRƯỞNG', 'VỤ TRƯỞNG', 'BỘ TRƯỞNG', 'THỨ TRƯỞNG',
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
