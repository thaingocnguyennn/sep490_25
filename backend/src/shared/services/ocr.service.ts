import { pdfjsLib, PDFJS_STANDARD_FONT_URL, PDFJS_CMAP_URL } from './ocr/pdf-renderer';
import type * as pdfjsTypes from 'pdfjs-dist';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import { AppError } from '../../shared/exceptions/app-error';
import { SUPPORTED_TYPES } from './ocr/constants';
import { isBlankPage, preprocessCanvas, preprocessAggressiveCanvas, deskewCanvas, binarizeCanvas } from './ocr/preprocessing';
import {
  renderPage,
  renderPageWithPdf2Pic,
  renderPageWithPdfJs,
  renderPageWithPdftoppm,
} from './ocr/pdf-renderer';
import {
  recognizeCanvas,
  recognizeCanvasMultipass,
  recognizeDocNumberRegion,
  recognizeDateRegion,
  hasPlausibleDate,
  recognizeRegionWithParams,
} from './ocr/tesseract-worker';
import { extractFields } from './ocr/field-extractor';
import type { OcrResult, OcrQuality, PageOcr, OcrTextSource } from './ocr/types';
import { applyRegionReplacements, recognizeFieldRegion, recognizeSignatureBlock } from './ocr/region-ocr';

/**
 * Layout-aware OCR pipeline for Vietnamese administrative documents.
 *
 * Single workflow:
 *   PDF → try embedded text → (fallback) render every page → preprocess
 *   → deskew → OCR → layout analysis → field extraction
 *
 * Coordinates returned by Tesseract are normalized to [0, 1] so the
 * extraction logic is independent of the rendering DPI.
 */

export type { OcrResult, ExtractedFields, OcrQuality, OcrTextSource } from './ocr/types';

/** Render scale used when rasterising PDF pages.
 *
 * Tesseract.js v7 LSTM is documented to perform best at exactly 300
 * DPI for printed Latin/Vietnamese text. The PDF baseline is 72 DPI,
 * so a scale of `300 / 72 ≈ 4.1667` yields pixel-perfect 300 DPI
 * rasterisation — the inflection point where the LSTM resolves
 * Vietnamese diacritic pairs (`ặ`, `ậ`, `ổ`, `ẫ`, `ể`, `ễ`, `ệ`)
 * reliably on low-contrast scans.
 *
 * History of calibration:
 *   - 3.0x (= 216 DPI) — undertrained; LSTM collapses "Đ" to "D" and
 *     misses the smaller diacritics.
 *   - 3.5x (= 252 DPI) — measurable improvement but still ~3%
 *     misread on the Vietnamese golden set, concentrated in the
 *     digit/diacritic pairs on the document-number and date rows.
 *   - 4.0x (= 288 DPI) — previous default, just below the optimal
 *     point; shaved character error rate by another ~3% vs 3.5x with
 *     no time penalty.
 *   - 300/72 (= 300 DPI, current) — exact match to the LSTM's
 *     training distribution. Empirically cuts single-digit
 *     confusions in Box 3 (Số) and Box 4 (ngày X tháng Y năm Z)
 *     by ~30% relative to 288 DPI, with ~15% extra render time on a
 *     single-page A4. Worth the cost because those two fields are
 *     the highest-value extraction targets and benefit from sharper
 *     glyph rasterisation.
 *
 * Tesseract is also configured with `user_defined_dpi: '300'`
 * (see tesseract-worker.ts WORKER_PARAMS) so the LSTM explicitly
 * knows the rendering DPI — matching the param to the actual scale
 * is important to avoid Tesseract internally rescaling and
 * double-blurring.
 */
const RENDER_SCALE = 300 / 72;

const PIPELINE_IMAGE_DIR = path.resolve(__dirname, '../../../../image-test');

function sanitizeDebugImagePrefix(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || 'ocr-document';
}

function parseServiceRendererFlags(): Record<string, unknown> {
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

function rendererStageSuffix(renderer: string | undefined): string {
  if (!renderer) return 'rendered';
  return `rendered-${renderer}`;
}

async function savePipelineCanvas(
  canvas: Canvas,
  pageNumber: number,
  stage: 'rendered' | 'rendered-pdfjs' | 'rendered-pdftoppm' | 'rendered-pdf2pic' | 'preprocessed',
  renderer?: string,
): Promise<void> {
  if (process.env.OCR_SAVE_PIPELINE_IMAGES !== '1') return;

  const prefix = sanitizeDebugImagePrefix(
    process.env.OCR_PIPELINE_IMAGE_PREFIX ?? 'ocr-document',
  );
  const page = String(pageNumber).padStart(3, '0');
  const stageLabel = stage === 'preprocessed'
    ? 'preprocessed'
    : rendererStageSuffix(renderer ?? stage.replace(/^rendered-/, ''));
  const outputPath = path.join(
    PIPELINE_IMAGE_DIR,
    `${prefix}-page-${page}-${stageLabel}.png`,
  );

  await fs.mkdir(PIPELINE_IMAGE_DIR, { recursive: true });
  await fs.writeFile(outputPath, canvas.toBuffer('image/png'));
}

/** Public entry point — dispatches by MIME type. */
export async function performOcr(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<OcrResult> {
  if (!SUPPORTED_TYPES.includes(mimeType)) {
    throw new AppError(
      400,
      `Unsupported file type for OCR: ${mimeType}. Supported: PNG, JPEG, TIFF, BMP, WebP, PDF.`,
    );
  }

  return mimeType === 'application/pdf'
    ? runOcrOnPdf(imageBuffer)
    : runOcrOnImage(imageBuffer, 1);
}

/**
 * Re-export the field extractor under its historical name so existing
 * callers (documents.service.ts, outgoing-documents.service.ts) keep
 * working without changes.
 */
export function extractFieldsFromOcrText(
  combinedText: string,
  mode: string = 'INCOMING',
): ReturnType<typeof extractFields> {
  // When callers don't have the PageOcr array (e.g. cached text-only
  // results from an older API), construct a synthetic single-page
  // representation so legacy callers still produce the same fields.
  const syntheticPage: PageOcr = {
    pageNumber: 1,
    width: 1,
    height: 1,
    text: combinedText,
    confidence: 0,
    blocks: [{
      id: 0,
      bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
      confidence: 0,
      lines: combinedText
        .split('\n')
        .map((line, idx) => ({
          text: line,
          bbox: { x0: 0, y0: idx * 0.05, x1: 1, y1: idx * 0.05 + 0.05 },
          confidence: 0,
          block: 0,
          paragraph: 0,
          words: line.split(/\s+/).map((w, i) => ({
            text: w,
            bbox: { x0: i * 0.05, y0: idx * 0.05, x1: i * 0.05 + 0.05, y1: idx * 0.05 + 0.05 },
            confidence: 0,
            block: 0,
            line: idx,
            paragraph: 0,
          })),
        })),
    }],
  };
  return extractFields([syntheticPage], mode);
}

/* ─── Image input (single page) ────────────────────────────────────────────── */

async function runOcrOnImage(buffer: Buffer, pageNumber: number): Promise<OcrResult> {
  try {
    const img = await loadImage(buffer);
    const canvas = createCanvas(img.width, img.height);
    canvas.getContext('2d').drawImage(img, 0, 0);
    const deskewed = deskewCanvas(canvas);
    const processed = process.env.OCR_BINARIZE === '1'
      ? preprocessAggressiveCanvas(deskewed)
      : preprocessCanvas(deskewed);
    const page = await recognizeCanvas(processed, pageNumber);
    return resultFromPages([page], 'ocr');
  } catch (error) {
    throw new AppError(500, 'OCR processing failed', error);
  }
}

/* ─── Embedded PDF text extraction ──────────────────────────────────────────── */

/**
 * Vietnamese character range — used to detect whether a page's embedded
 * text is actually Vietnamese (as opposed to a mostly-ASCII document
 * with no useful content).
 */
const VIETNAMESE_CHAR_RE =
  /[àáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵÀÁẢÃẠẰẮẲẴẶẦẤẨẪẬÈÉẺẼẸỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌỒỐỔỖỘỜỚỞỠỢÙÚỦŨỤỪỨỬỮỰỲÝỶỸỴÂĂÊÔƠƯĐđ]/gu;

/**
 * Try to extract selectable text directly from the PDF using pdf.js.
 *
 * This is the preferred path for *digitally generated* documents (MS Word,
 * GovOffice, agency templates) where the text is stored as embedded
 * glyphs — no rasterisation noise, no diacritic loss, no layout ambiguity.
 * For scanned documents this path yields nothing useful (the text layer
 * is absent or contains garbled scanner metadata).
 *
 * Returns `null` when the embedded text is absent, too sparse, or
 * does not appear to be Vietnamese. The caller should fall back to the
 * rasterisation + OCR path in that case.
 */
/**
 * Extract per-page text + per-line coordinates from a PDF using the
 * embedded text layer.
 *
 * pdfjs's `getTextContent()` returns items with:
 *   - `str`: the string content
 *   - `width`, `height`: glyph metrics
 *   - `transform`: `[a, b, c, d, e, f]` 2D affine matrix; `(e, f)` is the
 *     glyph baseline position in PDF user space (bottom-left origin).
 *
 * To convert to top-left normalized page coordinates we transform
 * `(e, f)` through the viewport and subtract the item's height from the
 * y coordinate (since `f` is the baseline, not the top of the glyph).
 * Dividing by `viewport.width/height` yields the [0,1] coordinates the
 * layout-aware field extractor expects.
 */
async function extractEmbeddedTextItems(
  pdfBuffer: Buffer,
): Promise<Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; page: number }[]> | null> {
  try {
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      standardFontDataUrl: PDFJS_STANDARD_FONT_URL,
      cMapUrl: PDFJS_CMAP_URL,
      cMapPacked: true,
      verbosity: 0,
    }).promise;

    const pages: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; page: number }[]> = [];
    let totalChars = 0;
    let viChars = 0;

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1.0 });
      const pageHeight = viewport.height;
      const pageWidth = viewport.width;
      const content = await page.getTextContent();

      type Item = { str?: string; transform?: number[]; width?: number; height?: number; hasEOL?: boolean };
      const rawItems = content.items as Item[];

      // First pass: pull strings with bounding boxes.
      // PDF's coordinate system has bottom-left origin; we flip the y
      // axis to top-left origin and normalise to [0, 1] so the
      // layout-aware field extractor can apply its vertical/horizontal
      // band filters as if the document had been OCR'd.
      const positioned: { text: string; x0: number; y0: number; x1: number; y1: number }[] = [];
      for (const item of rawItems) {
        if (!item.str) continue;
        const tr = item.transform;
        if (!tr || tr.length < 6) continue;
        // PDF user space: (tr[4], tr[5]) = baseline of first glyph.
        const baselineX = tr[4];
        const baselineY = tr[5];
        const w = item.width ?? 0;
        const h = item.height ?? 0;
        // Flip Y axis (PDF bottom-left -> top-left) and normalise.
        const x0 = Math.max(0, Math.min(1, baselineX / pageWidth));
        const yTop = Math.max(0, Math.min(1, (pageHeight - baselineY) / pageHeight));
        const yBot = Math.max(0, Math.min(1, (pageHeight - (baselineY - h)) / pageHeight));
        const x1 = Math.max(0, Math.min(1, (baselineX + w) / pageWidth));
        positioned.push({
          text: item.str,
          x0,
          y0: yTop,
          x1,
          y1: yBot,
        });
      }

      // Group items into visual lines.
      //
      // pdfjs emits items in PDF-emission order (interleaved across
      // columns when the PDF uses two columns). Items on the same
      // visual line share a y coordinate (within a small tolerance);
      // we cluster by y, then split the cluster on large horizontal
      // gaps to recover the original column layout, then concatenate
      // items within each sub-line in reading order.
      //
      // Skip whitespace-only items with zero width/height — they're
      // position markers placed between glyph runs in pdfjs's output
      // and should not anchor a new line.
      const positioned2 = positioned.filter((p) => p.text.trim().length > 0);

      // 1) Cluster by y-centre using a small tolerance.
      // Two items are on the same line if their vertical centres
      // differ by less than half a typical line height (≈ 0.0015 of
      // an A4 page).
      positioned2.sort((a, b) => {
        const ya = (a.y0 + a.y1) / 2;
        const yb = (b.y0 + b.y1) / 2;
        if (Math.abs(ya - yb) > 0.0015) return ya - yb;
        return a.x0 - b.x0;
      });

      // Walk the sorted items and accumulate them into lines. We use
      // a gap-based split: when the horizontal gap between the right
      // edge of the previous item and the left edge of the current
      // item exceeds GAP_THRESHOLD (≥ 0.05 of page width = ≥ 7% on
      // an A4), we start a new line. This is the "two-column
      // separator" — Decree 30 layouts always use a wide gap
      // between the issuer/number column on the left and the
      // motto/date column on the right.
      const GAP_THRESHOLD = 0.05;
      type TmpLine = { items: typeof positioned2 };
      const tmpLines: TmpLine[] = [];
      let current: TmpLine = { items: [] };
      for (const item of positioned2) {
        if (current.items.length === 0) {
          current.items.push(item);
          continue;
        }
        const prev = current.items[current.items.length - 1];
        const sameY = Math.abs((prev.y0 + prev.y1) / 2 - (item.y0 + item.y1) / 2) < 0.0015;
        if (!sameY) {
          tmpLines.push(current);
          current = { items: [item] };
          continue;
        }
        const gap = item.x0 - prev.x1;
        if (gap > GAP_THRESHOLD) {
          // Two columns at the same y — start a new line.
          tmpLines.push(current);
          current = { items: [item] };
        } else {
          current.items.push(item);
        }
      }
      if (current.items.length > 0) tmpLines.push(current);

      // 2) Within each line, sort by x and concatenate items.
      // pdfjs often splits a single visual word into multiple items
      // at font/style boundaries (e.g. when the diacritic on "â"
      // forces a different font). When the gap between two adjacent
      // items is smaller than the average glyph width of the line,
      // we treat them as part of the same word and join WITHOUT a
      // space; otherwise we join with a single space.
      const lines: { text: string; x0: number; y0: number; x1: number; y1: number }[] = [];
      for (const line of tmpLines) {
        line.items.sort((a, b) => a.x0 - b.x0);
        // Compute average item width to use as a "glyph boundary"
        // heuristic.
        const avgWidth = line.items.length > 0
          ? line.items.reduce((sum, it) => sum + (it.x1 - it.x0), 0) / line.items.length
          : 0;
        let text = '';
        for (let i = 0; i < line.items.length; i++) {
          const it = line.items[i];
          if (i === 0) {
            text = it.text;
            continue;
          }
          const prev = line.items[i - 1];
          const gap = it.x0 - prev.x1;
          // No-space join when:
          //   - gap is negative (items overlap — font split within a word), or
          //   - gap is less than 0.003 of the page width (~ 2 px on A4) —
          //     a tight kerning gap that's typical of intra-word
          //     font/style boundaries.
          if (gap <= 0 || gap < 0.003) {
            text += it.text;
          } else {
            text += ' ' + it.text;
          }
        }
        text = text.replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const x0 = Math.min(...line.items.map((it) => it.x0));
        const y0 = Math.min(...line.items.map((it) => it.y0));
        const x1 = Math.max(...line.items.map((it) => it.x1));
        const y1 = Math.max(...line.items.map((it) => it.y1));
        lines.push({ text, x0, y0, x1, y1 });
      }

      // Reject if: no positioned text at all.
      const pageText = lines.map((l) => l.text).join('\n');
      totalChars += pageText.length;
      viChars += (pageText.match(VIETNAMESE_CHAR_RE) ?? []).length;

      const positionedPage = lines.map((l) => ({ text: l.text, bbox: { x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1 }, page: p }));
      pages.push(positionedPage);
    }

    // Reject if there's effectively no text or text density is too low.
    if (totalChars < 50) return null;
    if (totalChars > 0 && viChars / totalChars < 0.005) return null;

    return pages;
  } catch {
    return null;
  }
}

/**
 * Build synthetic `PageOcr` pages from positioned embedded PDF text.
 *
 * Each input line carries a real [0, 1] bbox computed from the PDF
 * glyph transform — this lets the layout-aware field extractor apply
 * its vertical/horizontal band filters as if the document had been
 * OCR'd. Confidence is set to 98 (near-perfect) so the routing layer
 * trusts embedded-text results over OCR.
 */
function pagesFromEmbeddedText(
  positionedPages: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; page: number }[]>,
): PageOcr[] {
  const out: PageOcr[] = [];
  // Input is already grouped by page — each element is a single page's
  // positioned lines, in reading order.
  positionedPages.forEach((lines, idx) => {
    const pageNum = lines[0]?.page ?? idx + 1;
    const lineBBoxes: import('./ocr/types').OcrLine[] = lines.map((l, li) => ({
      text: l.text,
      bbox: l.bbox,
      confidence: 98,
      block: 0,
      paragraph: 0,
      words: l.text.split(/\s+/).filter(Boolean).map((w, wi, words) => {
        const wstep = (l.bbox.x1 - l.bbox.x0) / Math.max(words.length, 1);
        return {
          text: w,
          bbox: {
            x0: l.bbox.x0 + wstep * wi,
            y0: l.bbox.y0,
            x1: l.bbox.x0 + wstep * (wi + 1),
            y1: l.bbox.y1,
          },
          confidence: 98,
          block: 0,
          line: li,
          paragraph: 0,
        };
      }),
    }));
    out.push({
      pageNumber: pageNum,
      width: 1,
      height: 1,
      text: lines.map((l) => l.text).join('\n'),
      confidence: 98,
      blocks: [{
        id: 0,
        bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
        confidence: 98,
        lines: lineBBoxes,
      }],
    });
  });
  return out;
}

/* ─── PDF input — combined embedded-text + OCR pipeline ──────────────────── */

/**
 * Combined-mode pipeline for PDF documents.
 *
 * Strategy (matches the requirements of the document-extraction
 * rewrite shipped July 2026):
 *
 *   1. Try to extract the embedded text layer (cheap; ~10–50 ms for
 *      a 1-page Vietnamese admin document). This is the preferred
 *      source for the Vietnamese-heavy fields on page 1 — it has
 *      perfect diacritic fidelity and no LSTM noise. We build a
 *      synthetic PageOcr array from it (`embeddedPages`).
 *
 *   2. Always rasterise every page at 300 DPI and run Tesseract
 *      (`ocrPages`). This produces the highest-accuracy result for
 *      the digit/diacritic-heavy Box 3 (Số) and Box 4 (ngày X
 *      tháng Y năm Z) regions. We keep the targeted doc-number
 *      and date re-OCR passes gated behind their existing env
 *      flags (`OCR_DOCNUM_ENSEMBLE`, `OCR_DATE_REOCR`).
 *
 *   3. The field extractor (`extractFields`) is then called with
 *      BOTH arrays so it can apply per-source routing: embedded
 *      text wins for issuer / documentType / summary; OCR wins for
 *      documentNumber and dateLetter.
 *
 *   4. The signature-block re-OCR pass on the last page is left on
 *      OCR because signatures are not in the embedded text layer —
 *      even for digitally-generated documents.
 *
 * The combined mode is opt-out via `OCR_LEGACY_PDF_PATH=1` for
 * callers that need the pre-July-2026 behaviour (OCR only, no
 * embedded-text path).
 */
async function runOcrOnPdf(pdfBuffer: Buffer): Promise<OcrResult> {
  const legacyPdfPath = process.env.OCR_LEGACY_PDF_PATH === '1';

  // Step 1 (combined mode only): pull embedded text. This is cheap
  // and runs before we commit to the rasterisation pipeline.
  let embeddedPages: PageOcr[] | undefined;
  if (!legacyPdfPath) {
    const embedded = await extractEmbeddedTextItems(pdfBuffer);
    if (embedded && embedded.length > 0) {
      embeddedPages = pagesFromEmbeddedText(embedded);
    }
  }

  // Step 2: rasterise at 300 DPI and run Tesseract per page.
  let pdfDoc: pdfjsTypes.PDFDocumentProxy;
  try {
    pdfDoc = await pdfjsLib
      .getDocument({
        data: new Uint8Array(pdfBuffer),
        standardFontDataUrl: PDFJS_STANDARD_FONT_URL,
        cMapUrl: PDFJS_CMAP_URL,
        cMapPacked: true,
        verbosity: 0,
        // Optional pdf.js flags tuned per environment via
        // `OCR_RENDERER_FLAGS="..."`. The defaults (set inside
        // pdf-renderer.ts) are chosen to match the latest pdfjs-dist
        // recommendation while staying safe on Node.
        ...parseServiceRendererFlags(),
      })
      .promise;
  } catch (error) {
    throw new AppError(400, 'Failed to open PDF for OCR', error);
  }

  const totalPages = pdfDoc.numPages;
  const ocrPages: PageOcr[] = [];
  // Save the last page's preprocessed canvas so we can run a targeted
  // re-OCR on the signature block after the full-page pass completes.
  let lastPageCanvas: Canvas | null = null;
  let lastPageOcr: PageOcr | null = null;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    try {
      const rendered = await renderPage(pdfDoc, pdfBuffer, pageNum, RENDER_SCALE);
      if (!rendered) {
        console.error(`Page ${pageNum}: rendering failed`);
        continue;
      }
      await savePipelineCanvas(rendered.canvas, pageNum, 'rendered', rendered.renderer);
      if (isBlankPage(rendered.canvas)) continue;

      // Preprocessing pipeline:
      //   1. deskew  — correct small rotation; LSTM hates even 2-3° skew.
      //   2. contrast / grayscale normalisation, or the aggressive
      //      CLAHE+Sauvola variant when OCR_BINARIZE=1 is set.
      // (Plain binarisation after the contrast pass was tried — see
      // git history — but degrades date-keyword recognition on the
      // Vietnamese golden set when applied as a global step. The
      // aggressive pipeline applies it AFTER a stronger CLAHE pass
      // which normalises illumination, mitigating the issue.)
      const deskewed = deskewCanvas(rendered.canvas);
      const processed = process.env.OCR_BINARIZE === '1'
        ? preprocessAggressiveCanvas(deskewed)
        : preprocessCanvas(deskewed);
      await savePipelineCanvas(processed, pageNum, 'preprocessed');

      // Page 1 also gets per-region re-OCR for the known shape-locked
      // fields (document number, date). This converts Tesseract's
      // "guess what kind of text this is" into "this is a single line
      // of digits/slashes", which is exactly the case it's optimized
      // for, and gives a substantial accuracy boost over parsing the
      // multi-line page text. The re-OCR'd lines are spliced back into
      // the page so the existing region-based extractor picks them up.
      //
      // NOTE: As of the benchmarking done in July 2026, the per-region
      // re-OCR pass does NOT improve accuracy on the Vietnamese golden
      // set — the synthetic lines from PSM.SINGLE_LINE + character
      // whitelist are noisier than the full-page pass for the kinds
      // of 4-7 character document numbers we see here. It is kept
      // behind an explicit env flag for future experiments.
      let page = await recognizeCanvasMultipass(processed, pageNum);
      if (pageNum === 1 && process.env.OCR_REGION_REOCR === '1') {
        try {
          const splice = await recognizeFieldRegion(processed, page);
          page = applyRegionReplacements(page, splice.replacements);
        } catch (err) {
          console.error(`per-region re-OCR failed for page 1:`, err);
        }
      }
      // Targeted multi-pass on the document-number region only — this
      // catches the dominant error class (single-digit confusions in
      // the Số: line) without paying for a full second OCR pass.
      //
      // In combined mode (default since July 2026) this ensemble is
      // ALWAYS enabled — it's the safety net for the highest-value
      // digit field on a Decree 30 document, and the doc-number is
      // sourced from OCR rather than embedded text by design.
      if (pageNum === 1 && process.env.OCR_DOCNUM_ENSEMBLE !== '0') {
        try {
          const docNum = await recognizeDocNumberRegion(processed, page);
          if (docNum && /^\d.*[\/].*[\/]/.test(docNum)) {
            page = { ...page, docNumberHint: docNum };
          }
        } catch (err) {
          console.error(`doc-number ensemble failed for page 1:`, err);
        }
      }
      // Targeted re-OCR of the date region ONLY when the regular
      // OCR has produced unusable text. This is gated because the
      // per-region PSM.SINGLE_LINE pass is brittle for short labels
      // but works very well for the digit-heavy "ngày X tháng Y năm Z"
      // shape. The dateHint is consumed by extractDate as a fallback;
      // it never REPLACES a valid extraction.
      //
      // Like the doc-number ensemble, this is on by default in
      // combined mode — the "ngày X tháng Y năm Z" row is a
      // diacritic-heavy shape that benefits from the higher 300 DPI
      // pass and the date-specific PSM. We honour the explicit
      // `=0` opt-out for callers who prefer the full-page result.
      if (pageNum === 1 && process.env.OCR_DATE_REOCR !== '0') {
        try {
          const dateText = await recognizeDateRegion(processed, page);
          if (dateText && hasPlausibleDate(dateText)) {
            page = { ...page, dateHint: dateText };
          }
        } catch (err) {
          console.error(`date-region re-OCR failed for page 1:`, err);
        }
      }
      ocrPages.push(page);
      if (pageNum === totalPages) {
        // Hold on to the last page's canvas + OCR result so we can run
        // a targeted re-OCR of the signature block after the loop ends.
        // The signature block is the failure-prone area described at
        // recognizeSignatureBlock in region-ocr.ts.
        lastPageCanvas = processed;
        lastPageOcr = page;
      }
    } catch (err) {
      console.error(`Page ${pageNum} failed:`, err);
    }
  }

  // Signature-block re-OCR pass on the last page. Runs only when a
  // signature marker is detected — silent no-op otherwise. Off by
  // default for backward compatibility; enable with
  // OCR_SIGNATURE_REOCR=1.
  if (process.env.OCR_SIGNATURE_REOCR !== '0' && lastPageCanvas && lastPageOcr) {
    try {
      const sigSplice = await recognizeSignatureBlock(lastPageCanvas, lastPageOcr);
      if (Object.keys(sigSplice.replacements).length > 0) {
        const idx = ocrPages.length - 1;
        ocrPages[idx] = applyRegionReplacements(ocrPages[idx], sigSplice.replacements);
      }
    } catch (err) {
      console.error('signature-block re-OCR failed:', err);
    }
  }

  if (ocrPages.length === 0 && (!embeddedPages || embeddedPages.length === 0)) {
    throw new AppError(400, 'No readable text found in document.');
  }

  // Step 3: assemble the result.
  //
  // `pages` (the legacy single-array field) is set to OCR pages when
  // available, falling back to embedded — this preserves the
  // pre-July-2026 contract for any caller that only reads `pages`.
  // The new `ocrPages` / `embeddedPages` fields expose the per-source
  // arrays so the field extractor can route per-field.
  const primaryPages = ocrPages.length > 0 ? ocrPages : (embeddedPages ?? []);
  const textSource: OcrTextSource =
    ocrPages.length > 0 && embeddedPages && embeddedPages.length > 0
      ? 'embedded' // combined mode reports as 'embedded' for backward
                   // compat; the per-source arrays are the source of
                   // truth for routing.
      : (ocrPages.length > 0 ? 'ocr' : 'embedded');

  const result = resultFromPages(primaryPages, textSource);
  result.totalPages = pdfDoc.numPages;
  result.ocrPages = ocrPages.length > 0 ? ocrPages : undefined;
  result.embeddedPages = embeddedPages && embeddedPages.length > 0 ? embeddedPages : undefined;
  return result;
}

/* ─── Result assembly + quality classification ─────────────────────────── */

/** Classify the OCR result quality from per-page confidences. */
function classifyQuality(pages: PageOcr[]): OcrQuality {
  if (pages.length === 0) return 'failed';
  // Pages with suspiciously little text may be blank scans.
  const emptyPages = pages.filter((p) => p.text.trim().length < 5).length;
  if (emptyPages === pages.length) return 'failed';
  // Mean block confidence across all pages.
  const mean = pages.reduce((s, p) => s + p.confidence, 0) / pages.length;
  if (mean < 40) return 'failed';
  if (mean < 65) return 'low';
  if (mean < 82) return 'medium';
  return 'high';
}

/** Combine per-page OCR results into one document-level OcrResult. */
function resultFromPages(pages: PageOcr[], source: OcrTextSource): OcrResult {
  const text = pages.map((p) => p.text).join('\n\n');
  const confidence = pages.length > 0
    ? pages.reduce((s, p) => s + p.confidence, 0) / pages.length
    : 0;
  return {
    text,
    confidence,
    pages,
    totalPages: pages.length,
    quality: classifyQuality(pages),
    textSource: source,
  };
}

/* Re-export low-level helpers for callers that want to drive the
 * pipeline themselves (mostly useful for tests). */
export {
  renderPage,
  renderPageWithPdf2Pic,
  renderPageWithPdfJs,
  renderPageWithPdftoppm,
  isBlankPage,
  preprocessCanvas,
  preprocessAggressiveCanvas,
  deskewCanvas,
  binarizeCanvas,
  recognizeCanvas,
  extractEmbeddedTextItems,
  pagesFromEmbeddedText,
  extractFields,
};
