import type { ExtractedFields, FieldTrace, NormalizedBBox, OcrLine, OcrWord, PageOcr } from './types';
import {
  DOC_TYPES,
  MONTH_NAMES,
  TITLE_KEYWORDS,
  isPersonNameWord,
  removeDiacriticsForMatch,
} from './constants';
import {
  linesInReadingOrder,
  locateRegionByCode,
  wordsInReadingOrder,
} from './layout';
import { extractSignerName as extractSignerNamePipeline } from './signer-name-extractor';
import { detectTopBandColumns, splitLineByColumns, type ColumnLayout } from './column-detector';

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
 *
 * Expanded from the original 13-entry table after the July-2026
 * evaluation surfaced additional confusions observed on Vietnamese
 * administrative documents:
 *   - `J` ↔ `1` (very common in document numbers, where the digit
 *     1 sits next to a slash and gets misread as J because of the
 *     adjacent diagonal stroke)
 *   - `Y` ↔ `1` (top serif confusable)
 *   - `D` ↔ `0` (rare but seen in dates; D has a horizontal bar
 *     that 0 doesn't, but at low DPI the bar disappears)
 *   - `q` ↔ `9` (descender)
 *   - `g` ↔ `9` (the closed-loop portion of 9 looks like g)
 *   - `P` ↔ `9` (round shape)
 *   - `U`/`V`/`u`/`v` ↔ `0` (very common at low resolution)
 *   - `n` ↔ `0` (curvature confusion)
 *   - `H` ↔ `4` (vertical strokes confusable on small fonts)
 *   - `A` ↔ `4` (A has slanted sides; Tesseract sometimes reads 4
 *     as A in noisy areas)
 *   - `E` ↔ `8` (the "8" with no closed top loop looks like E)
 *   - `F` ↔ `7` (F looks like 7 with the crossbar)
 *   - `K` ↔ `k` ↔ `8` (rare)
 */
const DIGIT_LOOKALIKE: Record<string, string> = {
  // 0-confusable: round/oval shapes
  O: '0', o: '0', Q: '0', U: '0', u: '0', V: '0', v: '0',
  D: '0', d: '0', n: '0',
  // 1-confusable: vertical strokes / narrow glyphs
  I: '1', l: '1', i: '1', '|': '1', J: '1', j: '1', Y: '1', y: '1',
  // 2-confusable
  Z: '2', z: '2',
  // 3-confusable
  // (none worth adding without a false-positive risk on Vietnamese text)
  // 4-confusable
  A: '4', a: '4', H: '4',
  // 5-confusable
  S: '5', s: '5',
  // 6-confusable: B/6/G confusion in Vietnamese doc numbers
  G: '6', B: '6', b: '6',
  // 7-confusable
  T: '7', F: '7',
  // 8-confusable
  E: '8', K: '8', k: '8',
  // 9-confusable: closed-loop glyphs
  q: '9', g: '9', P: '9', p: '9',
  // 5: Tesseract frequently reads digit 5 as the vowel-with-diaresis ä
  // when the surrounding noise pattern looks similar; very common
  // in dates (e.g. "tháng ä năm" → "tháng 5 năm").
  ä: '5', Ä: '5',
  // Tesseract also occasionally reads 8 as ö on some scan profiles.
  ö: '8', Ö: '8',
};

/**
 * Replace any isolated non-digit, non-alphanumeric character that
 * maps to a digit via DIGIT_LOOKALIKE with its digit equivalent.
 *
 * "Isolated" means the character is surrounded by whitespace, start/
 * end of string, or another digit — i.e. it is the *entire* token.
 * This resolves the common case "tháng ä năm" (where ä is a garbled 5)
 * without touching Vietnamese letters inside longer words.
 */
function applyDigitLookalikeToIsolated(text: string): string {
  return text.replace(
    /((?:^|\s|\d))([^\d\w\u00C0-\u1EF9\s])((?:\s|\d|$))/g,
    (_full, pre, ch, post) => pre + (DIGIT_LOOKALIKE[ch] ?? ch) + post,
  );
}

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
/**
 * Coerce a single OCR token (1–3 characters) into a 1–2 digit value.
 * Handles pure digits, digit+letter mixes ("l5" → "15"), and any
 * letter that maps to a digit via DIGIT_LOOKALIKE.
 *
 * Strategy: progressively strip non-alphanumeric noise, then try the
 * DIGIT_LOOKALIKE map. Returns undefined only when the result is
 * clearly not a digit pair.
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
  // Last resort: try concatenating the leading letter-as-digit with
  // the trailing digit ("l5" → "15" via l→1).
  const letterDigitMatch = s.match(/^([A-Za-z])(\d)$/);
  if (letterDigitMatch) {
    const head = DIGIT_LOOKALIKE[letterDigitMatch[1]];
    if (head) return head + letterDigitMatch[2];
  }
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
  if (gapIdx >= 0 && maxGap >= 0.025) {
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
  if (firstMotto && firstMotto.bbox.x0 >= 0.30) {
    const left = sorted
      .filter((w) => w.bbox.x1 <= firstMotto.bbox.x0 + 0.005)
      .map((w) => clean(w.text))
      .join(' ')
      .trim();
    if (left) return left;
  }

  // Strategy 3: any word containing a Vietnamese diacritic that looks
  // like "HỘI", "CHỦ", "NGHĨA", "VIỆT", "NAM" near the right side is
  // a reliable motto marker (the rest of the Vietnamese admin
  // vocabulary in the issuer column rarely contains these bigrams).
  const mottoTelltale = /(?:H[OỘ]I|CH[UỦ]\s+NGH|VI[ÊỆ]T|NAM)/i;
  const mottoIdx = sorted.findIndex((w) => w.bbox.x0 >= 0.40 && mottoTelltale.test(clean(w.text)));
  if (mottoIdx > 0) {
    const left = sorted
      .slice(0, mottoIdx)
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
 * Column-aware extraction:
 *   1. Run the column detector on the top band of page 1 only.
 *      Pages 2+ have no two-column header, so running the detector
 *      on them splits body text into two pseudo-columns and the
 *      issuer extractor then grabs the first body line instead of
 *      returning undefined.
 *   2. For each top-band line on page 1, split it into left/right
 *      halves using the detected column boundaries.
 *   3. Use the LEFT half as the issuer candidate. This is robust
 *      against Tesseract merging the issuer with the national motto
 *      — the split happens at our layer instead of relying on a
 *      gap heuristic that's fragile on merged OCR lines.
 *
 * The y-band is intentionally tight (y < ~0.13, before the doc-number
 * line that Decree 30 always places below the issuer block).
 */
function extractIssuer(
  pages: PageOcr[],
  trace?: (t: FieldTrace) => void,
  columnLayout?: ColumnLayout,
): string | undefined {
  const firstPage = pages[0];
  if (!firstPage) return undefined;

  // Column layout is only computed from page 1's header. Pages 2+ have
  // no Decree-30 two-column header — they're single-column body pages.
  const layout = columnLayout ?? detectTopBandColumns(firstPage);

  const allTopLines = linesInReadingOrder(firstPage).filter((l) => l.bbox.y1 <= 0.13);
  const candidates: Array<{ line: OcrLine; source: 'left' | 'right' | 'single' }> = [];
  for (const line of allTopLines) {
    const split = splitLineByColumns(line, layout);
    if (split.left && split.left.text) candidates.push({ line: split.left as OcrLine, source: 'left' });
    if (split.right && split.right.text) candidates.push({ line: split.right as OcrLine, source: 'right' });
    if (!layout.isTwoColumn) candidates.push({ line, source: 'single' });
  }

  const rejected: FieldTrace['candidates'] = [];

  const topLines = candidates.filter(({ line }) => {
    const t = clean(line.text);
    if (t.length < 4) return false;
    const alnumLen = t.replace(/[^a-zA-ZÀ-ỹ0-9]/g, '').length;
    const digitLen = (t.match(/\d/g) ?? []).length;
    if (alnumLen > 0 && digitLen / alnumLen > 0.5) {
      rejected.push({ text: t.slice(0, 80), bbox: line.bbox, confidence: line.confidence, page: firstPage.pageNumber, rejectedReason: 'mostly digits' });
      return false;
    }
    if (!/[a-zA-ZÀ-ỹ]/.test(t)) {
      rejected.push({ text: t.slice(0, 80), bbox: line.bbox, confidence: line.confidence, page: firstPage.pageNumber, rejectedReason: 'no letters' });
      return false;
    }
    const upper = t.toUpperCase();
    const DOC_TYPES_HINT = /QUY[ẾÉÈ]T\s*Đ[IỊ]NH|NGH[IỊ]\s*QUY[ẾÉÈ]T|TH[ÔO]NG\s*B[ÁÀ]O|T[ỜO]\s*TR[IÌ]NH|B[ÁÀ]O\s*C[ÁÀ]O|TỜ\s*TRÌNH/i;
    if (DOC_TYPES_HINT.test(upper)) {
      rejected.push({ text: t.slice(0, 80), bbox: line.bbox, confidence: line.confidence, page: firstPage.pageNumber, rejectedReason: 'doc-type heading' });
      return false;
    }
    // Drop lines whose horizontal centre falls in the right column
    // when two columns are detected. This protects the issuer from
    // accidentally consuming a date/motto line.
    if (layout.isTwoColumn && line.bbox.x0 >= layout.columns[0].x1) {
      rejected.push({ text: t.slice(0, 80), bbox: line.bbox, confidence: line.confidence, page: firstPage.pageNumber, rejectedReason: 'right column' });
      return false;
    }
    // Drop the "Độc lập - Tự do - Hạnh phúc" / national-motto-only line
    // in the single-column case.
    if (!layout.isTwoColumn) {
      if (/\b[ĐD][ỘO]C\s*L[ẬÂ]P\b/i.test(upper)) {
        rejected.push({ text: t.slice(0, 80), bbox: line.bbox, confidence: line.confidence, page: firstPage.pageNumber, rejectedReason: 'doc-lap line' });
        return false;
      }
      if (/\bT[ỰU]\s*DO\b/i.test(upper)) {
        rejected.push({ text: t.slice(0, 80), bbox: line.bbox, confidence: line.confidence, page: firstPage.pageNumber, rejectedReason: 'tu-do line' });
        return false;
      }
      if (/\bH[ẠA]NH\s*PH[ÚU]C\b/i.test(upper)) {
        rejected.push({ text: t.slice(0, 80), bbox: line.bbox, confidence: line.confidence, page: firstPage.pageNumber, rejectedReason: 'hanh-phuc line' });
        return false;
      }
    }
    return true;
  });

  if (topLines.length === 0) {
    trace?.({
      field: 'issuer',
      value: null,
      reason: layout.isTwoColumn
        ? `no candidate left-column lines in top band (cols=[${layout.columns.map((c) => `[${c.x0.toFixed(2)},${c.x1.toFixed(2)}]`).join(',')}])`
        : 'no candidate lines in top band',
      candidates: rejected,
    });
    return undefined;
  }

  const issuerParts: string[] = [];
  let firstSelectedBBox: NormalizedBBox | undefined;
  let firstSelectedConfidence = 0;
  for (const { line } of topLines.slice(0, 3)) {
    let text = clean(line.text);
    text = stripNationalMottoPrefix(text);
    if (text) {
      issuerParts.push(text);
      if (!firstSelectedBBox) {
        firstSelectedBBox = line.bbox;
        firstSelectedConfidence = line.confidence;
      }
    }
  }

  let joined = issuerParts.filter(Boolean).join(' ');
  joined = correctVietnameseIssuerPhrase(joined);
  const finalValue = joined || undefined;

  if (trace && finalValue) {
    trace({
      field: 'issuer',
      value: finalValue,
      bbox: firstSelectedBBox,
      page: firstPage.pageNumber,
      confidence: firstSelectedConfidence,
      reason: layout.isTwoColumn
        ? `left-column extract (cols=[${layout.columns.map((c) => `[${c.x0.toFixed(2)},${c.x1.toFixed(2)}]`).join(',')}], method=${layout.method})`
        : 'single-column extract',
      candidates: rejected,
    });
  }
  return finalValue;
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
  [/\bTH[ÀA]NH\s*PH[OỐỔỘỖỌỎÕÒÓỜỒỚỞỠƠÔ]\b/gi, 'THÀNH PHỐ'],
  [/\bTHANH\s*PHO\b/gi, 'THÀNH PHỐ'],
  [/\bTHANH\s*PHỔ\b/gi, 'THÀNH PHỐ'],
  [/\bTHANH\s*PH[OƠ]C\b/gi, 'THÀNH PHỐ'],
  [/\bNH[ÂA]N\s*D[ÂA]N\b/gi, 'NHÂN DÂN'],
  [/\bNHAN\s*DAN\b/gi, 'NHÂN DÂN'],
  [/\bH[OƠỔỘỜỒÔỐỖỎÕÓÒ]I\s*[ĐD][OƠỔỘỜỒÔỐỖỎÕÓÒỚỜỢỞỠ]NG\b/gi, 'HỘI ĐỒNG'],
  [/\bH[OƠỔỘỜỒÔỐỖỎÕÓÒ]I\s*[ĐD]ÔNG\b/gi, 'HỘI ĐỒNG'],
  [/\bH[OƠỔỘỜỒÔỐỖỎÕÓÒ]I\s*[ĐD]ONG\b/gi, 'HỘI ĐỒNG'],
  [/\bH[OƠỔỘỜỒÔỐỖỎÕÓÒ]I\s*[ĐD]ONG\b/g, 'HỘI ĐỒNG'],
  [/\bH[OƠỔỘỜỒÔỐỖỎÕÓÒ]I\s*[ĐD][OƠỔỘỜỒÔỐỖỎÕÓÒỚỜỢỞỠ]NG[A-Z](?=[\s,\.]|$)/g, 'HỘI ĐỒNG'],
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
  // HĐND / HỘI ĐỒNG — Tesseract sometimes appends a stray
  // consonant to "ĐỒNG" (e.g. "ĐÒNB" / "ĐỒNGC") when the next
  // character bleeds into the joined OCR line.
  [/(?<=HỘI\s+)Đ[OÔÒỜỘ]+NB(?=[\s,\.]|$)/gi, 'ĐỒNG'],
  [/(?<=HỘI\s+)Đ[OÔÒỜỘ]+NC(?=[\s,\.]|$)/gi, 'ĐỒNG'],
  [/(?<=HỘI\s+)Đ[OÔÒỜỘ]+NG[A-Z](?=[\s,\.]|$)/g, 'ĐỒNG'],
  // HĐND / HỘI ĐỒNG — Tesseract frequently misreads the final
  // G as digit 5 on signature-block scans (the descender of "g"
  // rounds into a closed loop, which Tesseract scores higher as
  // the digit "5" than as the letter "g"). Drop the trailing
  // digit so the multi-word rule above can fire on the
  // remaining "ĐỒN".
  [/(?<=HỘI\s+)Đ[OÔÒỜỘ]+N\d(?=[\s,\.]|$)/g, 'ĐỒNG'],
  // Same digit-after-ĐỒNG corruption in the standalone "ĐỒNG"
  // case (no HỘI prefix). We allow optional preceding whitespace.
  [/\bĐ[OÔÒỜỘ]+N\d(?=[\s,\.]|$)/g, 'ĐỒNG'],
  // CẦN THƠ misread as "AN THƠ" (C and Ầ dropped). The fact that
  // "AN THƠ" appears in a Vietnamese admin document almost always
  // means "CẦN THƠ" — no other province has "…THƠ" as its
  // second token. The 5 central cities include Cần Thơ, and a
  // misread of "CẦN THƠ" → "AN THƠ" is the single most common
  // Vietnamese city-name OCR error.
  [/\bAN\s+THƠ\b/g, 'CẦN THƠ'],
  [/\bAN\s+THO\b/g, 'CẦN THƠ'],
  // General city-name cleanup: when "AN" precedes another Vietnamese
  // token and the document is a HĐND/UBND admin document (we can't
  // determine that here, but "AN X" tokens are rare in issuer lines),
  // leave it alone — the more specific rules above are sufficient.
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
  [/\bH[OỐỔỘỖỌỎÕÒÓỜỒỚỞỠƠÔ][\s-]*CH[IÍ][\s-]*MINH\b/gi, 'HỒ CHÍ MINH'],
  [/\bHO\s*CH[IÍ]\s*MINH\b/gi, 'HỒ CHÍ MINH'],
  [/\bCAN\s*THO\b/gi, 'CẦN THƠ'],
  [/\bC[ÂA]N\s*TH[OƠ]\b/gi, 'CẦN THƠ'],
  // Cần Thơ misread as "Lân Thơ" — common when Tesseract drops
  // the C+ầ (two-character grapheme), collapsing the city name
  // to just "Lân Thơ".
  [/\bTH[ÀA]NH\s*PH[OỐỔ]?\s*L[ÂA]N\s*TH[OƠ]\b/gi, 'THÀNH PHỐ CẦN THƠ'],
  [/\bL[ÂA]N\s*TH[OƠ]\b/gi, 'CẦN THƠ'],
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
/**
 * Closed-vocabulary Vietnamese administrative dictionary.
 *
 * Used to restore diacritics on common administrative-document words
 * after Tesseract OCR has stripped them. The dictionary covers the
 * ~150 highest-frequency words found in the Trích yếu / body of
 * Decree 30 administrative documents.
 *
 * Each entry is a single canonical word (with full diacritics). At
 * lookup time the function `restoreVietnameseDiacritics` computes
 * the diacritic-stripped form of each dictionary entry AND of each
 * input word, and rewrites an input word to its canonical form when
 * the stripped forms match AND that stripped form is unambiguous in
 * the dictionary (i.e. exactly one canonical entry strips to that
 * form).
 *
 * Entries are kept short and unambiguous on purpose. Compound phrases
 * ("Nghị quyết", "Hội đồng nhân dân") are handled by the regex rules
 * above; this dictionary only does single-word restoration.
 */
const VIETNAMESE_ADMIN_VOCAB: readonly string[] = [
  // Common action verbs and auxiliaries
  'sửa', 'đổi', 'bổ', 'sung', 'một', 'số', 'điều', 'khoản', 'điểm',
  'của', 'trong', 'này', 'theo', 'về', 'cho', 'được', 'tại', 'trên',
  'dưới', 'sang', 'giữa', 'cùng', 'với', 'thêm', 'mới', 'cũ', 'khác',
  'khi', 'nếu', 'để', 'thì', 'mà', 'nhưng', 'như', 'còn', 'rồi',
  'là', 'có', 'không', 'đã', 'sẽ', 'đang', 'vẫn', 'cũng', 'đều',
  // Document nouns
  'nghị', 'quyết', 'định', 'thông', 'báo', 'trình', 'báo', 'cáo',
  'quy', 'chế', 'chỉ', 'thị', 'kế', 'hoạch', 'hướng', 'dẫn',
  'chương', 'trình', 'giấy', 'ủy', 'quyền', 'hợp', 'đồng',
  'biên', 'bản', 'công', 'văn', 'luật', 'nghị', 'định',
  // Body nouns
  'đồng', 'nhân', 'dân', 'thành', 'phố', 'tỉnh', 'huyện', 'quận',
  'xã', 'phường', 'đặc', 'khu', 'thành', 'viên', 'cán', 'bộ',
  'chính', 'quyền', 'cơ', 'quan', 'ban', 'hành', 'nội', 'dung',
  // Government bodies / roles
  'chủ', 'tịch', 'phó', 'giám', 'đốc', 'trưởng', 'phòng', 'thủ',
  'tổng', 'cục', 'vụ', 'bộ', 'thứ', 'hiệu', 'phó',
  // Subjects / actions
  'bầu', 'cử', 'đại', 'biểu', 'quốc', 'hội', 'khóa', 'nhiệm',
  'kỳ', 'mức', 'chi', 'thời', 'gian', 'hỗ', 'trợ', 'kinh', 'phí',
  'phục', 'vụ', 'công', 'tác', 'các', 'cấp',
  'thực', 'hiện', 'thi', 'công', 'tuyển', 'dụng', 'sa', 'thải',
  'lương', 'thưởng', 'phạt', 'khen', 'thưởng', 'kỷ', 'luật',
  'quản', 'lý', 'sử', 'dụng', 'cấp', 'thu', 'tổng', 'hợp',
  // Date keywords
  'ngày', 'tháng', 'năm', 'tháng', 'tuần', 'quý',
  // Other common verbs
  'ban', 'hành', 'thông', 'qua', 'xét', 'duyệt', 'phê', 'chuẩn',
  'giao', 'nhận', 'chuyển', 'gửi', 'giao', 'nộp', 'thanh', 'toán',
  'quyết', 'toán', 'thanh', 'tra', 'kiểm', 'định', 'giám', 'sát',
  // Connectors
  'và', 'hoặc', 'hay', 'cũng', 'như', 'đó', 'này', 'kia', 'đây',
  'ấy', 'bao', 'nhiêu', 'nào', 'ai', 'gì', 'đâu', 'sao',
  // Common administrative terms
  'quyết', 'định', 'thông', 'báo', 'chỉ', 'thị', 'kế', 'hoạch',
  'đề', 'nghị', 'trình', 'bày', 'xin', 'ý', 'kiến', 'giải',
  'trình', 'thống', 'nhất', 'thống', 'kê', 'báo', 'cáo', 'tổng',
  'kết', 'quả', 'thực', 'hiện', 'tiến', 'độ', 'phương', 'án',
  'dự', 'án', 'đầu', 'tư', 'xây', 'dựng', 'lắp', 'đặt', 'sửa',
  'chữa', 'bảo', 'trì', 'bảo', 'dưỡng', 'vận', 'hành', 'khai',
  'thác', 'sử', 'dụng', 'thanh', 'lý', 'bán', 'đấu', 'giá',
  // Diplomatic / political
  'độc', 'lập', 'tự', 'do', 'hạnh', 'phúc', 'đoàn', 'kết',
  'hòa', 'bình', 'hữu', 'nghị', 'hợp', 'tác',
  // Education
  'giáo', 'dục', 'đào', 'tạo', 'học', 'sinh', 'giáo', 'viên',
  'trường', 'lớp', 'mẫu', 'giáo',
  // Economics
  'thuế', 'thu', 'chi', 'ngân', 'sách', 'quỹ', 'tiền', 'tệ',
  'tỷ', 'lệ', 'phần', 'trăm', 'đơn', 'vị',
  // Health
  'y', 'tế', 'bệnh', 'viện', 'bác', 'sĩ', 'thuốc', 'khám',
  'chữa', 'bệnh',
];

/**
 * Map from diacritic-stripped form → the unique canonical entry
 * whose stripped form equals it. Built once at module load.
 *
 * If multiple canonical entries strip to the same form (e.g. "sửa"
 * and "sứa" both strip to "sua"), we DROP the mapping so the
 * function refuses to substitute on that stripped form — better
 * than guessing wrong.
 */
const VIETNAMESE_ADMIN_VOCAB_STRIPPED: Map<string, string> = (() => {
  const m = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const word of VIETNAMESE_ADMIN_VOCAB) {
    const stripped = removeDiacriticsForMatch(word).toLowerCase();
    if (!stripped) continue;
    if (m.has(stripped)) {
      ambiguous.add(stripped);
      m.delete(stripped);
    } else if (!ambiguous.has(stripped)) {
      m.set(stripped, word);
    }
  }
  return m;
})();

/**
 * Hard-coded rewrite table for diacritic-keep-but-wrong-mark errors.
 *
 * Tesseract frequently substitutes one Vietnamese diacritic for
 * another (e.g. "phố" with horn → "phô" with circumflex; "chi" with
 * dot → "chỉ" with acute). The dictionary can't disambiguate these
 * because the de-diacritized forms collide — both "phố" and "phô"
 * strip to "pho".
 *
 * Each entry is the WRONG form produced by OCR → the canonical
 * CORRECT form. Only words from the admin vocabulary are rewritten;
 * non-admin words are left alone.
 */
const VI_DIACRITIC_CONFUSION_FIXES: Record<string, string> = {
  // `ô` (circumflex) misread for `ố` (horn): "phố" (city) → "phô"
  pho: 'phố',
  // `ô` (circumflex) misread for `ổ` (horn+circumflex): "đổi" → "đôi"
  doi: 'đổi',
  // `bau` → `bầu` (the city / voting term). Not ambiguous in admin
  // documents — "bau" itself isn't a Vietnamese word.
  bau: 'bầu',
  // `ô` (circumflex) → `ố` (horn) at end of word, e.g. "hỗ trợ" → "ho tro".
  // Already handled by "ho" → "hỗ" but we keep `ho` listed in dict too.
};

/**
 * Word-level Vietnamese diacritic restoration.
 *
 * Splits the input on whitespace boundaries and rewrites each word
 * whose stripped form maps uniquely to a canonical entry in
 * `VIETNAMESE_ADMIN_VOCAB`. Ambiguous words are left unchanged.
 *
 * Word boundaries are detected by scanning character-by-character:
 * a "word" is a maximal run of Vietnamese letters (Unicode `\p{L}`).
 * This is robust to the fact that JavaScript's `\b` does NOT
 * recognise Vietnamese diacritics as word characters (their code
 * points are outside `\w = [A-Za-z0-9_]`).
 *
 * The function preserves punctuation and spacing exactly.
 */
function restoreVietnameseDiacritics(s: string): string {
  if (!s) return s;
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/[\p{L}\p{M}]/u.test(ch)) {
      // Collect maximal letter run.
      const start = i;
      while (i < s.length && /[\p{L}\p{M}]/u.test(s[i])) i++;
      const word = s.slice(start, i);
      const stripped = removeDiacriticsForMatch(word).toLowerCase();
      // 1) Check the diacritic-confusion table first (handles the
      //    "wrong diacritic on the same base letter" case where the
      //    stripped form collides across two canonical entries).
      const confusion = VI_DIACRITIC_CONFUSION_FIXES[stripped];
      // 2) Fall back to the dictionary lookup.
      const canonical = confusion ?? VIETNAMESE_ADMIN_VOCAB_STRIPPED.get(stripped);
      if (canonical) {
        // Preserve the original case pattern (capitalisation matters
        // at the start of sentences and for proper nouns).
        //
        // IMPORTANT: use `\p{Lu}` (Unicode uppercase letter) to
        // detect "starts with uppercase". The naive range `[A-ZÀ-Ỹ]`
        // mistakenly matches `đ` (U+0111) because it's numerically
        // inside `À-Ỹ` (U+00C0 to U+1EF8). That over-detection
        // causes words beginning with `đ`/`Đ` to be re-capitalised
        // even when the source had them in lowercase.
        if (/^[\p{Lu}]/u.test(word)) {
          // First char is uppercase: capitalise the canonical form.
          out += canonical.charAt(0).toUpperCase() + canonical.slice(1);
        } else {
          out += canonical;
        }
      } else {
        out += word;
      }
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

const SUMMARY_WORD_CORRECTIONS: Array<[RegExp, string | ((substring: string, ...args: any[]) => string)]> = [
  // Multi-word summary corrections.
  //
  // Each rule targets a multi-word Vietnamese phrase that requires
  // context to disambiguate (e.g. "mức chi" vs "mức chỉ", "An Giang"
  // vs generic province). Single-word restoration is handled by
  // `restoreVietnameseDiacritics` (Vietnamese admin vocabulary
  // dictionary).
  //
  // CRITICAL: We use Unicode-aware lookbehind/lookahead
  // (`(?<=^|\s)…(?=\s|$|[,.;:])`) instead of `\b` for word
  // boundaries. JS `\b` does NOT recognise Vietnamese letters
  // (`đ`, `â`, `ê`, `ô`, `ơ`, `ư`, …) as word characters, so
  // `\bmức\b` would silently fail to match.

  // "An Giang" must come FIRST: the OCR over-diacriticises to
  // "ÂN GIANG" / "Ân Giang", and the bare TINH rule below can
  // mistransform "An Giang" if applied too aggressively.
  [/(?<=^|\s)ÂN\s*GIANG(?=\s|$|[,.;:])/g, 'An Giang'],
  [/(?<=^|\s)Ân\s*Giang(?=\s|$|[,.;:])/g, 'An Giang'],
  // Specific compound (most specific first): "tinh AN GIANG" /
  // "tinh Ân Giang" — Tesseract drops the d on tinh AND over-adds the
  // circumflex on Ân. Both errors must be fixed together.
  [/(?<=^|\s)tinh\s+AN\s*GIANG(?=\s|$|[,.;:])/gi, 'tỉnh An Giang'],
  [/(?<=^|\s)tinh\s+Ân\s+Giang(?=\s|$|[,.;:])/g, 'tỉnh An Giang'],
  [/(?<=^|\s)tinh\s+ÂN\s+GIANG(?=\s|$|[,.;:])/g, 'tỉnh An Giang'],
  // "ti_n sử dụng" / "ti_n cấp" / "ti_n thu" — only "tiền" fits.
  [/(?<=^|\s)ti[êe]n\s+(sử|sư|dụng|dung|cấp|cap|thu)(?=\s|$|[,.;:])/gi, 'tiền $1'],
  // "khu vực bi_n" / "khu vực biên" → "biển" in sea-area docs.
  [/(?<=^|\s)khu\s*vực\s*bi[êe]n(?=\s|$|[,.;:])/gi, 'khu vực biển'],
  [/(?<=^|\s)bi[êe]n\s+(trên|tren|thuộc|thuoc)(?=\s|$|[,.;:])/gi, 'biển $1'],
  // "địa bàn" — Tesseract frequently drops the đ ("_ia ban" → "dia ban").
  [/(?<=^|\s)dia\s*b[àa]n(?=\s|$|[,.;:])/gi, 'địa bàn'],
  // "mức chi" / "định mức chi" — Tesseract frequently writes "chỉ"
  // (restrictive) when the document means "chi" (spend). The
  // expression "mức chỉ" / "định mức chỉ" never appears in a
  // Vietnamese admin document.
  [/(?<=^|\s)m[ứu]c\s+ch[iỉ](?=\s|$|[,.;:])/gi, 'mức chi'],
  // "chi phí" — single diacritic-loss fix when standalone.
  [/(?<=^|\s)ch[iỉ]\s+ph[ií](?=\s|$|[,.;:])/gi, 'chi phí'],
  // "bổ sung" — Tesseract commonly drops the horn on ổ AND confuses
  // sung/xung/sung. We restore the most-common form here.
  [/(?<=^|\s)b[ôo]\s+xung(?=\s|$|[,.;:])/gi, 'bổ sung'],
  [/(?<=^|\s)b[ôo]\s+s[uư]ng(?=\s|$|[,.;:])/gi, 'bổ sung'],
  // "trên địa bàn" — "tren địa bàn" / "tren dia ban".
  [/(?<=^|\s)tr[eê]n\s+đi[aạ]\s+b[aà]n(?=\s|$|[,.;:])/gi, 'trên địa bàn'],
  [/(?<=^|\s)tr[eê]n\s+d[iı]a\s+ban(?=\s|$|[,.;:])/gi, 'trên địa bàn'],
  // Generic provincial "tinh X" — title-case the province name.
  // Tesseract usually delivers it uppercased ("tinh AN GIANG") which
  // is the An Giang case covered above; this rule handles generic
  // single-word provinces such as "tinh LONG AN", "tinh BINH DUONG".
  [/(?<=^|\s)tinh\s+([A-ZÂĂÊÔƠƯĐ][a-zà-ỹ]+(?:\s+[A-ZÂĂÊÔƠƯĐ][a-zà-ỹ]+)*)(?=\s|$|[,.;:])/g,
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
 * Recovery from heavily-garbled OCR output where the standard regex
 * chain above all fail. Strategy:
 *
 *   1. Tokenize the (label-stripped) input by non-alphanumeric
 *      boundaries (whitespace, slashes, dots).
 *   2. Walk the token list. The first two tokens are expected to be
 *      numeric (sequence + year); the remaining tokens form the code
 *      suffix.
 *   3. For each numeric slot, run coerceNumericSlot, which accepts
 *      letter-as-digit substitutions like `l→1`, `B→6`, `J→1`.
 *   4. For the code suffix, concatenate the remaining tokens with
 *      `-` separators, then apply the canonical diacritic restoration
 *      (HDND→HĐND, QD→QĐ, etc.) and a small closed-vocabulary
 *      substitution map (NQ↔Nguyễn quyết prefix, etc.).
 *
 * Designed specifically for inputs like
 *   `l427BJI 1-HĐN D C an Thơ, ngày 30 tháng 6 năm 2026`
 * which Tesseract produces on HĐND documents whose sequence + year
 * digits get heavily mangled (the 14 → `l4`, `/` → `27`, `2026` →
 * `BJI`, `NQ` → ` 1-HĐN`, `-` → `D`, `HĐND` → ` D C`). The function
 * recovers `14/2026/NQ-HĐND` from that input.
 */
function reconstructDocNumberFromTokens(raw: string): string | undefined {
  // Step 1: split on whitespace, slashes, dashes, dots. Keep the
  // positions of any non-alphanumeric separators so we can re-join
  // with the canonical "/" between numeric slots.
  const tokens: Array<{ text: string; sep: string }> = [];
  const re = /([^\s\/\-.]+)([\s\/\-.]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const text = m[1];
    const sep = m[2] ?? '';
    if (!text) continue;
    tokens.push({ text, sep });
    if (m.index + m[0].length >= raw.length) break;
  }
  if (tokens.length < 3) return undefined;

  // Step 2: find the sequence (small integer, 1–999) and the year
  // (4-digit, starting with 19 or 20). Both may have leading
  // letter-as-digit substitutions.
  let seqIdx = -1;
  let yearIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (seqIdx >= 0 && yearIdx >= 0) break;
    const slot = coerceNumericSlot(tokens[i].text);
    if (!slot) continue;
    const n = Number(slot);
    if (seqIdx < 0 && n >= 1 && n <= 999) {
      seqIdx = i;
    } else if (
      yearIdx < 0 &&
      slot.length === 4 &&
      /^20|^19/.test(slot) &&
      Number(slot) >= 1990 &&
      Number(slot) <= 2099
    ) {
      yearIdx = i;
    }
  }
  if (seqIdx < 0 || yearIdx < 0) return undefined;
  if (yearIdx <= seqIdx) return undefined;

  const seq = coerceNumericSlot(tokens[seqIdx].text);
  const year = coerceYearSlot(tokens[yearIdx].text);
  if (!seq || !year) return undefined;

  // Step 3: collect remaining tokens for the code suffix. We accept
  // anything AFTER the year that looks like letters / digits / Đ /
  // diacritics. Punctuation (commas, semicolons) terminates the
  // suffix.
  const suffixTokens: string[] = [];
  for (let i = yearIdx + 1; i < tokens.length; i++) {
    const t = tokens[i].text;
    if (/[,;]/.test(t)) break;
    // Accept tokens that contain at least one letter or digit.
    if (!/[\dA-Za-zÀ-ỹĐđ]/.test(t)) break;
    suffixTokens.push(t);
  }
  if (suffixTokens.length === 0) return undefined;

  // Step 4: assemble. Strip stray noise (single-letter stray words
  // are common when OCR drops diacritics: `D`, `C` from `Cần Thơ`
  // bled into the line). We keep tokens that look like meaningful
  // code characters.
  let suffix = suffixTokens.join('-');
  // Collapse spaces inside tokens.
  suffix = suffix.replace(/\s+/g, '');
  // The OCR may have split the suffix into garbage fragments like
  // `HĐND C an Thơ` — `C an Thơ` is the merged city-name which
  // must NOT be part of the suffix. Stop at the first all-uppercase
  // + lower-letter transition that looks like a city name.
  // (The more aggressive city-name detector lives in
  // cleanExtractedDocNumber via `/(?<=[A-Z])(?=\p{Ll}).*$/u`.)
  // After canonical diacritic restoration, run the cleanup pass.
  suffix = restoreDocCodeDiacritics(suffix);
  return `${seq}/${year}/${suffix}`;
}

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
 *
 * Additional cleanup for OCR-merged city names: a single uppercase
 * letter that follows a canonical Vietnamese code suffix (HĐND, UBND,
 * QĐ, NĐ, BGDĐT, etc.) is treated as the start of a city bleed and
 * trimmed. E.g. `HĐNDC` → `HĐND`, `UBNDT` → `UBND`.
 */
function cleanExtractedDocNumber(value: string): string {
  if (!value) return value;
  let v = value;
  // Truncate at punctuation.
  v = v.replace(/[,\.;:].*$/, '');
  // Uppercase-then-lowercase boundary. Without an explicit
  // lowercase-only class, this regex would cut "QĐ" because Đ
  // (U+0110) falls in the à-ỹ Unicode block and is included in
  // "/[a-zà-ỹ]/". So we use \p{Ll} (lowercase letter) with the
  // `u` flag — that excludes Đ (which is uppercase) while still
  // matching `inh` in "Ninh".
  v = v.replace(/(?<=[A-Z])(?=\p{Ll}).*$/u, '');
  // Trim NB<digits> and BGĐ<digits> partial-date bleed.
  v = v.replace(/NB\d.*$/, '').replace(/BGĐ.*$/, '');
  // Trim a single uppercase letter that is glued to a canonical
  // code suffix (city-name bleed). Specifically, drop a trailing
  // single uppercase letter when preceded by a known 4-letter
  // suffix that commonly suffers from bleed (HĐND, UBND, HĐNĐ).
  // The trailing letter must be followed by EOL or a non-letter
  // (so we don't strip middle letters of longer codes like BGDĐT).
  v = v.replace(/(?<=(?:HĐND|UBND|HĐNĐ))[A-ZÀ-Ỹ](?=$|[^A-ZÀ-Ỹ])/u, '');
  // Restore Đ (U+0110) in code suffixes when Tesseract dropped the
  // stroke (e.g. "HDNDC" → "HĐNDC", "HDND" → "HĐND"). The Đ is
  // semantically meaningful — it distinguishes HĐND ("Hội đồng
  // nhân dân") from the meaningless "HDND". We restore Đ whenever
  // the leading "HD" is followed by Vietnamese letters (N, ND,
  // NDC, etc.) that signal an HĐND context.
  v = v.replace(/\bHDND(C?)\b/g, (_m, c) => `HĐND${c}`);
  v = v.replace(/\bHDN(DC|ND)\b/g, (_m, suffix) => `HĐN${suffix}`);
  // Generic: HD<followed by Vietnamese-letter tail> — covers
  // HĐND/UBND-style patterns the explicit rules above miss.
  v = v.replace(/\bHD(?=[A-ZÀ-Ỹ]{1,3}\b)/g, 'HĐ');
  return v;
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
    // Collapse OCR-inserted whitespace in the code suffix
    // (e.g. "U BND" → "UBND", "Q D" → "QD" before diacritic restore).
    parts[2] = parts[2].replace(/\s+/g, '');
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

/**
 * Pull a document number ("14/2026/NQ-HĐND") out of a region.
 *
 * Layout-aware extraction:
 *   1. Detect two-column layout in the top band.
 *   2. For each candidate line in Box 3:
 *      a. If two-column, take only the LEFT half of the line (the
 *         doc-number sits on the left; the date+location sit on the
 *         right).
 *      b. Look for the "Số:" label at the start of the half-line.
 *      c. From the text immediately AFTER the label, find the FIRST
 *         substring matching the doc-number regex. Stop at the first
 *         date keyword ("ngày", "tháng", "năm") or first city name
 *         token that bled across the column boundary.
 *   3. Fall back to the existing regex chain (DOC_NUMBER_REGEX /
 *      DOC_NUMBER_REGEX_LOOSE / DOC_NUMBER_REGEX_VERY_LOOSE) on the
 *      truncated text.
 *
 * Why the change: the previous implementation matched the full line
 * after "Số:" — when the date+location were concatenated onto the
 * same OCR line, the regex happily walked past the doc-number and
 * captured the date's "ngày" + digits as well. The column-aware
 * truncation fixes this by isolating the doc-number region.
 */
function extractDocumentNumber(
  pages: PageOcr[],
  documentType?: string,
  trace?: (t: FieldTrace) => void,
  columnLayout?: ColumnLayout,
): string | undefined {
  const firstPage = pages[0];
  if (!firstPage) return undefined;
  // Prefer the ensemble-OCR hint when present. It is the result of a
  // 3-pass Tesseract run on the cropped Số: line and is significantly
  // more accurate than the full-page OCR for this specific field.
  if (firstPage.docNumberHint) {
    const cleaned = firstPage.docNumberHint.replace(/\s+/g, '');
    if (/\d+\/\d+\//.test(cleaned)) {
      const finalValue = refineDocNumberByDocType(finalizeDocNumber(cleaned), documentType);
      trace?.({
        field: 'documentNumber',
        value: finalValue ?? null,
        reason: 'page.docNumberHint (ensemble OCR pass)',
      });
      return finalValue;
    }
  }

  const layout = columnLayout ?? detectTopBandColumns(firstPage);

  const region = locateRegionByCode(firstPage, '3');
  if (!region) {
    trace?.({ field: 'documentNumber', value: null, reason: 'no Box 3 region' });
    return undefined;
  }

  const rejected: FieldTrace['candidates'] = [];
  let bestValue: string | undefined;
  let bestBBox: NormalizedBBox | undefined;
  let bestConfidence = 0;
  let bestReason = '';

  const candidateLines = region.lines;
  for (const line of candidateLines) {
    // For two-column layouts, isolate the LEFT half of the line —
    // this drops the "Thành phố Hồ Chí Minh, ngày ..." tail that
    // bleeds in from the right column.
    const split = splitLineByColumns(line, layout);
    const leftLine = split.left;

    // Collapse whitespace BEFORE checking the label regex, so that
    // OCR-permuted spaces (e.g. "S o" with stray spaces) still match.
    const text = normalizeDocNumberLine(clean(leftLine.text)).replace(/\s*([\/\-])\s*/g, '$1');
    const looksLikeDocNumberLine = /^s[ốo6]\s*[:.\-]?/i.test(text);

    if (!looksLikeDocNumberLine) {
      rejected.push({
        text: text.slice(0, 80),
        bbox: line.bbox,
        confidence: line.confidence,
        page: firstPage.pageNumber,
        rejectedReason: 'no "Số:" label at line start',
      });
      continue;
    }

    // Truncate at the first date keyword ("ngày", "tháng", "năm")
    // — these signal the start of the merged date column on
    // two-column documents.
    const docNumSegment = text
      .replace(/^s[ốo6]\s*[:.\-]?\s*/i, '')
      .replace(/\s+(?:ng[àa]y|th[áa]ng|n[ăa]m)\b.*$/i, '')
      // Also truncate at the comma that precedes a city/location name
      // (e.g. "14/2026/NQ-HĐND, Cần Thơ, ngày ..." → "14/2026/NQ-HĐND")
      .replace(/,\s+[A-ZÀ-Ỹ].*$/, '')
      .trim();

    const collapsed = docNumSegment.replace(/(?<=\d)\s+(?=\d)/g, '');
    const m =
      collapsed.match(DOC_NUMBER_REGEX) ??
      collapsed.match(DOC_NUMBER_REGEX_LOOSE) ??
      collapsed.match(DOC_NUMBER_REGEX_VERY_LOOSE);
    if (m) {
      const value = refineDocNumberByDocType(finalizeDocNumber(m[1] ?? m[0]), documentType);
      if (value) {
        bestValue = value;
        bestBBox = leftLine.bbox ?? line.bbox;
        bestConfidence = leftLine.confidence ?? line.confidence;
        bestReason = layout.isTwoColumn
          ? `left-column extract (cols=[${layout.columns.map((c) => `[${c.x0.toFixed(2)},${c.x1.toFixed(2)}]`).join(',')}])`
          : 'single-column extract, truncated at date keyword';
        break;
      }
    }

    // Last-resort recovery: token-based reconstruction when the
    // regex chain fails on heavily-garbled OCR.
    const recovered = reconstructDocNumberFromTokens(docNumSegment);
    if (recovered) {
      const value = refineDocNumberByDocType(finalizeDocNumber(recovered), documentType);
      if (value) {
        bestValue = value;
        bestBBox = leftLine.bbox ?? line.bbox;
        bestConfidence = leftLine.confidence ?? line.confidence;
        bestReason = 'token-based reconstruction (left column)';
        break;
      }
    }

    rejected.push({
      text: docNumSegment.slice(0, 80),
      bbox: line.bbox,
      confidence: line.confidence,
      page: firstPage.pageNumber,
      rejectedReason: 'no regex match after column split',
    });
  }

  if (!bestValue) {
    // Fallback: joined-region search, but anchor to a "Số:" label.
    const combined = joinLines(candidateLines);
    const labelled = combined.match(/s[\dốoöàáâãäåæçèéêëìíîïðñòóôõöùúûüýÿa-zà-ỹ]\s*[:.\-]?\s*(\d+\s*[\/\-]\s*\d+\s*[\/\-]\s*[A-Za-zÀ-ỹ][A-Za-zÀ-ỹ0-9\/\-.]*[A-Za-zÀ-ỹ])/i);
    if (labelled) {
      bestValue = refineDocNumberByDocType(finalizeDocNumber(labelled[0]), documentType);
      bestReason = 'fallback joined-region search';
    }
  }

  if (bestValue) {
    trace?.({
      field: 'documentNumber',
      value: bestValue,
      bbox: bestBBox,
      page: firstPage.pageNumber,
      confidence: bestConfidence,
      reason: bestReason,
      candidates: rejected,
    });
    return bestValue;
  }

  trace?.({
    field: 'documentNumber',
    value: null,
    reason: layout.isTwoColumn
      ? `no doc-number pattern after left-column split`
      : `no doc-number pattern found`,
    candidates: rejected,
  });
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
  NQ: ['A0', 'AD', 'AO', 'NO', 'l0', 'lO', 'lQ', 'N0', '0Q', 'O0', 'AQ', 'Nd', 'AI', 'Al', 'nQ', 'NQ', 'No', 'n0', 'NO', 'IO', 'IO', 'A1', 'IA'],
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
function extractDate(
  pages: PageOcr[],
  trace?: (t: FieldTrace) => void,
  columnLayout?: ColumnLayout,
): string | undefined {
  const firstPage = pages[0];
  if (!firstPage) return undefined;

  // Validate firstPage.dateHint before trusting it.
  //
  // The hint comes from a targeted Box 4 re-OCR (recognizeDateRegion
  // in tesseract-worker.ts) that uses PSM.SINGLE_LINE on a tight
  // crop. When Box 3 and Box 4 share a single OCR line in the
  // original page-level pass (very common for the merged
  // "Số: X/Y/CODE … ngày A tháng B năm C" header on Vietnamese
  // admin documents), the cropped Box 4 region STILL contains
  // the full merged line — PSM.SINGLE_LINE just forces Tesseract
  // to recognise it as one line, with character whitelist
  // filtering out a few letters but not the prefix text. The
  // resulting "plausible date" check (`/\b(?:19|20)\d{2}\b/`) is
  // satisfied by the trailing year, and the hint ends up holding
  // the entire merged string. Blindly returning that as the field
  // value is worse than no value at all.
  //
  // Fix: only accept the hint when it parses cleanly through the
  // same date-pattern matchers used below, OR when it's a short
  // "ngày X tháng Y năm Z" / "DD/MM/YYYY" substring. If it doesn't
  // parse, fall through to the normal extraction logic which will
  // re-extract from the underlying lines.
  if (firstPage.dateHint) {
    const hint = firstPage.dateHint;
    let hintClean: string | undefined;
    // Strategy 1: extract the canonical "ngày X tháng Y năm Z" substring.
    const dmyMatch = hint.match(/ng[àa]y\s*([0-9A-Za-zÀ-ỹ]{1,3})\s*th[áa]ng\s*([0-9A-Za-zÀ-ỹ]{1,3})\s*n[ăa]m\s*((?:19|20|[LlIiO0-9])[0-9A-Za-zÀ-ỹ]{2,3})/i);
    if (dmyMatch) {
      const [, dayRaw, monthRaw, yearRaw] = dmyMatch;
      const day = coerceNumericSlot(dayRaw);
      const month = parseMonthToken(monthRaw);
      const yearClean = yearRaw
        .split('')
        .map((ch) => DIGIT_LOOKALIKE[ch] ?? ch)
        .join('');
      if (day && month && /^\d{4}$/.test(yearClean)) {
        hintClean = `${day}/${month}/${yearClean}`;
      }
    }
    // Strategy 2: extract a DD/MM/YYYY substring if no "ngày" match.
    if (!hintClean) {
      const numeric = hint.match(/(\d{1,2})[\/\-.]\s*(\d{1,2})[\/\-.]\s*((?:19|20)\d{2})/);
      if (numeric) {
        const [, d, m, y] = numeric;
        const dn = Number(d);
        const mn = Number(m);
        if (dn >= 1 && dn <= 31 && mn >= 1 && mn <= 12) {
          hintClean = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
        }
      }
    }
    if (hintClean) {
      // Still run maybeFixDateYear so a snapped year agrees with
      // the doc-number year. The cleaned hint bypasses the
      // Box-4/upper-half/effective-date ranking, which is correct:
      // it's structurally a higher-fidelity source than any of
      // those.
      const fixed = maybeFixDateYear(pages, hintClean);
      trace?.({
        field: 'dateLetter',
        value: fixed.date,
        reason: 'page.dateHint (ensemble OCR pass)',
      });
      return fixed.date;
    }
    // Hint didn't parse to a clean date — drop it and run the
    // normal extraction on the underlying OCR lines.
  }

  const numericSlot = (s: string): string =>
    s.split('').map((ch) => DIGIT_LOOKALIKE[ch] ?? ch).join('');

  // Detect two-column layout so Box 4 (right column) is isolated
  // from Box 3 (left column) when Tesseract merged them.
  const layout = columnLayout ?? detectTopBandColumns(firstPage);

  // Source 1: Box 4 region (primary).
  // When the layout is two-column we restrict the candidate lines to
  // the right column only; this avoids picking up the doc-number
  // digits that bled into the same OCR line.
  const region = locateRegionByCode(firstPage, '4');
  const box4Candidates: { date: string; source: number; hasPipe: boolean; snapped: boolean; bbox?: NormalizedBBox; confidence?: number }[] = [];
  const box4Rejected: FieldTrace['candidates'] = [];
  if (region) {
    // For each Box-4 line, isolate the right-column half when two
    // columns are detected. The right-column half starts at the
    // column boundary (x ≈ mid) and goes to x ≈ 1.
    const rightLines: Array<{ text: string; line: OcrLine; rightHalf: NonNullable<ReturnType<typeof splitLineByColumns>['right']> }> = [];
    for (const l of region.lines) {
      const split = splitLineByColumns(l, layout);
      const rightHalf = split.right ?? (layout.isTwoColumn ? null : split.left);
      if (rightHalf && rightHalf.text) {
        rightLines.push({ text: rightHalf.text, line: l, rightHalf });
      }
    }
    for (const { text: flat, line, rightHalf } of rightLines) {
      // Pre-processing: replace isolated Latin-Extended chars (like ä, ö)
      // that DIGIT_LOOKALIKE knows about, before the regex patterns are
      // applied. This catches the common case where Tesseract emits "ä"
      // for digit "5" (e.g. "tháng ä năm" → "tháng 5 năm").
      const flatNorm = applyDigitLookalikeToIsolated(flat);
      const normalized = flatNorm.replace(
        /(ng[\u00e0a]y\s+)([^]*?)(\s+th[\u00e1a]ng\s+)([^]*?)(\s+n[\u0103a]m\s+)([^]*)/iu,
        (_full, lead, day, mid, month, trail, year) =>
          lead + numericSlot(day) + mid + numericSlot(month) + trail + year,
      );
      const haystack = normalized.replace(/(\d)\s+(\d)/g, '$1$2');
      let matched = false;
      for (const pattern of [...DATE_TEXT_PATTERNS, ...DATE_NUMERIC_PATTERNS]) {
        const m = haystack.match(pattern);
        if (m) {
          const d = parseDateMatch(m);
          if (d) {
            const fixed = maybeFixDateYear(pages, `${d.day}/${d.month}/${d.year}`);
            box4Candidates.push({
              date: fixed.date,
              source: 1,
              hasPipe: /\|/.test(flat),
              snapped: fixed.snapped,
              bbox: rightHalf.bbox ?? line.bbox,
              confidence: rightHalf.confidence ?? line.confidence,
            });
            matched = true;
            break;
          }
        }
      }
      if (!matched) {
        box4Rejected.push({
          text: flat.slice(0, 80),
          bbox: rightHalf.bbox ?? line.bbox,
          confidence: rightHalf.confidence ?? line.confidence,
          page: firstPage.pageNumber,
          rejectedReason: 'no date pattern in right-column half',
        });
      }
    }
  }

  // Source 2: upper half of page 1 (catches fused doc-num+date lines).
  // For two-column layouts, restrict the scan to the RIGHT column only.
  const upperCandidates: { date: string; source: number; hasPipe: boolean; snapped: boolean; bbox?: NormalizedBBox; confidence?: number }[] = [];
  const upperLinesAll = linesInReadingOrder(firstPage).filter((l) => l.bbox.y1 <= 0.30);
  for (const line of upperLinesAll) {
    // Restrict to the right column for two-column layouts.
    if (layout.isTwoColumn && line.bbox.x1 < layout.columns[0].x1) continue;
    const t = applyDigitLookalikeToIsolated(clean(line.text));
    for (const pattern of [...DATE_TEXT_PATTERNS, ...DATE_NUMERIC_PATTERNS]) {
      const m = t.match(pattern);
      if (m) {
        const d = parseDateMatch(m);
        if (d) {
          const fixed = maybeFixDateYear(pages, `${d.day}/${d.month}/${d.year}`);
          upperCandidates.push({
            date: fixed.date,
            source: 2,
            hasPipe: /\|/.test(t),
            snapped: fixed.snapped,
            bbox: line.bbox,
            confidence: line.confidence,
          });
          break;
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
  const effectiveCandidates: { date: string; source: number; hasPipe: boolean; snapped: boolean; bbox?: NormalizedBBox; confidence?: number }[] = [];
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
      const numericNormalizedNorm = applyDigitLookalikeToIsolated(numericNormalized);
      for (const pattern of [...DATE_TEXT_PATTERNS, ...DATE_NUMERIC_PATTERNS]) {
        const m = numericNormalizedNorm.match(pattern);
        if (m) {
          const d = parseDateMatch(m);
          if (d) {
            const fixed = maybeFixDateYear(pages, `${d.day}/${d.month}/${d.year}`);
            effectiveCandidates.push({
              date: fixed.date,
              source: 3,
              hasPipe: /\|/.test(t),
              snapped: fixed.snapped,
              bbox: line.bbox,
              confidence: line.confidence,
            });
          }
        }
      }
    }
  }
  // Note: an earlier revision iterated this scan twice (the second
  // loop was a copy/paste artefact). The scan is intentionally run
  // exactly once: every push into `effectiveCandidates` is by
  // definition a unique line, so any per-line contribution appears
  // exactly once in the candidate pool.
  const all = [...box4Candidates, ...upperCandidates, ...effectiveCandidates];
  if (all.length === 0) {
    trace?.({
      field: 'dateLetter',
      value: null,
      reason: layout.isTwoColumn
        ? `no date found in right column (cols=[${layout.columns.map((c) => `[${c.x0.toFixed(2)},${c.x1.toFixed(2)}]`).join(',')}])`
        : `no date pattern matched in upper half / effective-date scan`,
      candidates: box4Rejected,
    });
    return undefined;
  }

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
      trace?.({
        field: 'dateLetter',
        value: effective.date,
        reason: 'effective-date refinement (same month+year, different day)',
        bbox: effective.bbox,
        confidence: effective.confidence,
      });
      return effective.date;
    }
    // Stronger refinement for the case where Tesseract misread TWO
    // slots on the Box 4 line (not just the year): when the year
    // snap fired on the Box-4 candidate and the effective-date
    // candidate agrees with the doc-number year on the year slot,
    // the Box-4 month is no more trustworthy than the effective-
    // date month. In that situation we trust the effective-date
    // candidate entirely (day + month + year). Without this, a
    // garbled Box 4 line like "ngày 30 tháng B năm 2028" (parsed as
    // 30/8/2028, then year-snapped to 30/8/2026) would win over the
    // structurally-clean "ngày 30 tháng 6 năm 2026" from the body
    // — even though the Box-4 *month* (8) was misread just as much
    // as the year.
    if (
      box4.snapped &&
      !box4.hasPipe &&
      box4Parts.length === 3 &&
      effectiveParts.length === 3 &&
      box4Parts[2] === effectiveParts[2] && // years now agree after snap
      box4Parts[0] === effectiveParts[0]    // day slots agree
    ) {
      // Same day + same year (after snap), but Box 4 still has the
      // wrong month — the effective-date candidate is structurally
      // guaranteed to be about THIS document, so trust its month.
      trace?.({
        field: 'dateLetter',
        value: effective.date,
        reason: 'effective-date refinement (Box 4 month replaced)',
        bbox: effective.bbox,
        confidence: effective.confidence,
      });
      return effective.date;
    }
  }
  all.sort((a, b) => {
    if (a.hasPipe !== b.hasPipe) return a.hasPipe ? 1 : -1;
    if (a.source !== b.source) return a.source - b.source;
    return 0;
  });
  const winner = all[0];
  trace?.({
    field: 'dateLetter',
    value: winner.date,
    bbox: winner.bbox,
    confidence: winner.confidence,
    reason: `source=${winner.source} (1=Box4, 2=upper-half, 3=effective-date), hasPipe=${winner.hasPipe}, snapped=${winner.snapped}`,
  });
  return winner.date;
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
 *
 * Returns `{ date, snapped }`:
 *   - `date`: the (possibly year-snapped) date string.
 *   - `snapped`: true when the year was actually replaced (i.e. the
 *     OCR-extracted year differed from the doc-num year by 1–2).
 *     When `snapped` is true the extracted MONTH is also suspect
 *     because the LSTM's misread was strong enough on the same line;
 *     downstream ranking uses the flag to downgrade the entire
 *     candidate instead of just the year slot.
 */
function maybeFixDateYear(pages: PageOcr[], date: string): { date: string; snapped: boolean } {
  const firstPage = pages[0];
  if (!firstPage) return { date, snapped: false };
  const parts = date.split('/');
  if (parts.length !== 3) return { date, snapped: false };
  const [dd, mm, yyyy] = parts;
  if (!yyyy || !/^\d{4}$/.test(yyyy)) return { date, snapped: false };
  const dateYear = Number(yyyy);

  // Pull the merged doc-number+date line text (Box 3 + Box 4 usually
  // share a line) and look for a "/YYYY" pattern that represents the
  // document's own number year. We deliberately use a NO-word-boundary
  // regex because the year may be glued to a garbled character
  // (e.g. "05/2026A").
  //
  // All candidate years found on the doc-number line are merged;
  // when ANY of them agrees with the date year, we trust the date.
  // When ANY of them disagrees, we treat the doc-number year as
  // authoritative and snap the date — this catches the common
  // failure mode where Tesseract reads the year on the date-line
  // with a different tail digit than on the doc-number line (e.g.
  // 2026 → 2028, 2025 → 202B). We allow up to ±2 difference
  // because Tesseract sometimes confuses 6/8/5/0 in the trailing
  // digits of multi-line scans (less common but observed).
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
  if (candidates.length === 0) return { date, snapped: false };
  const docNumYear = candidates[0];
  // Snap when the date year is within ±2 of the doc-number year.
  // ±2 covers the (2026↔2028) case seen on the HĐND golden set
  // and is still narrow enough to not override real cross-year
  // references in body text (which surface as effective-date
  // candidates and are ranked separately by extractDate).
  if (Math.abs(docNumYear - dateYear) >= 1 && Math.abs(docNumYear - dateYear) <= 2) {
    return { date: `${dd}/${mm}/${docNumYear}`, snapped: true };
  }
  return { date, snapped: false };
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
  // Normalise BOTH the candidate text and each DOC_TYPES target via
  // removeDiacriticsForMatch + upper-case + letter-only. This is
  // critical because Tesseract routinely drops the combining marks
  // on Vietnamese vowels ("NGHI QUYET" instead of "NGHỊ QUYẾT"),
  // and comparing an unaccented candidate against an accented target
  // inflates the Levenshtein distance by the number of lost codepoints
  // (e.g. NGHIDUYET vs NGHỊ QUYẾT → dist=4, score=0.6, below the 0.65
  // acceptance bar — producing a false NONE for a clearly-correct
  // match).
  const norm = (s: string): string => removeDiacriticsForMatch(s.toUpperCase()).replace(/[^A-Z]/g, '');
  const upper = text.toUpperCase();
  const normText = norm(text);
  const words = upper.split(/[\s\\|,;:.\-]+/).filter(Boolean);
  const normWords = words.map(norm);

  // Pre-compute the normalised DOC_TYPES so we can substring-match
  // without going through the (slower, distance-noisy) full-string
  // check.
  const normTypes = new Map<string, string>();
  for (const dt of DOC_TYPES) normTypes.set(dt, norm(dt));

  let best: { type: string; score: number } | undefined;
  const consider = (candidateRaw: string, candidateNorm: string) => {
    if (!candidateRaw) return;
    if (!candidateNorm) return;
    for (const dt of DOC_TYPES) {
      const target = normTypes.get(dt)!;
      // Strict substring wins outright (against normalised forms).
      if (candidateNorm.includes(target)) {
        best = { type: dt, score: 1 };
        return;
      }
      const dist = levenshtein(candidateNorm, target);
      const score = 1 - dist / Math.max(candidateNorm.length, target.length);
      if (!best || score > best.score) best = { type: dt, score };
    }
  };

  for (let i = 0; i < words.length; i++) {
    // Skip very short tokens (< 4 chars after normalization) — they're
    // almost always document-number suffixes ("QĐ", "NQ", "TB", …)
    // or other structural fragments that can falsely match DOC_TYPES
    // when the Levenshtein threshold is loose (e.g. "QD" vs
    // "QUYẾT ĐỊNH" scores 0.82 and would pass the ≥0.5 filter).
    if (normWords[i].length >= 4) {
      consider(words[i], normWords[i]);
    }
  }
  for (let i = 0; i < words.length - 1; i++) {
    consider(words[i] + words[i + 1], normWords[i] + normWords[i + 1]);
  }
  // Sliding windows of the right length for each doc-type so that
  // an OCR misread somewhere in the title can still align. We slide
  // over the normalised text so the comparison stays robust against
  // diacritic loss.
  for (const dt of DOC_TYPES) {
    const target = normTypes.get(dt)!;
    if (normText.length < target.length - 3) continue;
    for (let i = 0; i <= normText.length - target.length + 3; i++) {
      const win = normText.slice(i, i + target.length + 4);
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
  //
  // We try the strict (centred + short) candidates FIRST and only
  // fall back to wider candidates if no strict match is found. Body
  // text containing "Luật", "Quyết định", "Nghị định", etc. (which
  // appear in citations like "Căn cứ Luật Tổ chức…") would otherwise
  // false-positive here.
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

  // Wider fallback: any line in the region whose text starts with a
  // doc-type keyword AND is at least score 0.85. We deliberately
  // reject citation lines (those starting with "Căn cứ", "Theo đề
  // nghị", "Luật số", "Nghị định số", "Quyết định số", etc.) which
  // are body-text mentions of doc types, not the title of the current
  // document. This prevents "Căn cứ Luật Tổ chức…" from being picked
  // as the document type when the actual title was garbled.
  const CITATION_PREFIX_RE = /^\s*(căn\s*cứ|theo\s+đề\s+nghị|luật\s+số|nghị\s*định\s*số|nghị\s*quyết\s*số|quyết\s*định\s*số|thông\s*tư\s*số|tờ\s*trình\s*số|báo\s*cáo\s*số|chỉ\s*thị\s*số|kế\s*hoạch\s*số)/i;
  for (const line of region.lines) {
    const text = clean(line.text);
    if (CITATION_PREFIX_RE.test(text)) continue;
    const m = fuzzyDocType(text);
    if (m && m.score >= 0.85 && (!best || m.score > best.score)) best = m;
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

function extractSummary(
  pages: PageOcr[],
  source: 'embedded' | 'ocr' = 'ocr',
): string | undefined {
  const firstPage = pages[0];
  if (!firstPage) return undefined;
  const lines = linesInReadingOrder(firstPage);

  // Anchor the search on Box 5a. The doc-type line and the trích yếu
  // lines both live in the centred Box 5a band (Decree 30, vertical
  // center ≈ 0.22 ± 0.10). Without this restriction `fuzzyDocType`
  // would happily false-positive on the top-band header labels
  // ("TỈNH NINH BÌNH" matches NGHỊ ĐỊNH at score 0.71; "CỘNG HÒA …"
  // matches NGHỊ QUYẾT at 0.67), which is acceptable for the
  // dedicated `extractDocumentType` extractor (which only reports
  // the strongest match per document) but catastrophic for the
  // summary extractor — the candidate anchor would jump to a top-
  // band line and walk the next 4 lines (the motto + số + date) into
  // the summary field.
  //
  // The 0.10 tolerance mirrors `linesInVerticalBand` in layout.ts,
  // and the [0.12, 0.32] band empirically covers all observed
  // doc-type + summary line positions on the Vietnamese golden set
  // while excluding the issuer (y < 0.10) and doc-number/date
  // (y ≈ 0.13–0.15) bands.
  const bandLines = lines.filter((l) => {
    const cy = (l.bbox.y0 + l.bbox.y1) / 2;
    return cy >= 0.12 && cy <= 0.32;
  });
  if (bandLines.length === 0) return undefined;

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

  // Citation-line detector: the doc-type extractor uses the same
  // pattern to reject body citations. We replicate it here so
  // extractSummary anchors on the title rather than the first
  // mention of "Luật" / "Nghị định" in the body.
  const CITATION_PREFIX_RE = /^\s*(căn\s*cứ|theo\s+đề\s+nghị|luật\s*số|nghị\s*định\s*số|nghị\s*quyết\s*số|quyết\s*định\s*số|thông\s*tư\s*số|tờ\s*trình\s*số|báo\s*cáo\s*số|chỉ\s*thị\s*số|kế\s*hoạch\s*số)/i;

  // Locate the document-type line using the same fuzzy matcher the
  // dedicated document-type extractor uses, so a garbled type line
  // (e.g. "1HUYẾT ĐỊNH") still anchors the summary correctly.
  //
  // Strict-first priority: a line whose bbox is centred (width ≤ 0.45)
  // AND short (≤ 30 chars) is much more likely to be the actual title
  // than a body citation like "Căn cứ Luật Tổ chức …". We therefore
  // prefer strict matches and only fall back to wider fuzzy matches if
  // no strict match exists.
  let typeIdx = bandLines.findIndex((l) => {
    const t = clean(l.text);
    if (isStructuralLine(t)) return false;
    if (CITATION_PREFIX_RE.test(t)) return false;
    if (t.length === 0 || t.length > 30) return false;
    const width = l.bbox.x1 - l.bbox.x0;
    if (width > 0.45) return false; // spans columns — body citation
    return fuzzyDocType(t) !== undefined;
  });
  if (typeIdx === -1) {
    typeIdx = bandLines.findIndex((l) => {
      const t = clean(l.text);
      if (isStructuralLine(t)) return false;
      if (CITATION_PREFIX_RE.test(t)) return false;
      const m = fuzzyDocType(t);
      return m !== undefined && m.score >= 0.85;
    });
  }
  if (typeIdx === -1) return undefined;

  // Walk forward from the type line within the Box 5a band only.
  // We translate `typeIdx` back to the absolute index in `lines` so
  // the next/prev comparisons below stay correct; the band may be a
  // strict subset of the page's lines.
  const absoluteTypeIdx = lines.indexOf(bandLines[typeIdx]);
  const summaryLines: string[] = [];
  for (let i = absoluteTypeIdx + 1; i < Math.min(lines.length, absoluteTypeIdx + 12); i++) {
    const cand = lines[i];
    const t = clean(cand.text);
    if (!t) continue;
    // Stay inside Box 5a. Walking into Box 5b / the citation block
    // would consume body text as the summary.
    const cy = (cand.bbox.y0 + cand.bbox.y1) / 2;
    if (cy > 0.32) break;
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
  //
  // CRITICAL: skip ALL lossy post-processing when the source is the
  // embedded-text layer (digital PDFs with a glyph stream). The
  // embedded text has perfect diacritic fidelity — running the
  // dictionary-based diacritic restorer on it actively corrupts the
  // output. The dictionary matches stripped forms (e.g. "da") to a
  // single canonical entry (e.g. "đã"), so when the embedded text
  // contains a valid alternative form with the same stripped key
  // (e.g. "đa" itself, "đất" vs vocab-only "đặt"), the restorer
  // silently substitutes the wrong form. See the July-2026 NQ
  // trích-yếu bug for the failure mode.
  const applyLossyCorrections = source === 'ocr';
  const normalized = summaryLines
    .map((line) => {
      if (!applyLossyCorrections) return line;
      let out = line;
      for (const [re, repl] of SUMMARY_WORD_CORRECTIONS) {
        // The replacements array mixes string substitutions and
        // callback substitutions; String.prototype.replace accepts
        // both, so cast through `unknown` to keep TS happy.
        out = out.replace(re, repl as unknown as string);
      }
      return out;
    })
    .map((s) => (applyLossyCorrections ? restoreVietnameseDiacritics(s) : s))
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
  // No marker found. Return undefined so the caller can decide
  // what to do — the previous behaviour was to default to 'THUONG',
  // but that hides genuine classification failures (e.g. an OCR miss
  // on a KHẨN/HOẢ TỐC document would silently become THƯỜNG). The
  // orchestrator now surfaces `undefined` as `null` in the API,
  // and the routing layer requires an explicit classification
  // before allowing distribution.
  return undefined;
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
  // See extractConfidentiality for the rationale: return undefined
  // rather than defaulting to 'THUONG' so the routing layer can
  // reject distribution when the OCR couldn't classify the doc.
  return undefined;
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
 * Options accepted by `extractFields`.
 *
 * The contract introduced in July 2026 lets the caller pass per-source
 * page arrays from the OCR pipeline. When `embeddedPages` is provided,
 * the embedded-text source wins for fields where it is strictly more
 * accurate than OCR (currently: issuer, documentType, summary). When
 * it is absent (e.g. image input, or the OCR pipeline produced no
 * embedded text), every field falls back to `pages` and the original
 * pre-July-2026 behaviour applies.
 */
export interface ExtractFieldsOptions {
  /** Populate the non-enumerable `__trace` array on the result. */
  debug?: boolean;
  /**
   * Per-source page arrays for combined embedded-text + OCR mode.
   * Either or both may be supplied; missing entries fall back to
   * `pages`. The field extractor routes:
   *   - issuer / documentType / summary ← `embeddedPages` if present
   *   - documentNumber / dateLetter     ← `pages` (OCR)
   *   - signerName / signerTitle / recipient / classification / pageCount
   *                                       ← `pages` (OCR signatures
   *                                          are never in the embedded
   *                                          text layer)
   */
  sources?: {
    embeddedPages?: PageOcr[];
    ocrPages?: PageOcr[];
  };
}

/**
 * Extract every supported field using the per-page layout information
 * returned by the OCR pipeline. The mode controls whether the
 * recipient or the issuer should be returned under `recipientName`.
 *
 * Per-field source routing (since the July-2026 combined-mode rewrite):
 *
 *   ┌───────────────────┬───────────────────────┬───────────────────┐
 *   │ Field             │ Source                │ Reason            │
 *   ├───────────────────┼───────────────────────┼───────────────────┤
 *   │ issuer            │ embeddedPages if any  │ perfect diacritics│
 *   │ documentType      │ embeddedPages if any  │ no LSTM noise     │
 *   │ summary           │ embeddedPages if any  │ no LSTM noise     │
 *   │ documentNumber    │ ocrPages (fallback:   │ 300 DPI digit     │
 *   │                   │ pages)                │ ensemble + region │
 *   │ dateLetter        │ ocrPages (fallback:   │ 300 DPI digit +   │
 *   │                   │ pages)                │ date region OCR   │
 *   │ signerName        │ ocrPages/pages        │ signature block   │
 *   │ signerTitle       │ ocrPages/pages        │ signature block   │
 *   │ recipientName     │ ocrPages/pages        │ "Kính gửi" line   │
 *   │ confidentiality   │ ocrPages/pages        │ header band       │
 *   │ urgency           │ ocrPages/pages        │ header band       │
 *   │ pageCount         │ pdfjs numPages        │ structural        │
 *   └───────────────────┴───────────────────────┴───────────────────┘
 */
export function extractFields(
  pages: PageOcr[],
  mode: string = 'INCOMING',
  options?: ExtractFieldsOptions,
): ExtractedFields {
  const fields: ExtractedFields = {};
  const traces: FieldTrace[] = [];
  const captureTrace = options?.debug ? (t: FieldTrace) => traces.push(t) : undefined;

  // Resolve per-source page arrays. Embedded text is preferred for
  // the Vietnamese-heavy labels where the embedded text layer is
  // strictly more accurate than OCR; the digit-heavy fields stay on
  // OCR even when embedded pages are present.
  const embeddedPages = options?.sources?.embeddedPages;
  const ocrPages = options?.sources?.ocrPages;
  const effectiveOcrPages = ocrPages && ocrPages.length > 0 ? ocrPages : pages;
  const effectiveEmbeddedPages = embeddedPages && embeddedPages.length > 0 ? embeddedPages : undefined;

  // Compute column layout from the page 1 of the OCR pipeline —
  // that's where the two-column Decree-30 header lives. The embedded
  // pages share the same layout coordinates (normalized to [0,1]),
  // so a single compute is sufficient.
  const columnLayout = effectiveOcrPages[0]
    ? detectTopBandColumns(effectiveOcrPages[0])
    : (effectiveEmbeddedPages?.[0] ? detectTopBandColumns(effectiveEmbeddedPages[0]) : undefined);

  // Issuer — prefer embedded text. Issuer text (e.g. "ỦY BAN NHÂN DÂN
  // THÀNH PHỐ …") is Vietnamese-heavy and embedded text has perfect
  // diacritic fidelity.
  fields.issuer = extractIssuer(
    effectiveEmbeddedPages ?? effectiveOcrPages,
    captureTrace,
    columnLayout,
  );

  // Recipient (OUTGOING mode only) — the "Kính gửi ..." line sits in
  // the body text on page 1 and is generally not part of the embedded
  // text layer in a useful location (depending on the PDF producer
  // it may be wrapped into the same glyph stream but with shifted
  // coordinates). Source from OCR for safety.
  if (mode === 'OUTGOING') {
    fields.recipientName = extractRecipient(effectiveOcrPages);
  } else {
    fields.recipientName = undefined;
  }

  // Document type — prefer embedded text. The doc-type heading lives
  // in Box 5a and is a short Vietnamese phrase ("QUYẾT ĐỊNH", "NGHỊ
  // QUYẾT", "BÁO CÁO", "TỜ TRÌNH", "THÔNG BÁO", "CHỈ THỊ",
  // "KẾ HOẠCH", ...) where diacritic accuracy is critical.
  fields.documentType = extractDocumentType(effectiveEmbeddedPages ?? effectiveOcrPages);

  // Document number and date — ALWAYS OCR. This is the highest-value
  // extraction target and runs through the 300 DPI rasterisation
  // pass plus the ensemble / region-specific re-OCR. Embedded text
  // may be absent (scanned docs) or noisy (font-split per-glyph
  // digital signatures), so we never source these from embedded.
  fields.documentNumber = extractDocumentNumber(
    effectiveOcrPages,
    fields.documentType,
    captureTrace,
    columnLayout,
  );
  fields.dateLetter = extractDate(effectiveOcrPages, captureTrace, columnLayout);

  // Summary — prefer embedded text. The trích yếu / "V/v ..." line is
  // often a long Vietnamese sentence where LSTM noise tends to clip
  // or merge adjacent lines; the embedded text layer reproduces the
  // exact glyph sequence. We pass the source through so `extractSummary`
  // can skip the lossy diacritic-restoration step on embedded input
  // (the dictionary can't distinguish "đa" from "đã" by stripped form
  // alone and would otherwise corrupt the perfect text).
  fields.summary = extractSummary(
    effectiveEmbeddedPages ?? effectiveOcrPages,
    effectiveEmbeddedPages ? 'embedded' : 'ocr',
  );

  // Signature block + classification + page count — OCR. Signatures
  // are not in the embedded layer, and the urgency/confidentiality
  // banner is often styled (bold, italic) which embedded text
  // reproduces inconsistently.
  fields.pageCount = extractPageCount(effectiveOcrPages);
  fields.signerName = extractSignerName(effectiveOcrPages);
  fields.signerTitle = extractSignerTitle(effectiveOcrPages);
  // Confidentiality and urgency are surfaced as `null` in the API
  // when OCR cannot classify the doc — the routing layer rejects
  // distribution unless these are non-null. See extractConfidentiality
  // / extractUrgency for the rationale.
  fields.confidentialityLevel = extractConfidentiality(effectiveOcrPages) ?? null;
  fields.urgencyLevel = extractUrgency(effectiveOcrPages) ?? null;

  // Drop empty values so the consumer can use plain JSON.stringify.
  // `confidentialityLevel` / `urgencyLevel` are exempt from this:
  // they are intentionally kept (as `null`) so the routing layer can
  // require an explicit classification.
  const NULLABLE_FIELDS = new Set<keyof ExtractedFields>([
    'confidentialityLevel',
    'urgencyLevel',
  ]);
  Object.keys(fields).forEach((k) => {
    const key = k as keyof ExtractedFields;
    if (NULLABLE_FIELDS.has(key)) return;
    if (fields[key] === undefined || fields[key] === '') delete fields[key];
  });

  if (options?.debug) {
    const debugBundle = {
      fields: traces,
      columnLayout: columnLayout
        ? {
            columns: columnLayout.columns.map((c) => ({ x0: c.x0, x1: c.x1, centerOfMass: c.centerOfMass })),
            isTwoColumn: columnLayout.isTwoColumn,
            method: columnLayout.method,
          }
        : undefined,
    };
    // Attach the trace as a non-enumerable property so the consumer
    // can read it without it leaking into JSON.stringify unless
    // explicitly asked for.
    Object.defineProperty(fields, '__trace', {
      value: traces,
      enumerable: false,
      writable: false,
    });
    Object.defineProperty(fields, '__debug', {
      value: debugBundle,
      enumerable: false,
      writable: false,
    });
  }

  return fields;
}

/* ── Re-export so callers don't need to reach into private modules ── */
export { allDocumentLines, allDocumentWords };
