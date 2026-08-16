import type { Canvas } from '@napi-rs/canvas';
import type { OcrBlock, OcrLine, OcrWord, PageOcr } from './types';
import { linesInReadingOrder, locateRegionByCode } from './layout';
import { normalizedCrop, unionLines as unionLineBBoxes } from './canvas-utils';
import { recognizeRegionWithParams, withParams } from './tesseract-worker';
import { BOX_VERTICAL_HINT, TITLE_KEYWORDS, isPersonNameWord } from './constants';
import { PSM } from 'tesseract.js';

/** Trim whitespace and tidy common OCR artefacts from a single value. */
const cleanText = (text: string | undefined | null): string =>
  (text ?? '').replace(/\s+/g, ' ').trim();

/**
 * Regex matching the Vietnamese signature-block opening line
 * ("TM. ỦY BAN NHÂN DÂN", "KT. CHỦ TỊCH", "PHÓ CHỦ TỊCH", etc.).
 *
 * More permissive than the SIGNATURE_MARKER regex in field-extractor.ts:
 * tolerates OCR-introduced spaces between letters (e.g. "K T." for
 * "KT.", "CH Ú TICH" for "CHUTICH"). Mirrored here to avoid a
 * circular import.
 */
const SIGNATURE_MARKER_RE = /\b(T\s*M\s*\.?|K\s*T\s*\.?|C\s*H\s*[ỦU]\s*T\s*[ỊI]CH|CHUTICH|P\s*H\s*O\s*C\s*H\s*[ỦU]\s*T\s*[ỊI]CH|PHO\s*CHUTICH|P\s*H\s*[ÓO]\s*TH\s*[ỦU]\s*T\s*[ƯU][ỚO]NG|TH\s*[ỦU]\s*T\s*[ƯU][ỚO]NG|K\s*[ÝY]\s*T\s*[ÊE]N|N\s*G\s*[ƯU][ỜO]I\s*K\s*[ÝY])\b/i;

/**
 * Per-region OCR.
 *
 * Runs an extra OCR pass on a *cropped* region of the page using
 * PSM 7 (single uniform text line) and a domain-appropriate character
 * whitelist. This converts Tesseract's "guess what kind of text this
 * is" into "this is a single line of digits/slashes" (or whatever the
 * region shape is), which is exactly the case the LSTM is tuned for.
 *
 * The key insight is that the *first* OCR pass is what gave us the
 * line-level layout info we need to know *where* the fields are. The
 * second pass then re-recognises those known regions with sharper
 * settings. This is the single biggest accuracy win for short,
 * shape-locked fields.
 *
 * Currently re-OCR'd fields (page 1 only):
 *   - documentNumber  - whitelist digits, "/.-" and uppercase Latin
 *                       (Vietnamese org codes use QĐ-UBND, TB-UBND, ...)
 *   - dateLetter      - whitelist digits, "ngaythangnam/", separators
 */

const DOC_NUMBER_WHITELIST =
  "0123456789/Q.-ABCDEFGHIJKLMNOPQRSTUVWXYZĐĂÂÊÔƠƯ";

const DATE_WHITELIST =
  "0123456789/.-nNgGaAyYtTháàÁÀảẢãÃạẠăĂằẰẳẲẵẴặẶâÂầẦẩẨẫẪậẬêÊếẾềỀểỂễỄệỆ";

/**
 * Whitelist of characters that appear in real Vietnamese personal
 * names. Used for a targeted signature-block re-OCR pass that
 * suppresses the OCR-glyph garbage (`>`, `#`, `¡`, `*`, `½`, `«`)
 * that Tesseract routinely injects around handwritten signatures.
 *
 * Without this whitelist Tesseract emits symbols and punctuation as
 * full words when the underlying pixels are ambiguous — so a dim
 * signature line that should read "Phạm Thị Thanh Trà" comes back as
 * "Phẩn#Íh¡ Thanh Tra". Constraining the alphabet to the actual
 * letters seen in real names lets the LSTM commit to letter
 * identities even at low confidence.
 *
 * The list mirrors the union of SURNAMES_NFC + MIDDLES_NFC plus the
 * set of common given-name initials (kept narrow on purpose — the
 * signer-name extractor handles dictionary expansion downstream).
 */
const SIGNATURE_NAME_WHITELIST =
  "abcdefghijklmnopqrstuvwxyzáàảãạăằẳẵặâầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôồốổỗộơờớởỡợúùủũụưừứửữựýỳỷỹỵđĐ";

export interface RegionOCRResult {
  documentNumber?: string;
  dateLetter?: string;
}

interface RegionSplice {
  replacements: Record<string, OcrLine[]>;
  values: RegionOCRResult;
}

function unionLines(lines: OcrLine[]) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const l of lines) {
    if (l.bbox.x0 < x0) x0 = l.bbox.x0;
    if (l.bbox.y0 < y0) y0 = l.bbox.y0;
    if (l.bbox.x1 > x1) x1 = l.bbox.x1;
    if (l.bbox.y1 > y1) y1 = l.bbox.y1;
  }
  return { x0, y0, x1, y1 };
}

function expandBBox(b: { x0: number; y0: number; x1: number; y1: number }, pad: number) {
  return {
    x0: Math.max(0, b.x0 - pad),
    y0: Math.max(0, b.y0 - pad),
    x1: Math.min(1, b.x1 + pad),
    y1: Math.min(1, b.y1 + pad),
  };
}

function wordsFromText(text: string, bbox: { x0: number; y0: number; x1: number; y1: number }): OcrWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const step = (bbox.x1 - bbox.x0) / Math.max(words.length, 1);
  return words.map((w, i) => ({
    text: w,
    bbox: { x0: bbox.x0 + step * i, y0: bbox.y0, x1: bbox.x0 + step * (i + 1), y1: bbox.y1 },
    confidence: 90,
    line: 0,
    block: 0,
    paragraph: 0,
  }));
}

function bestLine(page: PageOcr): string {
  const lines: OcrLine[] = linesInReadingOrder(page);
  if (lines.length === 0) return '';
  let best: { line: OcrLine; score: number } | undefined;
  for (const l of lines) {
    const wordCount = l.words.filter((w) => w.text.trim().length > 0).length;
    const conf = l.confidence || 0;
    const score = wordCount * 100 + conf;
    if (!best || score > best.score) best = { line: l, score };
  }
  return best ? best.line.text.trim() : '';
}

function buildLine(text: string, bbox: { x0: number; y0: number; x1: number; y1: number }, block: number): OcrLine {
  return {
    text,
    bbox,
    confidence: 90,
    block,
    paragraph: 0,
    words: wordsFromText(text, bbox),
  };
}

export async function recognizeFieldRegion(canvas: Canvas, page: PageOcr): Promise<RegionSplice> {
  const replacements: Record<string, OcrLine[]> = {};
  const values: RegionOCRResult = {};

  // Document number region.
  const docRegion = locateRegionByCode(page, '3');
  if (docRegion && docRegion.lines.length > 0) {
    const bbox = docRegion.blocks[0]?.bbox ?? unionLines(docRegion.lines);
    const cropped = normalizedCrop(canvas, expandBBox(bbox, 0.05));
    try {
      const reOcr = await recognizeRegionWithParams(
        cropped,
        page.pageNumber,
        {
          tessedit_pageseg_mode: PSM.SINGLE_LINE,
          tessedit_char_whitelist: DOC_NUMBER_WHITELIST,
        },
      );
      const txt = bestLine(reOcr);
      // Only accept the replacement if the re-OCR'd text looks like a
      // document number: contains digits and a slash.
      if (txt && /\d.*[\/]/.test(txt)) {
        values.documentNumber = txt;
        replacements['3'] = [buildLine(txt, bbox, docRegion.blocks[0]?.id ?? 0)];
      }
    } catch { /* fall back silently */ }
  }

  // Date region.
  const dateRegion = locateRegionByCode(page, '4');
  if (dateRegion && dateRegion.lines.length > 0) {
    const bbox = dateRegion.blocks[0]?.bbox ?? unionLines(dateRegion.lines);
    const cropped = normalizedCrop(canvas, expandBBox(bbox, 0.05));
    try {
      const reOcr = await recognizeRegionWithParams(
        cropped,
        page.pageNumber,
        {
          tessedit_pageseg_mode: PSM.SINGLE_LINE,
          tessedit_char_whitelist: DATE_WHITELIST,
        },
      );
      const txt = bestLine(reOcr);
      // Only accept if it looks like a date (4-digit year 19xx/20xx).
      if (txt && /\b(?:19|20)\d{2}\b/.test(txt)) {
        values.dateLetter = txt;
        replacements['4'] = [buildLine(txt, bbox, dateRegion.blocks[0]?.id ?? 0)];
      }
    } catch { /* fall back silently */ }
  }

  return { replacements, values };
}

/**
 * Re-OCR the signature block (Box 6/7a/7b) on the LAST page of the
 * document.
 *
 * Background: the signature block is the most failure-prone area of
 * a Vietnamese administrative document scan. Tesseract frequently
 * captures only the opening line ("TM. UY BAN NHAN DAN") and drops the
 * subsequent title line ("CHU TICH") and signer-name line
 * ("Nguyen Thanh Binh") — they share the right column at low contrast,
 * and the LSTM treats them as a single block. Once those lines are
 * missing, downstream extractors either return undefined (title) or
 * greedily pick the wrong text from the recipient list (name).
 *
 * Strategy: when a signature marker is found on the last page, crop
 * the right column from the marker down to the bottom of the page and
 * run a fresh Tesseract pass with PSM.SINGLE_BLOCK and the full
 * Vietnamese character set. If the re-OCR yields text that contains a
 * TITLE_KEYWORDS match or a person-name pattern, splice those lines
 * into the page as a new block so the field extractor can find them.
 *
 * Conservative: only fires when a signature marker is already
 * detected, and only accepts replacements that pass plausibility
 * checks (title keyword OR person-name run of >= 2 words).
 */
export interface SignatureBlockOCRResult {
  replacements: Record<string, OcrLine[]>;
}

export async function recognizeSignatureBlock(
  canvas: Canvas,
  page: PageOcr,
): Promise<SignatureBlockOCRResult> {
  const replacements: Record<string, OcrLine[]> = {};

  // Find the signature marker line.
  const allLines = linesInReadingOrder(page);
  const markerLine = allLines.find((l) => SIGNATURE_MARKER_RE.test(cleanText(l.text)));
  if (!markerLine) return { replacements };

  // Crop the right column from the marker down to the bottom of the page.
  // The signature block is right-aligned: x in [0.50, 1.00] reliably
  // excludes the recipient-list left column on Decree 30 layouts.
  // y starts just above the marker (so the marker line itself is
  // included) and ends at the bottom of the page.
  const crop = {
    x0: 0.50,
    y0: Math.max(0, markerLine.bbox.y0 - 0.02),
    x1: 1.00,
    y1: 1.00,
  };
  const cropped = normalizedCrop(canvas, crop);

  // Multi-pass: Tesseract with default settings (PSM.AUTO) often
  // returns only the first line of a low-contrast signature block.
  // Running PSM.SINGLE_BLOCK and PSM.SPARSE_TEXT in addition
  // recovers the title and name lines in the bottom of the crop.
  // We also try PSM.SINGLE_LINE for the bottom-most crop slice
  // (which usually contains only the signer name) — that mode
  // produces cleaner output for single-line Vietnamese text than
  // the page-level AUTO.
  //
  // We take the union of lines (deduped by text) across passes.
  const passes: Array<Partial<{ tessedit_pageseg_mode: PSM; tessedit_char_whitelist: string }>> = [
    { tessedit_pageseg_mode: PSM.AUTO },
    { tessedit_pageseg_mode: PSM.SINGLE_BLOCK },
    { tessedit_pageseg_mode: PSM.SPARSE_TEXT },
    { tessedit_pageseg_mode: PSM.SINGLE_LINE },
    // Dedicated name-line pass: PSM.SINGLE_BLOCK (assume a uniform
    // block of text) with a strict Vietnamese-name character
    // whitelist. The whitelist suppresses the OCR-glyph garbage
    // (`>`, `#`, `¡`, `*`, `½`, `«`) that the unconstrained LSTM
    // emits around handwritten signatures. Constraining the
    // alphabet to the union of SURNAMES_NFC + MIDDLES_NFC letters
    // lets Tesseract commit to letter identities even at low
    // confidence, which is critical for recovering the first 1–2
    // tokens of a 4-token Vietnamese name ("Phạm Thị Thanh Trà")
    // that the unconstrained LSTM collapses to "Phẩn#Íh¡ Thanh
    // Tra". The candidate is emitted in addition to the others
    // (not replacing them) so downstream scoring has more
    // material to work with.
    {
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      tessedit_char_whitelist: SIGNATURE_NAME_WHITELIST,
    },
  ];

  const seen = new Set<string>();
  const collectedLines: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }> = [];
  for (const params of passes) {
    try {
      const reOcr = await recognizeRegionWithParams(cropped, page.pageNumber, params);
      for (const l of linesInReadingOrder(reOcr)) {
        const text = cleanText(l.text);
        if (!text) continue;
        if (seen.has(text)) continue;
        seen.add(text);
        collectedLines.push({ text, bbox: l.bbox });
      }
    } catch (e) {
      if (process.env.OCR_DEBUG === '1') console.log('[signature re-OCR] pass failed', e);
    }
  }
  if (collectedLines.length === 0) return { replacements };

  // Re-map collected line bboxes from crop-relative coords back to
  // page-relative coords so they sit correctly on the page.
  const remapBBox = (b: { x0: number; y0: number; x1: number; y1: number }) => {
    const w = crop.x1 - crop.x0;
    const h = crop.y1 - crop.y0;
    return {
      x0: crop.x0 + b.x0 * w,
      y0: crop.y0 + b.y0 * h,
      x1: crop.x0 + b.x1 * w,
      y1: crop.y0 + b.y1 * h,
    };
  };

  const normalizeTitle = (s: string) =>
    s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

  // Title-keyword matching with two strategies (combined OR):
  //   1. Strict: does the normalized line contain any TITLE_KEYWORDS
  //      substring? (e.g. "CHU TICH", "GIA M DOC")
  //   2. Loose suffix: does the line end with a known 1-token tail of
  //      a TITLE_KEYWORDS entry, and have at least one other token?
  //      Catches Tesseract garbling of multi-word titles where only
  //      the final word survives ("CHU TICH" → "SHU TICH" /
  //      "SA ĐỀ U TỊCH").
  //   3. Last-word fuzzy: the line ends with a word whose normalized
  //      form matches any 1-token title suffix within an edit
  //      distance of 1.
  const titleMatches = (t: string): boolean => {
    const upper = normalizeTitle(t);
    if (TITLE_KEYWORDS.some((kw) => upper.includes(normalizeTitle(kw)))) return true;
    const tokens = upper.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return false;
    const lastWord = tokens[tokens.length - 1];
    for (const kw of TITLE_KEYWORDS) {
      const kwTokens = normalizeTitle(kw).split(/\s+/).filter(Boolean);
      const lastKw = kwTokens[kwTokens.length - 1];
      // Match the final word exactly (canonical suffix).
      if (lastWord === lastKw) return true;
      // Match the final word loosely: 1-char edit distance tolerates
      // "TICH" vs "TICH" with stray marks, "DỐC" vs "ĐỐC", etc.
      if (lastWord.length >= 3 && lastKw.length >= 3 &&
          Math.abs(lastWord.length - lastKw.length) <= 1) {
        let diffs = 0;
        const len = Math.min(lastWord.length, lastKw.length);
        for (let i = 0; i < len; i++) {
          if (lastWord[i] !== lastKw[i]) diffs++;
          if (diffs > 1) break;
        }
        if (diffs <= 1) return true;
      }
    }
    return false;
  };

  // Pick the best name line across all collected re-OCR passes.
  //
  // Strategy: every candidate line gets a "name-score" equal to the
  // length of its longest contiguous run of person-name words
  // (>= 2). We then prefer the candidate with the highest score;
  // ties are broken by total token count (more tokens = better
  // signal that the line is a name) and finally by the line's
  // original position in the collected list (later = preferred
  // because later passes tend to be higher-PSM and higher-fidelity).
  //
  // This fixes a critical issue seen on the NQ PDF where pass 6
  // produced "6 - 2031; NG Van Minh" (a fragment of the merged
  // recipient-list + signer-name line) and pass 11 produced the
  // correct "võ Văn Minh". The old `if (!nameLine)` logic would
  // pick the first match it found and stop — here, the first match
  // was the garbage fragment.
  let titleLine: { text: string; bbox: any } | undefined;
  for (const l of collectedLines) {
    const t = cleanText(l.text);
    // Skip the signature marker itself — its words ("UY BAN NHAN DAN")
    // would otherwise satisfy isPersonNameWord and grab the slot
    // before the actual name line is checked.
    if (SIGNATURE_MARKER_RE.test(t)) continue;
    if (!titleLine && titleMatches(t)) {
      titleLine = l;
      continue;
    }
  }
  // Collect EVERY viable name-line candidate (not just the single
  // best). On Vietnamese signature blocks the best-scoring candidate
  // by raw-OCR heuristics often isn't the best-scoring one after
  // dictionary expansion: "Phẩn#Íh¡ Thanh Tra" (PSM SINGLE_BLOCK,
  // 4 tokens, first 2 garbage) has the same isPersonNameWord score
  // as "hi Thanh Tra" (PSM SPARSE_TEXT, 3 tokens, first 1 garbage),
  // but downstream the longer line gives the dictionary more to
  // work with. Emitting both lets the signer-name-extractor's
  // structural scorer pick the actual best span via the Vietnamese
  // name dictionaries, instead of us committing to one here.
  const nameCandidates: Array<{
    text: string;
    bbox: any;
    nameRun: number;
    tokenCount: number;
    index: number;
  }> = [];
  for (let i = 0; i < collectedLines.length; i++) {
    const l = collectedLines[i];
    const t = cleanText(l.text);
    if (SIGNATURE_MARKER_RE.test(t)) continue;
    const tokens = t.split(/\s+/).filter(Boolean);
    let run: string[] = [];
    let bestRun: string[] = [];
    for (const tok of tokens) {
      if (isPersonNameWord(tok)) run.push(tok);
      else {
        if (run.length > bestRun.length) bestRun = run;
        run = [];
      }
    }
    if (run.length > bestRun.length) bestRun = run;
    if (bestRun.length < 2) continue;
    // Skip candidate lines whose text is already represented in an
    // earlier candidate — keeps the replacement block compact and
    // avoids the signer-name-extractor scoring the same text twice.
    if (nameCandidates.some((c) => c.text === t)) continue;
    nameCandidates.push({
      text: t,
      bbox: l.bbox,
      nameRun: bestRun.length,
      tokenCount: tokens.length,
      index: i,
    });
  }

  const newLines: OcrLine[] = [];
  if (titleLine) {
    newLines.push({
      text: titleLine.text,
      bbox: remapBBox(titleLine.bbox),
      confidence: 80,
      block: 0,
      paragraph: 0,
      words: [{ text: titleLine.text, bbox: remapBBox(titleLine.bbox), confidence: 80, line: 0, block: 0, paragraph: 0 }],
    });
  }
  // Emit every viable name-line candidate so the signer-name
  // extractor can pick the best span after dictionary expansion.
  // Downstream scoring (in signer-name-extractor.ts) is responsible
  // for selecting the actual output from these candidates.
  for (const cand of nameCandidates) {
    newLines.push({
      text: cand.text,
      bbox: remapBBox(cand.bbox),
      confidence: 80,
      block: 0,
      paragraph: 0,
      words: [{ text: cand.text, bbox: remapBBox(cand.bbox), confidence: 80, line: 0, block: 0, paragraph: 0 }],
    });
  }
  if (newLines.length === 0) return { replacements };
  replacements['7sig'] = newLines;
  return { replacements };
}

/**
 * Splice replacement lines into the page's blocks.
 *
 * Strategy: for each replacement, find the original block whose bbox
 * overlaps the region bbox, and PREPEND the re-OCR'd line to its
 * lines array. Existing extractors iterate lines in document order
 * so the re-OCR'd line is tried FIRST; if upstream validation
 * rejects it (e.g. fails a regex shape check), the original line is
 * still present as a fallback.
 *
 * This is much safer than outright replacement because a failed
 * re-OCR can no longer destroy the original data.
 */
export function applyRegionReplacements(page: PageOcr, replacements: Record<string, OcrLine[]>): PageOcr {
  if (Object.keys(replacements).length === 0) return page;

  const regionBBoxes: Record<string, { y0: number; y1: number }> = {
    '3': { y0: BOX_VERTICAL_HINT['3'] - 0.10, y1: BOX_VERTICAL_HINT['3'] + 0.10 },
    '4': { y0: BOX_VERTICAL_HINT['4'] - 0.10, y1: BOX_VERTICAL_HINT['4'] + 0.10 },
  };

  const matchedCodes = new Set<string>();
  const newBlocks: OcrBlock[] = page.blocks.map((block) => {
    for (const code of Object.keys(replacements)) {
      if (matchedCodes.has(code)) continue;
      const rb = regionBBoxes[code];
      if (!rb) continue;
      const overlaps = block.bbox.y0 >= rb.y0 - 0.05 && block.bbox.y1 <= rb.y1 + 0.05;
      if (!overlaps) continue;
      matchedCodes.add(code);
      return {
        ...block,
        lines: [...replacements[code], ...block.lines],
        confidence: 95,
      };
    }
    return block;
  });

  // Replacements whose region didn't overlap any existing block: add a
  // dedicated synthetic block so the extractor can still find them.
  const leftovers = Object.keys(replacements).filter((c) => !matchedCodes.has(c));
  if (leftovers.length > 0) {
    const newLines = leftovers.flatMap((c) => replacements[c]);
    newBlocks.push({
      id: -2,
      bbox: unionLines(newLines),
      confidence: 95,
      lines: newLines,
    });
  }

  return { ...page, blocks: newBlocks };
}