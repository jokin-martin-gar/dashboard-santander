/**
 * Formateo numérico en español. Todas las funciones devuelven "N/D" para null / NaN / Infinity,
 * de modo que la interfaz nunca muestra "NaN" ni "Infinity".
 */

export const ND = "N/D";

const cache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number, extra: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const key = `${min}|${max}|${JSON.stringify(extra)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
      // es-ES no agrupa los números de 4 cifras por defecto; se fuerza para mantener coherencia.
      useGrouping: "always",
      ...extra,
    } as Intl.NumberFormatOptions);
    cache.set(key, f);
  }
  return f;
}

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** 1234.5 → "1.234,5" */
export function formatNumber(v: number | null | undefined, decimals = 0): string {
  return isNum(v) ? nf(decimals, decimals).format(v) : ND;
}

/** Importe completo en euros: "282.262.344.512,35 €" */
export function formatEurFull(v: number | null | undefined): string {
  return isNum(v) ? `${nf(2, 2).format(v)} €` : ND;
}

/**
 * Importe abreviado: < 1.000 → "950 €"; k€; M€; MM€ (miles de millones, convención española).
 * Precisión: 1 decimal, salvo valores ≥ 100 en su unidad (0 decimales).
 */
export function formatEurCompact(v: number | null | undefined): string {
  if (!isNum(v)) return ND;
  const abs = Math.abs(v);
  const units: [number, string][] = [
    [1e9, "MM€"],
    [1e6, "M€"],
    [1e3, "k€"],
  ];
  for (const [div, unit] of units) {
    if (abs >= div) {
      const scaled = v / div;
      const decimals = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
      return `${nf(decimals, decimals).format(scaled)} ${unit}`;
    }
  }
  return `${nf(0, 0).format(v)} €`;
}

/** Fracción → porcentaje con 2 decimales: 0.00951 → "0,95 %" */
export function formatPercent(v: number | null | undefined, decimals = 2): string {
  return isNum(v) ? `${nf(decimals, decimals).format(v * 100)} %` : ND;
}

/** Diferencia en puntos porcentuales: 0.0012 → "+0,12 p.p." */
export function formatPp(v: number | null | undefined, decimals = 2): string {
  if (!isNum(v)) return ND;
  const s = nf(decimals, decimals).format(Math.abs(v * 100));
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${s} p.p.`;
}

/** Número de contratos (entero, con separador de miles). */
export function formatCount(v: number | null | undefined): string {
  return isNum(v) ? nf(0, 0).format(Math.round(v)) : ND;
}

/** Abreviación de recuentos para ejes: 6,56 M, 450 k */
export function formatCountCompact(v: number | null | undefined): string {
  if (!isNum(v)) return ND;
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${nf(abs >= 1e8 ? 0 : 2, abs >= 1e8 ? 0 : 2).format(v / 1e6)} M`;
  if (abs >= 1e3) return `${nf(0, 0).format(v / 1e3)} k`;
  return nf(0, 0).format(v);
}

/** Valor con signo para variaciones: +1,2 MM€ / −3.400 */
export function withSign(formatted: string, v: number | null | undefined): string {
  if (!isNum(v) || formatted === ND) return ND;
  if (v > 0) return `+${formatted}`;
  if (v < 0) return `−${formatted.replace(/^-/, "")}`;
  return formatted;
}

/** Años con 1 decimal: "3,4 años" */
export function formatYears(v: number | null | undefined, decimals = 1): string {
  return isNum(v) ? `${nf(decimals, decimals).format(v)} años` : ND;
}

export type MetricKind = "eur" | "count" | "percent";

export function formatMetricCompact(v: number | null | undefined, kind: MetricKind): string {
  if (kind === "eur") return formatEurCompact(v);
  if (kind === "count") return formatCount(v);
  return formatPercent(v);
}

export function formatMetricFull(v: number | null | undefined, kind: MetricKind): string {
  if (kind === "eur") return formatEurFull(v);
  if (kind === "count") return formatCount(v);
  return formatPercent(v, 4);
}
