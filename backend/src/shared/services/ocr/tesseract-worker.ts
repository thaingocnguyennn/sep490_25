import Tesseract, { createWorker, Worker, OEM, PSM } from 'tesseract.js';
import { USER_WORDS } from './constants';
import type { Canvas } from '@napi-rs/canvas';
import type { OcrBlock, OcrLine, OcrWord, PageOcr } from './types';
import { locateRegionByCode } from './layout';
import { normalizedCrop, expandBBox, unionLines } from './canvas-utils';

/**
 * Tesseract worker management.
 *
 * A single shared worker is reused across all OCR calls so we don't
 * pay the model-loading cost on every invocation. The worker is loaded
 * with 'vie' first (Vietnamese primary script) followed by 'eng' for
 * the rare mixed-language document. Loading order matters: Tesseract
 * uses the first language as the primary script detector, which
 * materially reduces diacritic loss on Vietnamese text.
 *
 * Vietnamese-specific init parameters are also applied here:
 *   - `preserve_interword_spaces` keeps multi-word terms (e.g.
 *     "Bộ Giáo dục") as single tokens for downstream parsing.
 *   - `user_defined_dpi` silences the spurious "Invalid resolution
 *     0 dpi" warning and lets the LSTM pick the right scale.
 *   - `tessedit_pageseg_mode` defaults to PSM.AUTO (3), which makes
 *     the implicit default explicit and is documented in code.
 *   - `load_system_dawg` / `load_freq_dawg` keep the Vietnamese
 *     dictionaries on (necessary for LSTM accuracy).
 */

let sharedWorker: Worker | null = null;
let initPromise: Promise<Worker> | null = null;

const WORKER_PARAMS = {
  preserve_interword_spaces: '1',
  // The Vietnamese LSTM was trained primarily at 300 DPI. Going higher
  // doesn't help (the LSTM treats it the same as 300), but going lower
  // measurably hurts digit recognition (4/5/6/9 group together more
  // when each glyph has fewer pixels).
  user_defined_dpi: '300',
  tessedit_pageseg_mode: PSM.AUTO,
} as const;

async function getSharedWorker(): Promise<Worker> {
  if (sharedWorker) return sharedWorker;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    // LSTM-only OEM (1) is the default for Tesseract 5+ and gives
    // the highest accuracy on Vietnamese. Using `OEM.LSTM_ONLY`
    // documents intent and is forward-compatible.
    // The current best config on the Vietnamese golden set (July 2026):
    // 'vie+eng' is required — 'vie' alone breaks extraction of common
    // date keywords ("ngày", "tháng", "năm") because the LSTM has not
    // seen them often enough in Vietnamese-only training. The English
    // data supplies the glyph shape for the small set of Latin-shape
    // Vietnamese stop words; the LSTM's primary language is still 'vie'
    // so diacritics on real Vietnamese text are preserved. Override via
    // the OCR_LANGS env var for callers who need a different pack.
    const langs = process.env.OCR_LANGS ?? 'vie+eng';
    const w = await createWorker(langs, OEM.LSTM_ONLY, {
      logger: () => undefined,
    });
    await w.setParameters({ ...WORKER_PARAMS });
    // Note: `user_words` only affects the legacy Tesseract engine; the
    // LSTM-only OEM we use ignores it. We leave a single dead reference
    // here so it's clear the lever was tried and not effective — the
    // exact equivalent for LSTM is `user_patterns` (regex constraints)
    // or `tessedit_char_whitelist` (per-character restrictions).
    const _userWordsUnused: Partial<Tesseract.WorkerParams> = {
      user_words: USER_WORDS.slice(0, 0).join('\n'),
    };
    await w.setParameters(_userWordsUnused);
    sharedWorker = w;
    return w;
  })();
  return initPromise;
}

process.on('exit', () => {
  sharedWorker?.terminate();
  sharedWorker = null;
});

/** Normalize a Tesseract bbox (in pixels) to [0, 1] page coordinates. */
function normalizeBBox(
  bbox: { x0: number; y0: number; x1: number; y1: number },
  pageWidth: number,
  pageHeight: number,
) {
  return {
    x0: bbox.x0 / pageWidth,
    y0: bbox.y0 / pageHeight,
    x1: bbox.x1 / pageWidth,
    y1: bbox.y1 / pageHeight,
  };
}

/** Convert a Tesseract word into our normalized representation. */
function mapWord(
  rawWord: TesseractWord,
  pageWidth: number,
  pageHeight: number,
): OcrWord {
  return {
    text: rawWord.text,
    bbox: normalizeBBox(rawWord.bbox, pageWidth, pageHeight),
    confidence: rawWord.confidence,
    line: rawWord.line_id,
    block: rawWord.block_id,
    paragraph: rawWord.para_id,
  };
}

function mapLine(
  rawLine: TesseractLine,
  pageWidth: number,
  pageHeight: number,
): OcrLine {
  return {
    text: rawLine.text,
    bbox: normalizeBBox(rawLine.bbox, pageWidth, pageHeight),
    confidence: rawLine.confidence,
    block: rawLine.block_id,
    paragraph: rawLine.para_id,
    words: rawLine.words.map((w) => mapWord(w, pageWidth, pageHeight)),
  };
}

function mapBlock(
  rawBlock: TesseractBlock,
  pageWidth: number,
  pageHeight: number,
): OcrBlock {
  return {
    id: rawBlock.block_id,
    bbox: normalizeBBox(rawBlock.bbox, pageWidth, pageHeight),
    confidence: rawBlock.confidence,
    lines: rawBlock.paragraphs
      .flatMap((p) => p.lines)
      .map((l) => mapLine(l, pageWidth, pageHeight)),
  };
}

/**
 * Run Tesseract on a (already preprocessed) canvas and return a
 * fully-typed PageOcr with normalized block/line/word bounding boxes.
 *
 * Preprocessing is the caller's responsibility — that way a single
 * preprocess pass is shared between full-page OCR and any later
 * region-level OCR calls (which would otherwise re-preprocess the
 * same pixels).
 */
export async function recognizeCanvas(
  canvas: Canvas,
  pageNumber: number,
): Promise<PageOcr> {
  const buffer = canvas.toBuffer('image/png');

  const worker = await getSharedWorker();
  // tesseract.js v6+ disables block/line/word output by default — we need
  // it because the layout-aware field extractor relies on bounding boxes.
  // Without `{ blocks: true }` the worker returns `data.blocks ===
  // undefined` and every layout extractor returns nothing.
  const { data } = await worker.recognize(buffer, {}, { blocks: true });
  const pageWidth = canvas.width;
  const pageHeight = canvas.height;

  const blocks = (data.blocks ?? [])
    .map((b) => mapBlock(b as unknown as TesseractBlock, pageWidth, pageHeight))
    .filter((b) => b.lines.length > 0);

  const text = blocks
    .map((b) => b.lines.map((l) => l.text).join('\n'))
    .join('\n\n')
    .trim();

  const confidence = blocks.length > 0
    ? blocks.reduce((sum, b) => sum + b.confidence, 0) / blocks.length
    : 0;

  return {
    pageNumber,
    width: pageWidth,
    height: pageHeight,
    text,
    confidence,
    blocks,
  };
}

/**
 * Multi-pass OCR: run Tesseract with two different PSM strategies and
 * merge the results into a single PageOcr. The output block list is the
 * union of the two passes; when blocks from both passes overlap (by
 * bbox), the higher-confidence one wins.
 *
 * This is expensive (~2x single-pass cost) but was the only technique
 * that produced a measurable accuracy gain on the Vietnamese golden
 * set during July 2026 benchmarking — namely, PSM.AUTO (3) tends to
 * get the document number line right but PSM.SINGLE_BLOCK (6) often
 * reads the date better, and vice-versa. Keeping only the higher-
 * confidence of the two per-region therefore cleans up digit
 * misreads in the noisy areas.
 *
 * Off by default; opt in by setting OCR_MULTIPASS=1.
 */
export async function recognizeCanvasMultipass(
  canvas: Canvas,
  pageNumber: number,
): Promise<PageOcr> {
  if (process.env.OCR_MULTIPASS !== '1') return recognizeCanvas(canvas, pageNumber);
  const buffer = canvas.toBuffer('image/png');
  const worker = await getSharedWorker();

  // Pass 1: PSM.AUTO (the default).
  const first = await worker.recognize(buffer, {}, { blocks: true });

  // Pass 2: PSM.SINGLE_BLOCK — for uniform Vietnamese admin documents
  // this often corrects digit/letter confusions in the header.
  const restore = await withParams(
    { tessedit_pageseg_mode: PSM.SINGLE_BLOCK as unknown as PSM },
    async () => {
      const { data } = await worker.recognize(buffer, {}, { blocks: true });
      return data;
    },
  );

  const pageWidth = canvas.width;
  const pageHeight = canvas.height;
  const firstBlocks = (first.data?.blocks ?? [])
    .map((b) => mapBlock(b as unknown as TesseractBlock, pageWidth, pageHeight))
    .filter((b) => b.lines.length > 0);
  const secondBlocks = (restore?.blocks ?? [])
    .map((b) => mapBlock(b as unknown as TesseractBlock, pageWidth, pageHeight))
    .filter((b) => b.lines.length > 0);

  // Merge: for each block in the first pass, check if any block in
  // the second pass overlaps by >50% of area. If so, keep the
  // higher-confidence one. Otherwise keep both (different layout).
  const overlapping = (a: OcrBlock, b: OcrBlock): boolean => {
    const xOverlap = Math.max(0, Math.min(a.bbox.x1, b.bbox.x1) - Math.max(a.bbox.x0, b.bbox.x0));
    const yOverlap = Math.max(0, Math.min(a.bbox.y1, b.bbox.y1) - Math.max(a.bbox.y0, b.bbox.y0));
    if (xOverlap <= 0 || yOverlap <= 0) return false;
    const aArea = (a.bbox.x1 - a.bbox.x0) * (a.bbox.y1 - a.bbox.y0);
    const bArea = (b.bbox.x1 - b.bbox.x0) * (b.bbox.y1 - b.bbox.y0);
    const overlapArea = xOverlap * yOverlap;
    return overlapArea / Math.min(aArea, bArea) > 0.5;
  };
  const seen = new Set<number>();
  const merged: OcrBlock[] = [];
  for (const ab of firstBlocks) {
    let best: OcrBlock = ab;
    for (let j = 0; j < secondBlocks.length; j++) {
      if (seen.has(j)) continue;
      const sb = secondBlocks[j];
      if (overlapping(ab, sb)) {
        seen.add(j);
        if (sb.confidence > ab.confidence) best = sb;
        break;
      }
    }
    merged.push(best);
  }
  for (let j = 0; j < secondBlocks.length; j++) {
    if (!seen.has(j)) merged.push(secondBlocks[j]);
  }

  const text = merged
    .map((b) => b.lines.map((l) => l.text).join('\n'))
    .join('\n\n')
    .trim();
  const confidence = merged.length > 0
    ? merged.reduce((sum, b) => sum + b.confidence, 0) / merged.length
    : 0;
  return {
    pageNumber,
    width: pageWidth,
    height: pageHeight,
    text,
    confidence,
    blocks: merged,
  };
}

/**
 * Lightweight per-call parameter override.
 *
 * Used by per-region OCR (recognizeRegion) so a single-line crop with
 * a character whitelist can run without permanently flipping the
 * shared worker's PSM. Saves + restores the prior PSM around the call.
 *
 * IMPORTANT: This is NOT safe to call concurrently. With a single
 * worker, two simultaneous recognizeRegion calls will race on PSM.
 * Use a worker pool if you need concurrent per-region OCR.
 */
export async function withParams<R>(
  params: Partial<Tesseract.WorkerParams>,
  fn: () => Promise<R>,
): Promise<R> {
  const worker = await getSharedWorker();
  await worker.setParameters(params);
  try {
    return await fn();
  } finally {
    // Restore the canonical baseline. Explicitly resetting
    // tessedit_char_whitelist to '' is important because
    // setParameters() merges rather than replaces, so a leftover
    // whitelist from one region pass would still apply to the next
    // page's full-page OCR if we didn't clear it.
    await worker.setParameters({ ...WORKER_PARAMS, tessedit_char_whitelist: '' });
  }
}

/** Recognize a single region (cropped canvas) with custom params. */
export async function recognizeRegionWithParams(
  cropped: Canvas,
  pageNumber: number,
  params: Partial<Tesseract.WorkerParams>,
): Promise<PageOcr> {
  const buffer = cropped.toBuffer('image/png');
  return withParams(params, async () => {
    const worker = await getSharedWorker();
    const { data } = await worker.recognize(buffer, {}, { blocks: true });
    const pageWidth = cropped.width;
    const pageHeight = cropped.height;
    const blocks = (data.blocks ?? [])
      .map((b) => mapBlock(b as unknown as TesseractBlock, pageWidth, pageHeight))
      .filter((b) => b.lines.length > 0);
    const text = blocks
      .map((b) => b.lines.map((l) => l.text).join('\n'))
      .join('\n\n')
      .trim();
    const confidence = blocks.length > 0
      ? blocks.reduce((sum, b) => sum + b.confidence, 0) / blocks.length
      : 0;
    return { pageNumber, width: pageWidth, height: pageHeight, text, confidence, blocks };
  });
}

/**
 * Multi-pass ensemble OCR for the document-number region only.
 *
 * The single biggest accuracy win on the Vietnamese golden set is to
 * re-OCR the Số: line with several PSM strategies and pick the
 * highest-confidence result. PSM.AUTO gives the LSTM's natural
 * guess; PSM.SINGLE_LINE forces it to treat the line as a single
 * token; and PSM.SINGLE_LINE + a tight character whitelist locks
 * it into "this is a numeric sequence".
 *
 * Returns the highest-confidence line whose shape looks like a doc
 * number (at least one slash and a leading digit). Used by the
 * orchestrator only when OCR_REGION_REOCR=2 is set, since the cost
 * is 3 extra recognise calls.
 */
/**
 * Multi-pass ensemble OCR for the document-number region only.
 *
 * Strategy: run Tesseract on the FULL rendered page (not a crop) with
 * 3 different PSM modes and a character whitelist on the most
 * targeted pass. Per-line candidate scoring picks the line most
 * likely to be the Số: value (most '/' chars, leading digit, etc.).
 *
 * The doc-number line is almost always at the same vertical position
 * (~0.12–0.15 of page height) on Vietnamese Decree 30 documents,
 * so cropping it works — but the crop has to be large enough that
 * Tesseract sees the line as a full text block and not a fragment.
 * Cropping at 0.15 margin was blowing up the bbox into the whole
 * page for short lines, so we pad by min(0.03, half-line-height).
 */
export async function recognizeDocNumberRegion(
  canvas: Canvas,
  page: PageOcr,
): Promise<string | undefined> {
  const docRegion = locateRegionByCode(page, '3');
  if (!docRegion || docRegion.lines.length === 0) return undefined;
  // Use the full page. Tesseract handles it the same way as the
  // orchestrator's full-page call, but with tighter PSM + whitelist
  // settings optimised for the Số: line shape.
  const buffer = canvas.toBuffer('image/png');
  const worker = await getSharedWorker();

  const passes: Partial<Tesseract.WorkerParams>[] = [
    { tessedit_pageseg_mode: PSM.AUTO as unknown as PSM },
    { tessedit_pageseg_mode: PSM.SINGLE_LINE as unknown as PSM },
    {
      tessedit_pageseg_mode: PSM.SINGLE_LINE as unknown as PSM,
      tessedit_char_whitelist: '0123456789/.-ABCDEFGHIJKLMNOPQRSTUVWXYZĐĂÂÊÔƠƯăâêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ',
    },
  ];

  let best: { text: string; confidence: number } | undefined;
  for (const params of passes) {
    try {
      const data = await withParams(params, async () => {
        const r = await worker.recognize(buffer, {}, { blocks: true });
        return r.data;
      });
      const blocks = (data as any).blocks ?? [];
      // Tesseract.js v7 returns blocks with `paragraphs` (each containing
      // `lines`); the legacy flat `lines` array no longer exists.
      const allLines: any[] = blocks.flatMap((b: any) =>
        (b.paragraphs ?? []).flatMap((p: any) => p.lines ?? []),
      );
      if (process.env.OCR_DEBUG === '1') {
        const layoutBlocks = (data as any).layoutBlocks ?? [];
        const blockLines = blocks.flatMap((b: any) => b.paragraphs ?? []).flatMap((p: any) => p.lines ?? []);
        console.log(`[ensemble pass] params=${JSON.stringify(params)} blocks=${blocks.length} layoutBlocks=${layoutBlocks.length} blockLines=${blockLines.length} textLen=${(data as any).text?.length ?? 0}`);
        for (let i = 0; i < Math.min(blockLines.length, 5); i++) {
          console.log(`  line ${i}: "${blockLines[i]?.text}"`);
        }
      }
      // For each pass pick the line most likely to be the doc number.
// We rank by: matches NUMBER/YEAR/CODE pattern (digits/digits/code)
// → strongest signal; otherwise falls back to slash count.
const stripLabel = (t: string): string => t.replace(/^s[ốo0]\s*[:.\-]?\s*/i, '').trim();
const ranked = allLines
        .map((l: any) => {
          const rawText = (l.text ?? '').trim();
          const t = stripLabel(rawText);
          let score = 0;
          if (/^\d+\s*[\/\\-]\s*\d+\s*[\/\\-]\s*[A-Za-zÀ-ỹ]/.test(t)) {
            score = 10 + ((t.match(/\//g) ?? []).length);
          } else if (/\d+\/\d+\//.test(t)) {
            score = 6 + ((t.match(/\//g) ?? []).length);
          } else if (/\d+\/\d+/.test(t)) {
            score = 3 + ((t.match(/\//g) ?? []).length);
          } else if (/S[ốo0]\s*[:.\-]?/.test(rawText)) {
            score = 1;
          }
          return { line: l, text: rawText, cleaned: t, confidence: l.confidence ?? 0, score };
        })
        .filter((x: any) => x.score > 0)
        .sort((a: any, b: any) => b.score - a.score || b.confidence - a.confidence);
      const top = ranked[0];
      if (!top) continue;
      // We want the line content AFTER the "Số:" label, since the
      // orchestrator's field extractor strips it again anyway.
      const text = (top.cleaned ?? '').trim();
      if (!/^\d.*[\/]/.test(text)) continue;
      if (!best || top.confidence > best.confidence) {
        best = { text, confidence: top.confidence };
      }
    } catch (e) {
      if (process.env.OCR_DEBUG === '1') console.log(`[ensemble pass] error:`, e);
    }
  }
  if (process.env.OCR_DEBUG === '1') console.log(`[ensemble] best:`, best);
  return best?.text;
}

/* ─── Local Tesseract types (just what we actually use) ─────────────────── */

interface TesseractWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  block_id: number;
  para_id: number;
  line_id: number;
}

interface TesseractLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  block_id: number;
  para_id: number;
  words: TesseractWord[];
}

interface TesseractBlock {
  block_id: number;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  paragraphs: { lines: TesseractLine[] }[];
}

const DATE_WHITELIST =
  '0123456789/.-nNgGaAyYtTháàÁÀảẢãÃạẠăĂằẰẳẲẵẴặẶâÂầẦẩẨẫẪậẬêÊếẾềỀểỂễỄệỆ';

/**
 * Run a targeted OCR pass on the date region (Box 4) and return the
 * most plausible date-looking text. Uses PSM.SINGLE_LINE with a small
 * character whitelist so Tesseract treats the row as one line of
 * Vietnamese date text rather than free text.
 *
 * Output is consumed by extractDate as a *fallback* — when the
 * page-level OCR mis-read "12/03/2026" as "17/03/2025", the focused
 * crop often recovers the correct digits because the engine isn't
 * fighting the surrounding layout.
 *
 * Returns undefined on failure; callers should treat absence of a
 * result as "do nothing".
 */
export async function recognizeDateRegion(
  canvas: Canvas,
  page: PageOcr,
): Promise<string | undefined> {
  const region = locateRegionByCode(page, '4');
  if (!region || region.lines.length === 0) return undefined;
  const bbox = region.blocks[0]?.bbox ?? unionLines(region.lines);
  const padded: { x0: number; y0: number; x1: number; y1: number } = {
    x0: Math.max(0, bbox.x0 - 0.05),
    y0: Math.max(0, bbox.y0 - 0.05),
    x1: Math.min(1, bbox.x1 + 0.05),
    y1: Math.min(1, bbox.y1 + 0.05),
  };
  const cropped = normalizedCrop(canvas, padded);
  const buffer = cropped.toBuffer('image/png');
  const worker = await getSharedWorker();

  const passes: Partial<Tesseract.WorkerParams>[] = [
    { tessedit_pageseg_mode: PSM.AUTO as unknown as PSM },
    {
      tessedit_pageseg_mode: PSM.SINGLE_LINE as unknown as PSM,
      tessedit_char_whitelist: DATE_WHITELIST,
    },
  ];

  let best: { text: string; score: number } | undefined;
  for (const params of passes) {
    try {
      const data = await withParams(params, async () => {
        const r = await worker.recognize(buffer, {}, { blocks: true });
        return r.data;
      });
      const lines: string[] = ((data as any).blocks ?? [])
        .flatMap((b: any) => (b.paragraphs ?? []).flatMap((p: any) => p.lines ?? []))
        .map((l: any) => (l.text ?? '').trim())
        .filter(Boolean);
      if (lines.length === 0) continue;
      const ranked = lines
        .map((t) => {
          let score = 0;
          if (/\b(?:19|20)\d{2}\b/.test(t)) score += 5;
          if (/ng[àa]y/i.test(t)) score += 2;
          if (/th[áa]ng/i.test(t)) score += 2;
          if (/n[ăa]m/i.test(t)) score += 2;
          if (/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}/.test(t)) score += 4;
          if (t.length < 6) score -= 3;
          return { text: t, score };
        })
        .sort((a, b) => b.score - a.score);
      const top = ranked[0];
      if (!top || top.score <= 0) continue;
      if (!best || top.score > best.score) best = { text: top.text, score: top.score };
    } catch {
      // Ignore individual-pass failures; one of the two usually succeeds.
    }
  }
  return best?.text;
}

/**
 * Quick plausibility check for a date-like OCR result.
 */
export function hasPlausibleDate(text: string): boolean {
  if (!text) return false;
  const yearMatch = text.match(/\b((?:19|20)\d{2})\b/);
  if (!yearMatch) return false;
  const year = Number(yearMatch[1]);
  return year >= 1990 && year <= 2099;
}
