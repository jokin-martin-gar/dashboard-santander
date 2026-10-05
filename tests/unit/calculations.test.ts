import { describe, expect, it } from "vitest";
import { safeDivide, sumMetrics, variation, weightedMean, weightedQuantile } from "@/lib/calculations/metrics";
import { applyDimensionFilters, groupByPeriod, resolvePeriods } from "@/lib/calculations/filters";
import {
  computeKpis,
  portfolioQuality,
  stageDistribution,
  summarizeTransitions,
  timeSeries,
} from "@/lib/calculations/aggregations";
import { ageMeans, binsFromEdges, binIndex, niceEdge } from "@/lib/calculations/ageing";
import { EMPTY_FILTERS } from "@/types/filters";
import type { PeriodInfo } from "@/types/data";
import { rec } from "./fixtures";

const periods = (keys: string[], nonObservable: string[] = []): PeriodInfo[] =>
  keys.map((key) => ({
    key,
    label: key,
    maxFechaTablon: null,
    fechasTablon: [],
    rows: 1,
    transitionsObservable: !nonObservable.includes(key),
  }));

describe("sumas", () => {
  const rs = [
    rec({ stage: 1, destination: 1, ead: 1000, provision: 10, nContratos: 500 }),
    rec({ stage: 1, destination: 2, ead: 200, provision: 8, nContratos: 20 }),
    rec({ stage: 3, destination: "S", ead: 50, provision: 25, nContratos: 3 }),
  ];
  it("SUM(N_contratos) suma la medida agregada, no cuenta filas", () => {
    expect(sumMetrics(rs).nContratos).toBe(523);
    expect(sumMetrics(rs).rows).toBe(3);
  });
  it("SUM(EAD) y SUM(Provision)", () => {
    expect(sumMetrics(rs).ead).toBe(1250);
    expect(sumMetrics(rs).provision).toBe(43);
  });
  it("coverage ratio = SUM(Provision)/SUM(EAD)", () => {
    expect(sumMetrics(rs).coverage).toBeCloseTo(43 / 1250, 12);
  });
  it("conjunto vacío → nulos, nunca 0/NaN", () => {
    const t = sumMetrics([]);
    expect(t.ead).toBeNull();
    expect(t.coverage).toBeNull();
    expect(t.nContratos).toBeNull();
  });
});

describe("nulos y divisiones entre cero", () => {
  it("safeDivide devuelve null con denominador 0 o nulo", () => {
    expect(safeDivide(1, 0)).toBeNull();
    expect(safeDivide(0, 0)).toBeNull();
    expect(safeDivide(null, 5)).toBeNull();
    expect(safeDivide(5, null)).toBeNull();
    expect(safeDivide(1, 4)).toBe(0.25);
  });
  it("EAD vacío no se imputa como importe y se excluye del coverage", () => {
    const rs = [
      rec({ stage: 1, destination: 1, ead: 100, provision: 1, nContratos: 1 }),
      rec({ stage: 1, destination: 1, ead: null, provision: 50, nContratos: 4 }),
    ];
    const t = sumMetrics(rs);
    expect(t.ead).toBe(100);
    expect(t.provision).toBe(51); // la provisión sí se suma
    expect(t.coverage).toBeCloseTo(0.01); // pero el coverage usa el mismo universo que el EAD
    expect(t.rowsWithoutEad).toBe(1);
    expect(t.nContratos).toBe(5);
  });
  it("EAD total cero → coverage null", () => {
    expect(sumMetrics([rec({ stage: 1, destination: 1, ead: 0, provision: 3 })]).coverage).toBeNull();
  });
  it("variación sin mes anterior → null", () => {
    expect(variation(10, null)).toEqual({ current: 10, previous: null, absolute: null, relative: null });
    expect(variation(10, 0).relative).toBeNull();
    expect(variation(12, 10).relative).toBeCloseTo(0.2);
  });
});

describe("medias ponderadas", () => {
  it("pondera por EAD e ignora pesos nulos o ≤ 0", () => {
    const items = [
      { v: 10, w: 1 },
      { v: 20, w: 3 },
      { v: 1000, w: 0 },
      { v: 5, w: null },
    ];
    expect(weightedMean(items, (i) => i.v, (i) => i.w)).toBe(17.5);
    expect(weightedMean([], () => 1, () => 1)).toBeNull();
  });
  it("cuantil ponderado", () => {
    const pairs = [
      { value: 1, weight: 10 },
      { value: 5, weight: 80 },
      { value: 9, weight: 10 },
    ];
    expect(weightedQuantile(pairs, 0.05)).toBe(1);
    expect(weightedQuantile(pairs, 0.5)).toBe(5);
    expect(weightedQuantile(pairs, 0.95)).toBe(9);
  });
  it("medias de antigüedad ponderadas por EAD y convertidas a años", () => {
    const rs = [
      rec({ stage: 1, destination: 1, ead: 100, tiempoEnCartera: 365.25, aniosTtm: 1 }),
      rec({ stage: 2, destination: 2, ead: 300, tiempoEnCartera: 3 * 365.25, aniosTtm: 5 }),
    ];
    const m = ageMeans(rs);
    expect(m[0].total.mean).toBeCloseTo(2.5);
    expect(m[0].total.median).toBeCloseTo(3);
    expect(m[0].byStage[1].mean).toBeCloseTo(1);
    expect(m[0].byStage[3].mean).toBeNull();
    expect(m[2].total.mean).toBeCloseTo(4);
  });
  it("excluye atípicos (> 100 años) de la media pero no de la mediana", () => {
    const rs = [
      rec({ stage: 1, destination: 1, ead: 100, tiempoAVencimiento: 2 * 365.25 }),
      rec({ stage: 1, destination: 1, ead: 100, tiempoAVencimiento: 4 * 365.25 }),
      rec({ stage: 1, destination: 1, ead: 1, tiempoAVencimiento: 4000 * 365.25 }),
    ];
    const m = ageMeans(rs)[1];
    expect(m.total.mean).toBeCloseTo(3);
    expect(m.outliersExcluded).toBe(1);
    expect(m.total.median).toBeCloseTo(4); // peso acumulado 100/201 < 50 % en 2 años
  });
  it("rangos de antigüedad", () => {
    expect(niceEdge(2.26)).toBe(2.5);
    expect(niceEdge(13.4)).toBe(13);
    const bins = binsFromEdges([1, 3, 10]);
    expect(bins.map((b) => b.label)).toEqual(["< 1 a", "1–3 a", "3–10 a", "≥ 10 a"]);
    expect(binIndex(bins, 0.2)).toBe(0);
    expect(binIndex(bins, 3)).toBe(2);
    expect(binIndex(bins, 500)).toBe(3);
  });
});

describe("filtros combinados", () => {
  const rs = [
    rec({ stage: 1, destination: 2, cartera: "A", titulizado: "N" }),
    rec({ stage: 1, destination: 1, cartera: "A", titulizado: "S" }),
    rec({ stage: 2, destination: 3, cartera: "B", titulizado: "N" }),
    rec({ stage: 3, destination: "S", cartera: "B", titulizado: "N", flagIndividualizado: "S" }),
    rec({ stage: 1, destination: "S", cartera: "A", transitionObservable: false }),
  ];
  it("combina cartera + titulizado + clase", () => {
    const out = applyDimensionFilters(rs, { ...EMPTY_FILTERS, carteras: ["A"], titulizado: ["N"], clases: ["deterioro"] });
    expect(out.map((r) => r.transition)).toEqual(["1-2"]);
  });
  it("origen y destino", () => {
    const out = applyDimensionFilters(rs, { ...EMPTY_FILTERS, origen: [1, 2], destino: [3, 2] });
    expect(out.map((r) => r.transition).sort()).toEqual(["1-2", "2-3"]);
  });
  it("Salida Cartera filtrable por destino 'S' y excluye destinos no observables", () => {
    const out = applyDimensionFilters(rs, { ...EMPTY_FILTERS, destino: ["S"] });
    expect(out).toHaveLength(1);
    expect(out[0].transitionClass).toBe("salida");
  });
  it("sin filtros de transición se conservan las filas no observables (stock)", () => {
    expect(applyDimensionFilters(rs, { ...EMPTY_FILTERS, carteras: ["A"] })).toHaveLength(3);
  });
});

describe("períodos de referencia", () => {
  const ps = periods(["2026-03", "2026-04", "2026-05", "2026-06"], ["2026-06"]);
  it("por defecto usa la última fecha disponible", () => {
    const r = resolvePeriods(ps, EMPTY_FILTERS)!;
    expect(r.stockPeriod).toBe("2026-06");
    expect(r.kpiPeriod).toBe("2026-06");
    expect(r.previousKpiPeriod).toBe("2026-05");
    expect(r.transitionPeriod).toBe("2026-05");
    expect(r.previousTransitionPeriod).toBe("2026-04");
    expect(r.inRange).toEqual(["2026-06"]);
  });
  it("con un rango, el KPI usa la última fecha del rango", () => {
    const r = resolvePeriods(ps, { ...EMPTY_FILTERS, periodFrom: "2026-03", periodTo: "2026-04" })!;
    expect(r.kpiPeriod).toBe("2026-04");
    expect(r.inRange).toEqual(["2026-03", "2026-04"]);
    expect(r.transitionPeriod).toBe("2026-04");
  });
  it("rango invertido se corrige", () => {
    const r = resolvePeriods(ps, { ...EMPTY_FILTERS, periodFrom: "2026-05", periodTo: "2026-03" })!;
    expect(r.from).toBe("2026-03");
    expect(r.to).toBe("2026-05");
  });
  it("primer mes → sin comparación", () => {
    const r = resolvePeriods(ps, { ...EMPTY_FILTERS, periodTo: "2026-03" })!;
    expect(r.previousKpiPeriod).toBeNull();
  });
  it("con filtros de transición, los KPI pasan al último mes observable", () => {
    const r = resolvePeriods(ps, { ...EMPTY_FILTERS, clases: ["deterioro"] })!;
    expect(r.kpiPeriod).toBe("2026-05");
  });
});

describe("comparación mensual de KPI", () => {
  it("calcula variación absoluta y porcentual frente al mes anterior", () => {
    const rs = [
      rec({ period: "2026-04", stage: 1, destination: 2, ead: 100, provision: 2, nContratos: 10 }),
      rec({ period: "2026-04", stage: 1, destination: 1, ead: 900, provision: 3, nContratos: 90 }),
      rec({ period: "2026-05", stage: 1, destination: 2, ead: 150, provision: 3, nContratos: 12 }),
      rec({ period: "2026-05", stage: 1, destination: 1, ead: 1050, provision: 3, nContratos: 95 }),
    ];
    const ps = periods(["2026-04", "2026-05"]);
    const k = computeKpis(groupByPeriod(rs), resolvePeriods(ps, EMPTY_FILTERS)!);
    expect(k.ead.current).toBe(1200);
    expect(k.ead.previous).toBe(1000);
    expect(k.ead.absolute).toBe(200);
    expect(k.ead.relative).toBeCloseTo(0.2);
    expect(k.nContratos.current).toBe(107);
    expect(k.eadDeteriorado.current).toBe(150);
    expect(k.eadDeteriorado.previous).toBe(100);
    expect(k.coverage.current).toBeCloseTo(6 / 1200);
  });
});

describe("transiciones y calidad de cartera", () => {
  const rs = [
    rec({ stage: 1, destination: 1, ead: 800, nContratos: 80, provision: 4 }),
    rec({ stage: 1, destination: 2, ead: 100, nContratos: 5, provision: 2 }),
    rec({ stage: 1, destination: "S", ead: 100, nContratos: 10, provision: 1 }),
    rec({ stage: 2, destination: 1, ead: 30, nContratos: 3, provision: 1 }),
    rec({ stage: 2, destination: 3, ead: 20, nContratos: 2, provision: 4 }),
    rec({ stage: 3, destination: 3, ead: 50, nContratos: 1, provision: 25 }),
  ];
  it("suma de transiciones = total del universo", () => {
    const s = summarizeTransitions(rs);
    const sumFlows = s.flows.reduce((a, f) => a + f.ead, 0);
    expect(sumFlows).toBe(s.total.ead);
    expect(s.flows.reduce((a, f) => a + f.nContratos, 0)).toBe(s.total.nContratos);
  });
  it("% del EAD de origen", () => {
    const s = summarizeTransitions(rs);
    expect(s.flows.find((f) => f.key === "1-2")!.pctOfOrigin).toBeCloseTo(0.1);
    expect(s.flows.find((f) => f.key === "2-1")!.pctOfOrigin).toBeCloseTo(0.6);
  });
  it("omite transiciones inexistentes", () => {
    const s = summarizeTransitions(rs);
    expect(s.flows.find((f) => f.key === "3-1")).toBeUndefined();
  });
  it("tasas de deterioro y cura con denominadores susceptibles", () => {
    const q = portfolioQuality(rs);
    expect(q.eadDeteriorado).toBe(120);
    expect(q.eadSusceptibleDeterioro).toBe(1050);
    expect(q.tasaDeterioro).toBeCloseTo(120 / 1050);
    expect(q.tasaCura).toBeCloseTo(30 / 100);
    expect(q.eadByClass.salida).toBe(100);
  });
  it("Salida Cartera es un destino independiente en la distribución", () => {
    const s = summarizeTransitions(rs);
    expect(s.destinationTotals.S.ead).toBe(100);
  });
  it("distribución por stage suma 100 %", () => {
    const d = stageDistribution(rs);
    const share = d.slices.reduce((a, s) => a + (s.shareEad ?? 0), 0);
    expect(share).toBeCloseTo(1);
  });
});

describe("series temporales", () => {
  it("meses sin datos → null (discontinuidad), no 0", () => {
    const rs = [rec({ period: "2026-01", stage: 1, destination: 1, ead: 10 })];
    const s = timeSeries(groupByPeriod(rs), ["2026-01", "2026-02"], "ead");
    expect(s[0].total).toBe(10);
    expect(s[1].total).toBeNull();
    expect(s[0].s2).toBeNull();
  });
});
