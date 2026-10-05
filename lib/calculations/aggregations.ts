import type { Destination, PeriodKey, RiskRecord, Stage, TransitionClass, TransitionKey } from "@/types/data";
import {
  ALL_TRANSITIONS,
  CURE_TRANSITIONS,
  DESTINATIONS,
  DETERIORATION_TRANSITIONS,
  STAGES,
  TRANSITION_CLASSES,
  classifyTransition,
  parseTransitionKey,
} from "@/lib/data/transitions";
import { EMPTY_TOTALS, safeDivide, sumMetrics, variation, type MetricTotals, type Variation } from "./metrics";
import type { ResolvedPeriods } from "./filters";

// ---------------------------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------------------------

export interface KpiSet {
  period: PeriodKey | null;
  previousPeriod: PeriodKey | null;
  transitionPeriod: PeriodKey | null;
  previousTransitionPeriod: PeriodKey | null;
  ead: Variation;
  provision: Variation;
  nContratos: Variation;
  coverage: Variation;
  eadDeteriorado: Variation;
  current: MetricTotals;
}

export function eadOfTransitions(records: readonly RiskRecord[], keys: readonly TransitionKey[]): number | null {
  const set = new Set(keys);
  const sel = records.filter((r) => set.has(r.transition) && r.transitionObservable);
  if (!records.some((r) => r.transitionObservable)) return null;
  return sel.reduce((a, r) => a + (r.ead ?? 0), 0);
}

export function computeKpis(byPeriod: Map<PeriodKey, RiskRecord[]>, p: ResolvedPeriods): KpiSet {
  const at = (k: PeriodKey | null) => (k ? (byPeriod.get(k) ?? []) : []);
  const cur = p.kpiPeriod ? sumMetrics(at(p.kpiPeriod)) : EMPTY_TOTALS;
  const prev = p.previousKpiPeriod ? sumMetrics(at(p.previousKpiPeriod)) : null;
  const detCur = p.transitionPeriod ? eadOfTransitions(at(p.transitionPeriod), DETERIORATION_TRANSITIONS) : null;
  const detPrev = p.previousTransitionPeriod
    ? eadOfTransitions(at(p.previousTransitionPeriod), DETERIORATION_TRANSITIONS)
    : null;
  return {
    period: p.kpiPeriod,
    previousPeriod: p.previousKpiPeriod,
    transitionPeriod: p.transitionPeriod,
    previousTransitionPeriod: p.previousTransitionPeriod,
    ead: variation(cur.ead, prev?.ead ?? null),
    provision: variation(cur.provision, prev?.provision ?? null),
    nContratos: variation(cur.nContratos, prev?.nContratos ?? null),
    coverage: variation(cur.coverage, prev?.coverage ?? null),
    eadDeteriorado: variation(detCur, detPrev),
    current: cur,
  };
}

// ---------------------------------------------------------------------------------------------
// Flujos de transición (Sankey + matriz)
// ---------------------------------------------------------------------------------------------

export interface TransitionFlow {
  key: TransitionKey;
  from: Stage;
  to: Destination;
  transitionClass: TransitionClass;
  ead: number;
  nContratos: number;
  provision: number;
  /** Coverage del flujo: provisión (filas con EAD) / EAD. */
  coverage: number | null;
  /** EAD del flujo / EAD total de su stage de origen. */
  pctOfOrigin: number | null;
  rows: number;
}

export interface TransitionSummary {
  flows: TransitionFlow[];
  originTotals: Record<Stage, MetricTotals>;
  destinationTotals: Record<string, MetricTotals>;
  total: MetricTotals;
}

/** Resume las transiciones de un conjunto de registros (ya filtrado al mes de transición). */
export function summarizeTransitions(records: readonly RiskRecord[]): TransitionSummary {
  const observable = records.filter((r) => r.transitionObservable);
  const byKey = new Map<TransitionKey, RiskRecord[]>();
  for (const r of observable) {
    let arr = byKey.get(r.transition);
    if (!arr) byKey.set(r.transition, (arr = []));
    arr.push(r);
  }
  const originTotals = Object.fromEntries(
    STAGES.map((s) => [s, sumMetrics(observable.filter((r) => r.stage === s))]),
  ) as Record<Stage, MetricTotals>;
  const destinationTotals = Object.fromEntries(
    DESTINATIONS.map((d) => [String(d), sumMetrics(observable.filter((r) => r.destination === d))]),
  ) as Record<string, MetricTotals>;

  const flows: TransitionFlow[] = ALL_TRANSITIONS.flatMap((key) => {
    const rs = byKey.get(key);
    if (!rs?.length) return [];
    const { from, to } = parseTransitionKey(key)!;
    const m = sumMetrics(rs);
    return [
      {
        key,
        from,
        to,
        transitionClass: classifyTransition(from, to),
        ead: m.ead ?? 0,
        nContratos: m.nContratos ?? 0,
        provision: m.provision ?? 0,
        coverage: m.coverage,
        pctOfOrigin: safeDivide(m.ead ?? 0, originTotals[from].ead),
        rows: rs.length,
      },
    ];
  });
  return { flows, originTotals, destinationTotals, total: sumMetrics(observable) };
}

// ---------------------------------------------------------------------------------------------
// Calidad de la cartera
// ---------------------------------------------------------------------------------------------

export interface PortfolioQuality {
  eadByClass: Record<TransitionClass, number>;
  eadDeteriorado: number;
  eadCura: number;
  /** EAD con origen en Stage 1 y 2 (susceptible de deterioro). */
  eadSusceptibleDeterioro: number;
  /** EAD con origen en Stage 2 y 3 (susceptible de cura). */
  eadSusceptibleCura: number;
  tasaDeterioro: number | null;
  tasaCura: number | null;
  totalEad: number;
}

/**
 * Tasa de deterioro = EAD(1-2, 1-3, 2-3) / EAD con origen en Stage 1 o 2 (incluye salidas).
 * Tasa de cura      = EAD(2-1, 3-2, 3-1) / EAD con origen en Stage 2 o 3 (incluye salidas).
 * Stage 3 no puede deteriorarse más y Stage 1 no puede curarse, por eso se excluyen.
 */
export function portfolioQuality(records: readonly RiskRecord[]): PortfolioQuality {
  const observable = records.filter((r) => r.transitionObservable);
  const eadByClass = Object.fromEntries(TRANSITION_CLASSES.map((c) => [c, 0])) as Record<TransitionClass, number>;
  let susDet = 0;
  let susCura = 0;
  let total = 0;
  const det = new Set(DETERIORATION_TRANSITIONS);
  const cure = new Set(CURE_TRANSITIONS);
  let eadDet = 0;
  let eadCura = 0;
  for (const r of observable) {
    const e = r.ead ?? 0;
    total += e;
    eadByClass[r.transitionClass] += e;
    if (r.stage === 1 || r.stage === 2) susDet += e;
    if (r.stage === 2 || r.stage === 3) susCura += e;
    if (det.has(r.transition)) eadDet += e;
    if (cure.has(r.transition)) eadCura += e;
  }
  return {
    eadByClass,
    eadDeteriorado: eadDet,
    eadCura,
    eadSusceptibleDeterioro: susDet,
    eadSusceptibleCura: susCura,
    tasaDeterioro: safeDivide(eadDet, susDet),
    tasaCura: safeDivide(eadCura, susCura),
    totalEad: total,
  };
}

// ---------------------------------------------------------------------------------------------
// Series temporales
// ---------------------------------------------------------------------------------------------

export type TimeMetric = "ead" | "provision" | "coverage" | "nContratos";

export function metricValue(m: MetricTotals, metric: TimeMetric): number | null {
  switch (metric) {
    case "ead":
      return m.ead;
    case "provision":
      return m.provision;
    case "coverage":
      return m.coverage;
    case "nContratos":
      return m.nContratos;
  }
}

export interface TimePoint {
  period: PeriodKey;
  total: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  rows: number;
}

/**
 * Serie mensual de una métrica. Un mes sin registros (tras filtros) devuelve null, nunca 0,
 * para que el gráfico muestre una discontinuidad.
 */
export function timeSeries(
  byPeriod: Map<PeriodKey, RiskRecord[]>,
  periods: readonly PeriodKey[],
  metric: TimeMetric,
): TimePoint[] {
  return periods.map((period) => {
    const rs = byPeriod.get(period) ?? [];
    if (!rs.length) return { period, total: null, s1: null, s2: null, s3: null, rows: 0 };
    const val = (stage: Stage) => {
      const sub = rs.filter((r) => r.stage === stage);
      return sub.length ? metricValue(sumMetrics(sub), metric) : null;
    };
    return {
      period,
      total: metricValue(sumMetrics(rs), metric),
      s1: val(1),
      s2: val(2),
      s3: val(3),
      rows: rs.length,
    };
  });
}

export interface RatePoint {
  period: PeriodKey;
  tasaDeterioro: number | null;
  tasaCura: number | null;
}

/** Evolución de las tasas de deterioro y cura (sólo meses con transiciones observables). */
export function rateSeries(byPeriod: Map<PeriodKey, RiskRecord[]>, periods: readonly PeriodKey[]): RatePoint[] {
  return periods.map((period) => {
    const rs = (byPeriod.get(period) ?? []).filter((r) => r.transitionObservable);
    if (!rs.length) return { period, tasaDeterioro: null, tasaCura: null };
    const q = portfolioQuality(rs);
    return { period, tasaDeterioro: q.tasaDeterioro, tasaCura: q.tasaCura };
  });
}

// ---------------------------------------------------------------------------------------------
// Distribución por stage
// ---------------------------------------------------------------------------------------------

export interface StageSlice {
  stage: Stage;
  totals: MetricTotals;
  /** Peso sobre el total de la métrica aditiva correspondiente. */
  shareEad: number | null;
  shareContratos: number | null;
  shareProvision: number | null;
}

export function stageDistribution(records: readonly RiskRecord[]): { slices: StageSlice[]; total: MetricTotals } {
  const total = sumMetrics(records);
  const slices = STAGES.map((stage) => {
    const t = sumMetrics(records.filter((r) => r.stage === stage));
    return {
      stage,
      totals: t,
      shareEad: safeDivide(t.ead ?? 0, total.ead),
      shareContratos: safeDivide(t.nContratos ?? 0, total.nContratos),
      shareProvision: safeDivide(t.provision ?? 0, total.provision),
    };
  });
  return { slices, total };
}
