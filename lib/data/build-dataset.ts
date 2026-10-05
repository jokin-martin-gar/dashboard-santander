import type { Dataset, PeriodInfo, PeriodKey, RawSheet } from "@/types/data";
import { mapColumns, missingRequiredColumns } from "@/lib/excel/headers";
import { extractSheet, readWorkbook, type LoadedWorkbook } from "@/lib/excel/read-workbook";
import { buildQualityReport, findDuplicates } from "@/lib/validators/quality";
import { normalizeRows } from "./normalize-rows";
import { periodLabel } from "./periods";

export class DatasetError extends Error {
  constructor(
    public readonly code: "missing_columns" | "empty_sheet" | "no_valid_rows",
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
    this.name = "DatasetError";
  }
}

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

export interface BuildOptions {
  fileName: string;
  sheetName: string;
  sheetNames: string[];
  source: Dataset["source"];
}

/** Normaliza y valida una hoja ya extraída y construye el modelo de datos completo. */
export function buildDataset(sheet: RawSheet, options: BuildOptions): Dataset {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const mapping = mapColumns(sheet.headers);
  const missing = missingRequiredColumns(mapping);
  if (missing.length) {
    throw new DatasetError(
      "missing_columns",
      `Faltan columnas necesarias en la hoja «${options.sheetName}».`,
      missing,
    );
  }
  if (!sheet.rows.length) {
    throw new DatasetError("empty_sheet", `La hoja «${options.sheetName}» no contiene filas de datos.`);
  }

  const { records, discarded, inconsistentTransitions, unrecognized } = normalizeRows(sheet, mapping);
  if (!records.length) {
    throw new DatasetError(
      "no_valid_rows",
      "Ninguna fila ha podido interpretarse. Revise el formato de fechas, stages y transiciones.",
      discarded.slice(0, 5).map((d) => `Fila ${d.excelRow}: ${d.reason}`),
    );
  }

  // Períodos
  const byPeriod = new Map<PeriodKey, { rows: number; fechas: Set<string> }>();
  for (const r of records) {
    let p = byPeriod.get(r.period);
    if (!p) byPeriod.set(r.period, (p = { rows: 0, fechas: new Set() }));
    p.rows++;
    if (r.fechaTablon) p.fechas.add(r.fechaTablon);
  }
  const periodKeys = [...byPeriod.keys()].sort();
  const periodSet = new Set(periodKeys);
  for (const r of records) {
    r.transitionObservable = r.transitionPeriod !== null && periodSet.has(r.transitionPeriod);
  }
  const observableByPeriod = new Map<PeriodKey, boolean>();
  for (const r of records) {
    observableByPeriod.set(r.period, (observableByPeriod.get(r.period) ?? false) || r.transitionObservable);
  }
  const periods: PeriodInfo[] = periodKeys.map((key) => {
    const p = byPeriod.get(key)!;
    const fechas = [...p.fechas].sort();
    return {
      key,
      label: periodLabel(key),
      maxFechaTablon: fechas.at(-1) ?? null,
      fechasTablon: fechas,
      rows: p.rows,
      transitionsObservable: observableByPeriod.get(key) ?? false,
    };
  });

  // Duplicados
  const { exact, keyDup } = findDuplicates(sheet, records);
  for (const r of records) {
    if (exact.has(r.rawIndex)) r.warnings.push("duplicate_row");
    if (keyDup.has(r.id)) r.warnings.push("duplicate_key");
  }

  const uniqSorted = (values: string[]) => [...new Set(values)].sort(collator.compare);
  const dimensions = {
    carteras: uniqSorted(records.map((r) => r.cartera)),
    titulizado: uniqSorted(records.map((r) => r.titulizado)),
    flags: uniqSorted(records.map((r) => r.flagIndividualizado)),
  };

  const quality = buildQualityReport({
    sheet,
    mapping,
    records,
    discarded,
    periods,
    inconsistentTransitions,
    unrecognized,
    exactDuplicates: exact.size,
    keyDuplicates: keyDup.size,
  });

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    fileName: options.fileName,
    sheetName: options.sheetName,
    sheetNames: options.sheetNames,
    source: options.source,
    loadedAt: new Date().toISOString(),
    parseMs: Math.round(t1 - t0),
    records,
    raw: sheet,
    mapping,
    periods,
    dimensions,
    quality,
  };
}

/** Lee un binario Excel y construye el dataset con la hoja indicada (o la más probable). */
export function loadDatasetFromBinary(
  data: ArrayBuffer | Uint8Array,
  options: { fileName: string; source: Dataset["source"]; sheetName?: string },
): { dataset: Dataset; workbook: LoadedWorkbook } {
  const workbook = readWorkbook(data);
  const sheetName = options.sheetName && workbook.workbook.SheetNames.includes(options.sheetName)
    ? options.sheetName
    : workbook.bestSheet;
  const dataset = datasetFromWorkbook(workbook, sheetName, options);
  return { dataset, workbook };
}

export function datasetFromWorkbook(
  workbook: LoadedWorkbook,
  sheetName: string,
  options: { fileName: string; source: Dataset["source"] },
): Dataset {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const sheet = extractSheet(workbook.workbook, sheetName);
  const ds = buildDataset(sheet, {
    fileName: options.fileName,
    sheetName,
    sheetNames: workbook.workbook.SheetNames,
    source: options.source,
  });
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  ds.parseMs = Math.round(t1 - t0);
  return ds;
}
