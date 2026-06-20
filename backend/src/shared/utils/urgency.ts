import prisma from '../../config/database';

/**
 * Legacy aliases accepted by the API for backward compatibility. Maps
 * the previous enum spelling (THUONG_KHAU) and a few other common
 * variants to the canonical seeded names.
 */
const LEGACY_TO_NAME: Record<string, string> = {
  THUONG_KHAU: 'THUONG_KHAN',
  THUONGKHAN:  'THUONG_KHAN',
  HOATOC:      'HOA_TOC',
};

/**
 * Resolve an Urgency record id from one of:
 *   - a numeric id                        → returned as-is if it exists
 *   - the empty string or null/undefined  → returns null
 *   - a legacy alias (THUONG_KHAU, etc.)  → mapped to the seeded name
 *   - a seeded name (THUONG, KHAN, ...)   → looked up by name
 *
 * Returns null when no match is found, which lets the caller decide
 * whether to throw or fall back to a default.
 */
export async function resolveUrgencyId(
  input: string | number | null | undefined,
): Promise<number | null> {
  if (input === null || input === undefined || input === '') return null;

  if (typeof input === 'number' || /^\d+$/.test(String(input))) {
    const id = Number(input);
    const exists = await prisma.urgency.findUnique({ where: { id } });
    return exists ? id : null;
  }

  const value = String(input).trim().toUpperCase();
  const name = LEGACY_TO_NAME[value] ?? value;

  const record = await prisma.urgency.findUnique({ where: { name } });
  return record?.id ?? null;
}

/**
 * Resolve an Urgency record id with a sensible default (THUONG) when
 * no input is provided. Used by code paths that previously defaulted
 * to 'NORMAL' priority.
 */
export async function resolveUrgencyIdWithDefault(
  input: string | number | null | undefined,
): Promise<number> {
  const id = await resolveUrgencyId(input);
  if (id !== null) return id;
  const fallback = await prisma.urgency.findUnique({ where: { name: 'THUONG' } });
  if (!fallback) {
    throw new Error('Default Urgency record "THUONG" is missing. Run the seed script.');
  }
  return fallback.id;
}

/**
 * Map a priority (the legacy `Document.urgencyLevel` enum) to a
 * canonical Urgency record. Used when backfilling or defaulting the
 * urgencyId on the parent Document row.
 */
export async function resolveUrgencyFromPriority(
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | null | undefined,
): Promise<number> {
  let name = 'THUONG';
  switch (priority) {
    case 'LOW':
    case 'NORMAL': name = 'THUONG';      break;
    case 'HIGH':   name = 'KHAN';        break;
    case 'URGENT': name = 'THUONG_KHAN'; break;
  }
  return resolveUrgencyIdWithDefault(name);
}
