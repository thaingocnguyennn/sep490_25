const fs = require('fs');
const path = require('path');

async function main() {
  const { PDFParse } = await import('pdf-parse');
  const MONTH_NAMES = { một:'01', hai:'02', ba:'03', bốn:'04', năm:'05', sáu:'06', bảy:'07', tám:'08', chín:'09', mười:'10' };

  for (const file of ['60-ubnd.pdf', '61-ubnd.pdf', 'KH 27.pdf']) {
    const pdfData = fs.readFileSync(path.join(__dirname, '../train-data', file));
    const parser = new PDFParse({ data: pdfData });
    const r = await parser.getText();
    const lines = r.text.trim().split('\n').map(l => l.trim()).filter(Boolean);

    // === documentNumber (exact source logic) ===
    let docNum = null;
    const soLineIdx = lines.findIndex(l => /^số\s*[:.\s]/i.test(l));
    if (soLineIdx !== -1) {
      const soLine = lines[soLineIdx];
      const slashPos = soLine.indexOf('/');
      if (slashPos !== -1) {
        let endPos = slashPos;
        while (endPos < soLine.length) {
          const ch = soLine[endPos];
          if (/[\wÀ-ỹ\-\/.]/.test(ch)) {
            endPos++;
          } else {
            break;
          }
        }
        let v = soLine.slice(slashPos, endPos).trim();
        if (/^\/[0-9]/.test(v)) {
          v = v.replace(/^\/+/, '');
        }
        if (v && v.length >= 4) {
          docNum = v;
        }
      }
    }

    // === dateLetter (exact source logic) ===
    let dateLetter = null;
    const docTypeLineIdx = lines.findIndex(l =>
      ['QUYẾT ĐỊNH','CÔNG VĂN','THÔNG BÁO','TỜ TRÌNH','BÁO CÁO','QUY ĐỊNH','CHỈ THỊ','KẾ HOẠCH','HƯỚNG DẪN','QUY CHẾ']
        .some(dt => l.toUpperCase().includes(dt))
    );
    const headerEnd = docTypeLineIdx !== -1 ? docTypeLineIdx : Math.min(15, lines.length);
    const headerText = lines.slice(0, headerEnd).join('\n');

    const datePatterns = [
      /(?:ngày\s+)(\d{1,2})\s+tháng\s+(\d{1,2}|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s+năm\s+(\d{4})/i,
      /(?:ngày\s+)(\d{1,2})\s+[\/\-](\d{1,2})\s+[\/\-](\d{4})/i,
      /(?:ngày\s+)(\d{1,2})\.(\d{1,2})\.(\d{4})/i,
    ];
    for (const pattern of datePatterns) {
      const m = headerText.match(pattern);
      if (m) {
        const day = String(m[1]).padStart(2, '0');
        let month = m[2];
        const lower = month.toLowerCase();
        if (MONTH_NAMES[lower]) month = MONTH_NAMES[lower];
        const year = m[3];
        if (/^\d{1,2}$/.test(month)) {
          dateLetter = `${year}-${String(month).padStart(2, '0')}-${day}`;
          break;
        }
      }
    }
    if (!dateLetter) {
      const effDateMatch = r.text.trim().match(
        /(?:hiệu\s*lực\s*thi\s*hành\s*kể\s*từ\s*ngày\s*)(\d{1,2})\s+tháng\s+(\d{1,2}|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s+năm\s+(\d{4})/i,
      );
      if (effDateMatch) {
        const day = String(effDateMatch[1]).padStart(2, '0');
        let month = effDateMatch[2];
        const lower = month.toLowerCase();
        if (MONTH_NAMES[lower]) month = MONTH_NAMES[lower];
        const year = effDateMatch[3];
        if (/^\d{1,2}$/.test(month)) {
          dateLetter = `${year}-${String(month).padStart(2, '0')}-${day}`;
        }
      }
    }

    console.log(`${file}: documentNumber="${docNum || 'null'}" dateLetter="${dateLetter || 'null'}"`);
  }
}

main().catch(console.error);
