import type {
  ColumnMapping,
  DiscardedRow,
  PeriodInfo,
  PeriodKey,
  QualityIssue,
  QualityReport,
  RawSheet,
  RiskRecord,
  RowWarningCode,
} from "@/types/data";
import { isNullLike } from "@/lib/excel/parse-values";
import { periodLabel } from "@/lib/data/periods";

/** Umbral de desviación del total mensual de N_contratos frente a la mediana de sus vecinos. */
export const CONTRACT_ANOMALY_THRESHOLD = 0.35;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/**
 * Detecta meses cuyo total de N_contratos se desvía más de un 35 % de la mediana de los
 * (hasta) 3 meses anteriores y 3 posteriores. Sirve para señalar cargas anómalas del recuento
 * de contratos sin alterar los datos.
 */
export function detectContractAnomalies(
  totals: { period: PeriodKey; total: number }[],
): QualityReport["contractAnomalies"] {
  const out: QualityReport["contractAnomalies"] = [];
  totals.forEach((t, i) => {
    const neighbours = [...totals.slice(Math.max(0, i - 3), i), ...totals.slice(i + 1, i + 4)].map((x) => x.total);
    if (neighbours.length < 2) return;
    const reference = median(neighbours);
    if (!(reference > 0)) return;
    const ratio = t.total / reference;
    if (Math.abs(ratio - 1) > CONTRACT_ANOMALY_THRESHOLD) out.push({ period: t.period, total: t.total, reference, ratio });
  });
  return out;
}

export function findDuplicates(sheet: RawSheet, records: RiskRecord[]) {
  const seenRaw = new Set<string>();
  const exact = new Set<number>();
  sheet.rows.forEach((r, i) => {
    const k = JSON.stringify(r);
    if (seenRaw.has(k)) exact.add(i);
    else seenRaw.add(k);
  });
  const seenKey = new Set<string>();
  const keyDup = new Set<number>();
  for (const r of records) {
    const k = [r.period, r.fechaTablon, r.cartera, r.titulizado, r.flagIndividualizado, r.transition].join("|");
    if (seenKey.has(k)) keyDup.add(r.id);
    else seenKey.add(k);
  }
  return { exact, keyDup };
}

const WARNING_TEXT: Record<RowWarningCode, string> = {
  ead_missing: "EAD vacío",
  provision_missing: "Provision vacía",
  n_contratos_missing: "N_contratos vacío",
  transition_inconsistent: "Transición incoherente con stage / stage_despues",
  ead_split_mismatch: "EAD_S1/S2/S3 no coincide con EAD del stage de origen",
  provision_gt_ead: "Provisión superior al EAD",
  tiempo_outlier: "Tiempo en cartera o a vencimiento superior a 100 años",
  duplicate_row: "Fila duplicada exacta",
  duplicate_key: "Clave duplicada (fecha, cartera, titulizado, flag, transición)",
  period_mismatch: "fechatablon no coincide con Año/Mes",
};

export function warningText(code: RowWarningCode): string {
  return WARNING_TEXT[code];
}

export interface BuildQualityInput {
  sheet: RawSheet;
  mapping: ColumnMapping;
  records: RiskRecord[];
  discarded: DiscardedRow[];
  periods: PeriodInfo[];
  inconsistentTransitions: number;
  unrecognized: Map<string, Set<string>>;
  exactDuplicates: number;
  keyDuplicates: number;
}

export function buildQualityReport(input: BuildQualityInput): QualityReport {
  const { sheet, mapping, records, discarded, periods } = input;
  const total = sheet.rows.length;

  const nullsByColumn = sheet.headers
    .map((h, i) => {
      if (!h) return null;
      let n = 0;
      for (const r of sheet.rows) if (isNullLike(r[i])) n++;
      return { column: h, nulls: n, pct: total ? n / total : 0 };
    })
    .filter((x): x is { column: string; nulls: number; pct: number } => x !== null);

  const warningCounts: Partial<Record<RowWarningCode, number>> = {};
  let rowsWithWarnings = 0;
  for (const r of records) {
    if (r.warnings.length) rowsWithWarnings++;
    for (const w of r.warnings) warningCounts[w] = (warningCounts[w] ?? 0) + 1;
  }

  let minFecha: string | null = null;
  let maxFecha: string | null = null;
  for (const r of records) {
    if (!r.fechaTablon) continue;
    if (!minFecha || r.fechaTablon < minFecha) minFecha = r.fechaTablon;
    if (!maxFecha || r.fechaTablon > maxFecha) maxFecha = r.fechaTablon;
  }

  const totalsByPeriod = new Map<PeriodKey, number>();
  for (const r of records) totalsByPeriod.set(r.period, (totalsByPeriod.get(r.period) ?? 0) + (r.nContratos ?? 0));
  const contractAnomalies = detectContractAnomalies(
    periods.map((p) => ({ period: p.key, total: totalsByPeriod.get(p.key) ?? 0 })),
  );

  const unrecognizedValues = [...input.unrecognized].map(([column, values]) => ({ column, values: [...values] }));

  const issues: QualityIssue[] = [];
  if (discarded.length) {
    issues.push({
      severity: "error",
      code: "discarded",
      title: "Filas descartadas",
      detail: "Filas sin período, stage o transición interpretables. No intervienen en ningún cálculo.",
      count: discarded.length,
    });
  }
  const eadMissing = records.filter((r) => r.ead === null);
  if (eadMissing.length) {
    const carteras = [...new Set(eadMissing.map((r) => r.cartera))];
    issues.push({
      severity: "warning",
      code: "ead_missing",
      title: "EAD no informado",
      detail: `Filas con EAD vacío (${carteras.slice(0, 4).join(", ")}${carteras.length > 4 ? "…" : ""}). Se excluyen de las sumas de EAD (no se imputa 0 como valor real) y del numerador y denominador del coverage ratio; sus contratos y provisiones sí se suman.`,
      count: eadMissing.length,
    });
  }
  const nonObservable = periods.filter((p) => !p.transitionsObservable);
  if (nonObservable.length) {
    issues.push({
      severity: "warning",
      code: "transitions_not_observable",
      title: "Transiciones no observables",
      detail: `${nonObservable.map((p) => periodLabel(p.key)).join(", ")}: el mes siguiente no existe en el fichero, por lo que todas sus filas figuran como «Salida Cartera». Sus importes de stock son válidos, pero se excluyen de los análisis de transición.`,
      count: records.filter((r) => !r.transitionObservable).length,
    });
  }
  for (const a of contractAnomalies) {
    issues.push({
      severity: "warning",
      code: "contract_anomaly",
      title: `N_contratos anómalo en ${periodLabel(a.period)}`,
      detail: `Total ${Math.round(a.total).toLocaleString("es-ES")} frente a una mediana de ${Math.round(a.reference).toLocaleString("es-ES")} en los meses vecinos (×${a.ratio.toFixed(2)}). El EAD de ese mes no presenta un salto equivalente: revisar la carga de N_contratos.`,
    });
  }
  const multiCut = periods.filter((p) => p.fechasTablon.length > 1);
  if (multiCut.length) {
    issues.push({
      severity: "info",
      code: "multiple_cutoffs",
      title: "Varias fechas de corte por mes",
      detail: `${multiCut.length} meses contienen varias fechatablon (subcarteras con cortes distintos). Se agregan dentro del mismo snapshot mensual (Año/Mes).`,
      count: multiCut.length,
    });
  }
  if (input.inconsistentTransitions) {
    issues.push({
      severity: "warning",
      code: "transition_inconsistent",
      title: "Transiciones incoherentes",
      detail: "Filas donde Transiciones no coincide con stage / stage_despues. Se usa stage como origen y Transiciones como destino.",
      count: input.inconsistentTransitions,
    });
  }
  const codes: RowWarningCode[] = ["ead_split_mismatch", "provision_gt_ead", "tiempo_outlier", "period_mismatch", "provision_missing", "n_contratos_missing"];
  for (const c of codes) {
    const n = warningCounts[c];
    if (n) issues.push({ severity: c === "tiempo_outlier" ? "info" : "warning", code: c, title: WARNING_TEXT[c], detail: "", count: n });
  }
  if (input.exactDuplicates) {
    issues.push({
      severity: "warning",
      code: "duplicate_row",
      title: "Filas duplicadas exactas",
      detail: "Se conservan (no se eliminan automáticamente) y se señalan para revisión.",
      count: input.exactDuplicates,
    });
  }
  if (input.keyDuplicates) {
    issues.push({
      severity: "warning",
      code: "duplicate_key",
      title: "Claves duplicadas",
      detail: "Más de una fila para la misma fecha, cartera, titulizado, flag y transición.",
      count: input.keyDuplicates,
    });
  }
  for (const u of unrecognizedValues) {
    issues.push({
      severity: "info",
      code: `unrecognized_${u.column}`,
      title: `Valores no reconocidos en ${u.column}`,
      detail: `${u.values.join(", ")}. Se conservan tal cual como categoría propia; su significado debe confirmarse.`,
      count: u.values.length,
    });
  }
  if (mapping.duplicates.length) {
    issues.push({
      severity: "warning",
      code: "duplicate_header",
      title: "Encabezados duplicados",
      detail: mapping.duplicates.map((d) => `«${d.header}» (columna ${d.column + 1}, se usa la ${d.keptColumn + 1})`).join("; "),
      count: mapping.duplicates.length,
    });
  }

  return {
    totalRows: total,
    validRows: records.length,
    discardedRows: discarded.length,
    rowsWithWarnings,
    discarded,
    exactDuplicates: input.exactDuplicates,
    keyDuplicates: input.keyDuplicates,
    nullsByColumn,
    minFecha,
    maxFecha,
    minPeriod: periods[0]?.key ?? null,
    maxPeriod: periods.at(-1)?.key ?? null,
    inconsistentTransitions: input.inconsistentTransitions,
    unrecognizedValues,
    contractAnomalies,
    warningCounts,
    issues,
  };
}
