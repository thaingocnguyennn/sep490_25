/**
 * Two-column layout detector for Vietnamese administrative documents.
 *
 * Tesseract frequently merges the issuer column (left) with the national-
 * motto column (right) into a single OCR line. To correctly split them
 * we need to know:
 *   1. Whether the page has a two-column header at all.
 *   2. Where the column boundaries lie.
 *
 * Method: take all words in the top band of the first page (where the
 * header lives — y < 0.18), cluster their x-centres into 1-D bins,
 * then check whether the distribution is bimodal. When bimodal, the
 * valley between the modes gives the column split point.
 *
 * Why not just use Tesseract's PSM=3 column detection?
 *   PSM=3 sometimes correctly separates columns but more often
 *   produces a single text stream that we then have to post-split.
 *   Doing the split at our layer gives us access to per-word bounding
 *   boxes — which the field extractor needs anyway — and keeps the
 *   Tesseract path identical to the embedded-text path.
 *
 * Why not just hard-code x=0.50 as the boundary?
 *   Vietnamese admin headers are NOT centered at the page midpoint.
 *   The left column typically spans x ∈ [0.08, 0.50]; the right column
 *   spans x ∈ [0.52, 0.92]. The gap between them is small (~0.02-0.04
 *   of page width) and varies by issuer, so a hard-coded threshold
 *   is fragile. Detecting the split from the actual word distribution
 *   handles the variance automatically.
 */

import type { PageOcr } from './types';

/** Result of the column-detection step on the top header band. */
export interface ColumnLayout {
  /** Two-column detection result. `false` for single-column pages. */
  isTwoColumn: boolean;
  /** Detected column ranges. Always present; 1-element for single-column. */
  columns: Array<{ x0: number; x1: number; centerOfMass: number }>;
  /** Method that produced the result: "kmeans", "gap", or "single". */
  method: 'kmeans' | 'gap' | 'single';
}

/**
 * Detect whether the top-band header of `page` is two-column, and if
 * so return the column boundaries. Looks at y ∈ [0, TOP_BAND_MAX] only
 * so body text doesn't bias the detection.
 */
export function detectTopBandColumns(page: PageOcr, topBandMaxY = 0.18): ColumnLayout {
  const words = page.blocks
    .flatMap((b) => b.lines)
    .flatMap((l) => l.words)
    .filter((w) => {
      const t = w.text.trim();
      if (!t) return false;
      // Only consider the top band. Box 1 (motto) sits at y ≈ 0.05,
      // Box 2 (issuer) at y ≈ 0.08, Box 3 (doc-number) at y ≈ 0.10,
      // Box 4 (date) at y ≈ 0.13 — all within y < 0.18.
      return w.bbox.y0 < topBandMaxY;
    });

  if (words.length < 4) {
    return { isTwoColumn: false, columns: [{ x0: 0, x1: 1, centerOfMass: 0.5 }], method: 'single' };
  }

  // Collect word centre x-coordinates.
  const centres = words.map((w) => (w.bbox.x0 + w.bbox.x1) / 2);

  // Run a 2-mean 1-D clustering on the x-centres.
  const clusters = kmeans1D(centres, 2, 25);
  const [c0, c1] = clusters.sort((a, b) => a.center - b.center);

  // Single-column check: when the two cluster centres are within
  // 0.10 of each other, the distribution isn't bimodal — treat the
  // page as single-column.
  if (Math.abs(c1.center - c0.center) < 0.10) {
    return { isTwoColumn: false, columns: [{ x0: 0, x1: 1, centerOfMass: 0.5 }], method: 'single' };
  }

  // Header-presence check: a real two-column header always contains
  // national-motto vocabulary on the right column (CỘNG / HÒA / HỘI /
  // NGHĨA / VIỆT / NAM / ĐỘC / TỰ / HẠNH / PHÚC / etc.). When the
  // right column has zero of these markers, the bimodal distribution
  // is body-text noise (e.g. a page with one wide table), not a
  // Decree-30 header. Skip the column split in that case.
  const MOTTO_HINT = /(?:C[ÔOỘ]NG|CONG|H[OỜỘ]A|HOA|H[OỘ]I|HOI|CH[UỦ]\s*NGH|VI[ÊỆE]T|NAM|[ĐD][ỘO]C|T[ỰU]|H[ẠA]NH|PH[ÚU]C)/i;
  const rightColWords = words.filter((w) => {
    const cx = (w.bbox.x0 + w.bbox.x1) / 2;
    return cx > c1.center - 0.05;
  });
  const leftColWords = words.filter((w) => {
    const cx = (w.bbox.x0 + w.bbox.x1) / 2;
    return cx < c0.center + 0.05;
  });
  const hasMottoOnRight = rightColWords.some((w) => MOTTO_HINT.test(w.text));
  const hasIssuerOnLeft = leftColWords.some((w) => /[A-ZÀ-Ỹ]/.test(w.text) && w.text.length >= 2);
  if (!hasMottoOnRight || !hasIssuerOnLeft) {
    return { isTwoColumn: false, columns: [{ x0: 0, x1: 1, centerOfMass: 0.5 }], method: 'single' };
  }

  // Find the midpoint between the two cluster centres. That's our
  // column boundary. We refine it by picking the LARGEST empty gap
  // between adjacent x-centres in the band, which is where the
  // physical column separator lives.
  const sortedCentres = [...centres].sort((a, b) => a - b);
  let bestGap = 0;
  let bestBoundary = (c0.center + c1.center) / 2;
  for (let i = 0; i < sortedCentres.length - 1; i++) {
    const gap = sortedCentres[i + 1] - sortedCentres[i];
    if (gap > bestGap && sortedCentres[i] > c0.center && sortedCentres[i + 1] < c1.center) {
      bestGap = gap;
      bestBoundary = (sortedCentres[i] + sortedCentres[i + 1]) / 2;
    }
  }

  // Compute the column extents from the cluster membership.
  const leftExtent = clusterExtent(words, c0.center);
  const rightExtent = clusterExtent(words, c1.center);

  return {
    isTwoColumn: true,
    columns: [
      { x0: leftExtent.x0, x1: bestBoundary, centerOfMass: c0.center },
      { x0: bestBoundary, x1: rightExtent.x1, centerOfMass: c1.center },
    ],
    method: 'kmeans',
  };
}

/** Compute [min(x0), max(x1)] across words assigned to `clusterCenter`. */
function clusterExtent(words: PageOcr['blocks'][number]['lines'][number]['words'][number][], clusterCenter: number) {
  const assigned = words.filter((w) => {
    const cx = (w.bbox.x0 + w.bbox.x1) / 2;
    // Use the nearest cluster within a tolerance.
    return Math.abs(cx - clusterCenter) < 0.25;
  });
  if (assigned.length === 0) {
    return { x0: clusterCenter - 0.05, x1: clusterCenter + 0.05 };
  }
  let x0 = 1, x1 = 0;
  for (const w of assigned) {
    if (w.bbox.x0 < x0) x0 = w.bbox.x0;
    if (w.bbox.x1 > x1) x1 = w.bbox.x1;
  }
  return { x0, x1 };
}

/**
 * 1-D k-means clustering. Returns K clusters sorted by their centres.
 *
 * Used to detect the bimodal x-distribution of a two-column header.
 * Tolerant of empty input (returns a single cluster at 0.5).
 */
function kmeans1D(values: number[], k: number, maxIter = 25): Array<{ center: number; members: number[] }> {
  if (values.length === 0) {
    return [{ center: 0.5, members: [] }];
  }
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  // Initialise centres evenly across the range.
  const centres: number[] = [];
  for (let i = 0; i < k; i++) {
    centres.push(min + ((i + 0.5) * (max - min)) / k);
  }
  const assignments = new Array<number>(values.length).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    // Assign each value to its nearest centre.
    let changed = false;
    for (let i = 0; i < values.length; i++) {
      let best = 0;
      let bestDist = Math.abs(values[i] - centres[0]);
      for (let c = 1; c < k; c++) {
        const d = Math.abs(values[i] - centres[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed = true;
      }
    }
    // Recompute centres as the mean of their assigned values.
    for (let c = 0; c < k; c++) {
      const members = values.filter((_, i) => assignments[i] === c);
      if (members.length > 0) {
        centres[c] = members.reduce((s, v) => s + v, 0) / members.length;
      }
    }
    if (!changed) break;
  }
  const result: Array<{ center: number; members: number[] }> = [];
  for (let c = 0; c < k; c++) {
    result.push({
      center: centres[c],
      members: values.filter((_, i) => assignments[i] === c),
    });
  }
  return result;
}

/**
 * Assign a line to a column index based on its horizontal centre.
 *
 * Returns 0 for the left column, 1 for the right column, and -1 for
 * lines that fall outside both columns (e.g. a single-column body
 * line at the same y as the header).
 */
export function lineColumnIndex(
  line: { bbox: { x0: number; x1: number } },
  layout: ColumnLayout,
): number {
  if (!layout.isTwoColumn) return 0;
  const cx = (line.bbox.x0 + line.bbox.x1) / 2;
  const [left, right] = layout.columns;
  // Tolerance: ±0.02 of page width so a line that straddles the boundary
  // is assigned to the closer column.
  const leftDist = Math.abs(cx - (left.x0 + left.x1) / 2);
  const rightDist = Math.abs(cx - (right.x0 + right.x1) / 2);
  return rightDist < leftDist ? 1 : 0;
}

/**
 * Take a wide Tesseract line (issuer+motto fused) and split it into
 * the left-column and right-column halves using the detected column
 * layout. Words whose horizontal centre falls in the right column are
 * grouped together, all others are grouped on the left.
 *
 * Returns the two halves as `OcrLine`-shaped objects (text + bbox +
 * word list) so the field extractor can consume them as if Tesseract
 * had given us two lines instead of one.
 */
export function splitLineByColumns(
  line: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; words: any[]; confidence: number },
  layout: ColumnLayout,
): { left: { text: string; bbox: any; words: any[]; confidence: number }; right: { text: string; bbox: any; words: any[]; confidence: number } | null } {
  if (!layout.isTwoColumn) {
    return {
      left: { text: line.text, bbox: line.bbox, words: line.words, confidence: line.confidence },
      right: null,
    };
  }
  const [leftCol, rightCol] = layout.columns;
  const leftWords = line.words.filter((w) => {
    const cx = (w.bbox.x0 + w.bbox.x1) / 2;
    return cx < (leftCol.x1 + rightCol.x0) / 2;
  });
  const rightWords = line.words.filter((w) => {
    const cx = (w.bbox.x0 + w.bbox.x1) / 2;
    return cx >= (leftCol.x1 + rightCol.x0) / 2;
  });
  const joinWords = (ws: any[]): { text: string; bbox: any; words: any[]; confidence: number } => {
    if (ws.length === 0) {
      return { text: '', bbox: { x0: 0, y0: 0, x1: 0, y1: 0 }, words: [], confidence: 0 };
    }
    const sorted = [...ws].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const text = sorted.map((w) => w.text.trim()).filter(Boolean).join(' ');
    const x0 = Math.min(...sorted.map((w) => w.bbox.x0));
    const y0 = Math.min(...sorted.map((w) => w.bbox.y0));
    const x1 = Math.max(...sorted.map((w) => w.bbox.x1));
    const y1 = Math.max(...sorted.map((w) => w.bbox.y1));
    const confidence = sorted.reduce((s, w) => s + (w.confidence ?? 0), 0) / sorted.length;
    return { text, bbox: { x0, y0, x1, y1 }, words: sorted, confidence };
  };
  return {
    left: joinWords(leftWords),
    right: joinWords(rightWords),
  };
}