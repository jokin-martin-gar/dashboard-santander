import type { PeriodInfo, PeriodKey, RiskRecord } from "@/types/data";
import type { Filters } from "@/types/filters";

/** true si hay algún filtro que dependa del destino de la transición. */
export function hasTransitionFilters(f: Filters): boolean {
  return f.destino.length > 0 || f.clases.length > 0 || f.transiciones.length > 0;
}

export function countActiveFilters(f: Filters): number {
  return (
    f.carteras.length +
    f.titulizado.length +
    f.flags.length +
    f.origen.length +
    f.destino.length +
    f.clases.length +
    f.transiciones.length
  );
}

export interface ResolvedPeriods {
  from: PeriodKey;
  to: PeriodKey;
  /** Meses del fichero dentro del rango, en orden cronológico. */
  inRange: PeriodKey[];
  /** Mes de referencia del stock (último del rango). */
  stockPeriod: PeriodKey;
  /** Último mes ≤ stockPeriod con transiciones observables (puede quedar fuera del rango). */
  transitionPeriod: PeriodKey | null;
  /** Mes usado por los KPI: stockPeriod, o transitionPeriod si hay filtros de transición. */
  kpiPeriod: PeriodKey | null;
  /** Mes disponible anterior a kpiPeriod (para la variación). */
  previousKpiPeriod: PeriodKey | null;
  /** Mes observable anterior a transitionPeriod. */
  previousTransitionPeriod: PeriodKey | null;
  /** true si transitionPeriod es anterior al inicio del rango seleccionado. */
  transitionOutsideRange: boolean;
}

/**
 * Resuelve los meses de referencia a partir del rango seleccionado:
 * - Por defecto (sin rango) se usa el último mes disponible.
 * - Con un rango, los KPI de stock muestran el ÚLTIMO mes del rango (no se suman meses).
 */
export function resolvePeriods(periods: PeriodInfo[], filters: Filters): ResolvedPeriods | null {
  if (!periods.length) return null;
  const keys = periods.map((p) => p.key);
  const last = keys[keys.length - 1];
  const clamp = (k: PeriodKey | null, fallback: PeriodKey) => {
    if (!k) return fallback;
    if (keys.includes(k)) return k;
    // Ajusta al mes disponible más cercano dentro de los límites.
    const after = keys.find((x) => x >= k);
    return after ?? last;
  };
  let to = clamp(filters.periodTo, last);
  let from = clamp(filters.periodFrom, to);
  if (from > to) [from, to] = [to, from];
  const inRange = keys.filter((k) => k >= from && k <= to);

  const observable = periods.filter((p) => p.transitionsObservable).map((p) => p.key);
  const transitionPeriod = [...observable].reverse().find((k) => k <= to) ?? null;
  const previousTransitionPeriod =
    transitionPeriod === null ? null : ([...observable].reverse().find((k) => k < transitionPeriod) ?? null);

  const kpiPeriod = hasTransitionFilters(filters) ? transitionPeriod : to;
  const kpiIdx = kpiPeriod ? keys.indexOf(kpiPeriod) : -1;
  const previousKpiPeriod = kpiIdx > 0 ? keys[kpiIdx - 1] : null;

  return {
    from,
    to,
    inRange,
    stockPeriod: to,
    transitionPeriod,
    kpiPeriod,
    previousKpiPeriod,
    previousTransitionPeriod,
    transitionOutsideRange: transitionPeriod !== null && transitionPeriod < from,
  };
}

/**
 * Filtros de dimensión y de transición (NO filtra por período).
 * Con filtros de transición activos se excluyen las filas cuyo destino no es observable
 * (último mes del fichero), porque su «Salida Cartera» es un artefacto de construcción.
 */
export function applyDimensionFilters(records: RiskRecord[], f: Filters): RiskRecord[] {
  const carteras = f.carteras.length ? new Set(f.carteras) : null;
  const tit = f.titulizado.length ? new Set(f.titulizado) : null;
  const flags = f.flags.length ? new Set(f.flags) : null;
  const origen = f.origen.length ? new Set(f.origen) : null;
  const destino = f.destino.length ? new Set(f.destino) : null;
  const clases = f.clases.length ? new Set(f.clases) : null;
  const trans = f.transiciones.length ? new Set(f.transiciones) : null;
  const transitionFilters = hasTransitionFilters(f);

  return records.filter(
    (r) =>
      (!carteras || carteras.has(r.cartera)) &&
      (!tit || tit.has(r.titulizado)) &&
      (!flags || flags.has(r.flagIndividualizado)) &&
      (!origen || origen.has(r.stage)) &&
      (!transitionFilters || r.transitionObservable) &&
      (!destino || destino.has(r.destination)) &&
      (!clases || clases.has(r.transitionClass)) &&
      (!trans || trans.has(r.transition)),
  );
}

/** Agrupa registros por período (una sola pasada). */
export function groupByPeriod(records: RiskRecord[]): Map<PeriodKey, RiskRecord[]> {
  const m = new Map<PeriodKey, RiskRecord[]>();
  for (const r of records) {
    let arr = m.get(r.period);
    if (!arr) m.set(r.period, (arr = []));
    arr.push(r);
  }
  return m;
}

export function filterByPeriods(records: RiskRecord[], periods: PeriodKey[]): RiskRecord[] {
  const s = new Set(periods);
  return records.filter((r) => s.has(r.period));
}
