import type { RiskRecord } from "@/types/data";

/** División segura: devuelve null (→ "N/D") si el denominador es 0, nulo o no finito. */
export function safeDivide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  const v = numerator / denominator;
  return Number.isFinite(v) ? v : null;
}

export interface MetricTotals {
  /** Nº de filas agregadas. */
  rows: number;
  /** SUM(EAD) de las filas con EAD informado. null si ninguna fila tiene EAD. */
  ead: number | null;
  /** SUM(Provision). null si ninguna fila tiene provisión. */
  provision: number | null;
  /** SUM(Provision) restringida a filas con EAD informado (numerador del coverage). */
  provisionWithEad: number;
  /** SUM(N_contratos): N_contratos es una medida agregada, NO se cuentan filas. */
  nContratos: number | null;
  /** Coverage ratio = SUM(Provision) / SUM(EAD) sobre el mismo universo (filas con EAD). */
  coverage: number | null;
  /** Filas sin EAD informado (excluidas del EAD y del coverage). */
  rowsWithoutEad: number;
}

export const EMPTY_TOTALS: MetricTotals = {
  rows: 0,
  ead: null,
  provision: null,
  provisionWithEad: 0,
  nContratos: null,
  coverage: null,
  rowsWithoutEad: 0,
};

export function sumMetrics(records: readonly RiskRecord[]): MetricTotals {
  let ead = 0;
  let eadCount = 0;
  let provision = 0;
  let provCount = 0;
  let provisionWithEad = 0;
  let n = 0;
  let nCount = 0;
  for (const r of records) {
    if (r.ead !== null) {
      ead += r.ead;
      eadCount++;
      if (r.provision !== null) provisionWithEad += r.provision;
    }
    if (r.provision !== null) {
      provision += r.provision;
      provCount++;
    }
    if (r.nContratos !== null) {
      n += r.nContratos;
      nCount++;
    }
  }
  const eadTotal = eadCount ? ead : null;
  return {
    rows: records.length,
    ead: eadTotal,
    provision: provCount ? provision : null,
    provisionWithEad,
    nContratos: nCount ? n : null,
    coverage: safeDivide(eadCount ? provisionWithEad : null, eadTotal),
    rowsWithoutEad: records.length - eadCount,
  };
}

/**
 * Media ponderada Σ(valor·peso) / Σ(peso), ignorando filas con valor o peso nulos y pesos ≤ 0.
 * Devuelve null si no hay peso total.
 */
export function weightedMean<T>(
  items: readonly T[],
  value: (item: T) => number | null,
  weight: (item: T) => number | null,
): number | null {
  let num = 0;
  let den = 0;
  for (const it of items) {
    const v = value(it);
    const w = weight(it);
    if (v === null || w === null || !Number.isFinite(v) || !Number.isFinite(w) || w <= 0) continue;
    num += v * w;
    den += w;
  }
  return safeDivide(num, den);
}

/** Cuantil ponderado (interpolación por escalones) de un conjunto valor/peso. */
export function weightedQuantile(pairs: { value: number; weight: number }[], q: number): number | null {
  const valid = pairs.filter((p) => Number.isFinite(p.value) && p.weight > 0).sort((a, b) => a.value - b.value);
  if (!valid.length) return null;
  const total = valid.reduce((a, p) => a + p.weight, 0);
  const target = q * total;
  let acc = 0;
  for (const p of valid) {
    acc += p.weight;
    if (acc >= target) return p.value;
  }
  return valid[valid.length - 1].value;
}

export interface Variation {
  current: number | null;
  previous: number | null;
  /** current - previous */
  absolute: number | null;
  /** (current - previous) / |previous| */
  relative: number | null;
}

export function variation(current: number | null, previous: number | null): Variation {
  if (current === null || previous === null) return { current, previous, absolute: null, relative: null };
  return {
    current,
    previous,
    absolute: current - previous,
    relative: safeDivide(current - previous, Math.abs(previous)),
  };
}
