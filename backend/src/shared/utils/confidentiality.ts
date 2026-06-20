import prisma from '../../config/database';

/**
 * Map the legacy ConfidentialityLevel enum values (NORMAL, CONFIDENTIAL,
 * TOP_SECRET) to the corresponding seeded name in the new Confidentiality
 * lookup table. This lets the API keep accepting the old labels for
 * backward compatibility.
 */
const LEGACY_TO_NAME: Record<string, string> = {
  NORMAL: 'THUONG',
  CONFIDENTIAL: 'MAT',
  TOP_SECRET: 'TUYET_MAT',
};

/**
 * Resolve a Confidentiality record id from one of:
 *   - a numeric id                       → returned as-is if it exists
 *   - a code ('A' | 'B' | 'C')           → looked up by code
 *   - the empty string or null/undefined → returns null (no classification)
 *   - a legacy ConfidentialityLevel      → mapped to a seeded name
 *   - a seeded name (THUONG, MAT, ...)   → looked up by name
 *
 * Returns null when no match is found, which lets the caller decide whether
 * to throw or fall back to a default.
 */
export async function resolveConfidentialityId(
  input: string | number | null | undefined,
): Promise<number | null> {
  if (input === null || input === undefined || input === '') return null;

  // Numeric id passthrough
  if (typeof input === 'number' || /^\d+$/.test(String(input))) {
    const id = Number(input);
    const exists = await prisma.confidentiality.findUnique({ where: { id } });
    return exists ? id : null;
  }

  const value = String(input).trim().toUpperCase();

  // Legacy enum value? Map to seeded name first.
  const name = LEGACY_TO_NAME[value] ?? value;

  // Prefer code lookup if the input looks like a single-letter code.
  const isCode = name.length === 1;
  const record = isCode
    ? await prisma.confidentiality.findUnique({ where: { code: name } })
    : await prisma.confidentiality.findUnique({ where: { name } });

  return record?.id ?? null;
}

/**
 * Resolve a Confidentiality record id with a sensible default (THUONG) when
 * no input is provided. Used by code paths that previously defaulted to
 * 'NORMAL' on the enum.
 */
export async function resolveConfidentialityIdWithDefault(
  input: string | number | null | undefined,
): Promise<number> {
  const id = await resolveConfidentialityId(input);
  if (id !== null) return id;
  const fallback = await prisma.confidentiality.findUnique({ where: { name: 'THUONG' } });
  if (!fallback) {
    throw new Error('Default Confidentiality record "THUONG" is missing. Run the seed script.');
  }
  return fallback.id;
}
