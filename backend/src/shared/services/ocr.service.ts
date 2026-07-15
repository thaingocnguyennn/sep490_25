import { pdfjsLib, PDFJS_STANDARD_FONT_URL, PDFJS_CMAP_URL } from './ocr/pdf-renderer';
import type * as pdfjsTypes from 'pdfjs-dist';
import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import { AppError } from '../../shared/exceptions/app-error';
import { SUPPORTED_TYPES } from './ocr/constants';
import { isBlankPage, preprocessCanvas, deskewCanvas, binarizeCanvas } from './ocr/preprocessing';
import {
  renderPage,
  renderPageWithPdf2Pic,
  renderPageWithPdfJs,
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
import type { OcrResult, PageOcr } from './ocr/types';
import { applyRegionReplacements, recognizeFieldRegion, recognizeSignatureBlock } from './ocr/region-ocr';

/**
 * Layout-aware OCR pipeline for Vietnamese administrative documents.
 *
 * Single workflow:
 *   PDF → render every page → preprocess → OCR → layout analysis → field extraction
 *
 * The pipeline is intentionally OCR-only — no embedded-text fallback.
 * Coordinates returned by Tesseract are normalized to [0, 1] so the
 * extraction logic is independent of the rendering DPI.
 */

export type { OcrResult, ExtractedFields } from './ocr/types';

/** Render scale used when rasterizing PDF pages.
 *
 * Tesseract.js v7 LSTM works best at ~300 DPI for printed text.
 * We render at 3.5x the PDF's nominal 72 DPI baseline (= 252 DPI),
 * which is just under the optimal point and saves ~15% time vs 4x
 * while still giving the LSTM enough pixels to resolve 6/8, B/6, ố/6
 * type confusions that are the dominant accuracy bottleneck on
 * Vietnamese administrative documents (per benchmarking done in
 * July 2026: scale 3.5 gave 23% field accuracy vs 21% at 3.0 on
 * the same golden set).
 */
const RENDER_SCALE = 3.5;

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
    const processed = preprocessCanvas(canvas);
    const page = await recognizeCanvas(processed, pageNumber);
    return resultFromPages([page]);
  } catch (error) {
    throw new AppError(500, 'OCR processing failed', error);
  }
}

/* ─── PDF input — render every page and OCR each one ──────────────────────── */

async function runOcrOnPdf(pdfBuffer: Buffer): Promise<OcrResult> {
  let pdfDoc: pdfjsTypes.PDFDocumentProxy;
  try {
    pdfDoc = await pdfjsLib
      .getDocument({
        data: new Uint8Array(pdfBuffer),
        // Resolve standard font names (Helvetica, Times, ...) so PDFs
        // that reference Type 1 standard fonts render correctly.
        standardFontDataUrl: PDFJS_STANDARD_FONT_URL,
        // Resolve non-Latin character maps when present.
        cMapUrl: PDFJS_CMAP_URL,
        cMapPacked: true,
        verbosity: 0,
      })
      .promise;
  } catch (error) {
    throw new AppError(400, 'Failed to open PDF for OCR', error);
  }

  const totalPages = pdfDoc.numPages;
  const pages: PageOcr[] = [];
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
      if (isBlankPage(rendered.canvas)) continue;

      // Preprocessing pipeline:
      //   1. deskew  — correct small rotation; LSTM hates even 2-3° skew.
      //   2. contrast / grayscale normalisation
      // (Adaptive binarisation was tried — see git history — but degrades
      // date-keyword recognition on the Vietnamese golden set.)
      const deskewed = deskewCanvas(rendered.canvas);
      const processed = preprocessCanvas(deskewed);

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
      if (pageNum === 1 && process.env.OCR_DOCNUM_ENSEMBLE === '1') {
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
      if (pageNum === 1 && process.env.OCR_DATE_REOCR === '1') {
        try {
          const dateText = await recognizeDateRegion(processed, page);
          if (dateText && hasPlausibleDate(dateText)) {
            page = { ...page, dateHint: dateText };
          }
        } catch (err) {
          console.error(`date-region re-OCR failed for page 1:`, err);
        }
      }
      pages.push(page);
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
        const idx = pages.length - 1;
        pages[idx] = applyRegionReplacements(pages[idx], sigSplice.replacements);
      }
    } catch (err) {
      console.error('signature-block re-OCR failed:', err);
    }
  }

  if (pages.length === 0) {
    throw new AppError(400, 'No readable text found in document.');
  }

  const result = resultFromPages(pages);
  result.totalPages = totalPages;
  return result;
}

/** Combine per-page OCR results into one document-level OcrResult. */
function resultFromPages(pages: PageOcr[]): OcrResult {
  const text = pages.map((p) => p.text).join('\n\n');
  const confidence = pages.length > 0
    ? pages.reduce((s, p) => s + p.confidence, 0) / pages.length
    : 0;
  return {
    text,
    confidence,
    pages,
    totalPages: pages.length,
  };
}

/* Re-export low-level helpers for callers that want to drive the
 * pipeline themselves (mostly useful for tests). */
export {
  renderPage,
  renderPageWithPdf2Pic,
  renderPageWithPdfJs,
  isBlankPage,
  preprocessCanvas,
  deskewCanvas,
  binarizeCanvas,
  recognizeCanvas,
  extractFields,
};
