import type { PeriodKey } from "@/types/data";

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function periodKey(year: number, month: number): PeriodKey | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 1900 || year > 2200)
    return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parsePeriodKey(key: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(m[1]), month };
}

export function isPeriodKey(key: string): boolean {
  return parsePeriodKey(key) !== null;
}

export function periodFromIsoDate(iso: string | null): PeriodKey | null {
  if (!iso) return null;
  return iso.slice(0, 7);
}

export function addMonths(key: PeriodKey, delta: number): PeriodKey | null {
  const p = parsePeriodKey(key);
  if (!p) return null;
  const idx = p.year * 12 + (p.month - 1) + delta;
  return periodKey(Math.floor(idx / 12), (idx % 12) + 1);
}

/** "2026-06" → "jun 2026" */
export function periodLabel(key: PeriodKey): string {
  const p = parsePeriodKey(key);
  if (!p) return key;
  return `${MONTHS_SHORT[p.month - 1]} ${p.year}`;
}

/** "2026-06" → "jun 26" (ejes de gráficos). */
export function periodShortLabel(key: PeriodKey): string {
  const p = parsePeriodKey(key);
  if (!p) return key;
  return `${MONTHS_SHORT[p.month - 1]} ${String(p.year).slice(2)}`;
}

/** "2026-06" → "junio de 2026" */
export function periodLongLabel(key: PeriodKey): string {
  const p = parsePeriodKey(key);
  if (!p) return key;
  return `${MONTHS_LONG[p.month - 1]} de ${p.year}`;
}

/** Orden cronológico (las claves YYYY-MM ordenan bien lexicográficamente, pero se valida). */
export function comparePeriods(a: PeriodKey, b: PeriodKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** "2026-06-30" → "30/06/2026" */
export function formatIsoDate(iso: string | null): string {
  if (!iso) return "N/D";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
