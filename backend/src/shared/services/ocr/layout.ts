import type {
  BoxRegion,
  OcrBlock,
  OcrLine,
  OcrWord,
  PageOcr,
  RegionMatch,
} from './types';
import {
  BOX_VERTICAL_HINT,
  BOX_HORIZONTAL_HINT,
  DECREE_30_REGIONS,
} from './constants';

/**
 * Layout analysis based on Decree 30/2020/NĐ-CP.
 *
 * Vietnamese administrative documents have a fixed-position layout
 * (decree-mandated). The boxes referenced here correspond to the
 * numbered boxes defined by the decree. Instead of looking at line
 * order, the field-extraction pipeline relies on these regions:
 *
 *   - words/blocks inside a region are collected greedily;
 *   - ordering is by vertical position then horizontal position;
 *   - textual regexes are only applied as a final validation pass.
 */

/**
 * Group OCR words by line so callers can iterate line-by-line in
 * correct reading order without re-doing the work.
 */
export function groupWordsByLine(page: PageOcr): OcrLine[] {
  return page.blocks.flatMap((b) => b.lines);
}

/** Lines ordered top-to-bottom then left-to-right. */
export function linesInReadingOrder(page: PageOcr): OcrLine[] {
  const lines = groupWordsByLine(page);
  return [...lines].sort((a, b) => {
    const dy = a.bbox.y0 - b.bbox.y0;
    if (Math.abs(dy) > 0.005) return dy;
    return a.bbox.x0 - b.bbox.x0;
  });
}

/** All words on a page in reading order. */
export function wordsInReadingOrder(page: PageOcr): OcrWord[] {
  return linesInReadingOrder(page).flatMap((l) => l.words);
}

/**
 * Approximate vertical band check for a given region. The bands
 * are coarse: they express "this region is the top of the page" or
 * "this region is the signature area near the bottom".
 */
export function isInVerticalBand(
  y: number,
  regionCode: string,
  tolerance = 0.10,
): boolean {
  const center = BOX_VERTICAL_HINT[regionCode];
  if (center === undefined) return true; // No constraint, accept anywhere.
  return Math.abs(y - center) <= tolerance;
}

/**
 * Collect every line in a page whose bounding box falls inside the
 * approximate vertical band of the supplied region. The selection is
 * coarse on purpose: it is the *primary* filter; region.match()
 * tightens the result.
 *
 * Tolerance per region: some regions (title 5a) span a wide vertical
 * range, while others (Box 3 doc number, Box 4 date) need a tight
 * band so they don't bleed into body text that happens to mention
 * "số X/QĐ-UBND" or "ngày …".
 */
export function linesInVerticalBand(
  page: PageOcr,
  regionCode: string,
): OcrLine[] {
  if (!(regionCode in BOX_VERTICAL_HINT)) {
    return linesInReadingOrder(page);
  }
  const center = BOX_VERTICAL_HINT[regionCode];
  // Per-region tolerance. Tight for header regions where body text
  // can be confused with field values; loose for body/title regions.
  let tolerance = 0.10;
  if (regionCode === '3' || regionCode === '4') tolerance = 0.05;
  if (regionCode === '2') tolerance = 0.08;
  return linesInReadingOrder(page).filter(
    (l) => Math.abs((l.bbox.y0 + l.bbox.y1) / 2 - center) <= tolerance,
  );
}

/**
 * Filter lines by horizontal band for a given region code.
 *
 * Decree 30 layouts are two-column. The horizontal hint keeps the
 * extractor from attributing a right-column line to a left-column region
 * (or vice versa). The filter uses the line's horizontal *centre*
 * against the band's edges ± a 0.05 tolerance so lines that just
 * barely overlap the boundary are still accepted.
 */
function linesInHorizontalBand(
  page: PageOcr,
  regionCode: string,
): OcrLine[] {
  const hh = BOX_HORIZONTAL_HINT[regionCode];
  if (!hh) return linesInReadingOrder(page);
  const { x0: hx0, x1: hx1 } = hh;
  return linesInReadingOrder(page).filter((l) => {
    const cx = (l.bbox.x0 + l.bbox.x1) / 2;
    return cx >= hx0 - 0.05 && cx <= hx1 + 0.05;
  });
}

/**
 * Locate the lines / words that satisfy a Decree 30 region.
 *
 * The algorithm:
 *   1. Narrow the candidate lines to the region's vertical band.
 *   2. Further filter by the region's horizontal band (two-column layout).
 *   3. Apply the region.match() predicate (line-level).
 *   4. If no line matches, fall back to the band as a whole.
 */
export function locateRegion(
  page: PageOcr,
  region: BoxRegion,
): RegionMatch {
  // Vertical filter first (always runs).
  let candidateLines = linesInVerticalBand(page, region.code);
  // Horizontal filter — only active for regions that have a BOX_HORIZONTAL_HINT.
  const hh = BOX_HORIZONTAL_HINT[region.code];
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

  if (matchedLines.length === 0) {
    matchedLines.push(...candidateLines);
  }

  const matchedWords = matchedLines.flatMap((l) => l.words);

  const block: OcrBlock = {
    id: -1,
    bbox: unionBbox(matchedLines.map((l) => l.bbox)),
    confidence: matchedLines.reduce((s, l) => s + l.confidence, 0) /
      Math.max(matchedLines.length, 1),
    lines: matchedLines,
  };

  return {
    region,
    lines: matchedLines,
    words: matchedWords,
    blocks: [block],
  };
}

/** Convenience: locate a region by its Decree 30 code. */
export function locateRegionByCode(
  page: PageOcr,
  code: string,
): RegionMatch | null {
  const region = DECREE_30_REGIONS[code];
  if (!region) return null;
  return locateRegion(page, region);
}

/** Compute the union bounding box of an array of boxes. */
export function unionBbox(
  boxes: { x0: number; y0: number; x1: number; y1: number }[],
): { x0: number; y0: number; x1: number; y1: number } {
  if (boxes.length === 0) {
    return { x0: 0, y0: 0, x1: 0, y1: 0 };
  }
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const b of boxes) {
    if (b.x0 < x0) x0 = b.x0;
    if (b.y0 < y0) y0 = b.y0;
    if (b.x1 > x1) x1 = b.x1;
    if (b.y1 > y1) y1 = b.y1;
  }
  return { x0, y0, x1, y1 };
}
