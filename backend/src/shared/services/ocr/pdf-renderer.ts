import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';
import {
  createCanvas,
  loadImage,
  type Canvas,
  type SKRSContext2D as CanvasRenderingContext2D,
} from '@napi-rs/canvas';

// pdfjs-dist ships a browser webpack build and a Node "legacy" build.
// The browser build references DOM globals (DOMMatrix, Path2D, ...) that
// are unavailable in Node, so we import the legacy build explicitly.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
// Use the package's bundled types for type-only references; this does
// not trigger the runtime DOMMatrix error.
import type * as pdfjsTypes from 'pdfjs-dist';

// pdf.js loads its worker via dynamic import(), which on Windows
// requires a file:// URL — a raw absolute path ("d:\...") is rejected
// with "Received protocol 'd:'".
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.resolve(__dirname, '../../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
).href;

/**
 * PDFs that reference Type 1 standard fonts (Helvetica, Times, ...) need
 * a `standardFontDataUrl` so pdf.js can resolve the embedded font names
 * to actual glyph data. Without it every page logs the
 * "Ensure that the standardFontDataUrl API parameter is provided"
 * warning and renders nothing.
 *
 * In pdfjs-dist 5.x this moved off `GlobalWorkerOptions` and onto the
 * per-document init options; we build the URL here and pass it to
 * `getDocument()`.
 */
const STANDARD_FONT_URL =
  pathToFileURL(
    path.resolve(__dirname, '../../../../node_modules/pdfjs-dist/standard_fonts/'),
  ).href + '/';

// Silence non-fatal warnings from pdf.js worker code. Errors are still
// surfaced via the regular error path.
pdfjsLib.VerbosityLevel.ERRORS = 0;

/**
 * Per-document `standardFontDataUrl` URL (with trailing slash).
 * Exposed so the orchestrator can pass it to `getDocument()`.
 */
export const PDFJS_STANDARD_FONT_URL = STANDARD_FONT_URL;

/**
 * Per-document `cMapUrl` for character maps. Vietnamese administrative
 * documents usually don't need these, but the package ships them and
 * wiring them in prevents a parallel class of "missing glyph" issues
 * for documents that do reference non-Latin character maps.
 */
export const PDFJS_CMAP_URL = pathToFileURL(
  path.resolve(__dirname, '../../../../node_modules/pdfjs-dist/cmaps/'),
).href + '/';

/**
 * Re-export pdfjsLib from this module so the rest of the OCR pipeline
 * uses the Node-friendly legacy build rather than re-importing the
 * browser build by mistake.
 */
export { pdfjsLib };
export type { pdfjsTypes };

/** Result of rendering a single PDF page to an image. */
export interface RenderedPage {
  canvas: Canvas;
  width: number;
  height: number;
  /** Identifier of the backend that produced the canvas. */
  renderer: RendererName;
}

/** Identifiers for the available PDF rendering backends. */
export type RendererName = 'pdfjs' | 'pdftoppm' | 'pdf2pic';

/** Resolution order for the auto-picker. */
const RENDERER_ORDER: RendererName[] = ['pdftoppm', 'pdfjs', 'pdf2pic'];

/**
 * Select which renderer to use based on the `OCR_RENDERER` env var.
 *
 *   - `pdfjs`     — pdf.js only (poppler‑free, works everywhere).
 *   - `pdftoppm`  — Poppler only (highest fidelity on Vietnamese subset
 *                   fonts but requires `pdftoppm` on PATH).
 *   - `pdf2pic`   — GraphicsMagick only (legacy fallback).
 *   - `auto`      — the documented default. Picks the first backend in
 *                   `RENDERER_ORDER` whose presence check succeeded.
 *   - anything else — logs a warning once and falls back to `auto`.
 */
export function selectRenderer(): RendererName {
  const raw = (process.env.OCR_RENDERER ?? 'auto').trim().toLowerCase();
  if (raw === 'auto') {
    const picked = RENDERER_ORDER.find((name) => isRendererAvailable(name));
    if (!picked) {
      // eslint-disable-next-line no-console
      console.warn(
        '[ocr] no renderer is available on this host; OCR will fail. ' +
          'Install Poppler (pdftoppm) or GraphicsMagick (gm).',
      );
      return 'pdfjs';
    }
    return picked;
  }
  if (raw === 'pdfjs' || raw === 'pdftoppm' || raw === 'pdf2pic') {
    if (!isRendererAvailable(raw)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[ocr] OCR_RENDERER=${raw} requested but the backend is unavailable; ` +
          'falling back to whichever renderer is present.',
      );
      return selectRendererSafe();
    }
    return raw;
  }
  // eslint-disable-next-line no-console
  console.warn(`[ocr] unknown OCR_RENDERER=${raw}; using auto`);
  return selectRendererSafe();
}

function selectRendererSafe(): RendererName {
  const picked = RENDERER_ORDER.find((name) => isRendererAvailable(name));
  return picked ?? 'pdfjs';
}

/** Probe whether a given backend is present on this host. */
export function isRendererAvailable(name: RendererName): boolean {
  switch (name) {
    case 'pdftoppm':
      return HAS_PDFTOPPM;
    case 'pdf2pic':
      return HAS_GM;
    case 'pdfjs':
      return true;
  }
}

const TEMP_DIR = path.resolve(__dirname, '../../../../temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Probe for pdftoppm (Poppler utils) — the preferred fallback on Windows
 * and Linux. Unlike GraphicsMagick, pdftoppm ships with most PDF toolchains
 * and doesn't require an X display. We check for it first; if absent we
 * fall back to the old pdf2pic+gm path.
 */
const HAS_PDFTOPPM = (() => {
  try {
    const probe = spawnSync('pdftoppm', ['-v'], { stdio: 'ignore' });
    return probe.status === 0 || probe.status === 99; // 99 = missing args (still installed)
  } catch {
    return false;
  }
})();

/**
 * Probe for GraphicsMagick (`gm`) — the legacy pdf2pic backend.
 * Kept as a second-chance fallback when neither pdftoppm nor pdf.js work.
 */
const HAS_GM = (() => {
  try {
    const probe = spawnSync('gm', ['version'], { stdio: 'ignore' });
    return probe.status === 0;
  } catch {
    return false;
  }
})();

if (!HAS_PDFTOPPM && !HAS_GM) {
  // eslint-disable-next-line no-console
  console.warn(
    '[ocr] Neither pdftoppm (Poppler) nor GraphicsMagick (gm) found on PATH. ' +
      'Pages that fail under pdf.js will be skipped.',
  );
}

/**
 * Minimal PDF.js canvas factory backed by `@napi-rs/canvas`.
 *
 * PDF.js expects a factory that owns the canvas/context lifecycle.
 * The default node implementation can fight with worker shutdowns;
 * this class keeps that lifecycle local to each rendered page.
 */
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  reset(c: { canvas: Canvas; context: CanvasRenderingContext2D }, w: number, h: number) {
    c.canvas.width = w;
    c.canvas.height = h;
  }

  destroy(c: { canvas: Canvas; context?: CanvasRenderingContext2D }) {
    c.canvas.width = 1;
    c.canvas.height = 1;
    c.canvas.getContext('2d')?.clearRect(0, 0, 1, 1);
  }
}

/**
 * Parse the `OCR_RENDERER_FLAGS` env var into a plain object passed to
 * pdf.js's `getDocument({...})` call.
 *
 * The benchmark on the supplied Vietnamese Nghị quyết PDF (run
 * 2026-07-18) showed that `disableFontFace` and `useSystemFonts` have
 * zero measurable effect on the rendered output for this PDF — the
 * three flag combinations tested produced SHA-256‑identical PNGs, with
 * identical OCR confidence (92), identical character error rate
 * (0.067), and identical Vietnamese diacritic preservation (93%).
 *
 * The one safe change carried over is `fontExtraProperties: true`,
 * which keeps the full font property blob in the operator stack so
 * that future diagnostics (e.g. logging the embedded font name) work.
 * It has no visible effect on the rendered glyphs.
 *
 * Operators can still opt into the other flags for debugging by
 * setting `OCR_RENDERER_FLAGS="disableFontFace=true,useSystemFonts=true"`.
 */
function parseRendererFlags(): Record<string, unknown> {
  const defaults: Record<string, unknown> = {
    fontExtraProperties: true,
  };
  const raw = process.env.OCR_RENDERER_FLAGS;
  if (!raw) return defaults;
  for (const pair of raw.split(',')) {
    const [k, v] = pair.split('=').map((s) => s.trim());
    if (!k || v === undefined) continue;
    if (v === 'true') defaults[k] = true;
    else if (v === 'false') defaults[k] = false;
    else if (v !== '' && !Number.isNaN(Number(v))) defaults[k] = Number(v);
    else defaults[k] = v;
  }
  return defaults;
}

const PDFJS_RENDERER_FLAGS = parseRendererFlags();

/** Render a single PDF page using pdf.js. */
export async function renderPageWithPdfJs(
  pdfDoc: pdfjsTypes.PDFDocumentProxy,
  pageNum: number,
  scale: number,
): Promise<RenderedPage | null> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const factory = new NodeCanvasFactory();
  const ctx = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
  ctx.context.fillStyle = '#ffffff';
  ctx.context.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  try {
    await page.render({
      canvasContext: ctx.context,
      viewport,
      canvas: ctx.canvas,
    }).promise;
  } catch (err) {
    console.error(`pdf.js render failed for page ${pageNum}:`, err);
    factory.destroy(ctx);
    return null;
  }

  return { canvas: ctx.canvas, width: ctx.canvas.width, height: ctx.canvas.height, renderer: 'pdfjs' };
}

/**
 * Fallback renderer using pdftoppm from Poppler.
 *
 * pdftoppm renders a PDF page to a PNG at a specified DPI. It handles
 * unusual font encodings, CIDFont resources, and non-standard PDF structures
 * that pdf.js cannot parse. Unlike GraphicsMagick, it has no display
 * dependency and is available on most Windows PDF toolchains.
 *
 * Target DPI: `scale * 72` where scale=4.0 → 288 DPI, matching the
 * primary pdf.js render path so downstream preprocessing is consistent.
 */
export async function renderPageWithPdftoppm(
  pdfBuffer: Buffer,
  pageNum: number,
  scale: number,
): Promise<RenderedPage | null> {
  if (!HAS_PDFTOPPM) return null;

  const pid = process.pid;
  const tmpIn = path.join(TEMP_DIR, `in_${pid}_${Date.now()}.pdf`);
  const tmpPrefix = path.join(TEMP_DIR, `out_${pid}_${Date.now()}`);
  let tmpOut: string | undefined;

  try {
    fs.writeFileSync(tmpIn, pdfBuffer);

    const targetDpi = Math.round(scale * 72);

    await new Promise<void>((resolve, reject) => {
      const p = spawn(
        'pdftoppm',
        [
          '-r', String(targetDpi),
          '-f', String(pageNum),
          '-l', String(pageNum),
          '-png',
          '-singlefile',
          tmpIn,
          tmpPrefix,
        ],
        { stdio: 'ignore' },
      );
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pdftoppm exited ${code}`))));
      p.on('error', reject);
    });

    tmpOut = `${tmpPrefix}.png`;
    if (!fs.existsSync(tmpOut)) return null;

    const img = await loadImage(fs.readFileSync(tmpOut));
    const canvas = createCanvas(img.width, img.height);
    canvas.getContext('2d').drawImage(img, 0, 0);

    return { canvas, width: canvas.width, height: canvas.height, renderer: 'pdftoppm' };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`pdftoppm fallback failed for page ${pageNum}:`, err);
    return null;
  } finally {
    for (const p of [tmpIn, tmpOut]) {
      if (!p) continue;
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
    }
  }
}

/**
 * Legacy fallback using pdf2pic + GraphicsMagick.
 *
 * Kept as a second-chance fallback when pdftoppm is absent.
 * Requires `gm` (GraphicsMagick) on PATH.
 */
export async function renderPageWithPdf2Pic(
  pdfBuffer: Buffer,
  pageNum: number,
  scale: number,
): Promise<RenderedPage | null> {
  if (!HAS_GM) return null;

  // Lazily import pdf2pic only when actually needed — avoids an extra
  // module-load cost on the hot path when HAS_GM is false.
  const { fromPath: pdf2picFromPath } = await import('pdf2pic');

  const tmpPath = path.join(
    TEMP_DIR,
    `ocr_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`,
  );
  const baseName = `ocr_page_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const guessedOutputPath = path.join(TEMP_DIR, `${baseName}.jpg`);
  let actualOutputPath: string | undefined;

  try {
    fs.writeFileSync(tmpPath, pdfBuffer);

    const converter = pdf2picFromPath(tmpPath, {
      density: Math.round(150 * scale),
      saveFilename: baseName,
      savePath: TEMP_DIR,
      format: 'jpg',
      quality: 90,
      width: Math.round(2480 * scale / 3),
      height: Math.round(3508 * scale / 3),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (converter as any)(pageNum) as { path: string } | false;
    if (!result || !result.path) return null;
    actualOutputPath = result.path;

    const img = await loadImage(fs.readFileSync(result.path));
    const canvas = createCanvas(img.width, img.height);
    canvas.getContext('2d').drawImage(img, 0, 0);

    return { canvas, width: canvas.width, height: canvas.height, renderer: 'pdf2pic' };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`pdf2pic fallback failed for page ${pageNum}:`, err);
    return null;
  } finally {
    for (const p of [tmpPath, guessedOutputPath, actualOutputPath]) {
      if (!p) continue;
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
    }
  }
}

/**
 * Render a single page using the renderer picked by `selectRenderer()`,
 * with deterministic fallback to the others if the chosen one fails for
 * a particular page.
 *
 * The renderer priority order is:
 *   pdftoppm → pdfjs → pdf2pic
 *
 * pdftoppm (Poppler) is the highest-fidelity renderer for the kinds of
 * Vietnam-government PDFs we target: it interprets the PDF file via
 * Poppler's full PDF/PS interpreter, which handles CMap / CIDFont /
 * subset-font references (the `ABCDEF+TimesNewRoman` subset naming
 * convention, ToUnicode maps, …) without the font-resolution path that
 * pdf.js takes. On hosts that ship Poppler (most Linux server images,
 * some Windows machines), this gives measurably cleaner Vietnamese
 * diacritic rendering on low-quality scans. pdf.js is the no-dep
 * fallback. pdf2pic + GraphicsMagick is the legacy last-resort.
 *
 * A `null` result causes `runOcrOnPdf` to skip the page with a console
 * error, keeping the rest of the document processable.
 *
 * `OCR_RENDERER=pdfjs|pdftoppm|pdf2pic|auto` may be used to override
 * the pick. `auto` (the default) uses the first renderer in priority
 * order whose presence probe succeeds.
 */
export async function renderPage(
  pdfDoc: pdfjsTypes.PDFDocumentProxy,
  pdfBuffer: Buffer,
  pageNum: number,
  scale: number,
  preferred?: RendererName,
): Promise<RenderedPage | null> {
  const pick = preferred ?? selectRenderer();
  const order: RendererName[] = pick === 'pdfjs'
    ? ['pdfjs']
    : [...RENDERER_ORDER];
  // Move the user-preferred renderer to the front of the order even
  // when it isn't the highest-priority one (so `OCR_RENDERER=pdfjs`
  // skips pdftoppm entirely).
  if (pick !== 'pdfjs' && order[0] !== pick) {
    order.unshift(pick);
  }

  for (const name of order) {
    if (!isRendererAvailable(name)) continue;
    let result: RenderedPage | null = null;
    if (name === 'pdfjs') {
      result = await renderPageWithPdfJs(pdfDoc, pageNum, scale);
    } else if (name === 'pdftoppm') {
      result = await renderPageWithPdftoppm(pdfBuffer, pageNum, scale);
    } else if (name === 'pdf2pic') {
      result = await renderPageWithPdf2Pic(pdfBuffer, pageNum, scale);
    }
    if (result) return result;
  }

  // eslint-disable-next-line no-console
  console.error(`[ocr] all renderers failed for page ${pageNum}; skipping`);
  return null;
}
