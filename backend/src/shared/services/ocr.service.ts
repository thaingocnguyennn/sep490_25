import Tesseract, { createWorker, Worker } from 'tesseract.js';
import { AppError } from '../../shared/exceptions/app-error';
import { PDFParse } from 'pdf-parse';
import * as path from 'path';
import * as fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist';
import { createCanvas, loadImage, Canvas, CanvasRenderingContext2D } from 'canvas';
import { fromPath } from 'pdf2pic';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  path.resolve(__dirname, '../../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs');

export interface OcrResult {
  text: string;
  confidence: number;
}

export interface ExtractedFields {
  issuer?: string;
  recipientName?: string;
  documentNumber?: string;
  dateLetter?: string;
  documentType?: string;
  summary?: string;
  pageCount?: string;
  signerName?: string;
  signerTitle?: string;
}

const SUPPORTED_TYPES = [
  'image/png', 'image/jpeg', 'image/jpg', 'image/tiff',
  'image/bmp', 'image/webp', 'application/pdf',
];

const DOC_TYPES = [
  'QUYẾT ĐỊNH', 'CÔNG VĂN', 'THÔNG BÁO', 'TỜ TRÌNH', 'BÁO CÁO',
  'QUY ĐỊNH', 'QUY TRÌNH', 'CHỈ THỊ', 'KẾ HOẠCH', 'HƯỚNG DẪN',
  'NGHỊ ĐỊNH', 'LUẬT', 'NGHỊ QUYẾT', 'CHƯƠNG TRÌNH',
  'GIẤY ỦY QUYỀN', 'HỢP ĐỒNG', 'BIÊN BẢN', 'QUY CHẾ',
];

const TITLE_KEYWORDS = [
  'PHÓ CHỦ TỊCH', 'CHỦ TỊCH', 'GIÁM ĐỐC', 'TRƯỞNG PHÒNG',
  'THỦ TRƯỞNG', 'HIỆU TRƯỞNG', 'TỔNG GIÁM ĐỐC', 'PHÓ GIÁM ĐỐC',
  'CỤC TRƯỞNG', 'VỤ TRƯỞNG', 'BỘ TRƯỞNG', 'THỨ TRƯỞNG',
];

const MONTH_NAMES: Record<string, string> = {
  một: '01', hai: '02', ba: '03', bốn: '04', năm: '05',
  sáu: '06', bảy: '07', tám: '08', chín: '09', mười: '10',
};

const SIGNER_SKIP_PREFIXES = /^(tm|kt|phó\s*chủ\s*tịch|chủ\s*tịch|uỷ\s*ban|nhân\s*dân|ủy\s*ban|vp|văn\s*phòng|p\d+|_+)\s*\.?\s*.*$/i;

// ─── Image preprocessing ──────────────────────────────────────────────────────

function preprocessCanvas(canvas: Canvas): Canvas {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  const src = ctx.getImageData(0, 0, width, height);
  const srcData = src.data;

  const out = ctx.createImageData(width, height);
  const outData = out.data;

  let min = 255, max = 0;

  for (let i = 0; i < srcData.length; i += 4) {
    const gray = Math.round(0.299 * srcData[i] + 0.587 * srcData[i + 1] + 0.114 * srcData[i + 2]);
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }

  const range = max - min || 1;

  for (let i = 0; i < srcData.length; i += 4) {
    const gray = Math.round(0.299 * srcData[i] + 0.587 * srcData[i + 1] + 0.114 * srcData[i + 2]);
    const normalized = Math.round(((gray - min) / range) * 255);
    outData[i] = outData[i + 1] = outData[i + 2] = normalized;
    outData[i + 3] = srcData[i + 3];
  }

  const outCanvas = createCanvas(width, height);
  outCanvas.getContext('2d').putImageData(out, 0, 0);
  return outCanvas;
}

// ─── PDF rendering ─────────────────────────────────────────────────────────────

const TEMP_DIR = path.resolve(__dirname, '../../../temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  reset(canvasAndContext: { canvas: Canvas; context: CanvasRenderingContext2D }, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: { canvas: Canvas; context?: CanvasRenderingContext2D }) {
    canvasAndContext.canvas.width = 1;
    canvasAndContext.canvas.height = 1;
    canvasAndContext.canvas.getContext('2d')?.clearRect(0, 0, 1, 1);
  }
}

async function renderPageToImage(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  scale: number,
): Promise<{ canvas: Canvas; width: number; height: number } | null> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvasFactory = new NodeCanvasFactory();
  const canvasAndContext = canvasFactory.create(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height)
  );

  canvasAndContext.context.fillStyle = '#ffffff';
  canvasAndContext.context.fillRect(0, 0, canvasAndContext.canvas.width, canvasAndContext.canvas.height);

  try {
    await page.render({
      canvasContext: canvasAndContext.context,
      viewport,
      canvas: canvasAndContext.canvas,
    }).promise;
  } catch (err) {
    canvasFactory.destroy(canvasAndContext);
    return null;
  }

  return {
    canvas: canvasAndContext.canvas,
    width: canvasAndContext.canvas.width,
    height: canvasAndContext.canvas.height,
  };
}

async function renderPageWithPdf2Pic(
  pdfBuffer: Buffer,
  pageNum: number,
  scale: number,
): Promise<{ canvas: Canvas; width: number; height: number } | null> {
  const tmpPath = path.join(TEMP_DIR, `ocr_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  const outputName = `ocr_page_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  const outputPath = path.join(TEMP_DIR, outputName);

  try {
    fs.writeFileSync(tmpPath, pdfBuffer);

    const converter = fromPath(tmpPath, {
      density: Math.round(150 * scale),
      saveFilename: path.basename(outputPath, path.extname(outputPath)),
      savePath: TEMP_DIR,
      format: 'jpg',
      quality: 90,
      width: Math.round(2480 * scale / 3),
      height: Math.round(3508 * scale / 3),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (converter as any)(pageNum) as { path: string } | false;

    if (!result || !result.path) return null;

    const imgBuffer = fs.readFileSync(result.path);
    const img = await loadImage(imgBuffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    return { canvas, width: canvas.width, height: canvas.height };
  } catch (err) {
    console.error(`pdf2pic fallback failed for page ${pageNum}:`, err);
    return null;
  } finally {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch { /* ignore cleanup errors */ }
  }
}

function isBlankPage(canvas: Canvas, threshold = 0.98): boolean {
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let whitePixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const isWhite = r > 240 && g > 240 && b > 240;
    if (isWhite) whitePixels++;
  }
  return whitePixels / (data.length / 4) > threshold;
}

// ─── OCR with shared worker ────────────────────────────────────────────────────

let sharedWorker: Worker | null = null;

async function getSharedWorker(): Promise<Worker> {
  if (!sharedWorker) {
    sharedWorker = await createWorker('eng+vie', 1, {
      logger: () => {},
    });
  }
  return sharedWorker;
}

async function recognizeImage(
  canvas: Canvas,
  preprocess: boolean,
): Promise<{ text: string; confidence: number }> {
  const processedCanvas = preprocess ? preprocessCanvas(canvas) : canvas;
  const buffer = processedCanvas.toBuffer('image/png');
  const worker = await getSharedWorker();
  const result = await worker.recognize(buffer);
  return { text: result.data.text, confidence: result.data.confidence };
}

// ─── Garbled text detection ───────────────────────────────────────────────────

function isTextGarbled(text: string): boolean {
  if (!text || text.trim().length === 0) return true;
  if (text.length > 50000) return true;

  const weirdChars = (text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
  if (text.length > 0 && weirdChars / text.length > 0.05) return true;

  const vietnameseChars = (text.match(/[À-ỹ]/gi) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  if (latinChars > 0 && vietnameseChars / latinChars < 0.05) return true;

  return false;
}

// ─── Main OCR entry ───────────────────────────────────────────────────────────

export async function performOcr(imageBuffer: Buffer, mimeType: string): Promise<OcrResult> {
  if (!SUPPORTED_TYPES.includes(mimeType)) {
    throw new AppError(
      400,
      `Unsupported file type for OCR: ${mimeType}. Supported: PNG, JPEG, TIFF, BMP, WebP, PDF.`,
    );
  }

  if (mimeType !== 'application/pdf') {
    return runOcrOnImage(imageBuffer);
  }

  return runOcrOnPdf(imageBuffer);
}

async function runOcrOnImage(buffer: Buffer): Promise<OcrResult> {
  try {
    const img = await loadImage(buffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const processed = preprocessCanvas(canvas);
    const { text, confidence } = await recognizeImage(processed, false);
    return { text, confidence };
  } catch (error) {
    throw new AppError(500, 'OCR processing failed', error);
  }
}

async function runOcrOnPdf(pdfBuffer: Buffer): Promise<OcrResult> {
  const parser = new PDFParse({ data: pdfBuffer });
  const textResult = await parser.getText();
  const embeddedText = textResult.text.trim();

  if (!isTextGarbled(embeddedText)) {
    const fields = extractFieldsFromOcrText(embeddedText);
    if (fields.documentNumber && fields.dateLetter) {
      return { text: embeddedText, confidence: 100 };
    }
  }

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;
  const SCALE = 3.0;

  const targetPages = totalPages === 1 ? [1] : [1, totalPages];

  const pageTexts: string[] = [];
  let totalConfidence = 0;
  let pagesProcessed = 0;

  for (const pageNum of targetPages) {
    try {
      let result = await renderPageToImage(pdfDoc, pageNum, SCALE);
      if (!result) {
        result = await renderPageWithPdf2Pic(pdfBuffer, pageNum, SCALE);
      }
      if (!result) continue;

      const { canvas } = result;
      if (isBlankPage(canvas)) continue;

      const { text, confidence } = await recognizeImage(canvas, true);

      if (text.trim().length >= 10) {
        pageTexts.push(text);
        totalConfidence += confidence;
        pagesProcessed++;
      }
    } catch (err) {
      console.error(`Page ${pageNum} failed:`, err);
    }
  }

  if (pageTexts.length === 0) {
    if (embeddedText.trim().length >= 10) {
      return { text: embeddedText, confidence: 50 };
    }
    throw new AppError(400, 'No readable text found on first or last page.');
  }

  return {
    text: pageTexts.join('\n'),
    confidence: pagesProcessed > 0 ? totalConfidence / pagesProcessed : 0,
  };
}

// ─── Field extraction ─────────────────────────────────────────────────────────

export function extractFieldsFromOcrText(ocrText: string, mode: string = 'INCOMING'): ExtractedFields {
  const fields: ExtractedFields = {};
  if (!ocrText || ocrText.trim().length === 0) return fields;

  const rawLines = ocrText.split('\n');
  const lines = rawLines.map((l) => l.trim()).filter(Boolean);

  // 1. Cơ quan ban hành (INCOMING) hoặc Nơi nhận (OUTGOING)
  if (mode === 'OUTGOING') {
    const linesLower = lines.map(l => l.toLowerCase());
    const kinhGuiIdx = linesLower.findIndex(l => l.includes('kính gửi'));
    if (kinhGuiIdx !== -1) {
      const textAfter = lines[kinhGuiIdx].replace(/kính\s*gửi\s*[:-]?\s*/i, '').trim();
      if (textAfter) {
        fields.recipientName = textAfter;
      } else if (kinhGuiIdx + 1 < lines.length) {
        fields.recipientName = lines[kinhGuiIdx + 1].replace(/^[-\+\*\.]\s*/, '').trim();
      }
    }
  } else {
    const orgLines: string[] = [];
    for (let i = 0; i < Math.min(12, lines.length); i++) {
      const l = lines[i];
      if (/\d/.test(l)) break;
      if (/^[,.\-–—:;_]+$/.test(l)) continue;
      if (l.length < 4) continue;
      if (!/[a-zA-ZÀ-ỹ]/.test(l)) continue;
      orgLines.push(l);
      if (orgLines.length === 2) break;
    }
    if (orgLines.length > 0) {
      fields.issuer = orgLines.join(' ');
    }
  }

  // 2. Số ký hiệu
  // Supported formats (all using / as separator, some with - between type and org):
  //   61/QĐ-UBND   123/CV-SGDĐT   03/TB-VP   15/KH-UBND   456/BC-BYT
  // Handle OCR spacing errors such as "61 / QĐ - UBND" or "123 /CV-SGDĐT"
  {
    const soLineIdx = lines.findIndex((l) => /^số\s*[:.\s]/i.test(l));
    if (soLineIdx !== -1) {
      const raw = lines[soLineIdx];

      // Normalize all spacing around "/" and "-" to single chars
      const normalized = raw
        .replace(/\s*\/\s*/g, '/')
        .replace(/\s*-\s*/g, '-');

      // Extract everything from the first "/" to the end of the identifier.
      // Stop at the first space followed by a non-word char or whitespace,
      // or at a line break.
      const slashPos = normalized.indexOf('/');
      if (slashPos !== -1) {
        let endPos = slashPos + 1;
        while (
          endPos < normalized.length &&
          /[A-Za-zÀ-ỹ0-9\/\-.]/.test(normalized[endPos])
        ) {
          endPos++;
        }

        let v = normalized.slice(slashPos, endPos).trim();

        // Strip leading "/" that was image-rendered as a separator
        if (/^\/[0-9]/.test(v)) v = v.replace(/^\/+/, '');

        // Validate: must contain at least one "/" and follow a recognisable pattern
        if (v && v.length >= 4 && /\//.test(v)) {
          // Reject lines that are clearly not doc numbers (e.g. plain URLs, paths)
          const parts = v.split('/');
          if (parts.length >= 2) {
            const lastPart = parts[parts.length - 1];
            // Last segment must be non-empty and contain at least one letter
            if (lastPart.length > 0 && /[A-Za-zÀ-ỹ]/.test(lastPart)) {
              // Normalise any residual internal spaces (e.g. "QĐ UBND" → "QĐ-UBND"
              // where a hyphen is implied by OCR artefacts)
              v = v.replace(/\s+/g, '');
              fields.documentNumber = v;
            }
          }
        }
      }
    }
  }

  // 3. Ngày ban hành — output format: dd/MM/yyyy
  // NOTE: if the day number is rendered as an image (invisible to text extraction),
  // text-only patterns will NOT find it. Fall back to the effective date if available.
  {
    const docTypeLineIdx = lines.findIndex((l) =>
      ['QUYẾT ĐỊNH', 'CÔNG VĂN', 'THÔNG BÁO', 'TỜ TRÌNH', 'BÁO CÁO',
        'QUY ĐỊNH', 'CHỈ THỊ', 'KẾ HOẠCH', 'HƯỚNG DẪN',
        'QUY CHẾ',
      ].some((dt) => l.toUpperCase().includes(dt)),
    );
    const headerEnd = docTypeLineIdx !== -1 ? docTypeLineIdx : Math.min(15, lines.length);
    const headerText = lines.slice(0, headerEnd).join('\n');

    // Normalise all whitespace within the date portion of the header
    const dateSearchText = headerText.replace(/(\d)\s+(\d)/g, '$1$2');

    // Patterns for:
    //   ngày 26 tháng 5 năm 2026
    //   ngày 26/05/2026
    //   ngày 26-05-2026
    //   ngày 26.05.2026
    const datePatterns = [
      /(?:ngày\s+)(\d{1,2})\s+tháng\s+(\d{1,2}|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s+năm\s+(\d{4})/i,
      /(?:ngày\s+)(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/i,
    ];
    for (const pattern of datePatterns) {
      const m = dateSearchText.match(pattern);
      if (m) {
        const day = String(m[1]).padStart(2, '0');
        let month = m[2];
        const lower = month.toLowerCase();
        if (MONTH_NAMES[lower]) month = MONTH_NAMES[lower];
        const year = m[3];
        if (/^\d{1,2}$/.test(month)) {
          fields.dateLetter = `${day}/${String(month).padStart(2, '0')}/${year}`;
          break;
        }
      }
    }

    // Fallback: look for effective date "Quyết định này có hiệu lực thi hành kể từ ngày X tháng Y năm Z"
    if (!fields.dateLetter) {
      const effDateSearch = ocrText.replace(/(\d)\s+(\d)/g, '$1$2');
      const effDateMatch = effDateSearch.match(
        /(?:hiệu\s*lực\s*thi\s*hành\s*kể\s*từ\s*ngày\s*)(\d{1,2})\s+tháng\s+(\d{1,2}|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s+năm\s+(\d{4})/i,
      );
      if (effDateMatch) {
        const day = String(effDateMatch[1]).padStart(2, '0');
        let month = effDateMatch[2];
        const lower = month.toLowerCase();
        if (MONTH_NAMES[lower]) month = MONTH_NAMES[lower];
        const year = effDateMatch[3];
        if (/^\d{1,2}$/.test(month)) {
          fields.dateLetter = `${day}/${String(month).padStart(2, '0')}/${year}`;
        }
      }
    }
  }

  // 4. Loại văn bản
  {
    for (const dt of DOC_TYPES) {
      const idx = lines.findIndex((l) => l.includes(dt) || l === dt);
      if (idx !== -1) {
        fields.documentType = dt;
        break;
      }
    }
  }

  // 5. Trích yếu
  {
    const docTypeLineIdx = lines.findIndex((l) =>
      ['QUYẾT ĐỊNH', 'CÔNG VĂN', 'THÔNG BÁO', 'TỜ TRÌNH', 'BÁO CÁO',
        'QUY ĐỊNH', 'CHỈ THỊ', 'KẾ HOẠCH', 'HƯỚNG DẪN',
        'QUY CHẾ',
      ].some((dt) => l.toUpperCase().includes(dt)),
    );
    if (docTypeLineIdx !== -1 && docTypeLineIdx + 1 < lines.length) {
      const summaryLines: string[] = [];
      for (let i = docTypeLineIdx + 1; i < lines.length; i++) {
        const l = lines[i];
        if (/^căn\s+cứ/i.test(l)) break;
        if (/^theo\s+đề\s+nghị/i.test(l)) break;
        if (/^(điều\s+\d|chương\s+\d|mục\s+\d)\b/i.test(l)) break;
        if (/^chương\s+[ivx\d]/i.test(l)) break;
        if (/^[IVXLC]+\.\s+/i.test(l)) break;
        if (/^[A-ZÀ-ỸĐ][^.!?\n]{0,30}\s*\.\s*\d+[\.\)]\s/i.test(l)) break;
        if (/^phần\s+\d/i.test(l)) break;
        if (/ban\s+hành\s+(kế\s+hoạch|quy\s+định|quy\s+chế|chỉ\s+thị)\s+này/i.test(l)) break;
        if (/^[\d]+\s+(nội\s*dung|mục\s*đích|yêu\s*cầu|phạm\s*vi|đối\s*tượng|thời\s*gian|địa\s*điểm|tổ\s*chức|kinh\s*phí|thực\s*hiện)/i.test(l)) break;
        if (/^[\d]+[\.\)]\s+(thực\s*hiện|triển\s*khai|tổ\s*chức|phát\s*động|thăm|tặng|nâng\s*cấp|tuyên\s*truyền|mục\s+đích|yêu\s+cầu)/i.test(l)) break;
        if (/^(\*|-|·)\s+tháng\s/i.test(l)) break;
        if (l.length > 3 && /^[\d]+[\.\)]\s+[a-zà-ỹ]/.test(l)) break;
        if (l.length > 10 && !/^[\d\s\-\–]+$/.test(l)) {
          summaryLines.push(l);
        }
        if (summaryLines.length >= 3) break;
      }
      if (summaryLines.length > 0) {
        fields.summary = summaryLines.join(' ').trim();
      }
    }
  }

  // 6. Số trang
  {
    const pageMatch = ocrText.match(/--\s*(\d+)\s+of\s+(\d+)\s*--/);
    if (pageMatch) fields.pageCount = pageMatch[2];
  }

  // 7. Người ký
  // Accepts three case formats:
  //   NGUYỄN VĂN A  (all-caps, common in formal documents)
  //   Nguyễn Văn A  (title-case)
  //   nguyễn văn a  (all-lowercase OCR artefacts)
  // Prioritises the signature area — bottom 30 lines of the document.
  // Skips organisation names, title lines, and common false positives.
  {
    const PAGE_SIG_LINES = 30;

    // 7a. Signature area (bottom of page)
    const sigLines = lines.slice(-PAGE_SIG_LINES);

    // Patterns for each casing variant
    const namePatterns = [
      // NGUYỄN VĂN A — all uppercase letters only
      /^[A-ZÀ-Ỹ]+(\s+[A-ZÀ-Ỹ]+){1,4}$/,
      // Nguyễn Văn A — title-case (first letter uppercase, rest lowercase)
      /^[A-ZÀ-Ỹ][a-zà-ỹ]+(\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){1,4}$/,
      // nguyễn văn a — all lowercase (OCR artefacts)
      /^[a-zà-ỹ]+(\s+[a-zà-ỹ]+){1,4}$/,
    ];

    for (const line of sigLines) {
      const t = line.trim();
      if (t.length < 5) continue;
      if (SIGNER_SKIP_PREFIXES.test(t)) continue;
      // Skip lines that contain organisation or title keywords
      if (/^(cộng\s*hòa|tp|thành\s*phố|quận|huyện|xã|phường|bộ|ban|nhân\s*dân|uỷ\s*ban|văn\s*phòng|sở|tổ\s*chức|chi\s*bộ)/i.test(t)) continue;
      // Skip lines with numbers or punctuation-heavy content
      if (/\d{4,}/.test(t)) continue;
      if (/^[^\w]*[^\w]$/.test(t)) continue;
      for (const pat of namePatterns) {
        if (pat.test(t)) {
          fields.signerName = t;
          break;
        }
      }
      if (fields.signerName) break;
    }

    // 7b. Broader fallback — scan full document if nothing found in signature area
    if (!fields.signerName) {
      for (const line of lines) {
        const t = line.trim();
        if (t.length < 5) continue;
        if (SIGNER_SKIP_PREFIXES.test(t)) continue;
        if (/^(cộng\s*hòa|tp|thành\s*phố|quận|huyện|xã|phường|bộ|ban|nhân\s*dân|uỷ\s*ban|văn\s*phòng|sở|tổ\s*chức|chi\s*bộ)/i.test(t)) continue;
        if (/\d{4,}/.test(t)) continue;
        for (const pat of namePatterns) {
          if (pat.test(t)) {
            fields.signerName = t;
            break;
          }
        }
        if (fields.signerName) break;
      }
    }
  }

  // 8. Chức vụ
  {
    if (fields.signerName) {
      const sigIdx = lines.findIndex((l) => l === fields.signerName);
      if (sigIdx !== -1) {
        for (let i = sigIdx - 1; i >= Math.max(0, sigIdx - 8); i--) {
          const upper = lines[i].toUpperCase();
          for (const kw of TITLE_KEYWORDS) {
            if (upper.includes(kw)) {
              fields.signerTitle = kw;
              break;
            }
          }
          if (fields.signerTitle) break;
        }
      }
    }
    if (!fields.signerTitle) {
      for (const line of lines.slice(-25)) {
        const upper = line.toUpperCase();
        for (const kw of TITLE_KEYWORDS) {
          if (upper.includes(kw)) {
            fields.signerTitle = kw;
            break;
          }
        }
        if (fields.signerTitle) break;
      }
    }
  }

  return fields;
}

// ─── Cleanup worker on process exit ────────────────────────────────────────────

process.on('exit', () => {
  sharedWorker?.terminate();
});
