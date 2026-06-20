import type { UrgencyCodeOrName, UrgencyName } from '../../types';

/**
 * Display options for the four seeded urgency classifications.
 * The `value` is what the frontend sends in API requests; the backend
 * resolves it (seeded name, legacy alias, or numeric id) to a `urgencyId`.
 */
export interface UrgencyOption {
  value: UrgencyName;
  name: UrgencyName;
  label: string;
}

export const URGENCY_OPTIONS: UrgencyOption[] = [
  { value: 'THUONG',      name: 'THUONG',      label: 'Thường' },
  { value: 'KHAN',        name: 'KHAN',        label: 'Khẩn' },
  { value: 'THUONG_KHAN', name: 'THUONG_KHAN', label: 'Thượng khẩn' },
  { value: 'HOA_TOC',     name: 'HOA_TOC',     label: 'Hỏa tốc' },
];

/**
 * Look up the display label for an Urgency record (or a raw name string).
 * Falls back to the value itself when the name is unknown.
 */
export function formatUrgency(
  u: { name: string } | string | null | undefined,
): string {
  if (!u) return '—';
  const name = typeof u === 'string' ? u : u.name;
  const opt = URGENCY_OPTIONS.find((o) => o.name === name);
  return opt ? opt.label : name;
}

/**
 * Normalize a `UrgencyCodeOrName` into a seeded `UrgencyName`, mapping
 * the legacy THUONG_KHAU spelling to THUONG_KHAN. Returns null for
 * numeric ids (which the backend resolves directly).
 */
export function normalizeUrgencyName(
  input: UrgencyCodeOrName | null | undefined,
): UrgencyName | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return null;
  const v = String(input).trim().toUpperCase();
  if (v === 'THUONG_KHAU') return 'THUONG_KHAN';
  if (URGENCY_OPTIONS.some((o) => o.name === v)) return v as UrgencyName;
  return null;
}
