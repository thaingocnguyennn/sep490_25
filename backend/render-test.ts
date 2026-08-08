import { promises as fs } from 'fs';
import * as path from 'path';
import { createCanvas } from '@napi-rs/canvas';
import { pdfjsLib, PDFJS_STANDARD_FONT_URL, PDFJS_CMAP_URL, renderPage } from './src/shared/services/ocr/pdf-renderer';

const PDF_PATH = path.resolve(__dirname, '../data-test/292_2026_nd-cp_22072026-signed.signed.pdf');
const OUTPUT_DIR = path.resolve(__dirname, 'image-test');

async function main() {
  console.log('Reading PDF:', PDF_PATH);
  const pdfBuffer = await fs.readFile(PDF_PATH);
  console.log('PDF size:', pdfBuffer.length, 'bytes');

  // Load PDF document
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    standardFontDataUrl: PDFJS_STANDARD_FONT_URL,
    cMapUrl: PDFJS_CMAP_URL,
    cMapPacked: true,
    verbosity: 0,
  }).promise;

  console.log('Total pages:', doc.numPages);

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Render first page at scale 4.0 (288 DPI)
  const scale = 4.0;
  console.log(`Rendering page 1 at scale ${scale}x...`);

  const rendered = await renderPage(doc, pdfBuffer, 1, scale);
  if (!rendered) {
    console.error('Failed to render page');
    process.exit(1);
  }

  console.log(`Rendered: ${rendered.width}x${rendered.height} (renderer: ${rendered.renderer})`);

  // Save as PNG
  const outputPath = path.join(OUTPUT_DIR, '292_2026_nd-cp_page1.png');
  const buffer = rendered.canvas.toBuffer('image/png');
  await fs.writeFile(outputPath, buffer);

  console.log('Saved to:', outputPath);
  console.log('Done!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
