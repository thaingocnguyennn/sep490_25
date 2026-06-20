import type { ConfidentialityCodeOrName, ConfidentialityName } from '../../types';

/**
 * Display options for the four seeded confidentiality classifications.
 * The `value` is what the frontend sends in API requests; the backend
 * resolves it (code, name, or legacy enum value) to a `confidentialityId`.
 */
export interface ConfidentialityOption {
  value: ConfidentialityCodeOrName;
  name: ConfidentialityName;
  code: string | null;
  label: string;
}

export const CONFIDENTIALITY_OPTIONS: ConfidentialityOption[] = [
  { value: 'THUONG',    name: 'THUONG',    code: null, label: 'Thường (không mật)' },
  { value: 'MAT',       name: 'MAT',       code: 'C',  label: 'Mật (C)' },
  { value: 'TOI_MAT',   name: 'TOI_MAT',   code: 'B',  label: 'Tối mật (B)' },
  { value: 'TUYET_MAT', name: 'TUYET_MAT', code: 'A',  label: 'Tuyệt mật (A)' },
];

/** Format a Confidentiality record for display: "Mật (C)" or "Thường" */
export function formatConfidentiality(c: { code: string | null; name: string } | null | undefined): string {
  if (!c) return '—';
  const opt = CONFIDENTIALITY_OPTIONS.find((o) => o.name === c.name);
  if (opt) return opt.label;
  return c.code ? `${c.name} (${c.code})` : c.name;
}
