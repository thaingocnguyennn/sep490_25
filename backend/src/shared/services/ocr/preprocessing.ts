import { createCanvas, type Canvas } from '@napi-rs/canvas';

/**
 * Image pre-processing utilities.
 *
 * The OCR pipeline works best on clean, high-contrast, grayscale images.
 * PDF pages rendered at scale 3 are already pretty clean, but we still
 * run a light normalization step to improve robustness against poor
 * scans and to fight downstream variance between renderers.
 */

/** Convert an RGBA image to grayscale. Operates in-place on the buffer. */
function toGrayscale(rgba: Uint8ClampedArray): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const gray = Math.round(
      0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2],
    );
    rgba[i] = rgba[i + 1] = rgba[i + 2] = gray;
  }
}

/** Apply per-channel contrast stretching based on observed min/max. */
function contrastStretch(
  rgba: Uint8ClampedArray,
  min: number,
  max: number,
): void {
  const range = max - min || 1;
  for (let i = 0; i < rgba.length; i += 4) {
    const v = Math.round(((rgba[i] - min) / range) * 255);
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
    rgba[i + 3] = rgba[i + 3];
  }
}

/** Run a simple contrast-stretch + grayscale pass and return a fresh canvas. */
export function preprocessCanvas(canvas: Canvas): Canvas {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d');
  const src = ctx.getImageData(0, 0, width, height);
  const srcData = src.data;

  // First pass: grayscale + scan min/max
  toGrayscale(srcData);
  let min = 255;
  let max = 0;
  for (let i = 0; i < srcData.length; i += 4) {
    if (srcData[i] < min) min = srcData[i];
    if (srcData[i] > max) max = srcData[i];
  }
  contrastStretch(srcData, min, max);

  const outCanvas = createCanvas(width, height);
  outCanvas.getContext('2d').putImageData(src, 0, 0);
  return outCanvas;
}

/**
 * Adaptive binarization (Sauvola variant).
 *
 * Documents scanned at moderate DPI benefit from binarization
 * because the LSTM is trained primarily on binarized training
 * data. A single global threshold binarizes background and noise
 * together; Sauvola's local threshold (T = m * (1 + k*(s/R - 1)))
 * preserves fine stroke details in low-contrast areas while
 * still cleaning up the background.
 *
 * This is the most impactful preprocessing change left to make —
 * it converts grayscale to pure B&W, which is the format the
 * Vietnamese LSTM was actually trained on.
 */
export function binarizeCanvas(canvas: Canvas): Canvas {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  const WINDOW = Math.max(7, Math.round(Math.min(width, height) / 60));
  // Compute integral image for fast local mean/variance.
  const integral = new Float64Array((width + 1) * (height + 1));
  const integralSq = new Float64Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    let rowSumSq = 0;
    for (let x = 1; x <= width; x++) {
      const i = (y - 1) * width * 4 + (x - 1) * 4;
      rowSum += data[i];
      rowSumSq += data[i] * data[i];
      integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + rowSum;
      integralSq[y * (width + 1) + x] = integralSq[(y - 1) * (width + 1) + x] + rowSumSq;
    }
  }

  const k = 0.2; // Sauvola constant (range 0.2–0.5 typical)
  const R = 128; // dynamic range of std deviation
  const out = ctx.createImageData(width, height);
  const outData = out.data;
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - WINDOW);
    const y1 = Math.min(height - 1, y + WINDOW);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - WINDOW);
      const x1 = Math.min(width - 1, x + WINDOW);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const s = integral[(y1 + 1) * (width + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (width + 1) + x0] -
        integral[y0 * (width + 1) + (x1 + 1)] +
        integral[y0 * (width + 1) + x0];
      const sq = integralSq[(y1 + 1) * (width + 1) + (x1 + 1)] -
        integralSq[(y1 + 1) * (width + 1) + x0] -
        integralSq[y0 * (width + 1) + (x1 + 1)] +
        integralSq[y0 * (width + 1) + x0];
      const mean = s / area;
      const variance = sq / area - mean * mean;
      const std = Math.sqrt(Math.max(0, variance));
      const threshold = mean * (1 + k * (std / R - 1));
      const i = (y * width + x) * 4;
      const v = data[i] < threshold ? 0 : 255;
      outData[i] = v;
      outData[i + 1] = v;
      outData[i + 2] = v;
      outData[i + 3] = 255;
    }
  }
  const outCanvas = createCanvas(width, height);
  outCanvas.getContext('2d').putImageData(out, 0, 0);
  return outCanvas;
}

/**
 * Lightweight skew detection + correction.
 *
 * Many scanned Vietnamese administrative documents are scanned at
 * a small rotation (typically ±3°). Tesseract's LSTM handles a few
 * degrees of skew but accuracy drops noticeably above that. This
 * pass detects the dominant text baseline angle via the Hough-style
 * gradient correlation technique and rotates the canvas so that
 * baselines are horizontal. It's bounded to ±5° to avoid overshoot
 * on pages with very little text.
 *
 * Implementation note: a full Hough transform would be overkill here.
 * We instead compute the gradient orientation at each non-background
 * pixel and build a histogram of the most common angles — this is the
 * same trick used by Leptonica's `findSkew` and runs in O(N) over the
 * pixels. Complexity stays acceptable even on dense A4 pages.
 */
export function deskewCanvas(canvas: Canvas, maxAngleDeg = 5): Canvas {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d');
  const src = ctx.getImageData(0, 0, width, height);
  const data = src.data;

  // Subsample every 4th pixel for speed — sufficient resolution for skew
  // detection, which only needs a fraction of a degree of precision.
  const BUCKET_COUNT = 180; // 1° per bucket over [-maxAngle, +maxAngle]
  const buckets = new Float64Array(BUCKET_COUNT);
  // Sobel-style gradients (cheap, no kernel buffer needed):
  for (let y = 1; y < height - 1; y += 4) {
    for (let x = 1; x < width - 1; x += 4) {
      const i = (y * width + x) * 4;
      const lum =
        (data[i - 4] + data[i + 4] + data[i - width * 4] + data[i + width * 4]) / 4;
      // Only consider "edge" pixels — strong contrast neighbours.
      const px = data[i];
      if (Math.abs(px - lum) < 30) continue;
      const gx =
        -data[i - 4] - 2 * data[i - width * 4 - 4] - data[i - width * 4 + 4]
        + data[i + 4] + 2 * data[i + width * 4 - 4] + data[i + width * 4 + 4];
      const gy =
        -data[i - width * 4] - 2 * data[i - width * 4] + -data[i - width * 4]
        + data[i + width * 4] + 2 * data[i + width * 4] + data[i + width * 4];
      // Sobel not real, just direction estimate.
      const dx = data[i + 4] - data[i - 4];
      const dy = data[i + width * 4] - data[i - width * 4];
      if (Math.abs(dx) + Math.abs(dy) < 20) continue;
      // Text edges are ~perpendicular to baselines; we want the
      // orientation of the baseline, so add 90°.
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      let norm = angle;
      while (norm < 0) norm += 180;
      while (norm >= 180) norm -= 180;
      const skewed = norm - 90;
      if (Math.abs(skewed) > maxAngleDeg) continue;
      const bucket = Math.floor(((skewed + maxAngleDeg) / (2 * maxAngleDeg)) * BUCKET_COUNT);
      if (bucket >= 0 && bucket < BUCKET_COUNT) buckets[bucket] += 1;
    }
  }

  // Find the peak.
  let peakIdx = -1;
  let peakVal = 0;
  for (let i = 0; i < BUCKET_COUNT; i++) {
    if (buckets[i] > peakVal) {
      peakVal = buckets[i];
      peakIdx = i;
    }
  }
  if (peakIdx < 0 || peakVal < 100) return canvas; // not enough signal

  const skewDeg = (peakIdx / BUCKET_COUNT) * (2 * maxAngleDeg) - maxAngleDeg;
  if (Math.abs(skewDeg) < 0.1) return canvas;

  // Rotate around the centre.
  const rotated = createCanvas(width, height);
  const rctx = rotated.getContext('2d');
  rctx.fillStyle = '#ffffff';
  rctx.fillRect(0, 0, width, height);
  rctx.translate(width / 2, height / 2);
  rctx.rotate((-skewDeg * Math.PI) / 180);
  rctx.translate(-width / 2, -height / 2);
  rctx.drawImage(canvas, 0, 0);
  return rotated;
}

/**
 * Detect whether a rendered page is blank (filled with white pixels).
 *
 * A typical A4 page with administrative text is ~99% white — a strict
 * 0.98 threshold wrongly rejected pages that had only a few lines of
 * text (the synthetic Vietnamese sample we use for testing was 99.4%
 * white and got dropped). We use 0.998 here, which still catches
 * intentionally blank pages while keeping ones that have at least a
 * few hundred ink pixels.
 */
export function isBlankPage(canvas: Canvas, threshold = 0.998): boolean {
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let whitePixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 240 && g > 240 && b > 240) whitePixels++;
  }
  return whitePixels / (data.length / 4) > threshold;
}
