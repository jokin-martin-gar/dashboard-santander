"use client";

import { useMemo } from "react";
import type { Dataset } from "@/types/data";
import type { Filters } from "@/types/filters";
import { applyDimensionFilters, filterByPeriods, groupByPeriod, resolvePeriods } from "@/lib/calculations/filters";
import {
  computeKpis,
  portfolioQuality,
  rateSeries,
  stageDistribution,
  summarizeTransitions,
} from "@/lib/calculations/aggregations";

/**
 * Agregaciones derivadas del dataset y los filtros. Cada paso se memoriza por sus dependencias:
 * los filtros de dimensión recalculan el filtrado; el rango de fechas sólo recalcula las vistas.
 */
export function useDashboardData(dataset: Dataset, filters: Filters) {
  const { carteras, titulizado, flags, origen, destino, clases, transiciones } = filters;

  const filtered = useMemo(
    () =>
      applyDimensionFilters(dataset.records, {
        periodFrom: null,
        periodTo: null,
        carteras,
        titulizado,
        flags,
        origen,
        destino,
        clases,
        transiciones,
      }),
    [dataset, carteras, titulizado, flags, origen, destino, clases, transiciones],
  );

  const byPeriod = useMemo(() => groupByPeriod(filtered), [filtered]);

  const periods = useMemo(() => resolvePeriods(dataset.periods, filters), [dataset, filters]);

  return useMemo(() => {
    if (!periods) return null;
    const allKeys = dataset.periods.map((p) => p.key);
    const kpis = computeKpis(byPeriod, periods);
    const transitionRecords = periods.transitionPeriod ? (byPeriod.get(periods.transitionPeriod) ?? []) : [];
    const transitions = summarizeTransitions(transitionRecords);
    const quality = portfolioQuality(transitionRecords);
    const kpiRecords = periods.kpiPeriod ? (byPeriod.get(periods.kpiPeriod) ?? []) : [];
    const distribution = stageDistribution(kpiRecords);
    // Con un único mes seleccionado, los gráficos temporales muestran todo el histórico (hasta el
    // mes de referencia) y marcan el mes; con un rango, muestran exactamente el rango.
    const singleMonth = periods.inRange.length < 2;
    const chartPeriods = singleMonth ? allKeys.filter((k) => k <= periods.to) : periods.inRange;
    const observableChartPeriods = chartPeriods.filter(
      (k) => dataset.periods.find((p) => p.key === k)?.transitionsObservable,
    );
    const rates = rateSeries(byPeriod, observableChartPeriods);
    const tableRecords = filterByPeriods(filtered, periods.inRange);
    return {
      periods,
      kpis,
      transitions,
      quality,
      kpiRecords,
      distribution,
      chartPeriods,
      singleMonth,
      rates,
      tableRecords,
      byPeriod,
      filteredCount: filtered.length,
    };
  }, [dataset, byPeriod, filtered, periods]);
}

export type DashboardData = NonNullable<ReturnType<typeof useDashboardData>>;
