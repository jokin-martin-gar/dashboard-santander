/**
 * Reconciliación con el Excel REAL de data/.
 *
 * Cada total se calcula dos veces:
 *  (a) de forma independiente, leyendo la hoja con SheetJS y sumando las columnas por su nombre
 *      original, sin pasar por la normalización de la aplicación;
 *  (b) con el pipeline de la aplicación (normalización + filtros + agregaciones).
 * Ambos deben coincidir.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { beforeAll, describe, expect, it } from "vitest";
import { loadDatasetFromBinary } from "@/lib/data/build-dataset";
import { applyDimensionFilters, groupByPeriod, resolvePeriods } from "@/lib/calculations/filters";
import { computeKpis, portfolioQuality, stageDistribution, summarizeTransitions } from "@/lib/calculations/aggregations";
import { sumMetrics } from "@/lib/calculations/metrics";
import { EMPTY_FILTERS } from "@/types/filters";
import type { Dataset } from "@/types/data";

const DATA_DIR = path.resolve(__dirname, "../../data");
const file = readdirSync(DATA_DIR).find((f) => /\.xlsx?$/i.test(f) && !f.startsWith("~$"));
if (!file) console.warn("[reconciliación] No hay Excel en data/: se omiten los tests de reconciliación.");
/** Los tests se omiten si el Excel (no versionado) no está presente. */
const suite = file ? describe : describe.skip;

type RawRow = Record<string, unknown>;
let ds: Dataset;
let raw: RawRow[];

const ym = (r: RawRow) => `${r["Año"]}-${String(r["Mes"]).padStart(2, "0")}`;
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const sumRaw = (rows: RawRow[], col: string) => rows.reduce((a, r) => a + num(r[col]), 0);

beforeAll(() => {
  if (!file) return;
  const buf = readFileSync(path.join(DATA_DIR, file));
  ds = loadDatasetFromBinary(new Uint8Array(buf), { fileName: file, source: "default" }).dataset;
  const wb = XLSX.read(buf, { type: "buffer" });
  // Los encabezados del Excel llevan formato contable: su texto formateado incluye espacios
  // (" EAD ", " N_contratos "). Aquí sólo se recortan, sin la normalización de la aplicación.
  raw = XLSX.utils
    .sheet_to_json<RawRow>(wb.Sheets[ds.sheetName], { raw: true, defval: null })
    .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), v])));
});

suite("estructura del Excel real", () => {
  it("procesa todas las filas sin descartes", () => {
    expect(ds.quality.totalRows).toBe(raw.length);
    expect(ds.records.length).toBe(raw.length);
    expect(ds.quality.discardedRows).toBe(0);
  });
  it("todas las transiciones son coherentes con stage / stage_despues", () => {
    expect(ds.quality.inconsistentTransitions).toBe(0);
  });
  it("EAD_S1/S2/S3 = EAD repartido por stage de origen (no se suman a EAD)", () => {
    expect(ds.quality.warningCounts.ead_split_mismatch ?? 0).toBe(0);
  });
  it("sin duplicados exactos ni de clave", () => {
    expect(ds.quality.exactDuplicates).toBe(0);
    expect(ds.quality.keyDuplicates).toBe(0);
  });
  it("el último mes no tiene transiciones observables", () => {
    const last = ds.periods.at(-1)!;
    expect(last.transitionsObservable).toBe(false);
    expect(ds.periods.slice(0, -1).every((p) => p.transitionsObservable)).toBe(true);
  });
});

suite("reconciliación por fecha", () => {
  it("SUM(EAD), SUM(Provision) y SUM(N_contratos) coinciden en TODOS los meses", () => {
    const byPeriod = groupByPeriod(ds.records);
    for (const p of ds.periods) {
      const rawRows = raw.filter((r) => ym(r) === p.key);
      const app = sumMetrics(byPeriod.get(p.key) ?? []);
      expect(app.ead!).toBeCloseTo(sumRaw(rawRows, "EAD"), 2);
      expect(app.provision!).toBeCloseTo(sumRaw(rawRows, "Provision"), 2);
      expect(app.nContratos).toBe(sumRaw(rawRows, "N_contratos"));
    }
  });

  it("los KPI por defecto corresponden al último mes y reconcilian con la hoja", () => {
    const res = resolvePeriods(ds.periods, EMPTY_FILTERS)!;
    const last = ds.periods.at(-1)!.key;
    expect(res.kpiPeriod).toBe(last);
    const k = computeKpis(groupByPeriod(ds.records), res);
    const rawRows = raw.filter((r) => ym(r) === last);
    expect(k.ead.current!).toBeCloseTo(sumRaw(rawRows, "EAD"), 2);
    expect(k.provision.current!).toBeCloseTo(sumRaw(rawRows, "Provision"), 2);
    expect(k.nContratos.current).toBe(sumRaw(rawRows, "N_contratos"));
    // Valores de referencia documentados en docs/data-audit.md
    expect(k.ead.current! / 1e9).toBeCloseTo(282.262, 2);
    expect(k.nContratos.current).toBe(6561155);
  });

  it("suma por stages = total y EAD_Sx = EAD del stage x", () => {
    const byPeriod = groupByPeriod(ds.records);
    for (const p of ds.periods) {
      const rs = byPeriod.get(p.key)!;
      const dist = stageDistribution(rs);
      const sumStages = dist.slices.reduce((a, s) => a + (s.totals.ead ?? 0), 0);
      expect(sumStages).toBeCloseTo(dist.total.ead!, 2);
      const rawRows = raw.filter((r) => ym(r) === p.key);
      expect(dist.slices[0].totals.ead ?? 0).toBeCloseTo(sumRaw(rawRows, "EAD_S1"), 2);
      expect(dist.slices[1].totals.ead ?? 0).toBeCloseTo(sumRaw(rawRows, "EAD_S2"), 2);
      expect(dist.slices[2].totals.ead ?? 0).toBeCloseTo(sumRaw(rawRows, "EAD_S3"), 2);
    }
  });

  it("suma por transiciones = total del mismo universo (meses observables)", () => {
    const byPeriod = groupByPeriod(ds.records);
    for (const p of ds.periods.filter((x) => x.transitionsObservable)) {
      const rs = byPeriod.get(p.key)!;
      const s = summarizeTransitions(rs);
      const total = sumMetrics(rs);
      expect(s.flows.reduce((a, f) => a + f.ead, 0)).toBeCloseTo(total.ead!, 2);
      expect(s.flows.reduce((a, f) => a + f.nContratos, 0)).toBe(total.nContratos);
      expect(s.flows.reduce((a, f) => a + f.provision, 0)).toBeCloseTo(total.provision!, 2);
      // por transición, contra la columna Transiciones original
      const rawRows = raw.filter((r) => ym(r) === p.key);
      for (const f of s.flows) {
        const label = f.to === "S" ? `${f.from}-Salida Cartera` : `${f.from}-${f.to}`;
        expect(f.ead).toBeCloseTo(sumRaw(rawRows.filter((r) => r["Transiciones"] === label), "EAD"), 2);
      }
      // las clases de transición también cuadran con el total
      const q = portfolioQuality(rs);
      const sumClasses = Object.values(q.eadByClass).reduce((a, v) => a + v, 0);
      expect(sumClasses).toBeCloseTo(total.ead!, 2);
    }
  });

  it("los filtros reconcilian: Σ por cartera = total", () => {
    const last = ds.periods.at(-2)!.key;
    const rsAll = ds.records.filter((r) => r.period === last);
    const total = sumMetrics(rsAll).ead!;
    let acc = 0;
    for (const c of ds.dimensions.carteras) {
      acc += sumMetrics(applyDimensionFilters(rsAll, { ...EMPTY_FILTERS, carteras: [c] })).ead ?? 0;
    }
    expect(acc).toBeCloseTo(total, 2);
  });

  it("EAD deteriorado = EAD de 1-2, 1-3 y 2-3 en el último mes observable", () => {
    const res = resolvePeriods(ds.periods, EMPTY_FILTERS)!;
    const k = computeKpis(groupByPeriod(ds.records), res);
    const rawRows = raw.filter((r) => ym(r) === res.transitionPeriod);
    const expected = sumRaw(rawRows.filter((r) => ["1-2", "1-3", "2-3"].includes(String(r["Transiciones"]))), "EAD");
    expect(k.eadDeteriorado.current!).toBeCloseTo(expected, 2);
  });
});

suite("calidad", () => {
  it("las filas sin EAD son las de 'No asignadas'", () => {
    const missing = ds.records.filter((r) => r.ead === null);
    expect(missing.length).toBe(raw.filter((r) => r["EAD"] === null).length);
    expect(new Set(missing.map((r) => r.cartera))).toEqual(new Set(["No asignadas"]));
  });
  it("detecta la anomalía de N_contratos de ago-sep 2024", () => {
    const anomalies = ds.quality.contractAnomalies.map((a) => a.period);
    expect(anomalies).toContain("2024-08");
    expect(anomalies).toContain("2024-09");
  });
});
