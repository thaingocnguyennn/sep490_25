/**
 * OCR Debug Visualizer — Tesseract Bounding Boxes + Field Extraction Regions
 *
 * Purpose: Identify whether OCR errors originate from:
 *   (A) Tesseract detecting incorrect bounding boxes
 *   (B) Preprocessing losing information
 *   (C) extractFields() choosing the wrong regions
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/shared/services/ocr/ocr-debug-visualizer.ts
 *
 * Output (written to image-test/):
 *   <prefix>-page-<N>-tesseract-boxes.png   — word (green), line (cyan), block (magenta) boxes
 *   <prefix>-page-<N>-field-regions.png    — Decree-30 region boxes (color-coded by field)
 *   <prefix>-page-<N>-field-overlay.png    — combined: preprocessed + tesseract + field regions
 *
 * The script reads existing preprocessed images from image-test/ (the same ones
 * produced by the OCR pipeline). No PDF rendering is needed — the visualizer
 * focuses purely on the Tesseract → extractFields() boundary.
 *
 * Environment variables:
 *   OCR_DEBUG_VIS_PREFIX  — image prefix to process (default: nq-sua-doi-bo-sung-nq.63-ve-kinh-phi-bau-cu)
 *   OCR_DEBUG_VIS_PAGES    — comma-separated page numbers (default: 1,2,3)
 *   OCR_SAVE_PIPELINE_IMAGES=1 (must be set for image-test output)
 */

import { createCanvas, loadImage, type Canvas, type CanvasRenderingContext2D } from '@napi-rs/canvas';
import { promises as fs } from 'fs';
import * as path from 'path';
import Tesseract, { createWorker, OEM } from 'tesseract.js';

import type { NormalizedBBox, PageOcr, OcrWord, OcrLine, OcrBlock } from './types';
import { linesInReadingOrder, locateRegionByCode } from './layout';
import { unionBbox } from './layout';
import {
  BOX_VERTICAL_HINT,
  BOX_HORIZONTAL_HINT,
  DECREE_30_REGIONS,
} from './constants';
import { preprocessCanvas } from './preprocessing';

// ─── Color palette ─────────────────────────────────────────────────────────────
// Each visual layer has a distinct, non-overlapping color.

const C = {
  // Tesseract layers (drawn first, below field regions)
  WORD_BOX: '#22c55e', // green   — individual word bboxes
  LINE_BOX: '#06b6d4', // cyan    — full line bboxes
  BLOCK_BOX: '#d946ef', // magenta — block-level bboxes

  // Field regions ( Decree-30 boxes )
  BOX_2: '#f59e0b', // amber   — issuer (cơ quan ban hành)
  BOX_3: '#3b82f6', // blue    — document number (số ký hiệu)
  BOX_4: '#ef4444', // red     — date (ngày tháng năm)
  BOX_5A: '#8b5cf6', // violet  — doc type + summary (loại văn bản / trích yếu)
  BOX_7A: '#14b8a6', // teal    — signer title (chức vụ)
  BOX_7B: '#f97316', // orange  — signer name (họ tên người ký)
  BOX_10A: '#84cc16', // lime    — confidentiality (độ mật)
  BOX_10B: '#a3e635', // yellow  — urgency (độ khẩn)

  // Vertical band hint lines
  BAND_LINE: '#64748b', // slate   — dashed vertical band markers
  BAND_CENTER: '#94a3b8', // lighter slate — center line of each band

  // Matched region highlight (filled, semi-transparent)
  MATCHED_FILL: 'rgba(34,197,94,0.12)',
  MATCHED_STROKE: '#22c55e',
} as const;

// ─── Canvas drawing helpers ───────────────────────────────────────────────────

function loadImageFile(filePath: string): Promise<Canvas> {
  return loadImage(filePath).then((img) => {
    const c = createCanvas(img.width, img.height);
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  });
}

function canvasToBuffer(canvas: Canvas): Buffer {
  return canvas.toBuffer('image/png');
}

/** Draw a normalized bbox on a canvas. */
function drawBBox(
  ctx: CanvasRenderingContext2D,
  bbox: NormalizedBBox,
  color: string,
  lineWidth: number,
  canvasWidth: number,
  canvasHeight: number,
  alpha = 1,
): void {
  const x0 = bbox.x0 * canvasWidth;
  const y0 = bbox.y0 * canvasHeight;
  const w = (bbox.x1 - bbox.x0) * canvasWidth;
  const h = (bbox.y1 - bbox.y0) * canvasHeight;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x0, y0, w, h);
  ctx.restore();
}

/** Fill a normalized bbox. */
function fillBBox(
  ctx: CanvasRenderingContext2D,
  bbox: NormalizedBBox,
  color: string,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const x0 = bbox.x0 * canvasWidth;
  const y0 = bbox.y0 * canvasHeight;
  const w = (bbox.x1 - bbox.x0) * canvasWidth;
  const h = (bbox.y1 - bbox.y0) * canvasHeight;
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(x0, y0, w, h);
  ctx.restore();
}

/** Draw a dashed horizontal band across the page. */
function drawVerticalBand(
  ctx: CanvasRenderingContext2D,
  y: number,
  color: string,
  canvasWidth: number,
  canvasHeight: number,
  label: string,
): void {
  const yPx = y * canvasHeight;
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, yPx);
  ctx.lineTo(canvasWidth, yPx);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = '11px monospace';
  ctx.fillText(label, 4, yPx - 3);
  ctx.restore();
}

/** Draw a dashed vertical band across the page. */
function drawHorizontalBand(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  color: string,
  canvasWidth: number,
  canvasHeight: number,
  label: string,
): void {
  const x0Px = x0 * canvasWidth;
  const x1Px = x1 * canvasWidth;
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0Px, 0);
  ctx.lineTo(x0Px, canvasHeight);
  ctx.moveTo(x1Px, 0);
  ctx.lineTo(x1Px, canvasHeight);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = '11px monospace';
  const mid = (x0Px + x1Px) / 2;
  ctx.fillText(label, mid - ctx.measureText(label).width / 2, canvasHeight - 4);
  ctx.restore();
}

/** Draw a text label near a bbox (top-left corner). */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  bbox: NormalizedBBox,
  label: string,
  bgColor: string,
  textColor: string,
  canvasWidth: number,
  canvasHeight: number,
  offsetY = 0,
): void {
  const x = bbox.x0 * canvasWidth;
  const y = bbox.y0 * canvasHeight + offsetY;
  ctx.save();
  ctx.font = '10px monospace';
  const tw = ctx.measureText(label).width;
  const pad = 2;
  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y - 11, tw + pad * 2, 13);
  ctx.fillStyle = textColor;
  ctx.fillText(label, x + pad, y);
  ctx.restore();
}

// ─── PageOcr from tesseract.js output ─────────────────────────────────────────

function normalizeBBox(
  bbox: { x0: number; y0: number; x1: number; y1: number },
  pageWidth: number,
  pageHeight: number,
): NormalizedBBox {
  return {
    x0: bbox.x0 / pageWidth,
    y0: bbox.y0 / pageHeight,
    x1: bbox.x1 / pageWidth,
    y1: bbox.y1 / pageHeight,
  };
}

function buildPageOcr(
  data: { blocks?: unknown[] | null; text?: string | null },
  pageNumber: number,
  canvasWidth: number,
  canvasHeight: number,
): PageOcr {
  const blocks: OcrBlock[] = (data.blocks ?? []).map((rawBlock: unknown) => {
    const block = rawBlock as {
      block_id: number; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number };
      paragraphs: { lines: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number }; block_id: number; para_id: number; words: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number }; block_id: number; para_id: number; line_id: number }[] }[] }[];
    };
    return {
      id: block.block_id,
      bbox: normalizeBBox(block.bbox, canvasWidth, canvasHeight),
      confidence: block.confidence,
      lines: block.paragraphs.flatMap((p: any) => p.lines).map((rawLine: any) => {
        const line = rawLine as {
          text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number };
          block_id: number; para_id: number;
          words: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number }; block_id: number; para_id: number; line_id: number }[];
        };
        return {
          text: line.text,
          bbox: normalizeBBox(line.bbox, canvasWidth, canvasHeight),
          confidence: line.confidence,
          block: line.block_id,
          paragraph: line.para_id,
          words: line.words.map((rawWord) => {
            const w = rawWord as { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number }; block_id: number; para_id: number; line_id: number };
            return {
              text: w.text,
              bbox: normalizeBBox(w.bbox, canvasWidth, canvasHeight),
              confidence: w.confidence,
              line: w.line_id,
              block: w.block_id,
              paragraph: w.para_id,
            };
          }),
        };
      }),
    };
  }).filter((b) => b.lines.length > 0);

  const text = blocks
    .map((b) => b.lines.map((l) => l.text).join('\n'))
    .join('\n\n')
    .trim();

  const confidence = blocks.length > 0
    ? blocks.reduce((s, b) => s + b.confidence, 0) / blocks.length
    : 0;

  return { pageNumber, width: canvasWidth, height: canvasHeight, text, confidence, blocks };
}

// ─── Region debug info ────────────────────────────────────────────────────────

interface RegionDebugInfo {
  code: string;
  label: string;
  color: string;
  verticalBand: { center: number; tolerance: number };
  horizontalBand?: { x0: number; x1: number };
  matchedLines: OcrLine[];
  unionBBox: NormalizedBBox;
  extractedText: string;
}

/** Replicate the locateRegion logic but return debug info. */
function locateRegionDebug(page: PageOcr, code: string): RegionDebugInfo | null {
  const region = DECREE_30_REGIONS[code];
  if (!region) return null;

  const verticalCenter = BOX_VERTICAL_HINT[code] ?? 0.5;
  let tolerance = 0.10;
  if (code === '3' || code === '4') tolerance = 0.05;
  if (code === '2') tolerance = 0.08;

  let candidateLines = linesInReadingOrder(page).filter(
    (l) => Math.abs(((l.bbox.y0 + l.bbox.y1) / 2) - verticalCenter) <= tolerance,
  );

  const hh = BOX_HORIZONTAL_HINT[code];
  if (hh) {
    candidateLines = candidateLines.filter((l) => {
      const cx = (l.bbox.x0 + l.bbox.x1) / 2;
      return cx >= hh.x0 - 0.05 && cx <= hh.x1 + 0.05;
    });
  }

  const matchedLines: OcrLine[] = [];
  for (const line of candidateLines) {
    const text = line.text.trim();
    const probeWord: OcrWord = {
      text,
      bbox: line.bbox,
      confidence: line.confidence,
      line: 0,
      block: 0,
      paragraph: 0,
    };
    if (region.match(probeWord, text)) {
      matchedLines.push(line);
    }
  }

  const unionB = unionBbox(matchedLines.map((l) => l.bbox));
  const extractedText = matchedLines.map((l) => l.text.trim()).filter(Boolean).join(' | ');

  return {
    code,
    label: region.label,
    color: getRegionColor(code),
    verticalBand: { center: verticalCenter, tolerance },
    horizontalBand: hh,
    matchedLines,
    unionBBox: unionB,
    extractedText,
  };
}

function getRegionColor(code: string): string {
  const map: Record<string, string> = {
    '2': C.BOX_2,
    '3': C.BOX_3,
    '4': C.BOX_4,
    '5a': C.BOX_5A,
    '7a': C.BOX_7A,
    '7b': C.BOX_7B,
    '10a': C.BOX_10A,
    '10b': C.BOX_10B,
  };
  return map[code] ?? '#ffffff';
}

// ─── Main visualizer ───────────────────────────────────────────────────────────

async function runTesseract(canvas: Canvas, langs: string, langPath: string) {
  const cachePath = path.join(__dirname, '..', '..', '..', '..', 'node_modules', '.cache', 'tesseractjs');
  const w = await createWorker(langs, OEM.LSTM_ONLY, {
    langPath,
    cachePath,
    cacheMethod: 'write',
    logger: () => undefined,
  });
  const { data } = await w.recognize(canvas.toBuffer('image/png'), {}, { blocks: true });
  await w.terminate();
  return data;
}

async function visualizerForImage(preprocessedPath: string, pageNumber: number): Promise<void> {
  const imageTestDir = path.resolve(__dirname, '../../../../../image-test');
  const prefix = path.basename(preprocessedPath, '.png').replace(/-preprocessed$/, '');

  // Load the preprocessed canvas (already CLAHE'd, ready for OCR).
  const canvas = await loadImageFile(preprocessedPath);
  const W = canvas.width;
  const H = canvas.height;

  console.log(`\n[visualizer] page ${pageNumber}: ${W}x${H}px`);

  // ── Step 1: Run Tesseract on the preprocessed image. ──────────────────────
  const langs = process.env.OCR_LANGS ?? 'vie+eng';
  const langPath = process.env.OCR_LANG_PATH
    ?? path.join(__dirname, '..', '..', '..', '..', 'tessdata');

  console.log(`[visualizer] running Tesseract (${langs})...`);
  const tesseractData = await runTesseract(canvas, langs, langPath);
  const page = buildPageOcr(tesseractData, pageNumber, W, H);

  console.log(`  blocks=${page.blocks.length}  confidence=${page.confidence.toFixed(1)}%`);
  const lineCount = page.blocks.reduce((s, b) => s + b.lines.length, 0);
  const wordCount = page.blocks.reduce(
    (s, b) => s + b.lines.reduce((sl, l) => sl + l.words.length, 0),
    0,
  );
  console.log(`  lines=${lineCount}  words=${wordCount}`);

  // ── Step 2: Draw tesseract boxes on a copy of the canvas. ────────────────
  const boxCanvas = createCanvas(W, H);
  const boxCtx = boxCanvas.getContext('2d');
  boxCtx.drawImage(canvas, 0, 0);

  // Block boxes (drawn first, on bottom)
  for (const block of page.blocks) {
    drawBBox(boxCtx, block.bbox, C.BLOCK_BOX, 1.5, W, H, 0.7);
  }
  // Line boxes (drawn second)
  for (const block of page.blocks) {
    for (const line of block.lines) {
      drawBBox(boxCtx, line.bbox, C.LINE_BOX, 1.0, W, H, 0.85);
    }
  }
  // Word boxes (drawn last, on top)
  for (const block of page.blocks) {
    for (const line of block.lines) {
      for (const word of line.words) {
        drawBBox(boxCtx, word.bbox, C.WORD_BOX, 0.6, W, H, 0.6);
      }
    }
  }

  // ── Step 3: Draw vertical band hints. ─────────────────────────────────────
  for (const [code, center] of Object.entries(BOX_VERTICAL_HINT)) {
    const label = `Box ${code} (y≈${(center * 100).toFixed(0)}%)`;
    drawVerticalBand(boxCtx, center, C.BAND_LINE, W, H, label);
  }

  // ── Step 4: Draw region debug overlay. ────────────────────────────────────
  const regionCanvas = createCanvas(W, H);
  const regionCtx = regionCanvas.getContext('2d');
  regionCtx.drawImage(canvas, 0, 0);

  const regionCodes = ['2', '3', '4', '5a', '7a', '7b', '10a', '10b'];
  const regionInfos: RegionDebugInfo[] = [];

  for (const code of regionCodes) {
    const info = locateRegionDebug(page, code);
    if (!info) continue;
    regionInfos.push(info);

    // Fill the candidate band for this region (greyed)
    const { verticalBand, horizontalBand } = info;
    const bandY0 = Math.max(0, verticalBand.center - verticalBand.tolerance);
    const bandY1 = Math.min(1, verticalBand.center + verticalBand.tolerance);
    const bandBBox: NormalizedBBox = horizontalBand
      ? { x0: horizontalBand.x0, y0: bandY0, x1: horizontalBand.x1, y1: bandY1 }
      : { x0: 0, y0: bandY0, x1: 1, y1: bandY1 };

    fillBBox(regionCtx, bandBBox, info.color + '18', W, H);

    // Draw matched region bbox (if any lines matched)
    if (info.matchedLines.length > 0) {
      // Filled highlight for the union of matched lines
      fillBBox(regionCtx, info.unionBBox, info.color + '2a', W, H);
      drawBBox(regionCtx, info.unionBBox, info.color, 2, W, H);

      // Draw individual matched line bboxes
      for (const line of info.matchedLines) {
        drawBBox(regionCtx, line.bbox, info.color, 1, W, H, 0.5);
      }

      // Label: code + extracted text (truncated)
      const shortText = info.extractedText.length > 60
        ? info.extractedText.slice(0, 60) + '…'
        : info.extractedText;
      drawLabel(regionCtx, info.unionBBox, `Box ${code}: ${shortText}`, info.color, '#ffffff', W, H, -2);
    } else {
      // No match: draw the band bbox with a dashed outline
      drawBBox(regionCtx, bandBBox, info.color, 1, W, H, 0.4);
      drawLabel(regionCtx, bandBBox, `Box ${code}: (no match)`, '#555555', '#ffffff', W, H, -2);
    }

    // Draw the vertical band center line
    const centerPx = verticalBand.center * H;
    regionCtx.save();
    regionCtx.setLineDash([3, 5]);
    regionCtx.strokeStyle = info.color;
    regionCtx.lineWidth = 0.5;
    regionCtx.beginPath();
    regionCtx.moveTo(0, centerPx);
    regionCtx.lineTo(W, centerPx);
    regionCtx.stroke();
    regionCtx.setLineDash([]);
    regionCtx.restore();
  }

  // ── Step 5: Draw horizontal band hints. ───────────────────────────────────
  if (regionInfos[0]?.horizontalBand) {
    const hh = regionInfos[0].horizontalBand!;
    for (const info of regionInfos) {
      if (info.horizontalBand) {
        drawHorizontalBand(
          regionCtx,
          info.horizontalBand.x0,
          info.horizontalBand.x1,
          info.color,
          W, H,
          `Box ${info.code} x:[${info.horizontalBand.x0.toFixed(2)},${info.horizontalBand.x1.toFixed(2)}]`,
        );
      }
    }
  }

  // ── Step 6: Draw legend. ──────────────────────────────────────────────────
  const legendCtx = regionCtx;
  const legendItems = [
    [C.BLOCK_BOX, 'block bbox'],
    [C.LINE_BOX, 'line bbox'],
    [C.WORD_BOX, 'word bbox'],
    [C.BOX_2, 'Box 2: issuer'],
    [C.BOX_3, 'Box 3: doc number'],
    [C.BOX_4, 'Box 4: date'],
    [C.BOX_5A, 'Box 5a: type/summary'],
    [C.BOX_7A, 'Box 7a: signer title'],
    [C.BOX_7B, 'Box 7b: signer name'],
    [C.BAND_LINE, 'vertical band center'],
  ];

  legendCtx.save();
  legendCtx.font = '11px monospace';
  const boxW = 130;
  const boxH = legendItems.length * 14 + 8;
  const lx = W - boxW - 6;
  const ly = 6;
  legendCtx.fillStyle = 'rgba(0,0,0,0.75)';
  legendCtx.fillRect(lx - 3, ly - 3, boxW + 6, boxH);
  legendItems.forEach(([color, text], i) => {
    const y = ly + i * 14 + 12;
    legendCtx.fillStyle = color;
    legendCtx.fillRect(lx, y - 9, 10, 10);
    legendCtx.fillStyle = '#ffffff';
    legendCtx.fillText(text, lx + 14, y);
  });
  legendCtx.restore();

  // ── Step 7: Draw per-region extraction report. ─────────────────────────────
  const reportLines: string[] = [];
  reportLines.push(`Page ${pageNumber} — OCR Debug Report`);
  reportLines.push(`Tesseract: ${langs}  confidence=${page.confidence.toFixed(1)}%  blocks=${page.blocks.length}  lines=${lineCount}  words=${wordCount}`);
  reportLines.push('');
  reportLines.push('Field Extraction Results:');
  reportLines.push('─'.repeat(70));

  for (const info of regionInfos) {
    const status = info.matchedLines.length > 0 ? ' MATCHED' : ' NO MATCH';
    reportLines.push(`  Box ${info.code} (${info.label})`);
    reportLines.push(`    Status   : ${status}`);
    reportLines.push(`    Band     : y-center=${info.verticalBand.center.toFixed(3)} ±${info.verticalBand.tolerance.toFixed(3)}`);
    if (info.horizontalBand) {
      reportLines.push(`    H-Band   : [${info.horizontalBand.x0.toFixed(2)}, ${info.horizontalBand.x1.toFixed(2)}]`);
    }
    reportLines.push(`    Extracted: "${info.extractedText || '(empty)'}"`);
    if (info.matchedLines.length > 0) {
      reportLines.push(`    Lines    : ${info.matchedLines.length}`);
      for (let i = 0; i < Math.min(info.matchedLines.length, 3); i++) {
        const l = info.matchedLines[i];
        const conf = l.confidence.toFixed(1);
        const bbox = `y:[${l.bbox.y0.toFixed(3)},${l.bbox.y1.toFixed(3)}] x:[${l.bbox.x0.toFixed(3)},${l.bbox.x1.toFixed(3)}]`;
        reportLines.push(`      line ${i + 1}: "${l.text.slice(0, 80)}" (conf=${conf}%, ${bbox})`);
      }
      if (info.matchedLines.length > 3) {
        reportLines.push(`      ... and ${info.matchedLines.length - 3} more lines`);
      }
    } else {
      // Show what WAS in the band (if anything)
      const allLines = linesInReadingOrder(page);
      const inBand = allLines.filter(
        (l) => Math.abs(((l.bbox.y0 + l.bbox.y1) / 2) - info.verticalBand.center) <= info.verticalBand.tolerance,
      );
      reportLines.push(`    In band  : ${inBand.length} line(s)`);
      for (let i = 0; i < Math.min(inBand.length, 3); i++) {
        reportLines.push(`      candidate: "${inBand[i].text.slice(0, 80)}"`);
      }
    }
    reportLines.push('');
  }

  const report = reportLines.join('\n');
  console.log(report);

  // ── Step 8: Save output images. ──────────────────────────────────────────
  await fs.mkdir(imageTestDir, { recursive: true });

  const boxPath = path.join(imageTestDir, `${prefix}-page-${String(pageNumber).padStart(3, '0')}-tesseract-boxes.png`);
  const regionPath = path.join(imageTestDir, `${prefix}-page-${String(pageNumber).padStart(3, '0')}-field-regions.png`);
  const reportPath = path.join(imageTestDir, `${prefix}-page-${String(pageNumber).padStart(3, '0')}-debug-report.txt`);

  await Promise.all([
    fs.writeFile(boxPath, canvasToBuffer(boxCanvas)),
    fs.writeFile(regionPath, canvasToBuffer(regionCanvas)),
    fs.writeFile(reportPath, Buffer.from(report, 'utf8')),
  ]);

  console.log(`[visualizer] saved:`);
  console.log(`  ${boxPath}`);
  console.log(`  ${regionPath}`);
  console.log(`  ${reportPath}`);
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const imageTestDir = path.resolve(__dirname, '../../../../../image-test');
  const defaultPrefix = 'nq-sua-doi-bo-sung-nq.63-ve-kinh-phi-bau-cu';
  const prefix = process.env.OCR_DEBUG_VIS_PREFIX ?? defaultPrefix;
  const pagesEnv = process.env.OCR_DEBUG_VIS_PAGES ?? '1,2,3';
  const pages = pagesEnv.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));

  console.log('═'.repeat(70));
  console.log('OCR Debug Visualizer — Tesseract BBoxes + Field Extraction');
  console.log('═'.repeat(70));
  console.log(`Prefix : ${prefix}`);
  console.log(`Pages  : ${pages.join(', ')}`);
  console.log(`Image dir: ${imageTestDir}`);
  console.log('');

  for (const pageNum of pages) {
    const preprocessedPath = path.join(
      imageTestDir,
      `${prefix}-page-${String(pageNum).padStart(3, '0')}-preprocessed.png`,
    );

    try {
      await fs.access(preprocessedPath);
    } catch {
      console.error(`[visualizer] preprocessed image not found: ${preprocessedPath}`);
      console.error(`  (Run the OCR pipeline first with OCR_SAVE_PIPELINE_IMAGES=1)`);
      continue;
    }

    await visualizerForImage(preprocessedPath, pageNum);
  }

  console.log('\n[visualizer] done.');
}

main().catch((e) => {
  console.error('[visualizer] fatal:', e);
  process.exit(1);
});
