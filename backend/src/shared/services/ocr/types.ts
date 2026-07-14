/**
 * Shared types for the layout-aware OCR pipeline.
 *
 * Bounding box coordinates are always normalized to the [0, 1] range
 * relative to the page width/height. This keeps extraction logic
 * independent of the DPI/scale used while rendering the PDF page.
 */

/** Normalized rectangle: all values are in [0, 1]. */
export interface NormalizedBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A single Tesseract word with its normalized bounding box and confidence. */
export interface OcrWord {
  text: string;
  bbox: NormalizedBBox;
  confidence: number;
  line: number;
  block: number;
  paragraph: number;
}

/** A Tesseract line aggregating words. */
export interface OcrLine {
  text: string;
  bbox: NormalizedBBox;
  confidence: number;
  words: OcrWord[];
  block: number;
  paragraph: number;
}

/** A Tesseract paragraph/row containing one or more lines. */
export interface OcrBlock {
  id: number;
  bbox: NormalizedBBox;
  confidence: number;
  lines: OcrLine[];
}

/** Result of recognizing a single page with full layout information. */
export interface PageOcr {
  /** Page number (1-indexed). */
  pageNumber: number;
  /** Page width in pixels at render time. */
  width: number;
  /** Page height in pixels at render time. */
  height: number;
  /** Concatenated text from all blocks/lines/words (for downstream consumption). */
  text: string;
  /** Mean confidence across blocks (0-100). */
  confidence: number;
  blocks: OcrBlock[];
  /**
   * Optional per-field re-OCR hints. The orchestrator can populate
   * these after running a targeted multi-pass on a region; the field
   * extractor consults them before the primary block-based extraction.
   * Allows a 3-pass ensemble on the Số: line to override the noisy
   * full-page OCR result without touching the block structure.
   */
  docNumberHint?: string;
  dateHint?: string;
}

/** Public OCR result: text + per-page layout. */
export interface OcrResult {
  text: string;
  confidence: number;
  pages: PageOcr[];
  /** Total number of pages in the source document. */
  totalPages: number;
}

/** Public extracted-fields DTO. */
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
  urgencyLevel?: string;
  confidentialityLevel?: string;
}

/**
 * Region definitions following Decree 30/2020/NĐ-CP.
 *
 * The decree prescribes a fixed positions layout for Vietnamese
 * administrative documents. Each "box" below is a normalized
 * region (in [0, 1] page coordinates) used as the primary source
 * for locating that field on the page.
 */
export interface BoxRegion {
  /** Box code, e.g. '2', '3', '5a', '7b'. */
  code: string;
  /** Human-friendly label. */
  label: string;
  /** Function for matching words that belong inside this region. */
  match: (word: OcrWord, lineText: string) => boolean;
}

/**
 * Helper used during field extraction: words collected within a
 * particular page region, sorted top-to-bottom then left-to-right.
 */
export interface RegionMatch {
  region: BoxRegion;
  words: OcrWord[];
  lines: OcrLine[];
  blocks: OcrBlock[];
}
