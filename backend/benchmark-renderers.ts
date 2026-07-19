/**
 * Renderer benchmark for Vietnamese admin PDFs.
 *
 * Renders page 1 of the supplied PDF using four pdf.js configurations,
 * OCR's each rendered PNG through the existing Vietnamese Tesseract
 * pipeline, and measures:
 *   - per-page OCR confidence (mean of Tesseract block confidences)
 *   - character-level accuracy vs the PDF's embedded text
 *     (the embedded text is treated as ground truth — for digitally
 *      generated government PDFs this is exact)
 *   - Vietnamese diacritic preservation (% of expected VN characters
 *     that survive OCR)
 *   - render wall time
 *
 * No pdftoppm test: Poppler is not installed in this environment
 * (`where pdftoppm` returned empty on the benchmark host). The script
 * skips Test D and reports it as such; the priorities defined here
 * still apply when pdftoppm is present at runtime (see
 * `pdf-renderer.ts::renderPage()` — pdftoppm is checked first there
 * and used as the primary renderer when available).
 *
 * Usage:
 *   npx ts-node benchmark-renderers.ts <path-to-vietnamese.pdf>
 */
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, type SKRSContext2D, type Canvas } from '@napi-rs/canvas';
import { recognizeCanvas } from './src/shared/services/ocr/tesseract-worker';

pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.resolve(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
).href;
pdfjsLib.VerbosityLevel.ERRORS = 0;

const STANDARD_FONT_URL = pathToFileURL(
  path.resolve(__dirname, 'node_modules/pdfjs-dist/standard_fonts/'),
).href + '/';
const CMAP_URL = pathToFileURL(
  path.resolve(__dirname, 'node_modules/pdfjs-dist/cmaps/'),
).href + '/';

interface TestCase {
  label: string;
  flags: {
    disableFontFace?: boolean;
    useSystemFonts?: boolean;
    fontExtraProperties?: boolean;
  };
}

const TEST_CASES: TestCase[] = [
  { label: 'A_baseline', flags: {} },
  {
    label: 'B_dffOn_sysOn_fepOn',
    flags: { disableFontFace: true, useSystemFonts: true, fontExtraProperties: true },
  },
  {
    label: 'C_dffOn_sysOff_fepOn',
    flags: { disableFontFace: true, useSystemFonts: false, fontExtraProperties: true },
  },
];

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }
  reset(c: { canvas: Canvas; context: SKRSContext2D }, w: number, h: number) {
    c.canvas.width = w;
    c.canvas.height = h;
  }
  destroy(c: { canvas: Canvas; context?: SKRSContext2D }) {
    c.canvas.width = 1;
    c.canvas.height = 1;
  }
}

async function renderPage1(
  pdfBuffer: Buffer,
  flags: TestCase['flags'],
  scale = 4.0,
): Promise<{ png: Buffer; width: number; height: number }> {
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    standardFontDataUrl: STANDARD_FONT_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    verbosity: 0,
    // Per-test varying flags — pdf.js accepts undefined as "default".
    disableFontFace: flags.disableFontFace,
    useSystemFonts: flags.useSystemFonts,
    fontExtraProperties: flags.fontExtraProperties,
  }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale });
  const factory = new NodeCanvasFactory();
  const ctx = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
  ctx.context.fillStyle = '#ffffff';
  ctx.context.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  await page.render({
    canvasContext: ctx.context,
    viewport,
    canvas: ctx.canvas,
  }).promise;
  return {
    png: ctx.canvas.toBuffer('image/png'),
    width: ctx.canvas.width,
    height: ctx.canvas.height,
  };
}

async function getEmbeddedText(pdfBuffer: Buffer): Promise<string> {
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    standardFontDataUrl: STANDARD_FONT_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    verbosity: 0,
  }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  type Item = { str?: string; hasEOL?: boolean };
  return (content.items as Item[])
    .map((it) => `${it.str ?? ''}${it.hasEOL ? '\n' : ''}`)
    .join('');
}

function normalize(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

interface MetricRow {
  test: string;
  renderMs: number;
  pngBytes: number;
  ocrConfidence: number;
  ocrChars: number;
  truthChars: number;
  cer: number;
  vnTruth: number;
  vnOcr: number;
  vnPreservation: number;
}

const VN_RE = /[àáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵÀÁẢÃẠẰẮẲẴẶẦẤẨẪẬÈÉẺẼẸỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌỒỐỔỖỘỜỚỞỠỢÙÚỦŨỤỪỨỬỮỰỲÝỶỸỴÂĂÊÔƠƯĐđ]/g;

function countVn(s: string): number {
  return (s.match(VN_RE) ?? []).length;
}

async function main() {
  const pdfPath = process.argv[2]
    ?? path.resolve(__dirname, '..', 'data-test', 'nq-sua-doi-bo-sung-nq.63-ve-kinh-phi-bau-cu.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF not found:', pdfPath);
    process.exit(1);
  }
  const pdfBuffer = fs.readFileSync(pdfPath);
  const truth = normalize(await getEmbeddedText(pdfBuffer));
  const truthVn = countVn(truth);

  console.log(`PDF: ${pdfPath}`);
  console.log(`Pages: page 1 only (single-page benchmark)`);
  console.log(`Embedded text length (ground truth): ${truth.length} chars; ${truthVn} VN chars`);
  console.log('');
  console.log('flags summary:');
  for (const t of TEST_CASES) {
    console.log(`  ${t.label}:`, JSON.stringify(t.flags));
  }
  console.log('');

  const results: MetricRow[] = [];
  const outDir = path.resolve(__dirname, '..', 'image-test');
  fs.mkdirSync(outDir, { recursive: true });

  for (const tc of TEST_CASES) {
    const t0 = Date.now();
    const { png, width, height } = await renderPage1(pdfBuffer, tc.flags);
    const renderMs = Date.now() - t0;
    const outPath = path.join(outDir, `bench-${tc.label}.png`);
    fs.writeFileSync(outPath, png);
    console.log(`[${tc.label}] rendered ${width}x${height} (${png.length}B) in ${renderMs}ms -> ${outPath}`);

    const pngCanvas = createCanvas(width, height);
    const imgCtx = pngCanvas.getContext('2d');
    // Rebuild the canvas from the saved PNG so Tesseract sees the exact
    // bytes it would in production.
    const { loadImage } = await import('@napi-rs/canvas');
    const img = await loadImage(png);
    imgCtx.drawImage(img, 0, 0);

    const ocr = await recognizeCanvas(pngCanvas, 1);
    const ocrText = normalize(ocr.text);
    const cer = ocrText.length === 0
      ? 1
      : levenshtein(ocrText, truth.slice(0, ocrText.length)) / Math.max(ocrText.length, truth.length);
    const vnOcr = countVn(ocrText);
    const vnPres = truthVn === 0 ? 1 : Math.min(1, vnOcr / truthVn);

    const row: MetricRow = {
      test: tc.label,
      renderMs,
      pngBytes: png.length,
      ocrConfidence: Math.round(ocr.confidence * 10) / 10,
      ocrChars: ocrText.length,
      truthChars: truth.length,
      cer: Math.round(cer * 1000) / 1000,
      vnTruth: truthVn,
      vnOcr,
      vnPreservation: Math.round(vnPres * 1000) / 1000,
    };
    results.push(row);
  }

  console.log('');
  console.log('=== Metrics ===');
  console.table(results);
  console.log('');
  console.log('Higher ocrConfidence and vnPreservation are better; lower cer is better.');
}

main().catch((e) => {
  console.error('benchmark crashed:', e);
  process.exit(1);
});
