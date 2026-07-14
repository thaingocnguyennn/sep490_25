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
import { fromPath } from 'pdf2pic';

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
}

const TEMP_DIR = path.resolve(__dirname, '../../../../temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * pdf2pic shells out to GraphicsMagick (`gm`). On hosts where `gm`
 * isn't on PATH (very common on Windows — most installs ship
 * ImageMagick instead) every invocation silently EPIPEs. Probe once
 * at module load so the orchestrator can skip the fallback instead
 * of paying the EPIPE cost per failed page.
 */
const HAS_GM = (() => {
  try {
    const probe = spawnSync('gm', ['version'], { stdio: 'ignore' });
    return probe.status === 0;
  } catch {
    return false;
  }
})();

if (!HAS_GM) {
  // eslint-disable-next-line no-console
  console.warn(
    '[ocr] GraphicsMagick (gm) not found on PATH — pdf2pic fallback disabled. ' +
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

  return { canvas: ctx.canvas, width: ctx.canvas.width, height: ctx.canvas.height };
}

/**
 * Fallback renderer using pdf2pic (which wraps GraphicsMagick/Ghostscript).
 *
 * Used when pdf.js fails to render a page — e.g. corrupted streams,
 * unusual fonts, or rare PDF features.
 */
export async function renderPageWithPdf2Pic(
  pdfBuffer: Buffer,
  pageNum: number,
  scale: number,
): Promise<RenderedPage | null> {
  const tmpPath = path.join(
    TEMP_DIR,
    `ocr_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`,
  );
  const baseName = `ocr_page_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const guessedOutputPath = path.join(TEMP_DIR, `${baseName}.jpg`);
  let actualOutputPath: string | undefined;

  try {
    fs.writeFileSync(tmpPath, pdfBuffer);

    const converter = fromPath(tmpPath, {
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

    return { canvas, width: canvas.width, height: canvas.height };
  } catch (err) {
    console.error(`pdf2pic fallback failed for page ${pageNum}:`, err);
    return null;
  } finally {
    // Clean up *both* the guessed output path (for early-failure cases)
    // and the actual output path returned by pdf2pic (which may include
    // an index suffix like ".1.jpg" we didn't predict).
    for (const p of [tmpPath, guessedOutputPath, actualOutputPath]) {
      if (!p) continue;
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        /* ignore cleanup errors */
      }
    }
  }
}

/**
 * Render a single page using the primary renderer (pdf.js) with the
 * fallback renderer (pdf2pic) on failure.
 */
export async function renderPage(
  pdfDoc: pdfjsTypes.PDFDocumentProxy,
  pdfBuffer: Buffer,
  pageNum: number,
  scale: number,
): Promise<RenderedPage | null> {
  const result = await renderPageWithPdfJs(pdfDoc, pageNum, scale);
  if (result) return result;
  if (!HAS_GM) return null;
  return renderPageWithPdf2Pic(pdfBuffer, pageNum, scale);
}
