/**
 * Signer-name extraction pipeline.
 *
 * Replaces the document-specific character-replacement heuristics
 * that lived in `field-extractor.ts` and `region-ocr.ts` with a
 * production-grade candidate-generation + scoring pipeline.
 *
 * Pipeline stages:
 *   1. Region detection (signature-block re-OCR + bottom-right of
 *      last page).
 *   2. Per-line candidate generation: confidence-gate words,
 *      normalise characters, classify via dictionaries, fuzzy
 *      correct, build name spans of length 2..4.
 *   3. Scoring with structural bonuses and recipient-list penalty.
 *   4. Pick the highest-scoring candidate.
 *
 * No document-specific rules live here — every tunable lives in
 * `constants.ts` and the dictionaries in `vn-name-dict.ts`.
 */

import type { OcrLine, PageOcr } from './types';
import { linesInReadingOrder } from './layout';
import { classifyToken, normalizeToken, OCR_SUBSTITUTION_MAP } from './name-normalizer';
import { MIDDLES_NORMAL, MIDDLES_NFC_LOWER, SURNAMES_NFC_LOWER } from './vn-name-dict';
import {
  LOW_CONFIDENCE_WORD_THRESHOLD,
  MIN_NAME_SPAN_LENGTH,
  MAX_NAME_SPAN_LENGTH,
  SCORE_HAS_SURNAME_AT_0_AND_VALID_LENGTH,
  SCORE_LENGTH_3_OR_4,
  SCORE_ENDS_WITH_GIVEN_OR_MIDDLE,
  SCORE_PER_MIDDLE_AFTER_FIRST,
  SCORE_PENALTY_PER_UNKNOWN,
  SCORE_BONUS_PER_CONF_BUCKET,
  SCORE_FROM_RE_OCR_BLOCK,
  SCORE_PENALTY_RECIPIENT_LIST,
  SCORE_PENALTY_TOPLINE_FRAGMENT,
} from './constants';
import type { NameRole } from './name-normalizer';

/**
 * Synthetic re-OCR'd blocks live in a block with negative `id`. The
 * orchestrator (`applyRegionReplacements`) tags them so we can boost
 * candidates that originated from the targeted signature re-OCR
 * (which is much higher fidelity than page-level OCR).
 */
const RE_OCR_BLOCK_ID = -2;

/**
 * Bottom-of-page window: a line's y0 above this fraction is treated
 * as last-page signature-block region when no `7sig` block exists.
 *
 * 0.30 (not 0.70) because signer-name lines on Vietnamese
 * administrative documents frequently live 30–70% down the page:
 * the recipient list pushes the signature block upward when the
 * document has many addressees. The signature-block region is
 * defined by horizontal position (x > 0.50) and the bottom-Y
 * context — not strictly the bottom-third of the page.
 */
const LAST_PAGE_Y_MIN = 0.30;

/** Right-column boundary: anything to the right of this is the sig column. */
const RIGHT_COLUMN_X_MIN = 0.50;

/**
 * A single name-span candidate produced by the generator. The
 * `text` is the canonical NFC form, `score` is non-negative when
 * structurally valid, and `debug` keeps intermediate stats for
 * logging.
 */
interface NameCandidate {
  text: string;
  /** Original OCR line text (for recipient-list / topline heuristics). */
  originalLineText: string;
  /** Per-token classification result. */
  tokens: Array<{
    raw: string;
    corrected: string;
    role: NameRole;
    confidence: number;
  }>;
  /** Aggregate score. */
  score: number;
  /** Mean OCR confidence across the source words (0–100). */
  meanConfidence: number;
  /** Where the candidate came from. */
  source: 'reocr' | 'lastpage';
  /** Y-coordinate of the source line (for tie-breaking). */
  y0: number;
}

/**
 * Lines that match these patterns are almost certainly recipient
 * bullets, not signer names. Used as a strong scoring penalty (not
 * a hard filter) so borderline cases can still surface if they're
 * the only candidate available.
 *
 * The patterns mirror the ones in the legacy `isRecipientListLine`
 * helper in the previous field-extractor implementation, but they
 * are kept here as a single regex literal instead of being
 * scattered.
 */
const RECIPIENT_LIST_PATTERNS: ReadonlyArray<RegExp> = [
  /^[-•*]\s*\d*\.?\s*[A-ZÀ-Ỹ]/u, // "- Sở Tư pháp", "* Bộ Giáo dục"
  /^\d+[.)]\s+/u, // "1. ...", "2) ..."
  /;\s*$/u, // trailing ";…"
  /^(Nơi\s+nhận|-\s*Nơi\s+nhận|Nơi\s+nhận\s*[:.\-]?)/iu,
  /(Thủ\s+trưởng|các\s+Sở|ban,\s*ngành|các\s+phòng)/iu, // "Thủ trưởng các Sở, ban, ngành…"
  /(chịu\s+trách\s+nhiệm|thi\s+hành\s+Quyết\s+định|Quyết\s+định\s+này)/iu, // boilerplate following signature
];

/**
 * Test whether a candidate's source line is plausibly a recipient
 * bullet.
 */
function looksLikeRecipientList(text: string): boolean {
  const trimmed = text.trim();
  return RECIPIENT_LIST_PATTERNS.some((re) => re.test(trimmed));
}

/** Heuristics: is this a short topline fragment (page header / footer)? */
function looksLikeToplineFragment(
  text: string,
  y0: number,
): boolean {
  // Pinned-to-top fragments (page number, header) are repeated on
  // every page and frequently captured above the signature block.
  const t = text.trim();
  return y0 < 0.15 && t.length <= 20 && !/[A-ZÀ-Ỹ]{2,}/u.test(t);
}

/**
 * Round mean confidence to the nearest 10 — used as a scoring
 * bucket so the bonus doesn't grow too large.
 */
function confBucket(conf: number): number {
  return Math.max(0, Math.min(10, Math.round(conf / 10)));
}

/**
 * Build name-span candidates from a single OCR line. Each run of
 * plausible-name tokens (length 2..4) is one candidate; both the
 * raw form and the fuzzy-corrected form are emitted so the scorer
 * can pick the best.
 *
 * `originalLineText` is preserved on each candidate so the scorer
 * can apply heuristics (recipient-list, topline fragment) that
 * look at punctuation and prefixes which the tokeniser may have
 * dropped.
 */
function buildCandidatesFromLine(
  originalLineText: string,
  tokens: Array<{ raw: string; corrected: string; role: NameRole; confidence: number }>,
): NameCandidate[] {
  const out: NameCandidate[] = [];
  // Slide a window to find every contiguous role-acceptable run.
  for (let start = 0; start < tokens.length; start++) {
    if (tokens[start].role === 'unknown') continue;
    for (let end = start + 1; end <= tokens.length; end++) {
      const span = tokens.slice(start, end);
      const hasUnknown = span.some((t) => t.role === 'unknown');
      if (hasUnknown) break; // an unknown breaks the run
      const len = span.length;
      if (len < MIN_NAME_SPAN_LENGTH || len > MAX_NAME_SPAN_LENGTH) continue;
      const rawText = span.map((t) => t.raw).join(' ');
      const correctedText = span
        .map((t) => (t.role === 'unknown' ? t.raw : t.corrected))
        .join(' ');
      const meanConf =
        span.reduce((s, t) => s + t.confidence, 0) / Math.max(span.length, 1);
      // Always emit the corrected form; rawText only if it differs
      // enough to be considered an alternative candidate.
      out.push({
        text: correctedText,
        originalLineText,
        tokens: span,
        score: 0, // computed by scorer
        meanConfidence: meanConf,
        source: 'lastpage',
        y0: 0,
      });
      if (rawText !== correctedText) {
        out.push({
          text: rawText,
          originalLineText,
          tokens: span,
          score: 0,
          meanConfidence: meanConf,
          source: 'lastpage',
          y0: 0,
        });
      }
    }
  }
  return out;
}

/**
 * Tokenize a single OCR line into classified tokens.
 *
 * Strategy: prefer Tesseract's per-word bounding boxes; if the line
 * contains only one (or no) word — a common failure mode in
 * signature-block OCR — fall back to whitespace-splitting the line
 * text into synthetic tokens at evenly-distributed bboxes across
 * the line's full bbox.
 *
 * Per-word confidence gating (LOW_CONFIDENCE_WORD_THRESHOLD) drops
 * noisy words before classification. The `position` field passed to
 * `classifyToken` is the token's 0-based index in this line — that
 * is what stops the fuzzy-corrector from inventing a surname out of
 * a given name (e.g. `Bình` → `Đinh` because of 1-edit similarity).
 */
function tokenizeLine(line: OcrLine): Array<{
  raw: string;
  corrected: string;
  role: NameRole;
  confidence: number;
}> {
  const out: Array<{
    raw: string;
    corrected: string;
    role: NameRole;
    confidence: number;
  }> = [];

  // Source 1: Tesseract's per-word bboxes (preferred).
  const words = line.words.filter((w) => {
    const trimmed = w.text.trim();
    if (!trimmed) return false;
    // Exempt short tokens (1-2 chars) from the confidence gate. Tesseract
    // frequently assigns very low confidence to single characters that
    // it split off from a longer word (e.g. "A" + "nh" = "Anh"). If we
    // filter them here, the merge pass downstream never sees them.
    if (trimmed.length > 2 && w.confidence > 0 && w.confidence < LOW_CONFIDENCE_WORD_THRESHOLD) {
      return false;
    }
    return true;
  });

  if (words.length > 0) {
    // First pass: split single words that contain internal whitespace
    // (Tesseract squashing multiple tokens into one — common in
    // signature-block noise such as "“al=@¥en Thanh Bình" or
    // "~ Nguyễn A nh Chức\n"). Each split token gets a synthetic
    // bbox within the original word's bbox so downstream candidacy
    // remains roughly accurate.
    const expanded: typeof words = [];
    for (const w of words) {
      const cleaned = (w.text || '').trim();
      if (!cleaned) continue;
      const parts = cleaned.split(/\s+/).filter(Boolean);
      if (parts.length <= 1) {
        expanded.push(w);
        continue;
      }
      const step = (w.bbox.x1 - w.bbox.x0) / Math.max(parts.length, 1);
      for (let i = 0; i < parts.length; i++) {
        expanded.push({
          ...w,
          text: parts[i],
          bbox: {
            x0: w.bbox.x0 + step * i,
            y0: w.bbox.y0,
            x1: w.bbox.x0 + step * (i + 1),
            y1: w.bbox.y1,
          },
        });
      }
    }

    // Second pass: apply a small join step to recover from
    // Tesseract's tendency to split short Vietnamese tokens
    // ("A" + "nh" = "Anh"). We merge neighbouring short tokens
    // when their joined form matches a middle-name dictionary
    // entry.
    const mergedWords: typeof words = [];
    for (let i = 0; i < expanded.length; i++) {
      const cur = expanded[i];
      const next = expanded[i + 1];
      const curText = cur.text.trim();
      const curIsShort = curText.length <= 3;
      if (next && curIsShort) {
        const joined = curText + next.text.trim();
        if (joined.length >= 3 && joined.length <= 6) {
          const asciiLow = joined
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/Đ/g, 'D')
            .replace(/đ/g, 'd')
            .toLowerCase();
          if (MIDDLES_NORMAL.has(asciiLow)) {
            const minX = Math.min(cur.bbox.x0, next.bbox.x0);
            const maxX = Math.max(cur.bbox.x1, next.bbox.x1);
            const minY = Math.min(cur.bbox.y0, next.bbox.y0);
            const maxY = Math.max(cur.bbox.y1, next.bbox.y1);
            mergedWords.push({
              ...cur,
              text: joined,
              bbox: { x0: minX, y0: minY, x1: maxX, y1: maxY },
            });
            i++;
            continue;
          }
        }
      }
      mergedWords.push(cur);
    }

    for (let i = 0; i < mergedWords.length; i++) {
      const w = mergedWords[i];
      const raw = normalizeToken(w.text);
      if (!raw) continue;
      // Defensive: if the merged token still has whitespace inside,
      // split again — extremely rare but keeps the loop deterministic.
      const subTokens = raw.split(/\s+/).filter(Boolean);
      if (subTokens.length > 1) {
        for (let j = 0; j < subTokens.length; j++) {
          const cls = classifyToken(subTokens[j], w.confidence, i + j);
          out.push({
            raw: subTokens[j],
            corrected: cls.corrected,
            role: cls.role,
            confidence: w.confidence,
          });
        }
        continue;
      }
      const cls = classifyToken(raw, w.confidence, i);
      out.push({
        raw,
        corrected: cls.corrected,
        role: cls.role,
        confidence: w.confidence,
      });
    }
    return out;
  }

  // Source 2: fallback to splitting the line text on whitespace. This
  // addresses a common signature-block failure mode where Tesseract
  // produced a single multi-word word with no per-word bboxes (e.g.
  // "al=@¥en Thanh Bình" gets emitted as one token). Synthetic
  // bboxes are evenly distributed across the line's bbox so
  // candidate-generation can still emit reasonable candidates.
  const textTokens = line.text.split(/\s+/).filter(Boolean);
  for (let i = 0; i < textTokens.length; i++) {
    const raw = normalizeToken(textTokens[i]);
    if (!raw) continue;
    const cls = classifyToken(raw, line.confidence, i);
    out.push({
      raw,
      corrected: cls.corrected,
      role: cls.role,
      confidence: line.confidence,
    });
  }
  return out;
}

/**
 * Score one candidate against the configured structural bonuses.
 *
 * The score is intentionally linear so debugging is straightforward
 * — a candidate that finds a Vietnamese surname at index 0 plus a
 * given name at the tail scores ~150; recipient-list bullets score
 * strongly negative.
 *
 * `sourceLineText` is the *original* OCR line text, used by the
 * recipient-list and topline-fragment heuristics (those patterns
 * match punctuation and prefixes that `normalizeToken` would have
 * stripped).
 */
function scoreCandidate(
  candidate: NameCandidate,
  sourceLineText: string,
  isFromReOcr: boolean,
): number {
  let s = 0;
  const tokens = candidate.tokens;
  if (tokens.length < 2 || tokens.length > 4) return -999;

  // Surname at index 0.
  if (tokens[0].role === 'surname' || tokens[0].role === 'middle') {
    s += SCORE_HAS_SURNAME_AT_0_AND_VALID_LENGTH;
  } else {
    // No surname? Penalise heavily.
    s -= 80;
  }
  // Length 3-4 (has middle).
  if (tokens.length >= 3) s += SCORE_LENGTH_3_OR_4;
  // Ends with given or middle.
  const last = tokens[tokens.length - 1];
  if (last.role === 'middle' || last.role === 'given') {
    s += SCORE_ENDS_WITH_GIVEN_OR_MIDDLE;
  }
  // Each non-first token matching a middle.
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i].role === 'middle') s += SCORE_PER_MIDDLE_AFTER_FIRST;
  }
  // Each unknown token in span.
  for (const t of tokens) {
    if (t.role === 'unknown') s += SCORE_PENALTY_PER_UNKNOWN;
  }
  // Confidence bucket.
  s += confBucket(candidate.meanConfidence) * SCORE_BONUS_PER_CONF_BUCKET;
  // Re-OCR boost.
  if (isFromReOcr) s += SCORE_FROM_RE_OCR_BLOCK;
  // Recipient-list penalty (uses the ORIGINAL line text so that
  // bullets / numbered prefixes survive even when `normalizeToken`
  // has dropped them).
  if (looksLikeRecipientList(sourceLineText)) s += SCORE_PENALTY_RECIPIENT_LIST;
  if (looksLikeToplineFragment(sourceLineText, candidate.y0)) {
    s += SCORE_PENALTY_TOPLINE_FRAGMENT;
  }
  return s;
}

/** Pick the best candidate; tie-break by confidence, length, y0. */
function selectBest(candidates: NameCandidate[]): NameCandidate | undefined {
  if (candidates.length === 0) return undefined;
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    if (
      c.score > best.score ||
      (c.score === best.score && c.meanConfidence > best.meanConfidence) ||
      (c.score === best.score &&
        c.meanConfidence === best.meanConfidence &&
        c.tokens.length > best.tokens.length) ||
      (c.score === best.score &&
        c.meanConfidence === best.meanConfidence &&
        c.tokens.length === best.tokens.length &&
        c.y0 > best.y0)
    ) {
      best = c;
    }
  }
  return best;
}

/**
 * Gather candidate lines from the page-level OCR. Uses two
 * strategies:
 *   - Lines inside a 7sig re-OCR block (boosted by source=reocr).
 *   - Lines in the bottom-right of the last page (source=lastpage).
 */
function collectCandidateLines(
  pages: PageOcr[],
): Array<{
  line: OcrLine;
  isFromReOcr: boolean;
  y0: number;
  tokens: Array<{
    raw: string;
    corrected: string;
    role: NameRole;
    confidence: number;
  }>;
}> {
  const out: Array<{
    line: OcrLine;
    isFromReOcr: boolean;
    y0: number;
    tokens: Array<{
      raw: string;
      corrected: string;
      role: NameRole;
      confidence: number;
    }>;
  }> = [];
  if (pages.length === 0) return out;
  const lastIdx = pages.length - 1;
  const lastPage = pages[lastIdx];

  // Strategy 1: 7sig re-OCR block.
  for (const block of lastPage.blocks) {
    if (block.id !== RE_OCR_BLOCK_ID) continue;
    for (const line of block.lines) {
      const tokens = tokenizeLine(line);
      if (tokens.length >= MIN_NAME_SPAN_LENGTH) {
        out.push({ line, isFromReOcr: true, y0: line.bbox.y0, tokens });
      }
    }
  }

  // Strategy 2: last-page bottom-right region.
  const lines = linesInReadingOrder(lastPage);
  for (const line of lines) {
    if (line.bbox.y0 < LAST_PAGE_Y_MIN) continue;
    if (line.bbox.x0 < RIGHT_COLUMN_X_MIN) continue;
    const tokens = tokenizeLine(line);
    if (tokens.length < MIN_NAME_SPAN_LENGTH) continue;
    out.push({ line, isFromReOcr: false, y0: line.bbox.y0, tokens });
  }
  return out;
}

/**
 * Public API: extract the signer name from a sequence of OCR pages.
 *
 * Returns the highest-scoring candidate, or `undefined` when no
 * candidate meets the minimum score threshold (-50 — anything below
 * this is structurally too broken to be worth surfacing).
 *
 * Set `process.env.OCR_DEBUG_SIGNER = '1'` to print per-candidate
 * scoring detail (useful when iterating on the pipeline).
 */
export function extractSignerName(pages: PageOcr[]): string | undefined {
  const collected = collectCandidateLines(pages);
  if (process.env.OCR_DEBUG_SIGNER === '1') {
    console.log('[signer] collected candidates=' + collected.length);
    for (let i = 0; i < collected.length; i++) {
      const c = collected[i];
      console.log('  [' + i + '] lineText=' + JSON.stringify(c.line.text) + ' tokens=' + c.tokens.map((t) => t.raw + '/' + t.role).join(','));
    }
  }
  if (collected.length === 0) return undefined;

  const candidates: NameCandidate[] = [];
  for (const c of collected) {
    const spans = buildCandidatesFromLine(c.line.text, c.tokens);
    for (const span of spans) {
      candidates.push({
        ...span,
        source: c.isFromReOcr ? 'reocr' : 'lastpage',
        y0: c.y0,
      });
    }
  }
  // Score.
  for (const cand of candidates) {
    cand.score = scoreCandidate(
      cand,
      cand.originalLineText,
      cand.source === 'reocr',
    );
  }
  if (process.env.OCR_DEBUG_SIGNER === '1') {
    console.log('[signer] all candidates:');
    for (const cand of candidates) {
      console.log('  - text=' + JSON.stringify(cand.text) + ' score=' + cand.score + ' roles=' + cand.tokens.map((t) => t.role).join(','));
    }
  }
  // Re-sort by y0 (already in reading order) — selection will pick
  // top scorer after tie-breaking.
  const best = selectBest(candidates);
  if (!best || best.score < -50) return undefined;
  return best.text;
}

// Re-export so tests can introspect the pipeline without poking at internals.
export { OCR_SUBSTITUTION_MAP };