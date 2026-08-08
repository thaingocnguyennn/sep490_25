/**
 * Smoke test for the layout-aware extractFields() improvements.
 *
 * Runs the full OCR pipeline (with the existing preprocessed images)
 * and verifies:
 *   1. Issuer extraction correctly uses the left column.
 *   2. Document number stops at the first date keyword.
 *   3. Date extraction uses the right column.
 *   4. Field traces are populated when OCR_FIELD_DEBUG=1.
 *
 * Reads preprocessed PNGs from image-test/ so we don't need a PDF.
 * Runs Tesseract on them and feeds the result through extractFields().
 */
import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { promises as fs } from 'fs';
import * as path from 'path';

import { extractFields } from './field-extractor';
import type { PageOcr, OcrBlock, OcrLine, OcrWord, NormalizedBBox } from './types';

const imageTestDir = path.resolve(__dirname, '../../../../../image-test');

interface RawWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  block_id: number;
  para_id: number;
  line_id: number;
}
interface RawLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  block_id: number;
  para_id: number;
  words: RawWord[];
}
interface RawBlock {
  block_id: number;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  paragraphs: { lines: RawLine[] }[];
}

async function loadImageFile(filePath: string): Promise<Canvas> {
  const img = await loadImage(filePath);
  const c = createCanvas(img.width, img.height);
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

async function runTesseract(canvas: Canvas, pageNum: number): Promise<PageOcr> {
  const langs = process.env.OCR_LANGS ?? 'vie+eng';
  const langPath = process.env.OCR_LANG_PATH
    ?? path.join(__dirname, '..', '..', '..', '..', 'tessdata');
  const cachePath = path.join(__dirname, '..', '..', '..', '..', 'node_modules', '.cache', 'tesseractjs');
  const worker = await createWorker(langs, OEM.LSTM_ONLY, {
    langPath,
    cachePath,
    cacheMethod: 'write',
    logger: () => undefined,
  });
  await worker.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '300', tessedit_pageseg_mode: PSM.AUTO });
  const buffer = canvas.toBuffer('image/png');
  const { data } = await worker.recognize(buffer, {}, { blocks: true });
  await worker.terminate();

  const W = canvas.width;
  const H = canvas.height;
  const blocks: OcrBlock[] = ((data.blocks ?? []) as unknown as RawBlock[]).map((raw) => ({
    id: raw.block_id,
    bbox: { x0: raw.bbox.x0 / W, y0: raw.bbox.y0 / H, x1: raw.bbox.x1 / W, y1: raw.bbox.y1 / H },
    confidence: raw.confidence,
    lines: raw.paragraphs.flatMap((p) => p.lines).map((line) => ({
      text: line.text,
      bbox: { x0: line.bbox.x0 / W, y0: line.bbox.y0 / H, x1: line.bbox.x1 / W, y1: line.bbox.y1 / H },
      confidence: line.confidence,
      block: line.block_id,
      paragraph: line.para_id,
      words: line.words.map((w) => ({
        text: w.text,
        bbox: { x0: w.bbox.x0 / W, y0: w.bbox.y0 / H, x1: w.bbox.x1 / W, y1: w.bbox.y1 / H },
        confidence: w.confidence,
        line: w.line_id,
        block: w.block_id,
        paragraph: w.para_id,
      })),
    })),
  })).filter((b) => b.lines.length > 0);

  return {
    pageNumber: pageNum,
    width: W,
    height: H,
    text: blocks.map((b) => b.lines.map((l) => l.text).join('\n')).join('\n').trim(),
    confidence: blocks.length > 0 ? blocks.reduce((s, b) => s + b.confidence, 0) / blocks.length : 0,
    blocks,
  };
}

async function main() {
  const prefix = process.env.OCR_DEBUG_VIS_PREFIX ?? 'nq-sua-doi-bo-sung-nq.63-ve-kinh-phi-bau-cu';
  const pagesEnv = process.env.OCR_DEBUG_VIS_PAGES ?? '1';
  const pages = pagesEnv.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));

  process.env.OCR_FIELD_DEBUG = '1';

  console.log('='.repeat(70));
  console.log('Layout-aware extractFields() smoke test');
  console.log('='.repeat(70));
  console.log(`Prefix: ${prefix}`);
  console.log(`Pages:  ${pages.join(', ')}`);

  for (const pageNum of pages) {
    const preprocessedPath = path.join(
      imageTestDir,
      `${prefix}-page-${String(pageNum).padStart(3, '0')}-preprocessed.png`,
    );
    console.log(`\n[page ${pageNum}] running Tesseract...`);
    const canvas = await loadImageFile(preprocessedPath);
    const page = await runTesseract(canvas, pageNum);

    const fields = extractFields([page], 'INCOMING', { debug: true });
    const trace = (fields as any).__trace;

    console.log('\n--- Extracted fields ---');
    console.log(`  issuer         : ${fields.issuer ?? '(undefined)'}`);
    console.log(`  documentNumber : ${fields.documentNumber ?? '(undefined)'}`);
    console.log(`  dateLetter     : ${fields.dateLetter ?? '(undefined)'}`);
    console.log(`  documentType   : ${fields.documentType ?? '(undefined)'}`);
    console.log(`  summary        : ${fields.summary?.slice(0, 80) ?? '(undefined)'}`);
    console.log(`  signerName     : ${fields.signerName ?? '(undefined)'}`);
    console.log(`  signerTitle    : ${fields.signerTitle ?? '(undefined)'}`);

    console.log('\n--- Field trace ---');
    for (const t of trace) {
      const bbox = t.bbox ? `[y=${t.bbox.y0.toFixed(3)}..${t.bbox.y1.toFixed(3)}, x=${t.bbox.x0.toFixed(3)}..${t.bbox.x1.toFixed(3)}]` : '(no bbox)';
      const conf = t.confidence !== undefined ? `${t.confidence.toFixed(0)}%` : '-';
      console.log(`  ${t.field}: "${t.value ?? '(null)'}"  bbox=${bbox}  conf=${conf}`);
      console.log(`    reason: ${t.reason}`);
    }
  }
  console.log('\n[done]');
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});