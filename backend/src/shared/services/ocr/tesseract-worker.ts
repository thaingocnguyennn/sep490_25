import path from 'node:path';
import Tesseract, { createWorker, Worker, OEM, PSM } from 'tesseract.js';
import { USER_PATTERNS, userPatternsFile } from './constants';
import { checkTessdata } from './tessdata-check';
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
 *
 * Closed-vocabulary prior (`user_patterns`):
 *   Tesseract's `user_patterns_file` is an *init-only* parameter; it
 *   must be wired in via the `config` object passed to `createWorker`.
 *   tesseract.js v7 does not expose a "pre-init FS write" hook, so
 *   the pattern file is written into the worker's in-memory FS via
 *   `worker.writeText()` AFTER `createWorker` resolves and BEFORE a
 *   `reinitialize()` call that re-runs `api.Init` with the new config.
 *   The previous attempt at this used the runtime-only `user_words`
 *   parameter via `setParameters`, which the LSTM accepts but the
 *   `tessdata` loader sometimes ignores after the dictionary is
 *   already formed. The pattern-file path is the documented way to
 *   influence the LSTM at recognition time.
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
    // langPath points tesseract.js at our local models instead of letting it
    // try to download from the default jsdelivr CDN.  The files must be
    // gzipped (.traineddata.gz) — tesseract.js v7's worker-script/index.js:151
    // always appends `.gz` to the langPath lookup.  Use the **tessdata/**
    // (fast LSTM) variants, NOT tessdata_best, because they are the only ones
    // ABI-compatible with tesseract.js-core@7.0.0: tessdata_best was compiled
    // against a newer Tesseract C++ engine that calls SSE-optimised routines
    // (e.g. _ZN9tesseract13DotProductSSEEPKfS1_i) which are absent from the
    // older WASM core and cause an emscripten abort at runtime.
    //
    // Before we attempt to boot a worker, run a startup check that
    // verifies (a) every requested language has a gzipped traineddata
    // file present at langPath, and (b) the embedded Tesseract
    // version is ABI-compatible with tesseract.js-core@7.x. Without
    // this, a wrong-pack upgrade used to fail at the first OCR call
    // with a cryptic emscripten abort — usually several minutes into
    // a multi-page document. The check throws early so the operator
    // sees the misconfiguration at boot time.
    const langPath = process.env.OCR_LANG_PATH
  ?? path.join(__dirname, '..', '..', '..', '..', 'tessdata');
    checkTessdata(langs, langPath, { throwOnError: true });

    // cachePath + cacheMethod redirect tesseract.js's disk cache away from
    // the project root.  Without this, every fresh worker load writes the
    // raw (uncompressed) `eng.traineddata` and `vie.traineddata` files into
    // cwd = backend/, which then collide with our gzipped versions and cause
    // confusion.  Cache them under node_modules/.cache instead.
    const cachePath = path.join(
      __dirname, '..', '..', '..', '..', 'node_modules', '.cache', 'tesseractjs',
    );

    // First boot: create the worker without the user-patterns config
    // (the file doesn't exist in the worker's in-memory FS yet, and
    // we can't write it before the worker exists). After creation we
    // write the patterns file and reinitialize with the `config`
    // argument that points at it.
    const w = await createWorker(langs, OEM.LSTM_ONLY, {
      langPath,
      cachePath,
      cacheMethod: 'write',
      logger: () => undefined,
    });
    await w.setParameters({ ...WORKER_PARAMS });

    // Inject the closed-vocabulary regex constraints as a Tesseract
    // `user_patterns_file`. The flow:
    //   1. Write the patterns content to the worker's in-memory FS.
    //   2. Reinitialize with `config = { user_patterns_file: '/<file>' }`,
    //      which makes tesseract.js write a config file referencing
    //      the patterns file and re-run `api.Init`.
    // The first init still runs (with no patterns), so the second
    // init essentially refreshes the LSTM with the prior. The cost
    // is paid once at boot; per-request cost is unchanged.
    if (USER_PATTERNS.length > 0) {
      try {
        await w.writeText('/vie.user-patterns', userPatternsFile().toString('utf8'));
        // The `config` argument to reinitialize() accepts arbitrary
        // key/value pairs (tesseract.js converts the object to a
        // Tesseract config file). The InitOptions type only models
        // the documented DAWG params, but `user_patterns_file` is
        // equally accepted — tesseract.js v7 forwards all keys into
        // the config file as-is.
        await w.reinitialize(
          langs,
          OEM.LSTM_ONLY,
          { user_patterns_file: '/vie.user-patterns' } as Partial<Tesseract.InitOptions>,
        );
      } catch (e) {
        // If patterns-file wiring fails (rare ABI mismatch), fall
        // back to the unconstrained worker. The default Vietnamese
        // LSTM still produces usable output; we just lose the
        // vocabulary boost. We log and continue so a misconfigured
        // init doesn't kill the whole OCR pipeline.
        // eslint-disable-next-line no-console
        console.warn(
          '[ocr] failed to install user_patterns_file; continuing without it:',
          e,
        );
      }
    }

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
 * Strategy: crop the canvas to the Box 3 region (plus a small
 * safety margin), then run Tesseract on the crop with 3 different
 * PSM modes. Per-line candidate scoring picks the line most likely
 * to be the Số: value (most '/' chars, leading digit, etc.).
 *
 * Speed: cropping to ~10% of the page area gives a roughly 5–10×
 * speedup on the LSTM pass because the LSTM only processes ~10% of
 * the pixels and PSM.SINGLE_LINE produces a stable result on a
 * single-line crop.
 *
 * Margin: the bbox is padded by 0.03 of the page on each side
 * (≈ 30 px at 1000-px width). Padding too much blows up the bbox
 * to include the entire Box 2 issuer block above, which then
 * contaminates the candidate pool; padding too little clips the
 * ascenders/descenders of the Số: label, which then forces Tesseract
 * to OCR a fragment and confuses the LSTM. 0.03 is the empirical
 * sweet spot from the Vietnamese golden set.
 */
export async function recognizeDocNumberRegion(
  canvas: Canvas,
  page: PageOcr,
): Promise<string | undefined> {
  const docRegion = locateRegionByCode(page, '3');
  if (!docRegion || docRegion.lines.length === 0) return undefined;
  // Union bbox of all lines in the Box 3 region. Box 3 sometimes
  // spans two visually-adjacent lines (Số: ... and "V/v ..."), so
  // we union them rather than picking just the first line.
  const bbox = docRegion.blocks[0]?.bbox ?? unionLines(docRegion.lines);
  // Pad by 0.03 of the page on every side. Clamp into [0, 1] so we
  // never crop outside the canvas.
  const padded: { x0: number; y0: number; x1: number; y1: number } = {
    x0: Math.max(0, bbox.x0 - 0.03),
    y0: Math.max(0, bbox.y0 - 0.03),
    x1: Math.min(1, bbox.x1 + 0.03),
    y1: Math.min(1, bbox.y1 + 0.03),
  };
  const cropped = normalizedCrop(canvas, padded);
  const buffer = cropped.toBuffer('image/png');
  const worker = await getSharedWorker();

  const passes: Partial<Tesseract.WorkerParams>[] = [
    { tessedit_pageseg_mode: PSM.AUTO as unknown as PSM },
    { tessedit_pageseg_mode: PSM.SINGLE_LINE as unknown as PSM },
    {
      tessedit_pageseg_mode: PSM.SINGLE_LINE as unknown as PSM,
      tessedit_char_whitelist: DOC_NUMBER_WHITELIST,
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
 * Closed vocabulary for the doc-number ensemble's most-targeted
 * PSM.SINGLE_LINE pass.
 *
 * Vietnamese administrative doc numbers have the shape
 * `<seq>/<year>/<code>` where `<code>` is a canonical organisational
 * token (e.g. UBND, HĐND, QĐ-BGDĐT, NĐ-CP, BC-UBND, CV-SGDĐT).
 * The character whitelist is the union of:
 *
 *   - the ASCII digits and the slash / dash / dot separators
 *     that appear in <seq>/<year>/<code>;
 *   - the Latin uppercase letters A–Z (English/Latin acronym root);
 *   - the 6 Vietnamese uppercase letters with diacritics that appear
 *     in canonical organisational tokens: Đ Ă Â Ê Ô Ơ Ư.
 *
 * Crucially we **do not** include the lowercase letters (a–z) or any
 * other Vietnamese diacritics — Tesseract's `tessedit_char_whitelist`
 * is hard-restrictive (a non-whitelisted glyph cannot appear in the
 * output), and a permissive whitelist reintroduces the original Latin-26
 * failure mode where "QĐ-UBND" was OCR'd as "QD-UBND" (losing the Đ)
 * because the LSTM fell back to its Latin-alphabet prior. The
 * restrictive whitelist here forces the LSTM to keep Vietnamese
 * uppercase diacritics at the cost of precluding lowercase variants
 * — the cost is acceptable because organisational tokens are
 * universally written in caps on Decree 30 documents.
 */
const DOC_NUMBER_WHITELIST = [
  '0123456789',
  '/.-',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'ĐĂÂÊÔƠƯ',
].join('');

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
      // Sanitize the top candidate down to just the date-shaped
      // substring. The Box 4 region on Vietnamese admin docs
      // routinely contains the merged "Số: X/Y/CODE … ngày A
      // tháng B năm C" header (Box 3 + Box 4 share a single OCR
      // line). PSM.SINGLE_LINE on the cropped region forces
      // Tesseract to read it as one line, and the plausibility
      // check above accepts the trailing year — without
      // sanitization the field would be the full merged string.
      const sanitized = sanitizeDateHint(top.text);
      if (!sanitized) continue;
      if (!best || top.score > best.score) best = { text: sanitized, score: top.score };
    } catch {
      // Ignore individual-pass failures; one of the two usually succeeds.
    }
  }
  return best?.text;
}

/**
 * Reduce a possibly-merged re-OCR output to its date substring.
 *
 * Accepts both the Vietnamese text form ("ngày X tháng Y năm Z")
 * and the numeric form ("DD/MM/YYYY"). Returns undefined if no
 * date-shaped substring is present, so the caller can fall through
 * to the full-text extraction rather than emit a half-clean
 * field value.
 */
function sanitizeDateHint(text: string): string | undefined {
  const dmyMatch = text.match(/ng[àa]y\s*([0-9A-Za-zÀ-ỹ]{1,3})\s*th[áa]ng\s*([0-9A-Za-zÀ-ỹ]{1,3})\s*n[ăa]m\s*((?:19|20|[LlIiO0-9])[0-9A-Za-zÀ-ỹ]{2,3})/i);
  if (dmyMatch) {
    const [, dayRaw, monthRaw, yearRaw] = dmyMatch;
// Apply the same lookalike mapping that the field extractor
      // uses for the digit/letter confusion cluster on date slots,
      // so "30 tháng B năm 202B" reduces to "30/6/2026" in one
      // place rather than waiting for the downstream extractor to
      // clean it. We intentionally limit this to the single-letter
      // / single-digit cluster observed on the Vietnamese golden
      // set (B↔6, S↔5, O↔0, A↔4, l↔1, I↔1); the full DIGIT_LOOKALIKE
      // table lives in field-extractor.ts and is not exported
      // because it's coupled to layout-aware parsing logic that
      // doesn't make sense at this layer.
      const LOOKALIKE_DIGIT: Record<string, string> = {
        B: '6', b: '6', S: '5', s: '5', O: '0', o: '0',
        A: '4', a: '4', I: '1', l: '1', i: '1', Y: '1',
      };
      const coerce = (s: string): string =>
        s.split('').map((ch) => LOOKALIKE_DIGIT[ch] ?? ch).join('');
    const day = coerce(dayRaw);
    const month = coerce(monthRaw);
    const year = coerce(yearRaw);
    if (/^\d{1,2}$/.test(day) && /^\d{1,2}$/.test(month) && /^\d{4}$/.test(year)) {
      const dn = Number(day);
      const mn = Number(month);
      if (dn >= 1 && dn <= 31 && mn >= 1 && mn <= 12) {
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      }
    }
  }
  const numeric = text.match(/(\d{1,2})[\/\-.]\s*(\d{1,2})[\/\-.]\s*((?:19|20)\d{2})/);
  if (numeric) {
    const [, d, m, y] = numeric;
    const dn = Number(d);
    const mn = Number(m);
    if (dn >= 1 && dn <= 31 && mn >= 1 && mn <= 12) {
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
  }
  return undefined;
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
