/**
 * OCR token normalisation and classification for signer-name
 * extraction.
 *
 * Two-stage pipeline:
 *   1. `normalizeToken` — replace the most common Tesseract
 *      substitution characters and NFC-normalise.
 *   2. `classifyToken` — look the input up in the Vietnamese name
 *      dictionaries using the *diacritic-preserving* NFC-lowered
 *      form first (so that `Văn` and `Vạn` don't collide), then
 *      fall back to fuzzy correction against the fully
 *      de-diacriticked dictionary.
 *
 * The dictionaries live in `./vn-name-dict` and are immutable.
 */

import { distance } from 'fastest-levenshtein';
import {
  SURNAMES_NFC_LOWER,
  MIDDLES_NFC_LOWER,
  SURNAMES_NORMAL,
  MIDDLES_NORMAL,
  toAsciiLower,
  toNfcLower,
  nfcForNormalised,
  SURNAMES_NFC,
  MIDDLES_NFC,
} from './vn-name-dict';

/**
 * Single source of truth for OCR → Vietnamese char substitution.
 *
 * Each entry maps a stray ASCII / non-letter character that
 * Tesseract emits on low-contrast signature scans to the most
 * likely Vietnamese letter it was meant to render. Add new rules
 * here rather than scattering them across the pipeline.
 *
 * Leading non-letter glyphs (`>`, `"`, `(`, `|`, `«`, `»`, `…`,
 * `*`, `_`, `\`) are mapped to the empty string so they vanish
 * cleanly from signature-block OCR output. They appear as
 * decorative ornaments around handwritten names (e.g. `">Phẩm
 * Thị Trà"` is read as `">Phẩm"` and would otherwise poison the
 * surname lookup with a leading `>`).
 */
export const OCR_SUBSTITUTION_MAP: Readonly<Record<string, string>> = {
  '@': 'u', // very frequent: Tesseract emits '@' for 'u' or 'ễ'
  '=': 'n', // very frequent: for 'n' or 'ñ'
  '¥': 'y', // occasional: for 'y' with descending stroke
  '&': '',   // accent remnant on the next character
  '$': '',   // accent remnant
  '"': '',   // ASCII double quote (line boundary)
  '\u201c': '', // left double curly quote
  '\u201d': '', // right double curly quote
  '\u2018': '', // left single curly quote
  '\u2019': '', // right single curly quote / apostrophe
  '`': '',   // grave accent
  '~': '',   // tilde
  '^': '',   // circumflex
  '>': '',   // signature-block ornament
  '<': '',   // signature-block ornament
  '|': '',   // signature-block ornament (often a vertical separator)
  '(': '',   // signature-block ornament
  ')': '',   // signature-block ornament
  '[': '',   // signature-block ornament
  ']': '',   // signature-block ornament
  '{': '',   // signature-block ornament
  '}': '',   // signature-block ornament
  '*': '',   // signature-block ornament (Tesseract reads '*' next to names)
  '_': '',   // signature-block ornament (underline remnant)
  '\\': '',  // backslash artefact
  '/': '',   // forward slash artefact when not part of a date/number
  '#': '',   // OCR artefact inside fused names ("Phẩn#Íh¡")
  '!': '',   // exclamation (OCR artefact)
  '¡': '',   // inverted exclamation (OCR artefact on "ị" descenders)
  ';': '',   // semicolon artefact
  ':': '',   // colon artefact
  ',': '',   // comma artefact (signature OCR frequently inserts spurious commas)
  '.': '',   // period artefact
  '?': '',   // question mark artefact
  '¿': '',   // inverted question mark artefact
  '«': '',   // left guillemet ornament
  '»': '',   // right guillemet ornament
  '‹': '',   // left single guillemet ornament
  '›': '',   // right single guillemet ornament
  '·': '',   // middle dot ornament
  '•': '',   // bullet ornament
  '§': '',   // section sign ornament
  '%': '',   // percent ornament
  '½': '',   // half fraction
  '¼': '',   // quarter fraction
  '¾': '',   // three-quarter fraction
  '×': '',   // multiplication sign
  '÷': '',   // division sign
  '±': '',   // plus-minus sign
  '°': '',   // degree sign
  '¬': '',   // negation sign
};

/** Build the substitution regex once at module load. */
const OCR_SUBSTITUTION_RE = new RegExp(
  '[' +
    Object.keys(OCR_SUBSTITUTION_MAP)
      .map((c) => {
        if (c.length === 1) {
          const code = c.charCodeAt(0);
          return '\\u' + code.toString(16).padStart(4, '0');
        }
        return c.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
      })
      .join('') +
    ']',
  'g',
);

/**
 * Apply OCR substitution map and NFC normalisation, then trim.
 *
 * This is the *single* function that converts raw Tesseract output
 * into a form the rest of the pipeline can rely on. Use it before
 * any dictionary lookup, classification, or fuzzy matching.
 */
export function normalizeToken(token: string): string {
  if (!token) return '';
  return token
    .replace(OCR_SUBSTITUTION_RE, (c) => OCR_SUBSTITUTION_MAP[c] ?? '')
    .normalize('NFC')
    .trim();
}

/** Role of a token within a Vietnamese personal name. */
export type NameRole = 'surname' | 'middle' | 'given' | 'unknown';

/**
 * Result of classifying a single OCR token. `corrected` is the
 * canonical NFC form the classifier inferred from the input.
 */
export interface TokenClassification {
  role: NameRole;
  corrected: string;
  correctedNormal: string;
  distance: number;
  ocrConfidence: number;
}

/**
 * Find the closest dictionary entry within an edit-distance
 * budget against the *fully normalised* (no-diacritic) form.
 *
 * Use this only when the diacritic-preserving lookup failed —
 * by then the input has already been stripped of distinguishing
 * marks, so we have to do fuzzy matching against the de-diacrited
 * vocabulary.
 */
export function fuzzyCorrectNormalised(
  normalised: string,
  kind: 'surname' | 'middle',
  maxDistance = 2,
): { nfc: string; distance: number } | undefined {
  const entries = kind === 'surname' ? SURNAMES_NFC : MIDDLES_NFC;
  let best: { nfc: string; distance: number } | undefined;
  for (const entry of entries) {
    const d = distance(normalised, toAsciiLower(entry));
    if (d <= maxDistance && (!best || d < best.distance)) {
      best = { nfc: entry, distance: d };
    }
  }
  return best;
}

/**
 * Try a small set of common Vietnamese surname-prefix recoveries on
 * the input. Returns the candidate that best matches a surname in
 * the dictionary, or undefined if none of them help.
 *
 * Background: Tesseract on low-contrast signature scans frequently
 * loses the **initial consonant** of `Nguyễn` — the descender of `g`
 * becomes invisible. Most observed corruption patterns are:
 *
 *   - `al`       (no descender, capital N lost)
 *   - `nl`       (rounding of N into n)
 *   - `a`        (single-letter garbage from `Ng`)
 *   - `N`        (just the stem of the N)
 *
 * We try each fixup, run an exact-dictionary lookup on the result,
 * and return the first hit. We DO NOT fuzzy-match here — dictionary
 * lookup is cheaper to debug and the patterns above are
 * Vietnamese-specific but extremely common (every signature scan
 * I've seen on `Nguyễn` produces one of them).
 *
 * Returning multiple fixups is intentional: scoring compares them
 * downstream.
 */
function recoverSurnamePrefix(token: string): string[] {
  const out: string[] = [];
  const cleaned = normalizeToken(token).toLowerCase();
  // 1. Recovery of the "Ng" prefix when Tesseract dropped the
  //    descender.
  if (/^al[a-zà-ỹ]/.test(cleaned)) {
    out.push('Ng' + cleaned.slice(2));
  }
  if (/^nl[a-zà-ỹ]/.test(cleaned)) {
    out.push('Ng' + cleaned.slice(2));
  }
  // 2. Prefix-only recovery (single-letter tokens) — try `Ng`.
  if (cleaned === 'n' || cleaned.startsWith('n ')) {
    out.push('Ng' + cleaned.slice(1).trim());
  }
  return out;
}

/**
 * Classify a single OCR token. Returns the role plus optional
 * fuzzy-corrected canonical form.
 *
 * `position` (0 = first token of a name span) lets the classifier
 * accept surnames only at the start of a name. Tokens at position ≥
 * 1 that aren't in either dictionary are tagged `given` rather than
 * being fuzzy-corrected against a surname or middle — that's how we
 * stop `Bình` from being silently mutated into the (1-edit-distant)
 * surname `Đinh` or middle `Minh`.
 *
 * Lookup order (at position 0):
 *   1. NFC-lowered exact match against the surname dictionary
 *      (handles clean `Nguyễn` → `Nguyễn`).
 *   2. Surname-prefix recovery: try `Ng` substitutions for inputs
 *      matching the documented `al`/`nl` corruption patterns, then
 *      look up the recovered form. This is the only "knowledge" we
 *      encode about signature-scan noise; it is keyed to a handful
 *      of Tesseract failure modes, not to individual PDFs.
 *   3. Fuzzy match against the fully normalised surname dictionary,
 *      budget 2 (≤ 3 for tokens ≥ 7 chars so `alnuyen`→`nguyen`
 *      still matches).
 * Lookup order (at position ≥ 1):
 *   1. NFC-lowered exact match against the middle dictionary.
 *   2. Fall through to `given` (raw token).
 *
 * Why no fuzzy correction for middles or given names? Vietnamese
 * given names share many 1-edit-distance neighbours
 * (`Bình`/`Minh`, `Linh`/`Lĩnh`/`Lưng`, etc.) and Tesseract already
 * corrupts them in 100+ different ways. Silently rewriting a
 * correctly-recognised given name to a dictionary entry is worse
 * than preserving the raw form. Exact dictionary matches still
 * succeed; everything else passes through as-is.
 */
export function classifyToken(
  token: string,
  ocrConfidence = 100,
  position = 0,
): TokenClassification {
  const cleaned = normalizeToken(token);
  const nfcLower = toNfcLower(cleaned);
  const asciiLower = toAsciiLower(cleaned);

  if (!asciiLower) {
    return {
      role: 'unknown',
      corrected: '',
      correctedNormal: '',
      distance: 0,
      ocrConfidence,
    };
  }

  if (position === 0 && SURNAMES_NFC_LOWER.has(nfcLower)) {
    const nfc = nfcForNormalised(nfcLower, 'surname') ?? cleaned;
    return {
      role: 'surname',
      corrected: nfc,
      correctedNormal: asciiLower,
      distance: 0,
      ocrConfidence,
    };
  }

  if (MIDDLES_NFC_LOWER.has(nfcLower)) {
    const nfc = nfcForNormalised(nfcLower, 'middle') ?? cleaned;
    return {
      role: 'middle',
      corrected: nfc,
      correctedNormal: asciiLower,
      distance: 0,
      ocrConfidence,
    };
  }

  // Light fuzzy correction for non-first tokens (middles + givens).
  // Without this, OCR artefacts like "Íhị" (1-2 edits from "Thị")
  // survive verbatim and produce wrong signer names. We cap the
  // edit distance at 1 for short tokens and 2 for longer ones,
  // which is enough to recover common Tesseract errors on the
  // very frequent Vietnamese middles ("Thị", "Văn", "Hồng", …)
  // while still preserving unusual givens intact. The diacritic-
  // aware dictionary lookup above already preferred exact matches
  // so anything that reaches here is genuinely ambiguous.
  if (position >= 1) {
    const midBudget = asciiLower.length >= 5 ? 2 : 1;
    const midHit = fuzzyCorrectNormalised(asciiLower, 'middle', midBudget);
    if (midHit) {
      return {
        role: 'middle',
        corrected: midHit.nfc,
        correctedNormal: asciiLower,
        distance: midHit.distance,
        ocrConfidence,
      };
    }
  }

  if (position === 0) {
    // 2. Surname-prefix recovery (handles `al`/`nl` → `Ng` patterns).
    for (const recovered of recoverSurnamePrefix(token)) {
      if (SURNAMES_NORMAL.has(toAsciiLower(recovered))) {
        const nfc = nfcForNormalised(toAsciiLower(recovered), 'surname') ?? recovered;
        return {
          role: 'surname',
          corrected: nfc,
          correctedNormal: toAsciiLower(recovered),
          distance: 1,
          ocrConfidence,
        };
      }
    }
    // 3. Fuzzy match against the surname dictionary. Longer tokens
    //    get a slightly larger budget because the 7-char `alnuyen`
    //    is 3 edits from `nguyen` and we still want to recover it.
    const budget = asciiLower.length >= 7 ? 3 : asciiLower.length <= 3 ? 1 : 2;
    const surnameHit = fuzzyCorrectNormalised(asciiLower, 'surname', budget);
    if (surnameHit) {
      return {
        role: 'surname',
        corrected: surnameHit.nfc,
        correctedNormal: asciiLower,
        distance: surnameHit.distance,
        ocrConfidence,
      };
    }
  }

  return {
    role: position === 0 ? 'unknown' : 'given',
    corrected: cleaned,
    correctedNormal: asciiLower,
    distance: 0,
    ocrConfidence,
  };
}

export { SURNAMES_NORMAL, MIDDLES_NORMAL, nfcForNormalised };