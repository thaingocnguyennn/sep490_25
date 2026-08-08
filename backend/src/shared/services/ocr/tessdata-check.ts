import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const TESSERACT_JS_CORE_VERSION = '7.0.0';

/**
 * Expected Tesseract version prefix for ABI compatibility with
 * tesseract.js-core@7.x.
 *
 * tesseract.js-core@7.0.0 ships with a Tesseract 4.x C++ engine;
 * the LSTM models trained against a 5.x engine (tessdata_best
 * 5.x branch) reference SSE-optimised routines that the older
 * WASM core does not export, causing an emscripten abort at
 * runtime. We assert the major version is "4" here; minor version
 * differences within the 4.x line are tolerated.
 */
const EXPECTED_TESSDATA_VERSION_PREFIX = '4.';

/**
 * Maximum number of entries in the Tesseract `TessdataManager`
 * header (mirrors `TESSDATA_NUM_ENTRIES` in ccutil/tessdatamanager.h).
 * The version component lives at index 23, so we need at least 24
 * entries to read it.
 */
const TESSDATA_NUM_ENTRIES = 24;

/** Index of the `version` component in the offset table. */
const TESSDATA_VERSION_INDEX = 23;

/**
 * Result of a tessdata startup check.
 *
 * `ok` is true only when every required file is present, gzipped,
 * and reports an ABI-compatible Tesseract version. `warnings` lists
 * non-fatal issues (e.g. core-version drift). `errors` are issues
 * that will likely break OCR entirely.
 */
export interface TessdataCheckResult {
  ok: boolean;
  files: Array<{ lang: string; path: string; exists: boolean; version?: string; error?: string }>;
  warnings: string[];
  errors: string[];
}

/**
 * Parse a Tesseract `.traineddata` archive and extract the
 * embedded version string.
 *
 * The format (per ccutil/tessdatamanager.h) is:
 *
 *   [uint32_le num_entries] [int64_le offsets[num_entries]] [components...]
 *
 * where each component is contiguous between its offset and the
 * next non-(-1) entry's offset (or EOF). The version component lives
 * at index 23 — its content is the UTF-8 string Tesseract emits as
 * the result of `tesseract --version` (e.g. "4.00.00alpha").
 *
 * Returns the version string (without trailing NUL), or undefined
 * if the file is too small / malformed / missing the version entry.
 */
function readTraineddataVersion(buf: Buffer): string | undefined {
  if (buf.length < 4 + TESSDATA_NUM_ENTRIES * 8) return undefined;
  const numEntries = buf.readUInt32LE(0);
  if (numEntries < TESSDATA_NUM_ENTRIES) return undefined;
  const versionOffset = Number(buf.readBigInt64LE(4 + TESSDATA_VERSION_INDEX * 8));
  if (versionOffset < 0 || versionOffset >= buf.length) return undefined;
  // The version string is NUL-terminated; clip at the first NUL
  // within a reasonable window.
  const end = buf.indexOf(0, versionOffset);
  const rawEnd = end === -1 ? Math.min(buf.length, versionOffset + 80) : end;
  return buf.subarray(versionOffset, rawEnd).toString('utf8').trim() || undefined;
}

/**
 * Read the embedded Tesseract version from a `.traineddata.gz` file.
 * Returns the version string, or undefined when the file is missing,
 * not a gzip, or has no parseable version header.
 */
function peekTraineddataVersion(gzPath: string): string | undefined {
  let gz: Buffer;
  try {
    gz = fs.readFileSync(gzPath);
  } catch {
    return undefined;
  }
  let inflated: Buffer;
  try {
    inflated = zlib.gunzipSync(gz);
  } catch {
    return undefined;
  }
  return readTraineddataVersion(inflated);
}

/**
 * Run the tessdata startup check.
 *
 * - Resolves the lang directory (defaulting to `backend/tessdata`,
 *   overridable via `OCR_LANG_PATH`).
 * - For every requested language, requires a gzipped traineddata
 *   file present.
 * - Reads the embedded Tesseract version and asserts it starts
 *   with `4.` (i.e. ABI-compatible with tesseract.js-core@7.x).
 *
 * When `throwOnError` is true (default), throws on a fatal mismatch;
 * otherwise returns a structured result so callers can log without
 * killing the boot.
 */
export function checkTessdata(
  langs: string,
  langPath: string,
  options: { throwOnError?: boolean; tesseractJsCoreVersion?: string } = {},
): TessdataCheckResult {
  const throwOnError = options.throwOnError !== false;
  const coreVersion = options.tesseractJsCoreVersion ?? TESSERACT_JS_CORE_VERSION;

  const langList = langs.split('+').map((l) => l.trim()).filter(Boolean);
  const files: TessdataCheckResult['files'] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const lang of langList) {
    const filePath = path.join(langPath, `${lang}.traineddata.gz`);
    if (!fs.existsSync(filePath)) {
      files.push({ lang, path: filePath, exists: false, error: 'file not found' });
      errors.push(`[ocr] missing tessdata file: ${filePath}`);
      continue;
    }
    const version = peekTraineddataVersion(filePath);
    if (!version) {
      files.push({ lang, path: filePath, exists: true, error: 'could not parse version header' });
      warnings.push(
        `[ocr] ${lang}.traineddata.gz: could not parse Tesseract version header ` +
          `(file may be corrupt or not a Tesseract 4.x archive)`,
      );
      continue;
    }
    files.push({ lang, path: filePath, exists: true, version });
    // The version string emitted by Tesseract has two legal shapes:
    //   - "Pre-4.0.0+<modern>[:tag]" (legacy + new combined)
    //   - "<modern>[:tag]" (new only, e.g. "4.00.00alpha:vie:...")
    // We accept either as long as the **post-prefix** major is 4.x.
    // A leading "5." or "Pre-4.0.0+5." indicates the model was
    // trained against a newer Tesseract engine and is not ABI-safe
    // for tesseract.js-core@7.x.
    const normalised = version.replace(/^Pre-\d+\.\d+\.\d+\+/, '');
    const majorMatch = normalised.match(/^(\d+)\./);
    const major = majorMatch ? majorMatch[1] : undefined;
    if (major !== '4') {
      errors.push(
        `[ocr] ${lang}.traineddata.gz reports Tesseract ${version} ` +
          `(major=${major ?? '?'}); expected major=4 (ABI-compatible with ` +
          `tesseract.js-core@${coreVersion}). The LSTM was likely compiled ` +
          `against a different engine and will abort or produce English-only output. ` +
          `Re-download from https://github.com/tesseract-ocr/tessdata_fast/tree/4.0.0`,
      );
    }
  }

  // tesseract.js-core major-version assertion. We only check the
  // major component because minor mismatches are usually fine within
  // the 7.x line.
  const coreMajor = coreVersion.split('.')[0];
  const installedCore = tryReadInstalledCoreVersion();
  if (installedCore && installedCore.split('.')[0] !== coreMajor) {
    warnings.push(
      `[ocr] tesseract.js-core reports version ${installedCore}; ` +
        `tesseract.js@7.x expects ABI major ${coreMajor}. ` +
        `Run "npm install tesseract.js-core@^${coreMajor}.0.0" to align.`,
    );
  }

  const result: TessdataCheckResult = {
    ok: errors.length === 0,
    files,
    warnings,
    errors,
  };

  if (!result.ok) {
    const msg =
      `[ocr] tessdata startup check FAILED:\n  ${errors.join('\n  ')}` +
      (warnings.length ? `\n  warnings:\n  ${warnings.join('\n  ')}` : '');
    if (throwOnError) {
      throw new Error(msg);
    }
    // eslint-disable-next-line no-console
    console.error(msg);
  } else if (warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[ocr] tessdata startup check OK with warnings:\n  ${warnings.join('\n  ')}`);
  }

  return result;
}

/**
 * Best-effort read of the installed tesseract.js-core version.
 *
 * The package.json is shipped with the npm tarball but we deliberately
 * do NOT import it (tesseract.js-core has no `exports` map and the
 * JSON import would force CommonJS resolution). Reading via fs keeps
 * this module loadable from both CJS and ESM contexts.
 */
function tryReadInstalledCoreVersion(): string | undefined {
  try {
    // Walk up from this file: services/ocr/ → services/ → shared/
    // → src/ → backend/ → node_modules/tesseract.js-core/
    const here = __dirname;
    const pkgPath = path.resolve(
      here,
      '..',
      '..',
      '..',
      '..',
      'node_modules',
      'tesseract.js-core',
      'package.json',
    );
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version;
  } catch {
    return undefined;
  }
}