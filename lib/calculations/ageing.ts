import type { RiskRecord, Stage } from "@/types/data";
import { STAGES } from "@/lib/data/transitions";
import { safeDivide, weightedMean, weightedQuantile } from "./metrics";

export type AgeVariable = "tiempoEnCartera" | "tiempoAVencimiento" | "aniosTtm";

export interface AgeVariableDef {
  key: AgeVariable;
  label: string;
  column: string;
  /** Unidad original del Excel. */
  sourceUnit: "días" | "años";
  description: string;
}

export const AGE_VARIABLES: readonly AgeVariableDef[] = [
  {
    key: "tiempoEnCartera",
    label: "Antigüedad en cartera",
    column: "tiempo_en_cartera",
    sourceUnit: "días",
    description: "Tiempo medio en cartera de los contratos de la fila (días en origen; se muestra en años).",
  },
  {
    key: "tiempoAVencimiento",
    label: "Plazo a vencimiento",
    column: "tiempo_a_vencimiento",
    sourceUnit: "días",
    description: "Tiempo medio hasta vencimiento (días en origen; se muestra en años). 0 = vencido o sin plazo.",
  },
  {
    key: "aniosTtm",
    label: "Años a vencimiento (TTM)",
    column: "años_ttm",
    sourceUnit: "años",
    description: "Años a vencimiento redondeados al alza con mínimo 1, promediados por fila.",
  },
];

const DAYS_PER_YEAR = 365.25;

/** Valor de la variable en años (las columnas en días se convierten). */
export function ageValueYears(r: RiskRecord, v: AgeVariable): number | null {
  const raw = r[v];
  if (raw === null) return null;
  return v === "aniosTtm" ? raw : raw / DAYS_PER_YEAR;
}

/** Redondea un borde a un valor "amable" en años según su magnitud. */
export function niceEdge(x: number): number {
  if (x < 1) return Math.round(x * 4) / 4;
  if (x < 5) return Math.round(x * 2) / 2;
  if (x < 20) return Math.round(x);
  if (x < 50) return Math.round(x / 5) * 5;
  return Math.round(x / 10) * 10;
}

const QUANTILES = [0.1, 0.25, 0.5, 0.75, 0.9];

/**
 * Bordes de los rangos derivados de la distribución REAL: cuantiles ponderados por EAD
 * (p10, p25, p50, p75, p90) sobre todo el fichero, redondeados y sin duplicados.
 * Se calculan sobre el fichero completo para que los rangos no cambien al filtrar.
 */
export function deriveEdges(records: readonly RiskRecord[], v: AgeVariable): number[] {
  const pairs: { value: number; weight: number }[] = [];
  let min = Infinity;
  for (const r of records) {
    const val = ageValueYears(r, v);
    if (val === null || r.ead === null || r.ead <= 0) continue;
    pairs.push({ value: val, weight: r.ead });
    if (val < min) min = val;
  }
  if (!pairs.length) return [];
  const edges: number[] = [];
  for (const q of QUANTILES) {
    const x = weightedQuantile(pairs, q);
    if (x === null) continue;
    const e = niceEdge(x);
    if (e > min && !edges.includes(e) && (edges.length === 0 || e > edges[edges.length - 1])) edges.push(e);
  }
  return edges;
}

export interface AgeBin {
  label: string;
  from: number | null;
  to: number | null;
}

function fmtYears(x: number): string {
  return x.toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

export function binsFromEdges(edges: number[]): AgeBin[] {
  if (!edges.length) return [{ label: "Todos", from: null, to: null }];
  const bins: AgeBin[] = [{ label: `< ${fmtYears(edges[0])} a`, from: null, to: edges[0] }];
  for (let i = 0; i < edges.length - 1; i++) {
    bins.push({ label: `${fmtYears(edges[i])}–${fmtYears(edges[i + 1])} a`, from: edges[i], to: edges[i + 1] });
  }
  bins.push({ label: `≥ ${fmtYears(edges[edges.length - 1])} a`, from: edges[edges.length - 1], to: null });
  return bins;
}

export function binIndex(bins: AgeBin[], value: number): number {
  for (let i = 0; i < bins.length; i++) {
    const b = bins[i];
    if ((b.from === null || value >= b.from) && (b.to === null || value < b.to)) return i;
  }
  return bins.length - 1;
}

export interface AgeHistogramRow {
  bin: string;
  total: number;
  s1: number;
  s2: number;
  s3: number;
  /** Peso del rango sobre el EAD de cada stage (para comparar perfiles). */
  pctTotal: number | null;
  pct1: number | null;
  pct2: number | null;
  pct3: number | null;
}

/** Distribución del EAD por rangos y stage. Las filas sin EAD o sin valor no se incluyen. */
export function ageHistogram(records: readonly RiskRecord[], v: AgeVariable, bins: AgeBin[]): AgeHistogramRow[] {
  const acc = bins.map(() => ({ total: 0, s: [0, 0, 0] }));
  const stageTotals = [0, 0, 0];
  let total = 0;
  for (const r of records) {
    const val = ageValueYears(r, v);
    if (val === null || r.ead === null) continue;
    const i = binIndex(bins, val);
    acc[i].total += r.ead;
    acc[i].s[r.stage - 1] += r.ead;
    stageTotals[r.stage - 1] += r.ead;
    total += r.ead;
  }
  return bins.map((b, i) => ({
    bin: b.label,
    total: acc[i].total,
    s1: acc[i].s[0],
    s2: acc[i].s[1],
    s3: acc[i].s[2],
    pctTotal: safeDivide(acc[i].total, total),
    pct1: safeDivide(acc[i].s[0], stageTotals[0]),
    pct2: safeDivide(acc[i].s[1], stageTotals[1]),
    pct3: safeDivide(acc[i].s[2], stageTotals[2]),
  }));
}

/** Valores por encima de 100 años se consideran atípicos (p. ej. vencimientos de miles de años). */
export const AGE_OUTLIER_YEARS = 100;

export interface AgeStat {
  /** Media ponderada por EAD, excluyendo valores atípicos (> 100 años). */
  mean: number | null;
  /** Mediana ponderada por EAD (robusta, incluye todos los valores). */
  median: number | null;
}

export interface AgeMeans {
  variable: AgeVariable;
  total: AgeStat;
  byStage: Record<Stage, AgeStat>;
  /** Filas con valor atípico excluidas de la media. */
  outliersExcluded: number;
}

function ageStat(records: readonly RiskRecord[], v: AgeVariable): AgeStat {
  const pairs: { value: number; weight: number }[] = [];
  for (const r of records) {
    const val = ageValueYears(r, v);
    if (val !== null && r.ead !== null && r.ead > 0) pairs.push({ value: val, weight: r.ead });
  }
  return {
    mean: weightedMean(
      pairs.filter((p) => p.value <= AGE_OUTLIER_YEARS),
      (p) => p.value,
      (p) => p.weight,
    ),
    median: weightedQuantile(pairs, 0.5),
  };
}

/** Medias (excluyendo atípicos) y medianas ponderadas por EAD, en años, total y por stage. */
export function ageMeans(records: readonly RiskRecord[]): AgeMeans[] {
  return AGE_VARIABLES.map(({ key }) => ({
    variable: key,
    total: ageStat(records, key),
    byStage: Object.fromEntries(
      STAGES.map((s) => [
        s,
        ageStat(
          records.filter((r) => r.stage === s),
          key,
        ),
      ]),
    ) as Record<Stage, AgeStat>,
    outliersExcluded: records.filter((r) => {
      const val = ageValueYears(r, key);
      return val !== null && val > AGE_OUTLIER_YEARS;
    }).length,
  }));
}
