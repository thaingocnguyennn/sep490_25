import { createCanvas, type Canvas } from '@napi-rs/canvas';
import type { NormalizedBBox, OcrLine } from './types';

// Canvas helpers. cropCanvas() extracts a sub-rectangle and returns a new
// canvas; coordinates are in pixels. normalizedCrop() takes a NormalizedBBox
// (in [0,1] page coordinates) and returns a cropped canvas.

export function cropCanvas(src: Canvas, x: number, y: number, w: number, h: number): Canvas {
  const dst = createCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const ctx = dst.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dst.width, dst.height);
  ctx.drawImage(src, x, y, w, h, 0, 0, dst.width, dst.height);
  return dst;
}

export function normalizedCrop(src: Canvas, bbox: NormalizedBBox): Canvas {
  const x = Math.round(bbox.x0 * src.width);
  const y = Math.round(bbox.y0 * src.height);
  const w = Math.round((bbox.x1 - bbox.x0) * src.width);
  const h = Math.round((bbox.y1 - bbox.y0) * src.height);
  return cropCanvas(src, x, y, w, h);
}

/** Inflate a normalized bbox by a relative margin on every side. */
export function expandBBox(bbox: NormalizedBBox, margin: number): NormalizedBBox {
  return {
    x0: Math.max(0, bbox.x0 - margin),
    y0: Math.max(0, bbox.y0 - margin),
    x1: Math.min(1, bbox.x1 + margin),
    y1: Math.min(1, bbox.y1 + margin),
  };
}

/** Union of all lines' bounding boxes, in normalized page coords. */
export function unionLines(lines: OcrLine[]): NormalizedBBox {
  if (lines.length === 0) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of lines) {
    if (l.bbox.x0 < x0) x0 = l.bbox.x0;
    if (l.bbox.y0 < y0) y0 = l.bbox.y0;
    if (l.bbox.x1 > x1) x1 = l.bbox.x1;
    if (l.bbox.y1 > y1) y1 = l.bbox.y1;
  }
  return { x0, y0, x1, y1 };
}