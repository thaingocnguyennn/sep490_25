const fs = require('fs');
const path = require('path');
const pdfjs = require('./node_modules/pdfjs-dist/legacy/build/pdf.min.mjs');

async function test() {
  const files = ['61-ubnd.pdf', '18-ubnd-ld.pdf', 'KH 27.pdf'];
  for (const file of files) {
    const filePath = path.join(__dirname, '..', 'train-data', file);
    if (!fs.existsSync(filePath)) { console.log(`\n${file}: NOT FOUND`); continue; }
    const buffer = fs.readFileSync(filePath);
    try {
      const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
      const texts = [];
      for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s{2,}/g, '\n')
          .trim();
        if (pageText) texts.push(pageText);
      }
      const text = texts.join('\n\n');
      console.log(`\n=== ${file} (${doc.numPages} pages) ===`);
      console.log(`Text length: ${text.length}`);
      console.log(`Text:\n${text.slice(0, 800)}\n...`);
    } catch (err) {
      console.log(`\n${file}: ERROR - ${err.message}`);
    }
  }
}

test().catch(console.error);
