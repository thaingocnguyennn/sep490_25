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

/** Quality tier for the OCR result. Used by the routing layer to
 * determine whether a result is trustworthy enough for automatic
 * distribution, or needs human review / re-upload. */
export type OcrQuality = 'high' | 'medium' | 'low' | 'failed';

/** How the document text was obtained. */
export type OcrTextSource = 'embedded' | 'ocr';

/** Public OCR result: text + per-page layout. */
export interface OcrResult {
  text: string;
  confidence: number;
  pages: PageOcr[];
  /** Total number of pages in the source document. */
  totalPages: number;
  /** Quality tier. Always present; `failed` means no pages were readable. */
  quality: OcrQuality;
  /** Whether text came from embedded PDF text or rasterised OCR. */
  textSource: OcrTextSource;
  /** Optional per-field debug trace (only populated when OCR_FIELD_DEBUG=1). */
  debug?: OcrResultDebug;
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
  // Confidentiality and urgency are *intentionally* nullable in the
  // API: when the OCR cannot classify a document, these fields are
  // surfaced as `null` (not omitted, not defaulted to 'THUONG') so
  // the routing layer can require an explicit classification before
  // allowing distribution. The extractor returns `string | undefined`
  // internally; the orchestrator normalises to `null` for these two.
  urgencyLevel?: string | null;
  confidentialityLevel?: string | null;
}

/**
 * Per-field debug trace. Captures exactly what the extractor picked
 * for each field, with the bounding-box coordinates and confidence
 * from the underlying OCR line(s), plus the human-readable reason
 * the extractor settled on this value.
 *
 * Stored on the OcrResult only when OCR_FIELD_DEBUG=1 is set in the
 * environment. The trace is meant for offline analysis of layout
 * interpretation, not for the API surface.
 */
export interface FieldTrace {
  /** Field name (matches a key of ExtractedFields). */
  field: string;
  /** Final extracted value as a string. `null` when the field was not found. */
  value: string | null;
  /** Selected line's bounding box in normalized page coordinates, if any. */
  bbox?: NormalizedBBox;
  /** Page number the selection came from (1-indexed). */
  page?: number;
  /** Tesseract confidence of the selected line(s), 0-100. */
  confidence?: number;
  /** Why this region was chosen (strategy name + freeform note). */
  reason: string;
  /** Any candidate line(s) the extractor considered but rejected. */
  candidates?: Array<{
    text: string;
    bbox: NormalizedBBox;
    confidence: number;
    page: number;
    rejectedReason?: string;
  }>;
}

/** Optional debug extension on the public OCR result. */
export interface OcrResultDebug {
  fields: FieldTrace[];
  columnLayout?: {
    /** Detected column boundaries (x ∈ [0,1]) — empty when single-column. */
    columns: Array<{ x0: number; x1: number; centerOfMass: number }>;
    /** Whether the page was classified as two-column. */
    isTwoColumn: boolean;
    /** Method used to detect the layout (e.g. "kmeans", "gap", "single"). */
    method: string;
  };
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
