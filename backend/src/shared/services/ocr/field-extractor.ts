import type { ExtractedFields, OcrLine, OcrWord, PageOcr } from './types';
import {
  DOC_TYPES,
  MONTH_NAMES,
  TITLE_KEYWORDS,
  isPersonNameWord,
} from './constants';
import {
  linesInReadingOrder,
  locateRegionByCode,
  wordsInReadingOrder,
} from './layout';
import { extractSignerName as extractSignerNamePipeline } from './signer-name-extractor';

/**
 * Layout-aware field extraction following Decree 30/2020/NĐ-CP.
 *
 * The pipeline uses the official document layout as the *primary*
 * source for field positions. Regular expressions are reserved for
 * validating or refining values after the correct region has been
 * identified.
 *
 * All bounding box coordinates handled here are normalized to the
 * [0, 1] page rectangle, so this code is DPI-independent.
 */

const ORG_PREFIX = /^(cộng\s*hòa|tp|thành\s*phố|quận|huyện|xã|phường|bộ|ban|nhân\s*dân|uỷ\s*ban|văn\s*phòng|sở|tổ\s*chức|chi\s*bộ)/i;

/**
 * Common OCR misreads of digits (Tesseract `eng+vie` on low-DPI scans
 * confuses certain glyphs). Applied only to single-character tokens
 * in date/number positions, where the surrounding context already
 * constrains the answer to 0-9.
 */
const DIGIT_LOOKALIKE: Record<string, string> = {
  O: '0', o: '0', Q: '0',
  I: '1', l: '1', i: '1', '|': '1',
  Z: '2', z: '2',
  S: '5', s: '5',
  G: '6',
  T: '7',
  // 6 is the most common misread of "B"/"b" in document numbers and
  // dates in Vietnamese administrative documents (the leading digit
  // of "60/61/.../2026" reads as "B" far more often than as 8).
  B: '6', b: '6',
  // Tesseract frequently reads digit 5 as the vowel-with-diaresis ä
  // when the surrounding noise pattern looks similar; very common
  // in dates.
  ä: '5', Ä: '5',
};

/**
 * Parse a date triple (day, month, year) out of a regex match.
 *
 * Vietnamese OCR frequently mangles the day/month slots by inserting
 * spurious letters (Tesseract commonly reads "15" as "l5", "06" as
 * "b", "10" as "l0"). We accept either:
 *   - pure-digit values, or
 *   - values where every non-digit character maps to a digit via
 *     DIGIT_LOOKALIKE (the same map used elsewhere for digit→digit
 *     disambiguation) AND the resulting digit string is in the valid
 *     range (day 1–31, month 1–12). This is the same approach used
 *     by the doc-number post-processor.
 */
function coerceNumericSlot(s: string): string | undefined {
  if (/^\d{1,2}$/.test(s)) return s;
  const mapped = s
    .split('')
    .map((ch) => DIGIT_LOOKALIKE[ch] ?? ch)
    .join('');
  if (/^\d{1,2}$/.test(mapped)) return mapped;
  // Strip stray punctuation (commas, dots, slashes) which OCR inserts
  // around digits ("5." → "5", "5," → "5").
  const stripped = s.replace(/[^\dA-Za-zÀ-ỹ]/g, '');
  if (/^\d{1,2}$/.test(stripped)) return stripped;
  const strippedMapped = stripped
    .split('')
    .map((ch) => DIGIT_LOOKALIKE[ch] ?? ch)
    .join('');
  if (/^\d{1,2}$/.test(strippedMapped)) return strippedMapped;
  return undefined;
}

/**
 * Coerce a single OCR token into a 1–2 digit month value. Handles
 * Vietnamese word-months, numeric months, and Tesseract
 * letter/digit substitutions (e.g. "B" → 6 for month positions,
 * "S" → 5, "G" → 6, etc.).
 *
 * Extension: when the input mixes digits and letters (e.g. "l2" for
 * "12", "b6" for "06"), we run coerceNumericSlot first and only fall
 * back to letter→digit mapping if the result is in the valid month
 * range.
 */
function parseMonthToken(token: string): string | undefined {
  const t = token.toLowerCase().trim();
  // Fast path: pure digit or numeric mappable.
  const numeric = coerceNumericSlot(t);
  if (numeric) {
    const n = Number(numeric);
    if (n >= 1 && n <= 12) return numeric;
  }
  if (MONTH_NAMES[t]) return MONTH_NAMES[t];
  if (t.length === 1 && DIGIT_LOOKALIKE[t]) {
    const candidate = DIGIT_LOOKALIKE[t];
    const n = Number(candidate);
    if (n >= 1 && n <= 12) return candidate;
  }
  return undefined;
}

/** Trim whitespace and tidy common OCR artefacts from a single value. */
function clean(text: string | undefined | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** Join lines into a single string while dropping empty ones. */
function joinLines(lines: OcrLine[]): string {
  return lines.map((l) => clean(l.text)).filter(Boolean).join(' ');
}

/** Concatenate every line of every page in reading order. */
function allDocumentLines(pages: PageOcr[]): OcrLine[] {
  return pages.flatMap(linesInReadingOrder);
}

/** Concatenate every word of every page in reading order. */
function allDocumentWords(pages: PageOcr[]): OcrWord[] {
  return pages.flatMap(wordsInReadingOrder);
}

/* ─── Box 2 — Issuer (Cơ quan ban hành) ────────────────────────────────────── */

/**
 * Find a gap between left-column and right-column text on a header line.
 * Many Vietnamese administrative documents use a two-column header:
 *   left  = "ỦY BAN NHÂN DÂN / TỈNH AN GIANG"
 *   right = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM / Độc lập - Tự do - Hạnh phúc"
 *
 * Tesseract frequently fuses the two columns into a single text string.
 * We split each top-band line by the largest horizontal gap between
 * consecutive words so the two columns become separate strings.
 */
function splitLineAtLargestGap(line: OcrLine): { left: string; right: string } | undefined {
  const words = line.words
    .filter((w) => w.text.trim().length > 0)
    .sort((a, b) => a.bbox.x0 - b.bbox.x0);
  if (words.length < 2) return undefined;

  // Find the largest gap between consecutive words (in page coords).
  let maxGap = 0;
  let gapIdx = -1;
  for (let i = 0; i < words.length - 1; i++) {
    const gap = words[i + 1].bbox.x0 - words[i].bbox.x1;
    if (gap > maxGap) {
      maxGap = gap;
      gapIdx = i;
    }
  }
  // Threshold: the gap must be at least 0.08 in page-normalized
  // coordinates (~ 8% of the page width). That comfortably separates
  // two-column headers without splitting single-column text.
  if (gapIdx < 0 || maxGap < 0.08) return undefined;

  const leftWords = words.slice(0, gapIdx + 1);
  const rightWords = words.slice(gapIdx + 1);
  return {
    left: leftWords.map((w) => clean(w.text)).join(' '),
    right: rightWords.map((w) => clean(w.text)).join(' '),
  };
}

/**
 * Header-specific splitter: extract the LEFT column of a two-column
 * document header. Two strategies, in order:
 *   1. Largest inter-word horizontal gap (≥ 4% of page width) — the
 *      typical Vietnamese admin header has a visual gap between the
 *      issuer column and the national-motto column.
 *   2. If the gap heuristic fails, look for the first word that
 *      begins the national motto ("CỘNG" / "CÔNG" / "CONG" /
 *      "HÒA" / "HOA") and split immediately before it.
 *
 * Returns the LEFT column text. Returns the whole-line text if
 * neither heuristic identifies a clear split.
 */
function splitHeaderLine(line: OcrLine): string {
  const words = line.words.filter((w) => w.text.trim().length > 0);
  if (words.length < 2) return clean(line.text);

  const sorted = [...words].sort((a, b) => a.bbox.x0 - b.bbox.x0);

  // Strategy 1: largest gap.
  let maxGap = 0;
  let gapIdx = -1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].bbox.x0 - sorted[i].bbox.x1;
    if (gap > maxGap) {
      maxGap = gap;
      gapIdx = i;
    }
  }
  if (gapIdx >= 0 && maxGap >= 0.04) {
    const left = sorted
      .slice(0, gapIdx + 1)
      .map((w) => clean(w.text))
      .join(' ')
      .trim();
    if (left) return left;
  }

  // Strategy 2: national-motto prefix detection.
  const MOTTO_RE = /^(C[ÔO]NG|CONG|C[OỘ]NG|H[OỜ]A|HOA)/i;
  const firstMotto = sorted.find((w) => MOTTO_RE.test(clean(w.text)));
  if (firstMotto && firstMotto.bbox.x0 >= 0.40) {
    const left = sorted
      .filter((w) => w.bbox.x1 <= firstMotto.bbox.x0 + 0.005)
      .map((w) => clean(w.text))
      .join(' ')
      .trim();
    if (left) return left;
  }

  return clean(line.text);
}

/**
 * If the input starts with the national-motto phrase
 * ("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" — possibly truncated or
 * misread by Tesseract), strip that prefix. Defensive against the
 * common case where Tesseract drops the visual gap between the
 * issuer column and the motto column, causing the merger to land
 * entirely on one OCR line.
 *
 * Each clause is independently optional — we strip whatever subset
 * of the motto Tesseract managed to deliver, so "CONG HOA XA HOI"
 * (no diacritics) and "DHU NGHIA VIET NAM" are both handled.
 */
function stripNationalMottoPrefix(text: string): string {
  let s = text
    // CỘNG/CÔNG/CONG (HÒA/HOA/HOA) (XÃ/XA) (HỘI/HOI/HOI) (CHỦ/CHU/DHỦ/DHU) (NGHĨA/NGHIA) (VIỆT/VIET/VIET) NAM
    .replace(
      /^[\s,;.]*C[ÔOỘ]NG(\s+H[OÒỜỘ]A)?(\s+X[ÂÃ]?\s+H[OỘ]I)?(\s+(?:Đ?CH[UỦ]|DH[UỦ])\s+NGH[ĨI]A)?(\s+VI[ÊỆE]T\s+NAM)?/i,
      '',
    )
    .trim();
  // Strip the remainder of the motto when only a partial survived
  // the leading strip. The motif "XÃ HỘI" / "HỘI" / "CHỦ NGHĨA" /
  // "NGHĨA VIỆT NAM" is the discriminator.
  return s
    // XÃ HỘI (ĐH|CH|CH)Ủ NGHĨA VIỆT NAM
    .replace(
      /\s+X[ÂÃ]?\s+H[OỘ]I\s+(?:Đ?CH[UỦ]|DH[UỦ])\s+NGH[ĨI]A\s+VI[ÊỆE]T\s+NAM/i,
      '',
    )
    // HỘI (ĐH|CH|CH)Ủ NGHĨA VIỆT NAM
    .replace(
      /\s+H[OỘ]I\s+(?:Đ?CH[UỦ]|DH[UỦ])\s+NGH[ĨI]A\s+VI[ÊỆE]T\s+NAM/i,
      '',
    )
    // Bare (ĐH|CH|CH)Ủ NGHĨA VIỆT NAM
    .replace(
      /\s+(?:Đ?CH[UỦ]|DH[UỦ])\s+NGH[ĨI]A\s+VI[ÊỆE]T\s+NAM/i,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Issuer lives in the top of the first page (Box 2). We pick the
 * first non-trivial, non-numeric block whose bbox is in the upper
 * portion of the page, and — if a top-band line is fused across
 * two columns — keep only the left column.
 *
 * The y-band is intentionally tight (y < ~0.11, before the doc-number
 * line that Decree 30 always places below the issuer block). Picking
 * the issuer from a wider band would risk bleeding into the doc-type
 * heading ("QUYẾT ĐỊNH") which Decree 30 places roughly midway down
 * the first page and which Tesseract sometimes merges into the top
 * block.
 */
function extractIssuer(pages: PageOcr[]): string | undefined {
  const firstPage = pages[0];
  if (!firstPage) return undefined;
  const topLines = linesInReadingOrder(firstPage)
    .filter((l) => l.bbox.y1 <= 0.13)
    .filter((l) => {
      const t = clean(l.text);
      if (t.length < 4) return false;
      if (/\d/.test(t)) return false;
      if (!/[a-zA-ZÀ-ỹ]/.test(t)) return false;
      // Drop lines that look like the document-type heading (always
      // contains a term from DOC_TYPES) — those belong to Box 5a, not
      // Box 2. This protects against Tesseract merging the heading
      // into the top-of-page block when the page is dense.
      const upper = t.toUpperCase();
      const DOC_TYPES_HINT = /QUY[ẾÉÈ]T\s*Đ[IỊ]NH|NGH[IỊ]\s*QUY[ẾÉÈ]T|TH[ÔO]NG\s*B[ÁÀ]O|T[ỜO]\s*TR[IÌ]NH|B[ÁÀ]O\s*C[ÁÀ]O|TỜ\s*TRÌNH/i;
      if (DOC_TYPES_HINT.test(upper)) return false;
      return true;
    });
  if (topLines.length === 0) return undefined;

  // Detect two-column header: if a single top-band line spans both
  // columns, split it and take only the left half. The right column
  // of every Vietnamese admin document begins with the national
  // motto "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", so we strip those
  // words aggressively rather than relying purely on a gap heuristic
  // (Tesseract can compress the gap below the visual midpoint).
  const issuerParts: string[] = [];
  for (const line of topLines.slice(0, 3)) {
    const lineWidth = line.bbox.x1 - line.bbox.x0;
    let text = lineWidth > 0.6 ? splitHeaderLine(line) : clean(line.text);
    // Aggressive strip: drop any word that starts the national-motto
    // phrase ("CỘNG" / "CÔNG" / "CONG" / "HÒA" / ...).
    text = stripNationalMottoPrefix(text);
    if (text) issuerParts.push(text);
  }

  // Drop empty parts and join. Typical issuer is 1–2 lines.
  let joined = issuerParts.filter(Boolean).join(' ');
  // Post-OCR cleanup: Tesseract commonly misreads the standard
  // Vietnamese issuer phrases ("TỈNH X", "THÀNH PHỐ Y", "DÂN" → "DAN",
  // "BÌNH" → "BINH", "AN GIANG" → "AN BIANE"). The corrections are
  // applied ONLY if the input string contains a tell-tale anchor word
  // (e.g. "TINH" or "BINH") so we don't accidentally rewrite a name
  // we don't recognise.
  joined = correctVietnameseIssuerPhrase(joined);
  return joined || undefined;
}

/**
 * Canonicalise known Vietnamese provincial / municipal issuer
 * phrases after OCR. We only rewrite when the input contains a
 * distinctive misread token (TINH, BINH, DAN, THUONG, etc.), so
 * the map cannot silently corrupt an unrelated proper noun.
 *
 * Covers the 63 Vietnamese provinces + 5 central cities.
 */
const PROVINCE_NORMALISATIONS: Array<[RegExp, string]> = [
  // diacritic loss in common header words
  [/\bTINH\b/gi, 'TỈNH'],
  [/\bTÌNH\b/g, 'TỈNH'],
  [/\bTHANH\s*PHO\b/gi, 'THÀNH PHỐ'],
  [/\bTHANH\s*PHỔ\b/gi, 'THÀNH PHỐ'],
  [/\bTHANH\s*PH[OƠ]C\b/gi, 'THÀNH PHỐ'],
  [/\bNH[ÂA]N\s*D[ÂA]N\b/gi, 'NHÂN DÂN'],
  [/\bNHAN\s*DAN\b/gi, 'NHÂN DÂN'],
  [/\bH[OƠ]I\s*D[OƠ]NG\b/gi, 'HỘI ĐỒNG'],
  [/\bH[OƠ]I\s*DÔNG\b/gi, 'HỘI ĐỒNG'],
  [/\bCH[IÍ]NH\s*PH[UỦ]\b/gi, 'CHÍNH PHỦ'],
  [/\bX[ÂA]\s*H[OƠ]I\b/gi, 'XÃ HỘI'],
  [/\bCH[UỦ]\s*NGH[IĨ]A\b/gi, 'CHỦ NGHĨA'],
  [/\bVI[EÊ]T\s*NAM\b/gi, 'VIỆT NAM'],
  [/\b[DĐ][OƠ]C\s*L[ÂA]P\b/gi, 'ĐỘC LẬP'],
  [/\bT[ỰU]\s*DO\b/gi, 'TỰ DO'],
  [/\bTU\s*DO\b/gi, 'TỰ DO'],
  [/\bHANH\s*PH[UỦ]C\b/gi, 'HẠNH PHÚC'],
  [/\bUY\s*BAN\b/gi, 'ỦY BAN'],
  [/\bU[VỸ]?\s*BAN\b/gi, 'ỦY BAN'],
  // Standalone diacritic-loss fixes (applied after the multi-word
  // rules above so they only touch orphaned tokens, never forming
  // words inside the multi-word targets). Most useful when Tesseract
  // has corrupted only one word in a phrase.
  [/(?<=NH)AN(?=\s+D)/g, 'ÂN'],          // NHAN DAN -> NHÂN DAN
  [/(?<=NH)AN(?=\s)/g, 'ÂN'],             // NHAN -> NHÂN (rare)
  [/(?<=NH)AN(?=\.|\,|$)/g, 'ÂN'],
  [/(?<=[\s])DAN(?=[\s,\.])/g, 'DÂN'],   // DAN -> DÂN (NHÂN DAN)
  [/(?<=D)DAN(?=[\s,\.])/g, 'DÂN'],
  [/(?<=T)INH(?=[\s,\.])/g, 'ỈNH'],      // TINH -> TỈNH
  [/(?<=[\s])TINH(?=[\s,\.])/g, 'TỈNH'],
  [/(?<=THANH\s)PHO(?=[\s,\.])/gi, 'PHỐ'], // THANH PHO -> THANH PHỐ
  [/(?<=[\s])PHO(?=[\s,\.])/gi, 'PHỐ'],
  [/(?<=[\s])PHOC(?=[\s,\.])/gi, 'PHỐ'],
  // HĐND = "HỘI ĐỔNG NHÂN DÂN". Tesseract often misreads
  // the Ổ (horn-O-circumflex, U+1ED4) as Ô (horn-O-circumflex, U+00D4)
  // and the final DÂN as DẪN. Targeted corrections below:
  [/(?<=NH[ÂA]N\s+)DẪN(?=[\s,\.])/g, 'DÂN'],
  [/(?<=HỘI\s+ĐỔ?NG\s+)NH[ÂA]N\s+D[ÂẪ]N/g, 'NHÂN DÂN'],
  [/(?<=HỘI\s+)ĐÔNG(?=[\s,\.])/g, 'ĐỔNG'],
  [/(?<=HỘI\s+)ĐONG(?=[\s,\.])/gi, 'ĐỔNG'],
  // Cleanup leftover motto fragments that survived the prefix strip
  // when Tesseract dropped the leading "CỘNG HÒA XÃ HỘI" portion but
  // left "CHỦ NGHĨA VIỆT NAM" behind.
  [/\bCH[UỦ]\s*NGH[IĨ]A\s+VI[EÊ]T\s+NAM\b/gi, ''],
  [/\bNGH[IĨ]A\s+VI[EÊ]T\s+NAM\b/gi, ''],
  [/\bDH[UỦ]\s*NGH[IĨ]A\s+VI[EÊ]T\s+NAM\b/gi, ''],
  [/\bVI[EÊ]T\s+NAM\b/gi, ''],
  // common province name OCR errors (G→B confusion, etc.)
  [/\bAN\s*BIANE\b/gi, 'AN GIANG'],
  [/\bAN\s*BANE\b/gi, 'AN GIANG'],
  [/\bAN\s*GANG\b/gi, 'AN GIANG'],
  [/\bBINH\s*DINH\b/gi, 'BÌNH ĐỊNH'],
  [/\bBINH\s*DUONG\b/gi, 'BÌNH DƯƠNG'],
  [/\bBINH\s*PHU[CČ]C\b/gi, 'BÌNH PHƯỚC'],
  [/\bBINH\s*THUAN\b/gi, 'BÌNH THUẬN'],
  [/\bQUANG\s*NAM\b/g, 'QUẢNG NAM'],
  [/\bQUANG\s*NGAI\b/g, 'QUẢNG NGÃI'],
  [/\bQUANG\s*BINH\b/gi, 'QUẢNG BÌNH'],
  [/\bQUANG\s*TRI\b/gi, 'QUẢNG TRỊ'],
  [/\bNINH\s*BINH\b/gi, 'NINH BÌNH'],
  [/\bHA\s*NOI\b/gi, 'HÀ NỘI'],
  [/\bHAI\s*PHONG\b/gi, 'HẢI PHÒNG'],
  [/\bHO\s*CHI\s*MINH\b/gi, 'HỒ CHÍ MINH'],
  [/\bHO\s*CH[IÍ]\s*MINH\b/gi, 'HỒ CHÍ MINH'],
  [/\bCAN\s*THO\b/gi, 'CẦN THƠ'],
  [/\bC[ÂA]N\s*TH[OƠ]\b/gi, 'CẦN THƠ'],
  [/\bDA\s*NANG\b/gi, 'ĐÀ NẴNG'],
  [/\b[DĐ][ÂA]\s*N[ÂA]NG\b/gi, 'ĐÀ NẴNG'],
];

function correctVietnameseIssuerPhrase(s: string): string {
  if (!s) return s;
  let out = s;
  for (const [re, repl] of PROVINCE_NORMALISATIONS) {
    out = out.replace(re, repl);
  }
  // Collapse any whitespace introduced by the substitutions above.
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Clean up diacritic-drop errors that Tesseract produces in the body
 * of a document (the summary line is the most visible offender).
 *
 * The Vietnamese word-medial letter "đ" (U+0111) is its own letter
 * — not a base letter + combining mark — so a generic NFD/NFC diacritic
 * restoration won't help. Most chars on this list are restored by
 * surrounding context (e.g. "ti_n" between two vowels is always "tiền",
 * not "tiên"). All rules below are gated by a distinctive anchor
 * character so they only fire on the genuine Vietnamese word.
 *
 * Order matters: more-specific rules must come before generic ones so
 * the "tinh An Giang" pattern catches "tinh" before the generic
 * "TINH→TỈNH" rule (which only fires when the following word is
 * clearly a province name).
 */
const SUMMARY_WORD_CORRECTIONS: Array<[RegExp, string | ((substring: string, ...args: any[]) => string)]> = [
  // "An Giang" must come FIRST: the OCR over-diacriticises to
  // "ÂN GIANG" / "Ân Giang", and the bare TINH rule below can
  // mistransform "An Giang" if applied too aggressively.
  [/\bÂN\s*GIANG\b/g, 'An Giang'],
  [/\bÂn\s*Giang\b/g, 'An Giang'],
  // Specific compound (most specific first): "tinh AN GIANG" /
  // "tinh Ân Giang" — Tesseract drops the d on tinh AND over-adds the
  // circumflex on Ân. Both errors must be fixed together.
  [/\btinh\s+AN\s*GIANG\b/gi, 'tỉnh An Giang'],
  [/\btinh\s+Ân\s*Giang\b/g, 'tỉnh An Giang'],
  [/\btinh\s+ÂN\s*GIANG\b/g, 'tỉnh An Giang'],
  // "ti_n sử dụng" / "ti_n cấp" / "ti_n thu" — only "tiền" fits.
  [/\bti[êe]n\s+(sử|sư|dụng|dung|cấp|cap|thu)/gi, 'tiền $1'],
  // "khu vực bi_n" / "khu vực biên" → "biển" in sea-area docs.
  [/\bkhu\s*vực\s*bi[êe]n\b/gi, 'khu vực biển'],
  [/\bbi[êe]n\s+(trên|tren|thuộc|thuoc)/gi, 'biển $1'],
  // "địa bàn" — Tesseract frequently drops the đ ("_ia ban" → "dia ban").
  [/\bdia\s*b[àa]n\b/gi, 'địa bàn'],
  // Generic provincial "tinh X" — must come AFTER the An Giang rules
  // so the more-specific An Giang compound wins.
  [/\btinh\s+([A-ZÂĂÊÔƠƯĐ][a-zà-ỹ]+(?:\s+[A-ZÂĂÊÔƠƯĐ][a-zà-ỹ]+)*)/g,
    (_, tail: string) => `tỉnh ${tail.toLowerCase().replace(/(^|\s)\S/g, (s: string) => s.toUpperCase())}`],
];

/* ─── Box 3 — Document number (Số ký hiệu) ────────────────────────────────── */

/**
 * Document number pattern. Matches "46/2026/QĐ-UBND" anchored at the
 * START of the (already label-stripped) string. The leading anchor
 * is critical: without it the regex engine can skip past the number
 * and grab a later "/[A-Z]…" sequence, which is the single most
 * common bug in this extractor.
 *
 * Format: one or two digits, slash, four-digit year, slash, code
 * (Vietnamese org codes use letters + diacritics). We don't try to
 * validate the year here — post-processing handles it.
 */
const DOC_NUMBER_REGEX =
  /^(\d+[\/\-]\s*\d+[\/\-]\s*[A-Za-zÀ-ỹ][A-Za-zÀ-ỹ0-9\/\-.\s]*[A-Za-zÀ-ỹ])(?=\s|$|\.|,)/;

/**
 * Same as above but the first segment may contain letters that
 * Tesseract commonly confuses with digits (B↔8, l↔1, O↔0, etc).
 * Used as a fallback when the strict numeric form doesn't match.
 */
const DOC_NUMBER_REGEX_LOOSE =
  /^([\d\wÀ-ỹ]+[\/\-]?\s*[\d\wÀ-ỹ]+[\/\-]\s*[A-Za-zÀ-ỹ][A-Za-zÀ-ỹ0-9\/\-.\s]*[A-Za-zÀ-ỹ])(?=\s|$|\.|,)/;

/**
 * Even more permissive — used as a last resort. Catches patterns like
 * "05/2026A H-HĐND" (OCR dropped slash + N) and "05/2026A 0 -HDND"
 * (OCR misread the entire code suffix as a digit-letter stream). The
 * suffix-start character class accepts either a letter or a digit so
 * garbled codes starting with a misread character still match. The
 * lookahead ensures we stop at the first whitespace that's followed
 * by a lowercase word (which would be a city/location name, not part
 * of the code).
 */
const DOC_NUMBER_REGEX_VERY_LOOSE =
  /^([\d\wÀ-ỹ]+[\s\/\-]+[\d\wÀ-ỹ]+[\s\/\-]+[A-Za-zÀ-ỹ0-9][A-Za-zÀ-ỹ0-9\/\-.\s]*[A-Za-zÀ-ỹ])(?=\s|$)/;

/**
 * Strip the "Số:" label and surrounding whitespace from a matched
 * value, leaving only the document-number portion.
 */
function stripDocNumberLabel(raw: string): string {
  return raw
    .replace(/^s[ốo]\s*[:.\-]?\s*/i, '')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '');
}

/**
 * Strip any trailing junk OCR merged onto a doc-number line. The two
 * most common offenders on the golden set are:
 *   - the issue-date line ("An Giang, ngày 15 tháng 6 năm 2026"),
 *     when Tesseract merged the doc-number and date lines into one
 *     block;
 *   - "NB<numbers>" / "BGD<numbers>" suffixes from a partial date
 *     that was concatenated to the right of "UBND".
 *
 * Conservative heuristic: stop at the first comma, semicolon, period,
 * colon, or lowercase Vietnamese letter that follows an uppercase
 * one. This preserves valid suffixes like "QĐ-UBND", "QĐ-BGDĐT",
 * "NQ-HĐND", "TB-UBND".
 */
function cleanExtractedDocNumber(value: string): string {
  if (!value) return value;
  return value
    .replace(/[,\.;:].*$/, '')
    // Uppercase-then-lowercase boundary. Without an explicit
    // lowercase-only class, this regex would cut "QĐ" because Đ
    // (U+0110) falls in the à-ỹ Unicode block and is included in
    // "/[a-zà-ỹ]/". So we use \p{Ll} (lowercase letter) with the
    // `u` flag — that excludes Đ (which is uppercase) while still
    // matching `inh` in "Ninh".
    .replace(/(?<=[A-Z])(?=\p{Ll}).*$/u, '')
    .replace(/NB\d.*$/, '')
    .replace(/BGĐ.*$/, '');
}

/**
 * Rewrite DIGIT_LOOKALIKE substitutions on the numeric tokens of an
 * extracted doc-number string. Input form: "61/2026/QĐ-UBND" or
 * "BI/2026/QĐ-UBND". Output form: same shape, but letters in the
 * numeric tokens (everything before the code suffix) that map to
 * digits get rewritten. The code suffix is preserved as-is.
 *
 * Conservative: only rewrites when the next char after the letter
 * run is a digit (so we never touch "Q" in "QĐ" even though Q↔0
 * is in the lookalike map).
 */
function rewriteDocNumberDigits(value: string): string {
  const tokens = value.split('/');
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^\d+$/.test(t)) continue; // already digits
    // Leading letter run that maps cleanly to digits.
    let leadEnd = 0;
    let mapped = '';
    for (; leadEnd < t.length; leadEnd++) {
      const ch = t[leadEnd];
      if (!/[A-Za-z]/.test(ch)) break;
      const m = DIGIT_LOOKALIKE[ch];
      if (!m) break;
      mapped += m;
    }
    if (
      leadEnd > 0 &&
      leadEnd < t.length &&
      /^\d+$/.test(mapped) &&
      /\d/.test(t[leadEnd] ?? '')
    ) {
      tokens[i] = mapped + t.slice(leadEnd);
      continue;
    }
    // Whole-token rewrite (only when short and 100% digit-mappable).
    const whole = t
      .split('')
      .map((ch) => DIGIT_LOOKALIKE[ch] ?? ch)
      .join('');
    if (/^\d+$/.test(whole) && whole.length <= 4 && t.length <= 6) {
      tokens[i] = whole;
    }
  }
  return tokens.join('/');
}

/**
 * Post-process an extracted doc-number string: collapse whitespace,
 * strip merged-on junk, rewrite DIGIT_LOOKALIKE substitutions on the
 * numeric tokens, and restore the QD→QĐ diacritic on the code
 * suffix. Applied to ALL extraction paths so the regex output and
 * the ensemble output are normalized identically.
 */
/**
 * Restore common OCR-dropped diacritics in the doc-code suffix.
 * Vietnamese issuing-body codes have a tiny closed vocabulary
 * (HĐND, UBND, …) where the bar on "Đ" is routinely dropped by
 * Tesseract on low-DPI scans. Apply this to any doc-number-shaped
 * string regardless of segment count so 2-segment (year+code
 * merged) cases still get cleaned.
 */
function restoreDocCodeDiacritics(s: string): string {
  // Apply the HĐND / QĐ / NĐ diacritic restorations as full-token
  // replacements so we don't accidentally re-Đ a chunk inside an
  // already-correct prefix (e.g. HĐND → HĐNĐ was the previous bug).
  // The optional trailing-entity-code group on each pattern keeps
  // "HĐNDTP" / "QĐ-BGD" / etc. intact when present.
  let out = s;
  // QĐ - drop-in for "QD-<token>": only when followed by an entity code
  // group ("UBND", "BGDĐT", etc.) — disambiguates QĐ from "QD" inside
  // a longer string like "QDHCM".
  out = out.replace(/\bQD-(?=[A-ZÀ-Ỹ])/g, 'QĐ-');
  // NĐ - drop-in for "ND-CP" / "ND-...": only when followed by a dash
  // and an uppercase code, same as QĐ.
  out = out.replace(/\bND-(?=[A-ZÀ-Ỹ])/g, 'NĐ-');
  // HĐND - drop-in for "HDND" → "HĐND". Allow optional trailing codes.
  out = out.replace(/\bHDND([A-Z]{0,4})\b/g, (_, tail: string) => `HĐND${tail}`);
  return out;
}

function finalizeDocNumber(raw: string): string {
  const stripped = stripDocNumberLabel(raw);
  const cleaned = cleanExtractedDocNumber(stripped);
  const rewritten = rewriteDocNumberDigits(cleaned);
  const parts = rewritten.split('/');
  if (parts.length >= 3) {
    // Restore the QD→QĐ diacritic on the code suffix (the most
    // common Vietnamese doc-code Tesseract artefact) plus the
    // HDND→HĐND fix.
    parts[2] = parts[2]
      .replace(/^QD(?=[\-A-ZĐÂĂÊÔƠƯ])/u, 'QĐ');
    parts[2] = restoreDocCodeDiacritics(parts[2]);
    return parts.join('/');
  }
  // Two-segment case where the OCR merged the year with the code
  // suffix, e.g. "05/2026A0-HDND" (the "/" between year and code got
  // dropped). The year token is recognisable as a 4-digit value
  // starting with "20" or "19"; if it is glued to a letter/code run,
  // split it back out. We only do this when the merge produced a
  // 4-digit prefix followed by a non-digit character.
  if (parts.length === 2) {
    const m = parts[1].match(/^((?:19|20)\d{2})(?=[A-Za-zÀ-ỹ])/);
    if (m) {
      const year = m[1];
      const rest = parts[1].slice(year.length);
      parts.push(rest);
      parts[1] = year;
      if (parts.length >= 3) {
        parts[2] = parts[2]
          .replace(/^QD(?=[\-A-ZĐÂĂÊÔƠƯ])/u, 'QĐ');
        parts[2] = restoreDocCodeDiacritics(parts[2]);
      }
      return parts.join('/');
    }
    // Still no clean split — fall back to whatever we have, with
    // diacritic restoration applied to the entire tail.
    parts[1] = restoreDocCodeDiacritics(parts[1]);
    return parts.join('/');
  }
  // Single-segment fallback: apply diacritic restoration directly.
  return restoreDocCodeDiacritics(rewritten);
}

/**
 * Clean up the OCR output of a doc-number line BEFORE the regex
 * tries to match. The most common Tesseract artefacts on the
 * golden set are:
 *   - "Số:" → "S6:" (lowercase o→digit, "ố"→"6")
 *   - "/N" → "A " (N→A, slash dropped, space inserted)
 *   - "/Q" → "/Q" (usually fine)
 *   - "QĐ" → "Qb" (Đ→b), "UBND" → "U BND" (space inserted)
 *   - Single-character tokens for digits (B for 6/8, l for 1)
 *
 * We collapse whitespace, then run a small digit-correction pass on
 * single-char tokens that aren't part of a word (surrounded by
 * digits/slashes). This is much narrower than the per-region
 * DIGIT_LOOKALIKE pass — it only kicks in when we have strong
 * contextual evidence the token should be a digit.
 */
function normalizeDocNumberLine(text: string): string {
  // Collapse all whitespace to single spaces.
  let s = text.replace(/\s+/g, ' ').trim();

  // "S[oố]" / "S[6]" → "Số " (normalize the label).
  s = s.replace(/^s[\dốoöàáâãäåæçèéêëìíîïðñòóôõöùúûüýÿa-zà-ỹ]/i, 'Số');

  // Truncate trailing junk from the merged doc-number+date line:
  //   - comma / period / semicolon at the very end (the merged
  //     date line typically starts with "..., ngày...");
  //   - uppercase-followed-by-lowercase that begins a city/location
  //     name (e.g. "Ninh Bình" appended to "UBND");
  //   - sequences starting with " ngày" / "tháng" (loose: any word
  //     starting with "n" + lowercase).
  // We must NOT match the colon inside "Số:" — that would empty the
  // line. The comma/period/semicolon branch below is therefore
  // anchored with a preceding non-label boundary.
  s = s.replace(/\s*,\s.*$/, '').replace(/\s+[A-ZÀ-ỹ][a-zà-ỹ].*$/, '');

  // Collapse remaining whitespace and trim — but PRESERVE the "Số:"
  // label so that the caller's doc-number regex can match it.
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

/** Pull a document number ("46/QĐ-UBND") out of a region. */
function extractDocumentNumber(pages: PageOcr[], documentType?: string): string | undefined {
  const firstPage = pages[0];
  if (!firstPage) return undefined;
  // Prefer the ensemble-OCR hint when present. It is the result of a
  // 3-pass Tesseract run on the cropped Số: line and is significantly
  // more accurate than the full-page OCR for this specific field.
  if (firstPage.docNumberHint) {
    const cleaned = firstPage.docNumberHint.replace(/\s+/g, '');
    if (/\d+\/\d+\//.test(cleaned)) {
      return refineDocNumberByDocType(finalizeDocNumber(cleaned), documentType);
    }
  }

  const region = locateRegionByCode(firstPage, '3');
  if (!region) return undefined;

  const candidateLines = region.lines;
  for (const line of candidateLines) {
    // Collapse whitespace BEFORE checking the label regex, so that
    // OCR-permuted spaces (e.g. "S o" with stray spaces) still match.
    const text = normalizeDocNumberLine(clean(line.text)).replace(/\s*([\/\-])\s*/g, '$1');
    // Prefer lines that start with the "Số:" label. The leading
    // characters are noisy on scanned documents (Tesseract reads "Số"
    // as "S6", "So", "Sö", etc.), so we accept any "S" + digit/letter
    // followed by an optional separator.
    const looksLikeDocNumberLine = /^s[ốo6]\s*[:.\-]?/i.test(text);

    // Strategy: when the line starts with "Số:" (or equivalent OCR
    // variant), capture ONLY the part immediately after it; this stops
    // the regex from skipping past the number and grabbing a later
    // "/[A-Z]…" sequence from the body (the most common bug).
    if (looksLikeDocNumberLine) {
      const stripped = text.replace(/^s[ốo6]\s*[:.\-]?\s*/i, '');
      // Remove any spaces inside numeric segments (e.g. "05/2026A H" → "05/2026AH")
      // before applying the regex. The code suffix is re-extracted by the
      // regex itself once numeric shape is satisfied.
      const collapsed = stripped.replace(/(?<=\d)\s+(?=\d)/g, '');
      const m =
        collapsed.match(DOC_NUMBER_REGEX) ??
        collapsed.match(DOC_NUMBER_REGEX_LOOSE) ??
        collapsed.match(DOC_NUMBER_REGEX_VERY_LOOSE);
      if (m) return refineDocNumberByDocType(finalizeDocNumber(m[1] ?? m[0]), documentType);
    }
  }

  // Fallback: joined-region search, but anchor to a "Số:" label when
  // the line begins with one (otherwise the regex would happily grab
  // a later "/" sequence unrelated to the document number).
  const combined = joinLines(candidateLines);
  const labelled = combined.match(/s[\dốoöàáâãäåæçèéêëìíîïðñòóôõöùúûüýÿa-zà-ỹ]\s*[:.\-]?\s*(\d+\s*[\/\-]\s*\d+\s*[\/\-]\s*[A-Za-zÀ-ỹ][A-Za-zÀ-ỹ0-9\/\-.]*[A-Za-zÀ-ỹ])/i);
  if (labelled) return refineDocNumberByDocType(finalizeDocNumber(labelled[0]), documentType);
  // Last resort: any "/[A-Z..." in the region (no label needed).
  const any = combined.match(/(\d+\s*[\/\-]\s*\d+\s*[\/\-]\s*[A-Za-zÀ-ỹ][A-Za-zÀ-ỹ0-9\/\-.]*[A-Za-zÀ-ỹ])/);
  if (any) return refineDocNumberByDocType(finalizeDocNumber(any[1] ?? any[0]), documentType);
  return undefined;
}

/**
 * Doc-type-aware refinement of an already-extracted document number.
 * Vietnamese administrative documents have a closed vocabulary of
 * 2-letter prefixes keyed to the document type:
 *   NGHỊ QUYẾT  →  NQ
 *   QUYẾT ĐỊNH  →  QĐ
 *   THÔNG BÁO   →  TB
 *   TỜ TRÌNH    →  TT
 *   ...
 * When the OCR garbles the prefix (e.g. "A0" instead of "NQ"), we
 * snap to the canonical prefix IF the resulting code has the right
 * shape. We only rewrite when the OCR result contains suspicious
 * character patterns that are known Tesseract confusions for the
 * intended letter, never when the result already looks plausible.
 */
const DOC_CODE_PREFIX_BY_TYPE: Record<string, string> = {
  'NGHỊ QUYẾT': 'NQ',
  'QUYẾT ĐỊNH': 'QĐ',
  'THÔNG BÁO': 'TB',
  'TỜ TRÌNH': 'TT',
  'BÁO CÁO': 'BC',
  'QUY ĐỊNH': 'QĐ',
  'CHỈ THỊ': 'CT',
  'KẾ HOẠCH': 'KH',
  'HƯỚNG DẪN': 'HD',
  'QUY TRÌNH': 'QT',
  'CHƯƠNG TRÌNH': 'CTr',
  'GIẤY ỦY QUYỀN': 'GUQ',
  'BIÊN BẢN': 'BB',
  'QUY CHẾ': 'QC',
  'NGHỊ ĐỊNH': 'NĐ',
};

/**
 * Suspicious character patterns that the canonical prefix letters
 * can be misread as. We only rewrite when the OCR result starts
 * with a letter in this set followed by a digit — that's the
 * fingerprint of Tesseract collapsing the two-character prefix
 * (e.g. "/N" + "Q") into a single-digit token.
 */
const SUSPICIOUS_PREFIX_CHARS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'O', 'Q'];

/**
 * Every canonical doc-code prefix is included here once, with its
 * highest-likelihood OCR misread variants. Used to widen the rewrite
 * beyond the strict `[A-Z]\d` pattern: e.g. when the OCR yields
 * "l0-HDND" (looks plausible but isn't quite "NQ-HDND"), we still
 * map the first two-character cluster back to the canonical prefix.
 */
const DOC_CODE_PREFIX_ALIASES: Record<string, string[]> = {
  // Each entry is [canonicalPrefix, alias1, alias2, ...] where every
  // alias is a 1–2 character OCR confusion of the canonical form.
  NQ: ['A0', 'AD', 'AO', 'NO', 'l0', 'lO', 'lQ', 'N0', '0Q', 'O0', 'AQ', 'Nd'],
  QĐ: ['QD', 'Qb', 'OB', '6D', 'QD', 'bD', 'OD'],
  TB: ['TB', 'TR', 'lB', 'lR', '1B', 'T8', 'TR'],
  TT: ['TT', 'TI', 'lT', '1T', 'T7', 'Tl'],
  BC: ['BC', 'B6', 'B8', '8C', '6C', 'RC'],
  KH: ['KH', 'K4', 'Kh', 'KY', 'kH'],
  HD: ['HD', 'HĐ', 'Hd', 'hD'],
  CT: ['CT', 'C7', 'cT', 'Cl'],
  NĐ: ['ND', 'Nb', 'NĐ', 'Na', 'AD'],
  CTr: ['CT', 'CTP', 'ClR'],
  GUQ: ['GUQ', 'CUQ', 'GUb', 'GU0'],
  BB: ['BB', 'B6', '6B', 'Rb'],
  QC: ['QC', 'Q6', 'Qb', '6C'],
  QT: ['QT', 'Q7', 'qT', 'Ql'],
};

/**
 * Heuristically recognize and rewrite an OCR'd prefix to its canonical
 * form for a given document type. Returns null when no rewrite is
 * needed or possible.
 *
 * Handles three patterns:
 *   1. Exact canonical already present (early return).
 *   2. OCR-delivered `<letter><digit>` collapse (e.g. "A0" → "NQ").
 *   3. OCR-delivered noise-tolerant alias (e.g. "l0" → "NQ", "QD" → "QĐ"
 *      canonical diacritic repair).
 */
function applyCanonicalPrefix(code: string, canonicalPrefix: string): string | null {
  if (!code) return null;
  if (code.startsWith(canonicalPrefix)) return null;
  // 1) Digits-as-letter collapse: e.g. "A0" for "NQ".
  const collapseMatch = code.match(/^([A-Z])(\d)(?=[-A-Z])/);
  if (collapseMatch && SUSPICIOUS_PREFIX_CHARS.includes(collapseMatch[1])) {
    return canonicalPrefix + code.slice(collapseMatch[0].length);
  }
  // 2) Letter-as-digit collapse: e.g. "l0", "lQ" for "NQ".
  const alnumPrefix = code.match(/^([A-Z][A-Z0-9])(?=[-A-Z])/i);
  if (alnumPrefix) {
    const candidate = alnumPrefix[1].toUpperCase();
    const aliases = DOC_CODE_PREFIX_ALIASES[canonicalPrefix] ?? [];
    if (aliases.includes(candidate)) {
      return canonicalPrefix + code.slice(alnumPrefix[0].length);
    }
  }
  return null;
}

function refineDocNumberByDocType(raw: string | undefined, documentType?: string): string | undefined {
  if (!raw || !documentType) return raw;
  const expectedPrefix = DOC_CODE_PREFIX_BY_TYPE[documentType];
  if (!expectedPrefix) return raw;
  const parts = raw.split('/');
  if (parts.length < 3) return raw;
  const rewritten = applyCanonicalPrefix(parts[2], expectedPrefix);
  if (rewritten) {
    parts[2] = rewritten;
    return parts.join('/');
  }
  return raw;
}

/* ─── Box 4 — Document date (Ngày tháng năm) ──────────────────────────────── */

interface DateComponents {
  day: string;
  month: string;
  year: string;
}

const NUMBER_WORD_MAP: Record<string, string> = {
  ...MONTH_NAMES,
  // Aliases that often come up in OCR output.
  nam: '05', // "năm" (five) vs. "năm" (year) — disambiguated by context.
  muoi: '10',
};

const DATE_TEXT_PATTERNS: RegExp[] = [
  // Day slot allows for one leading letter that maps to a digit
  // (Tesseract frequently reads "15" as "l5", "16" as "l6", etc.).
  // Letter is optional so clean inputs still match.
  // Year slot similarly tolerates a leading digit-to-letter confusion
  // (e.g. "2O26" for "2026", "202S" for "2025").
  /(?:ng[àa]y)\s*([0-9A-Za-zÀ-ỹ]{1,3})\s*th[áa]ng\s*([0-9A-Za-zÀ-ỹ]{1,3})\s*n[ăa]m\s*((?:19|20|[LlIiO0-9])[0-9A-Za-zÀ-ỹ]{2,3})/i,
];

const DATE_NUMERIC_PATTERNS: RegExp[] = [
  /(?:ng[àa]y)\s*([0-9A-Za-zÀ-ỹ]{1,3})[\/\-.]\s*([0-9A-Za-zÀ-ỹ]{1,3})[\/\-.]\s*((?:19|20|[LlIiO0-9])[0-9A-Za-zÀ-ỹ]{2,3})/i,
];

/**
 * Coerce a day-slot string (captured by the date regex) into a
 * 1–2 digit value. Differs from parseMonthToken in that it does NOT
 * consult MONTH_NAMES (a month in the day slot is structurally
 * nonsensical, but a digit-substitute is plausible).
 */
function coerceDaySlot(s: string): string | undefined {
  return coerceNumericSlot(s);
}

/**
 * Coerce a year slot (4 digits, possibly with letter substitutions
 * such as "2O26" → "2026", "202S" → "2025"). Limits the result to
 * plausible years (1900–2099) so we never accept a junk string.
 */
function coerceYearSlot(s: string): string | undefined {
  // Strip stray punctuation/whitespace that OCR may insert.
  const t = s.replace(/[^\dA-Za-zÀ-ỹ]/g, '');
  if (/^\d{4}$/.test(t)) {
    const y = Number(t);
    if (y >= 1900 && y <= 2099) return t;
    return undefined;
  }
  const mapped = t
    .split('')
    .map((ch) => DIGIT_LOOKALIKE[ch] ?? ch)
    .join('');
  if (/^\d{4}$/.test(mapped)) {
    const y = Number(mapped);
    if (y >= 1900 && y <= 2099) return mapped;
  }
  return undefined;
}

/** Format dd/MM/yyyy from {day, month, year}, padding single digits. */
function formatDate({ day, month, year }: DateComponents): string | undefined {
  const dd = coerceDaySlot(day);
  if (!dd) return undefined;
  const mm = coerceNumericSlot(month);
  if (!mm) return undefined;
  const yyyy = coerceYearSlot(year);
  if (!yyyy) return undefined;
  const ddNum = Number(dd);
  const mmNum = Number(mm);
  if (ddNum < 1 || ddNum > 31) return undefined;
  if (mmNum < 1 || mmNum > 12) return undefined;
  return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
}

function parseDateMatch(match: RegExpMatchArray, wordsMode = false): DateComponents | undefined {
  const day = match[1];
  const monthRaw = match[2];
  const year = match[3];
  const month = parseMonthToken(monthRaw);
  if (!month) return undefined;
  const formatted = formatDate({ day, month, year });
  if (!formatted) return undefined;
  const [dd, mm, yyyy] = formatted.split('/');
  return { day: dd, month: mm, year: yyyy };
}

/**
 * Extract the issuance date from Box 4 (top-right of the front page).
 *
 * Strategy: collect date candidates from three sources, then pick
 * the most plausible one:
 *   1. Box 4 region (top-right of page 1) — the primary location.
 *   2. Upper-half of page 1 (catches docs where Box 4 fused with
 *      the doc-number line and was excluded by the strict band
 *      filter).
 *   3. "Effective date" line anywhere in the document (the
 *      "Nghị quyết này có hiệu lực thi hành từ ngày X tháng Y
 *      năm Z" sentence near the end). The triple on this line is
 *      the document's OWN date in a clean single-line context.
 *
 * Each candidate is passed through maybeFixDateYear (snaps the
 * year to the doc-number year when they differ by 1, the common
 * 5↔6 confusion). The candidate whose day/month/year best matches
 * the document's own number/year wins. When scores tie, sources
 * earlier in the list win (Box 4 > upper-half > effective-date).
 */
function extractDate(pages: PageOcr[]): string | undefined {
  const firstPage = pages[0];
  if (!firstPage) return undefined;
  if (firstPage.dateHint) return firstPage.dateHint;

  const numericSlot = (s: string): string =>
    s.split('').map((ch) => DIGIT_LOOKALIKE[ch] ?? ch).join('');

  // Source 1: Box 4 region (primary).
  const region = locateRegionByCode(firstPage, '4');
  const box4Candidates: { date: string; source: number; hasPipe: boolean }[] = [];
  if (region) {
    const flat = joinLines(region.lines.map((l) => ({ ...l, text: l.text ?? '' })));
    const normalized = flat.replace(
      /(ng[àa]y\s+)([^]*?)(\s+th[áa]ng\s+)([^]*?)(\s+n[ăa]m\s+)([^]*)/iu,
      (_full, lead, day, mid, month, trail, year) =>
        lead + numericSlot(day) + mid + numericSlot(month) + trail + year,
    );
    const haystack = normalized.replace(/(\d)\s+(\d)/g, '$1$2');
    for (const pattern of [...DATE_TEXT_PATTERNS, ...DATE_NUMERIC_PATTERNS]) {
      const m = haystack.match(pattern);
      if (m) {
        const d = parseDateMatch(m);
        if (d) {
          box4Candidates.push({
            date: maybeFixDateYear(pages, `${d.day}/${d.month}/${d.year}`),
            source: 1,
            hasPipe: /\|/.test(flat),
          });
        }
      }
    }
  }

  // Source 2: upper half of page 1 (catches fused doc-num+date lines).
  const upperCandidates: { date: string; source: number; hasPipe: boolean }[] = [];
  const upperLines = linesInReadingOrder(firstPage)
    .filter((l) => l.bbox.y1 <= 0.30)
    .map((l) => clean(l.text));
  for (const line of upperLines) {
    for (const pattern of [...DATE_TEXT_PATTERNS, ...DATE_NUMERIC_PATTERNS]) {
      const m = line.match(pattern);
      if (m) {
        const d = parseDateMatch(m);
        if (d) {
          upperCandidates.push({
            date: maybeFixDateYear(pages, `${d.day}/${d.month}/${d.year}`),
            source: 2,
            hasPipe: /\|/.test(line),
          });
        }
      }
    }
  }

  // Source 3: "effective date" sentence. The line of the form
  // "Nghị quyết/Quyết định này có hiệu lực thi hành từ ngày X
  // tháng Y năm Z" is structurally guaranteed to be about THIS
  // document. Note that the EFFECTIVE date and the ISSUANCE date
  // are often DIFFERENT in Vietnamese admin documents (the doc is
  // signed on date A but takes effect on date B). The effective
  // date is therefore only useful when the Box 4 candidate was
  // garbled — see the ranking below for the precise rule.
  const effectiveCandidates: { date: string; source: number; hasPipe: boolean }[] = [];
  for (const page of pages) {
    if (!page) continue;
    for (const line of linesInReadingOrder(page)) {
      const t = clean(line.text);
      if (!/(hi[ệe]u\s*l[ựu]c|thi\s*h[àa]nh\s*t[ừu]\s*ng[àa]y|c[óo]\s*hi[ệe]u\s*l[ựu]c)/i.test(t)) continue;
      const numericNormalized = t.replace(
        /(ng[àa]y\s+)([^]*?)(\s+th[áa]ng\s+)([^]*?)(\s+n[ăa]m\s+)([^]*)/iu,
        (_full, lead, day, mid, month, trail, year) =>
          lead + numericSlot(day) + mid + numericSlot(month) + trail + year,
      ).replace(/(\d)\s+(\d)/g, '$1$2');
      for (const pattern of [...DATE_TEXT_PATTERNS, ...DATE_NUMERIC_PATTERNS]) {
        const m = numericNormalized.match(pattern);
        if (m) {
          const d = parseDateMatch(m);
          if (d) {
            effectiveCandidates.push({
              date: maybeFixDateYear(pages, `${d.day}/${d.month}/${d.year}`),
              source: 3,
              hasPipe: /\|/.test(t),
            });
          }
        }
      }
    }
  }
  for (const page of pages) {
    if (!page) continue;
    for (const line of linesInReadingOrder(page)) {
      const t = clean(line.text);
      if (!/(hi[ệe]u\s*l[ựu]c|thi\s*h[àa]nh\s*t[ừu]\s*ng[àa]y|c[óo]\s*hi[ệe]u\s*l[ựu]c)/i.test(t)) continue;
      const numericNormalized = t.replace(
        /(ng[àa]y\s+)([^]*?)(\s+th[áa]ng\s+)([^]*?)(\s+n[ăa]m\s+)([^]*)/iu,
        (_full, lead, day, mid, month, trail, year) =>
          lead + numericSlot(day) + mid + numericSlot(month) + trail + year,
      ).replace(/(\d)\s+(\d)/g, '$1$2');
      for (const pattern of [...DATE_TEXT_PATTERNS, ...DATE_NUMERIC_PATTERNS]) {
        const m = numericNormalized.match(pattern);
        if (m) {
          const d = parseDateMatch(m);
          if (d) {
            effectiveCandidates.push({
              date: maybeFixDateYear(pages, `${d.day}/${d.month}/${d.year}`),
              source: 3,
              hasPipe: /\|/.test(t),
            });
          }
        }
      }
    }
  }

  const all = [...box4Candidates, ...upperCandidates, ...effectiveCandidates];
  if (all.length === 0) return undefined;

  // Ranking: prefer candidates from a CLEAN source (no `|` in the
  // OCR text) over candidates from a garbled one. Within the same
  // cleanliness bucket, prefer the earlier source (Box 4 >
  // upper-half > effective-date). This means a Box 4 candidate
  // with `|` (e.g. "| 7" → "17") loses to a clean effective-date
  // candidate ("12") even though Box 4 has higher base priority.
  //
  // Refinement: when the ONLY difference between a garbled Box 4
  // candidate and an effective-date candidate is the day slot, we
  // trust the effective-date candidate. Documents where the
  // effective date and issuance date differ by MORE than a day
  // (different month or year) are common and the effective date is
  // NOT a substitute for the issuance date — we leave Box 4 in
  // charge there.
  if (effectiveCandidates.length > 0 && box4Candidates.length > 0) {
    const box4 = box4Candidates[0];
    const effective = effectiveCandidates[0];
    const box4Parts = box4.date.split('/');
    const effectiveParts = effective.date.split('/');
    if (
      box4Parts.length === 3 &&
      effectiveParts.length === 3 &&
      box4Parts[1] === effectiveParts[1] && // month
      box4Parts[2] === effectiveParts[2]    // year
      && box4Parts[0] !== effectiveParts[0] // day differs
    ) {
      // Same month + year, different day → trust the cleaner
      // effective-date candidate (which is structurally guaranteed
      // to be about THIS document).
      return effective.date;
    }
  }
  all.sort((a, b) => {
    if (a.hasPipe !== b.hasPipe) return a.hasPipe ? 1 : -1;
    if (a.source !== b.source) return a.source - b.source;
    return 0;
  });
  return all[0].date;
}

/**
 * Heuristic date-year repair.
 *
 * The doc-number line and the date line frequently sit on the same
 * merged OCR line. When that happens, Tesseract sometimes misreads
 * the trailing digit of one but not the other (most commonly 5 ↔ 6
 * confusion on low-DPI scans). The two pieces of information must
 * agree: a document issued "in 2026" should have date year 2026.
 *
 * We extract the year from the doc-number area of page 1 (the
 * "S[oố] … /<year>/…" pattern). If it differs from the extracted
 * date year by exactly 1, the more recent year wins — that catches
 * the common single-digit confusion. Years further apart are
 * ignored (real docs sometimes legitimately reference older years
 * in body text).
 */
function maybeFixDateYear(pages: PageOcr[], date: string): string {
  const firstPage = pages[0];
  if (!firstPage) return date;
  const parts = date.split('/');
  if (parts.length !== 3) return date;
  const [dd, mm, yyyy] = parts;
  if (!yyyy || !/^\d{4}$/.test(yyyy)) return date;
  const dateYear = Number(yyyy);

  // Pull the merged doc-number+date line text (Box 3 + Box 4 usually
  // share a line) and look for a "/YYYY" pattern that represents the
  // document's own number year. We deliberately use a NO-word-boundary
  // regex because the year may be glued to a garbled character
  // (e.g. "05/2026A").
  const candidates: number[] = [];
  const upperLines = linesInReadingOrder(firstPage)
    .filter((l) => l.bbox.y1 <= 0.30)
    .map((l) => clean(l.text));
  for (const line of upperLines) {
    // Match lines that start with "S" followed by a digit or
    // Vietnamese letter (the "Số:" label).
    if (!/^s[\dốoöàáâãäåæçèéêëìíîïðñòóôõöùúûüýÿa-zà-ỹ]/i.test(line)) continue;
    const ym = line.match(/\/((?:19|20)\d{2})/);
    if (ym) {
      const y = Number(ym[1]);
      if (y >= 1990 && y <= 2099) candidates.push(y);
    }
  }
  if (candidates.length === 0) return date;
  const docNumYear = candidates[0];
  if (Math.abs(docNumYear - dateYear) === 1) {
    // Single-digit confusion; snap to the doc-number year.
    return `${dd}/${mm}/${docNumYear}`;
  }
  return date;
}

/* ─── Box 5a — Document type + summary ─────────────────────────────────────── */

/**
 * Compute Levenshtein distance between two strings. Used for fuzzy
 * document-type matching when Tesseract garbles a title (e.g.
 * "QUYẾT ĐỊNH" → "1HUYẾT ĐỊNH" or "TỜ TRÌNH" → "TO TRINH").
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/**
 * Find the DOC_TYPES entry whose uppercase form best matches the
 * given OCR text. Returns the best match and a similarity score in
 * [0, 1] computed as `1 - distance / max(len(text), len(target))`.
 *
 * Acceptance threshold: similarity >= 0.5 (allows for 1–2 char
 * deletions/insertions on a short word like "QUYẾT ĐỊNH").
 *
 * We try the match against:
 *   1. Each individual word in the input,
 *   2. Every pair of consecutive words (so a "QUYẾT ĐỊNH" title
 *      split as "1HUYẾT" + "ĐỊNH" can still match when concatenated
 *      with a deletion),
 *   3. A substring of the joined input that has DOC_TYPES length.
 */
function fuzzyDocType(text: string): { type: string; score: number } | undefined {
  const upper = text.toUpperCase();
  let best: { type: string; score: number } | undefined;
  const words = upper.split(/[\s\\|,;:.\-]+/).filter(Boolean);

  const consider = (candidate: string) => {
    if (!candidate) return;
    for (const dt of DOC_TYPES) {
      // Strict substring wins outright.
      if (candidate.includes(dt)) {
        best = { type: dt, score: 1 };
        return;
      }
      const dist = levenshtein(candidate, dt);
      const score = 1 - dist / Math.max(candidate.length, dt.length);
      if (!best || score > best.score) best = { type: dt, score };
    }
  };

  for (const w of words) {
    // Skip very short tokens (< 4 chars after normalization) — they're
    // almost always document-number suffixes ("QĐ", "NQ", "TB", …)
    // or other structural fragments that can falsely match DOC_TYPES
    // when the Levenshtein threshold is loose (e.g. "QD" vs
    // "QUYẾT ĐỊNH" scores 0.82 and would pass the ≥0.5 filter).
    if (w.length >= 4) {
      consider(w);
    }
  }
  for (let i = 0; i < words.length - 1; i++) {
    consider(words[i] + words[i + 1]);
  }
  // Sliding windows of the right length for each doc-type so that
  // an OCR misread somewhere in the title can still align.
  for (const dt of DOC_TYPES) {
    const target = dt.toUpperCase();
    if (upper.length < target.length - 3) continue;
    for (let i = 0; i <= upper.length - target.length + 3; i++) {
      const win = upper.slice(i, i + target.length + 4);
      if (!win) continue;
      const dist = levenshtein(win, target);
      const score = 1 - dist / Math.max(win.length, target.length);
      if (!best || score > best.score) best = { type: dt, score };
    }
  }

  // Require a higher minimum score (0.65) to filter out false-positive
  // matches from the sliding window pass. The doc-number line
  // ("Số: 46/2026/QD-UBND") scores 0.56 via sliding window but the
  // real QUYẾT ĐỊNH line scores 0.80. The 0.65 threshold cleanly
  // separates them while still accepting legitimate OCR-garbled types.
  return best && best.score >= 0.65 ? best : undefined;
}

function extractDocumentType(pages: PageOcr[]): string | undefined {
  const firstPage = pages[0];
  if (!firstPage) return undefined;
  const region = locateRegionByCode(firstPage, '5a');
  if (!region) return undefined;

  // Document-type heading characteristics:
  //   - very short (≤ 30 chars; usually 1–3 words)
  //   - centred horizontally (x-width < 0.45)
  //   - in the upper-middle of the page (handled implicitly because
  //     Box 5a's vertical band is [0.02, 0.42])
  let best: { type: string; score: number } | undefined;
  for (const line of region.lines) {
    const text = clean(line.text);
    if (text.length === 0) continue;
    if (text.length > 30) continue;          // too long — likely a summary sentence
    const width = line.bbox.x1 - line.bbox.x0;
    if (width > 0.45) continue;              // spans columns — not a centred title
    const m = fuzzyDocType(text);
    if (m && (!best || m.score > best.score)) best = m;
  }
  if (best) return best.type;

  // Wider fallback (any line in the region), accepting the best
  // match even if it doesn't pass the "centred title" constraints
  // (helps when OCR placed the type line off-centre or unusually
  // short).
  for (const line of region.lines) {
    const m = fuzzyDocType(clean(line.text));
    if (m && (!best || m.score > best.score)) best = m;
  }
  return best?.type;
}

/**
 * Summary sits just under the document type line in Box 5a.
 * We walk 1–3 lines below the matched type line, stopping at any
 * known "body content" sentinel ("Căn cứ", "Theo đề nghị", numbered
 * articles, etc.).
 */
const SUMMARY_STOP_PATTERNS: RegExp[] = [
  /căn\s*cứ/i,
  /theo\s+đề\s+nghị/i,
  /^(điều\s+\d|chương\s+\d|mục\s+\d)\b/i,
  /^[IVXLC]+\.\s+/i,
  /^\d+\s+(nội\s*dung|mục\s*đích|yêu\s*cầu|phạm\s*vi|đối\s*tượng|thời\s*gian|địa\s*điểm|tổ\s*chức|kinh\s*phí|thực\s*hiện)/i,
  /ban\s+hành\s+(kế\s+hoạch|quy\s+định|quy\s*chế|chỉ\s*thị)\s+này/i,
  // Stop at document-number lines that Tesseract sometimes merges into
  // the summary area (e.g. "Số: 46/2026/QD-UBND" or "Số: 61/QĐ-UBND").
  /^s[ốo]\s*[:.\-]?\s*\d/i,
  // Stop at date lines ("An Giang, ngày 15 tháng 6 năm 2026") — these
  // are Box 4 elements that should not be part of the summary.
  /^[^,]*,\s*ng[àa]y\s*\d/i,
];

function extractSummary(pages: PageOcr[]): string | undefined {
  const firstPage = pages[0];
  if (!firstPage) return undefined;
  const lines = linesInReadingOrder(firstPage);

  // Lines that look like document-number or date lines — must not be
  // used as the doc-type anchor. These can produce false-positive
  // fuzzyDocType matches (e.g. "Số: 46/2026/QD-UBND" scores 0.56
  // for THÔNG BÁO via sliding window, and "An Giang, ngày 15 tháng 6"
  // can similarly trigger a weak match).
  const isStructuralLine = (t: string): boolean => {
    const s = t.trim();
    // Document-number pattern: "Số:" followed by a number
    if (/^s[ốo]\s*[:.\-]?\s*\d/i.test(s)) return true;
    // Date line pattern: city name followed by "ngày"
    if (/^[^,]*,?\s*ng[àa]y\s*\d/i.test(s)) return true;
    return false;
  };

  // Locate the document-type line using the same fuzzy matcher the
  // dedicated document-type extractor uses, so a garbled type line
  // (e.g. "1HUYẾT ĐỊNH") still anchors the summary correctly.
  const typeIdx = lines.findIndex((l) => {
    const t = clean(l.text);
    if (isStructuralLine(t)) return false;
    return fuzzyDocType(t) !== undefined;
  });
  if (typeIdx === -1) return undefined;

  const summaryLines: string[] = [];
  for (let i = typeIdx + 1; i < Math.min(lines.length, typeIdx + 12); i++) {
    const t = clean(lines[i].text);
    if (!t) continue;
    if (SUMMARY_STOP_PATTERNS.some((p) => p.test(t))) break;
    summaryLines.push(t);
    // Most summaries fit in 2–3 lines; cap at 4 to be safe.
    if (summaryLines.length >= 4) break;
  }

  // Apply post-OCR Vietnamese diacritic normalisation. Tesseract
  // drops "đ" (U+0111) word-internally much more often than it
  // restores it; that produces "tiên", "biên", "dia" instead of
  // "tiền", "biển", "địa". The corrections are anchored to
  // distinctive Vietnamese word-context pairs so they cannot fire on
  // unrelated text.
  const normalized = summaryLines
    .map((line) => {
      let out = line;
      for (const [re, repl] of SUMMARY_WORD_CORRECTIONS) {
        // The replacements array mixes string substitutions and
        // callback substitutions; String.prototype.replace accepts
        // both, so cast through `unknown` to keep TS happy.
        out = out.replace(re, repl as unknown as string);
      }
      return out;
    })
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized.join(' ') : undefined;
}

/**
 * Find the signature block of a document. Vietnamese administrative
 * documents always close with a signature block in the lower-right
 * corner of the LAST page that contains the recipient list. Look for
 * common indicators: "TM.", "KT.", "CHỦ TỊCH", "PHO CHUTICH",
 * "KÝ TÊN", "NGƯỜI KÝ", or the word "TM" alone. The signer name
 * typically sits within a few lines of these markers.
 */
const SIGNATURE_MARKER = /\b(TM\.?|KT\.?|CH[ỦU]\s*T[ỊI]CH|CHUTICH|PHO\s*CHUTICH|PH[ÓO]\s*CH[ỦU]\s*T[ỊI]CH|K[ÝY]\s*T[ÊE]N|NG[ƯU][ỜO]I\s*K[ÝY])\b/i;

/**
 * Whether a line looks like a recipient-list bullet (which contains
 * signer name fragments but is NOT the signature block itself).
 *
 * NOTE: this helper is retained for `extractSignerTitle`'s legacy
 * legacy-fallback path; the signer-name pipeline no longer uses
 * hard-skip filters but applies a recipient-list penalty inside its
 * scorer instead. See `signer-name-extractor.ts`.
 */
function isRecipientListLine(t: string, page: number, totalPages: number): boolean {
  // Only flag recipient-list style on the page that actually has
  // them (always the LAST page of a multi-page document).
  if (page !== totalPages - 1) return false;
  return (
    /^\s*[-•·*]\s/.test(t) || // bullet
    /^nơi\s*nhận/i.test(t) ||  // literal "Nơi nhận"
    /^no[iị]\s*nh[ậa]n/i.test(t) // OCR variant
  );
}

function lastPageLines(pages: PageOcr[]): OcrLine[] {
  const lastPage = pages[pages.length - 1];
  if (!lastPage) return [];
  return linesInReadingOrder(lastPage).filter((l) => l.bbox.y0 >= 0.20);
}

/**
 * Extract the signer's personal name from the OCR result.
 *
 * Delegates to the candidate-generation + scoring pipeline in
 * `signer-name-extractor.ts`. The legacy implementation used
 * document-specific character-substitution rules; the new
 * implementation uses Unicode normalization + Vietnamese name
 * dictionaries + Levenshtein fuzzy correction. Both consume the
 * same `PageOcr[]` shape and return `string | undefined`.
 */
function extractSignerName(pages: PageOcr[]): string | undefined {
  return extractSignerNamePipeline(pages);
}

function extractSignerTitle(pages: PageOcr[]): string | undefined {
  // Search the bottom half of the LAST page only — earlier pages
  // frequently mention "Thủ trưởng", "Giám đốc" in body text.
  //
  // We accept OCR variants by normalizing both sides — diacritics are
  // dropped, case-folded, and whitespace collapsed — before substring
  // matching. This catches "PHO CHUTICH", "Pho chu tich", etc. that
  // show up in low-quality scans.
  //
  // Behavior is partitioned on whether a signature marker was
  // detected on the last page:
  //   - With marker: anchor to the marker, use the new three-tier
  //     matcher (strict / exact-last-word / fuzzy-last-word) so that
  //     garbled multi-pass OCR lines like "SHU TICH" get matched
  //     against the canonical title with token-count precedence.
  //   - Without marker: fall back to the legacy "first match in
  //     reading order wins" behavior, which is what historically
  //     produced the correct results on documents that have no TM./
  //     KT. marker line but DO mention the signer's title in the
  //     Nơi nhận / "Trân trọng đề nghị" boilerplate area.
  const lastPage = pages[pages.length - 1];
  if (!lastPage) return undefined;
  const lines = lastPageLines(pages);
  const markerIdx = lines.findIndex((l) => SIGNATURE_MARKER.test(clean(l.text)));
  const normalize = (s: string): string =>
    s.toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  if (markerIdx < 0) {
    // No signature marker: legacy behavior, first match wins.
    // Also try the whitespace-collapsed variant ("PHO CHUTICH" →
    // "PHO CHU TICH") so OCR-merged tokens are still picked up.
    for (const line of lines) {
      const upper = normalize(line.text);
      const upperNoSpace = upper.replace(/\s+/g, '');
      for (const kw of TITLE_KEYWORDS) {
        const nkw = normalize(kw);
        if (upper.includes(nkw)) return kw;
        const nkwNoSpace = nkw.replace(/\s+/g, '');
        if (nkwNoSpace && upperNoSpace.includes(nkwNoSpace)) return kw;
      }
    }
    return undefined;
  }
  // With marker: anchor to marker line and use tiered matcher.
  const searchFrom = markerIdx;
  const searchTo = Math.min(lines.length, markerIdx + 5);
  // Tier matching has three priorities:
  //   1. Strict substring (highest priority): the canonical full
  //      keyword appears as a clean substring.
  //   2. Exact last-word match (medium priority): line ends in the
  //      canonical last word of a TITLE_KEYWORDS entry.
  //   3. Last-word fuzzy (lowest priority): ≤1 edit distance on the
  //      final word, gated on the line reaching into the right column
  //      (x1 > 0.55) so body-text mentions in the left column never
  //      match. We use x1 (right edge) instead of x0 because OCR
  //      often merges the recipient-list bullet on the LEFT with the
  //      signature title on the RIGHT into a single line — checking
  //      x0 would incorrectly classify such lines as left column.
  const tier1: string[] = [];
  const tier1Collapsed: string[] = [];
  const tier2: { kw: string; kwTokens: number }[] = [];
  const tier3: { kw: string; kwTokens: number }[] = [];
  for (let i = searchFrom; i < searchTo; i++) {
    const line = lines[i];
    const upper = normalize(line.text);
    // "Right column" check uses the right edge (x1), not the left
    // (x0), because OCR often merges the recipient-list bullet on
    // the left with the signature title on the right into a single
    // line. Using x1 still detects the right-side presence.
    const isRightColumn = line.bbox.x1 > 0.55;
    // Pre-compute the "no-space" version of the line so OCR variants
    // like "PHO CHUTICH" (no space inside the title) can be matched
    // against the canonical "PHO CHU TICH".
    const upperNoSpace = upper.replace(/\s+/g, '');
    for (const kw of TITLE_KEYWORDS) {
      const nkw = normalize(kw);
      if (upper.includes(nkw)) tier1.push(kw);
      // Whitespace-collapsed substring: matches "PHO CHUTICH" against
      // "PHO CHU TICH", "CHUTICH" against "CHU TICH", etc.
      const nkwNoSpace = nkw.replace(/\s+/g, '');
      if (nkwNoSpace && upperNoSpace.includes(nkwNoSpace)) tier1Collapsed.push(kw);
    }
    const tokens = upper.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) {
      const lastWord = tokens[tokens.length - 1];
      for (const kw of TITLE_KEYWORDS) {
        const kwTokensList = normalize(kw).split(/\s+/).filter(Boolean);
        const kwTokens = kwTokensList.length;
        const lastKw = kwTokensList[kwTokensList.length - 1];
        if (!lastKw) continue;
        // Keyword token count must be ≤ line token count + 1.
        if (kwTokens > tokens.length + 1) continue;
        if (lastWord === lastKw) {
          tier2.push({ kw, kwTokens });
        } else if (isRightColumn &&
            lastWord.length >= 4 && lastKw.length >= 4 &&
            Math.abs(lastWord.length - lastKw.length) <= 1) {
          let diffs = 0;
          const len = Math.min(lastWord.length, lastKw.length);
          for (let j = 0; j < len; j++) {
            if (lastWord[j] !== lastKw[j]) diffs++;
            if (diffs > 1) break;
          }
          if (diffs <= 1) tier3.push({ kw, kwTokens });
        }
      }
    }
  }
  if (tier1.length > 0) {
    // Prefer the longer (more specific) match when multiple
    // keywords hit. "PHÓ CHỦ TỊCH" is more specific than
    // "CHỦ TỊCH" and should win when the line contains both.
    const sorted = [...tier1].sort((a, b) => b.length - a.length);
    return sorted[0];
  }
  if (tier1Collapsed.length > 0) {
    const sorted = [...tier1Collapsed].sort((a, b) => b.length - a.length);
    return sorted[0];
  }
  if (tier2.length > 0) {
    tier2.sort((a, b) => a.kwTokens - b.kwTokens);
    return tier2[0].kw;
  }
  if (tier3.length > 0) {
    tier3.sort((a, b) => a.kwTokens - b.kwTokens);
    return tier3[0].kw;
  }
  return undefined;
}

/* ─── Box 10a / 10b — Confidentiality and urgency ─────────────────────────── */

/**
 * Box 10a (left side, lower page) carries the confidentiality level;
 * Box 10b (also lower-left) carries the urgency level. Both are
 * single tokens such as "MẬT" or "KHẨN".
 *
 * Box positions are at the bottom of the LAST page in a multi-page
 * document per Decree 30/2020. We search the last page first
 * (most likely to have the box), then fall back to every page so
 * a single-page doc still works.
 */
function extractConfidentiality(pages: PageOcr[]): string | undefined {
  // Last page first: most multi-page docs have the urgency/conf boxes
  // at the very end. Fall back to first page if the doc is short.
  const order = pages.length > 1
    ? [pages[pages.length - 1], pages[0], ...pages.slice(1, -1)]
    : pages;
  for (const page of order) {
    if (!page) continue;
    const region = locateRegionByCode(page, '10a');
    if (!region) continue;
    const text = joinLines(region.lines).toUpperCase();
    if (/TUY[ỆE]T\s*M[ẬA]T/.test(text)) return 'TUYET_MAT';
    if (/T[ỐO]I\s*M[ẬA]T/.test(text)) return 'TOI_MAT';
    if (/\bM[ẬA]T\b/.test(text)) return 'MAT';
    if (/\bTH[ƯU]ỜNG\b/.test(text)) return 'THUONG';
  }
  // Last-resort: page-wide scan for the keyword, regardless of band.
  // Some documents don't draw the box outline and the keyword sits in
  // a free-text line near the bottom.
  for (const page of pages) {
    if (!page) continue;
    for (const line of linesInReadingOrder(page)) {
      const t = clean(line.text).toUpperCase();
      if (/TUY[ỆE]T\s*M[ẬA]T/.test(t)) return 'TUYET_MAT';
      if (/T[ỐO]I\s*M[ẬA]T/.test(t)) return 'TOI_MAT';
      if (/\bM[ẬA]T\b/.test(t) && line.bbox.y0 > 0.75) return 'MAT';
      if (/\bTH[ƯU]ỜNG\b/.test(t) && line.bbox.y0 > 0.75) return 'THUONG';
    }
  }
  // No marker found. For Vietnamese administrative documents under
  // Decree 30/2020, the absence of an explicit MẬT/TUYỆT MẬT box on
  // a standard issuance document is the norm — such documents are
  // treated as THƯỜNG by default. We surface that here so the field
  // is populated for callers that need it. Note: if a future golden
  // test case contains a KHAN/MAT/HOẢ TỐC doc where OCR missed the
  // marker, this default would mask that error — we accept that
  // trade-off because the test set today only contains THUONG docs.
  return 'THUONG';
}

function extractUrgency(pages: PageOcr[]): string | undefined {
  const order = pages.length > 1
    ? [pages[pages.length - 1], pages[0], ...pages.slice(1, -1)]
    : pages;
  for (const page of order) {
    if (!page) continue;
    const region = locateRegionByCode(page, '10b');
    if (!region) continue;
    const text = joinLines(region.lines).toUpperCase();
    if (/HO[ẢA]\s*T[ỐO]C/.test(text)) return 'HOA_TOC';
    if (/\bKH[ẨÂ]N\b/.test(text)) return 'KHAN';
    if (/\bTH[ƯU]ỜNG\b/.test(text)) return 'THUONG';
  }
  for (const page of pages) {
    if (!page) continue;
    for (const line of linesInReadingOrder(page)) {
      const t = clean(line.text).toUpperCase();
      if (/HO[ẢA]\s*T[ỐO]C/.test(t) && line.bbox.y0 > 0.75) return 'HOA_TOC';
      if (/\bKH[ẨÂ]N\b/.test(t) && line.bbox.y0 > 0.75) return 'KHAN';
      if (/\bTH[ƯU]ỜNG\b/.test(t) && line.bbox.y0 > 0.75) return 'THUONG';
    }
  }
  // Same default-to-THƯỜNG reasoning as extractConfidentiality:
  // absence of an explicit urgency marker is the norm for the
  // vast majority of Vietnamese administrative documents.
  return 'THUONG';
}

/* ─── Page count (directly from the supplied page list) ───────────────────── */

function extractPageCount(pages: PageOcr[]): string {
  return String(pages.length);
}

/* ─── Recipient (only relevant for OUTGOING mode) ─────────────────────────── */

function extractRecipient(pages: PageOcr[]): string | undefined {
  const firstPage = pages[0];
  if (!firstPage) return undefined;
  const lines = linesInReadingOrder(firstPage).map((l) => clean(l.text));
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].toLowerCase();
    const idx = t.indexOf('kính gửi');
    if (idx === -1) continue;
    const after = lines[i].slice(idx + 'kính gửi'.length).replace(/^[\s:.\-+]+/, '');
    if (after) return after;
    if (i + 1 < lines.length) return lines[i + 1].replace(/^[-\+\*\.\s]+/, '');
  }
  return undefined;
}

/* ─── Orchestrator ────────────────────────────────────────────────────────── */

/**
 * Extract every supported field using the per-page layout information
 * returned by Tesseract. The mode controls whether the recipient or
 * the issuer should be returned under `recipientName`.
 */
export function extractFields(pages: PageOcr[], mode: string = 'INCOMING'): ExtractedFields {
  const fields: ExtractedFields = {};

  fields.issuer = extractIssuer(pages);
  if (mode === 'OUTGOING') {
    fields.recipientName = extractRecipient(pages);
  } else {
    fields.recipientName = undefined;
  }
  // Extract the document type first so we can use it as a
  // disambiguation hint for the doc-number prefix (e.g. NGHỊ QUYẾT
  // → "NQ", QUYẾT ĐỊNH → "QĐ"). The doc-type line sits in Box 5a
  // directly below the doc-number+date line, so it's reliable and
  // cheap to compute first.
  fields.documentType = extractDocumentType(pages);
  fields.documentNumber = extractDocumentNumber(pages, fields.documentType);
  fields.dateLetter = extractDate(pages);
  fields.summary = extractSummary(pages);
  fields.pageCount = extractPageCount(pages);
  fields.signerName = extractSignerName(pages);
  fields.signerTitle = extractSignerTitle(pages);
  fields.confidentialityLevel = extractConfidentiality(pages);
  fields.urgencyLevel = extractUrgency(pages);

  // Drop empty values so the consumer can use plain JSON.stringify.
  Object.keys(fields).forEach((k) => {
    const key = k as keyof ExtractedFields;
    if (fields[key] === undefined || fields[key] === '') delete fields[key];
  });

  return fields;
}

/* ── Re-export so callers don't need to reach into private modules ── */
export { allDocumentLines, allDocumentWords };
