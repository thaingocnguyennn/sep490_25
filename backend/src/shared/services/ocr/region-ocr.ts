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
const SIGNATURE_MARKER_RE = /\b(T\s*M\s*\.?|K\s*T\s*\.?|C\s*H\s*[ỦU]\s*T\s*[ỊI]CH|CHUTICH|P\s*H\s*O\s*C\s*H\s*[ỦU]\s*T\s*[ỊI]CH|PHO\s*CHUTICH|K\s*[ÝY]\s*T\s*[ÊE]N|N\s*G\s*[ƯU][ỜO]I\s*K\s*[ÝY])\b/i;

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
  const passes: Array<PSM> = [
    PSM.AUTO,
    PSM.SINGLE_BLOCK,
    PSM.SPARSE_TEXT,
    PSM.SINGLE_LINE,
  ];

  const seen = new Set<string>();
  const collectedLines: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }> = [];
  for (const psm of passes) {
    try {
      const reOcr = await recognizeRegionWithParams(cropped, page.pageNumber, {
        tessedit_pageseg_mode: psm,
      });
      if (process.env.OCR_DEBUG === '1') {
        console.log('[signature re-OCR pass=' + psm + '] blocks=' + reOcr.blocks.length + ' text=' + JSON.stringify(reOcr.text));
      }
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
  if (process.env.OCR_DEBUG === '1') {
    console.log('[signature re-OCR] collected ' + collectedLines.length + ' lines');
    for (const l of collectedLines) console.log('  - ' + JSON.stringify(l.text));
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

  let titleLine: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } } | undefined;
  let nameLine: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } } | undefined;
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
    if (!nameLine) {
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
      if (bestRun.length >= 2) {
        // Emit the *raw* OCR text (no in-place character
        // replacement) — the new signer-name pipeline normalises
        // and corrects each token via dictionaries + Levenshtein,
        // and emits multiple candidates instead of fabricating a
        // single cleaned line.
        nameLine = { text: t, bbox: l.bbox };
      }
    }
  }

  const newLines: OcrLine[] = [];
  if (process.env.OCR_DEBUG === '1') {
    console.log('[signature re-OCR] titleLine=' + (titleLine ? JSON.stringify(titleLine.text) : 'undefined') + ' nameLine=' + (nameLine ? JSON.stringify(nameLine.text) : 'undefined'));
  }
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
  if (nameLine) {
    newLines.push({
      text: nameLine.text,
      bbox: remapBBox(nameLine.bbox),
      confidence: 80,
      block: 0,
      paragraph: 0,
      words: [{ text: nameLine.text, bbox: remapBBox(nameLine.bbox), confidence: 80, line: 0, block: 0, paragraph: 0 }],
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