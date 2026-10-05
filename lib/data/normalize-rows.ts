import type {
  CanonicalColumn,
  ColumnMapping,
  DiscardedRow,
  PeriodKey,
  RawSheet,
  RiskRecord,
  RowWarningCode,
  Stage,
} from "@/types/data";
import {
  inferColumnLocale,
  isNullLike,
  parseCategory,
  parseExcelDate,
  parseFlag,
  parseNumber,
  type NumberLocale,
} from "@/lib/excel/parse-values";
import { addMonths, periodFromIsoDate, periodKey } from "./periods";
import { classifyTransition, parseStage, parseTransition, transitionKey } from "./transitions";

/** Tiempos superiores a 100 años (en días) se marcan como atípicos. */
export const TIEMPO_OUTLIER_DAYS = 36_525;

const NUMERIC_COLUMNS: CanonicalColumn[] = [
  "nContratos",
  "ead",
  "provision",
  "tiempoEnCartera",
  "tiempoAVencimiento",
  "aniosTtm",
  "eadS1",
  "eadS2",
  "eadS3",
  "anio",
  "mes",
  "anioTransiciones",
  "mesTransiciones",
];

export interface NormalizeResult {
  /** Registros válidos. `transitionObservable` se calcula después, cuando se conocen los períodos. */
  records: RiskRecord[];
  discarded: DiscardedRow[];
  inconsistentTransitions: number;
  unrecognized: Map<string, Set<string>>;
}

function addUnrecognized(map: Map<string, Set<string>>, column: string, value: string) {
  let s = map.get(column);
  if (!s) map.set(column, (s = new Set()));
  if (s.size < 50) s.add(value);
}

const EXPECTED_FLAGS: Record<"titulizado" | "flag_individualizado", ReadonlySet<string>> = {
  titulizado: new Set(["S", "N"]),
  flag_individualizado: new Set(["S", "N"]),
};

const approxEqual = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

export function normalizeRows(sheet: RawSheet, mapping: ColumnMapping): NormalizeResult {
  const idx = mapping.indexes;
  const get = (row: unknown[], col: CanonicalColumn): unknown => (idx[col] >= 0 ? row[idx[col]] : undefined);

  // Convención numérica por columna (sólo relevante si hay números almacenados como texto).
  const locales = new Map<CanonicalColumn, NumberLocale | null>();
  for (const col of NUMERIC_COLUMNS) {
    if (idx[col] < 0) continue;
    locales.set(col, inferColumnLocale(sheet.rows.map((r) => r[idx[col]])));
  }
  const num = (row: unknown[], col: CanonicalColumn) =>
    idx[col] >= 0 ? parseNumber(row[idx[col]], { locale: locales.get(col) ?? null }) : null;

  const records: RiskRecord[] = [];
  const discarded: DiscardedRow[] = [];
  const unrecognized = new Map<string, Set<string>>();
  let inconsistentTransitions = 0;

  sheet.rows.forEach((row, rawIndex) => {
    const excelRow = sheet.excelRows[rawIndex] ?? rawIndex + 2;
    const warnings: RowWarningCode[] = [];

    // --- Período (snapshot mensual) ---
    const fechaTablon = parseExcelDate(get(row, "fechaTablon"));
    const anio = num(row, "anio");
    const mes = num(row, "mes");
    const fromYm = anio !== null && mes !== null ? periodKey(anio, mes) : null;
    const fromFecha = periodFromIsoDate(fechaTablon);
    const period: PeriodKey | null = fromYm ?? fromFecha;
    if (!period) {
      discarded.push({ excelRow, reason: "Fecha / período no válido (fechatablon, Año y Mes vacíos o ilegibles)" });
      return;
    }
    if (fromYm && fromFecha && fromYm !== fromFecha) warnings.push("period_mismatch");

    // --- Stage de origen ---
    const stageRaw = get(row, "stage");
    const stage = parseStage(stageRaw);
    const transRaw = get(row, "transiciones");
    const parsedTransition = parseTransition(transRaw);
    if (stage === null && !parsedTransition) {
      discarded.push({ excelRow, reason: `Stage de origen no válido (${String(stageRaw ?? "vacío")})` });
      if (!isNullLike(stageRaw)) addUnrecognized(unrecognized, "stage", String(stageRaw));
      return;
    }
    if (stage === null && !isNullLike(stageRaw)) addUnrecognized(unrecognized, "stage", String(stageRaw));

    // --- Destino ---
    const stageDespuesRaw = get(row, "stageDespues");
    const stageDespues = parseStage(stageDespuesRaw);
    if (stageDespues === null && !isNullLike(stageDespuesRaw) && stageDespuesRaw !== undefined) {
      addUnrecognized(unrecognized, "stage_despues", String(stageDespuesRaw));
    }
    if (!parsedTransition && !isNullLike(transRaw) && transRaw !== undefined) {
      addUnrecognized(unrecognized, "Transiciones", String(transRaw));
    }

    const origin: Stage = stage ?? parsedTransition!.from;
    let destination = parsedTransition?.to ?? null;
    if (destination === null) {
      if (stageDespues !== null) destination = stageDespues;
      else if (idx.transiciones < 0 && isNullLike(stageDespuesRaw)) destination = "S";
    }
    if (destination === null) {
      discarded.push({ excelRow, reason: `Transición no reconocida (${String(transRaw ?? "vacía")})` });
      return;
    }

    // Coherencia stage / stage_despues / Transiciones
    let inconsistent = false;
    if (parsedTransition && stage !== null && parsedTransition.from !== stage) inconsistent = true;
    if (parsedTransition && idx.stageDespues >= 0) {
      if (parsedTransition.to === "S" ? stageDespues !== null : stageDespues !== parsedTransition.to) inconsistent = true;
    }
    if (inconsistent) {
      inconsistentTransitions++;
      warnings.push("transition_inconsistent");
    }

    // --- Métricas ---
    const nContratos = num(row, "nContratos");
    const ead = num(row, "ead");
    const provision = num(row, "provision");
    const tiempoEnCartera = num(row, "tiempoEnCartera");
    const tiempoAVencimiento = num(row, "tiempoAVencimiento");
    const aniosTtm = num(row, "aniosTtm");
    const eadS1 = num(row, "eadS1");
    const eadS2 = num(row, "eadS2");
    const eadS3 = num(row, "eadS3");

    if (ead === null) warnings.push("ead_missing");
    if (provision === null) warnings.push("provision_missing");
    if (nContratos === null) warnings.push("n_contratos_missing");
    if (ead !== null && provision !== null && provision > ead && !approxEqual(provision, ead)) {
      warnings.push("provision_gt_ead");
    }
    if (
      (tiempoEnCartera !== null && tiempoEnCartera > TIEMPO_OUTLIER_DAYS) ||
      (tiempoAVencimiento !== null && tiempoAVencimiento > TIEMPO_OUTLIER_DAYS)
    ) {
      warnings.push("tiempo_outlier");
    }
    if (ead !== null && idx.eadS1 >= 0 && idx.eadS2 >= 0 && idx.eadS3 >= 0) {
      const split = [eadS1 ?? 0, eadS2 ?? 0, eadS3 ?? 0];
      const ok = split.every((v, i) => (i === origin - 1 ? approxEqual(v, ead) : approxEqual(v, 0)));
      if (!ok) warnings.push("ead_split_mismatch");
    }

    // --- Dimensiones ---
    const cartera = parseCategory(get(row, "cartera")) ?? "(Sin cartera)";
    const titulizado = parseFlag(get(row, "titulizado")) ?? "N/D";
    const flagIndividualizado = parseFlag(get(row, "flagIndividualizado")) ?? "N/D";
    if (idx.titulizado >= 0 && !EXPECTED_FLAGS.titulizado.has(titulizado)) {
      addUnrecognized(unrecognized, "titulizado", titulizado);
    }
    if (idx.flagIndividualizado >= 0 && !EXPECTED_FLAGS.flag_individualizado.has(flagIndividualizado)) {
      addUnrecognized(unrecognized, "flag_individualizado", flagIndividualizado);
    }

    // --- Período de destino de la transición ---
    const anioT = num(row, "anioTransiciones");
    const mesT = num(row, "mesTransiciones");
    const transitionPeriod =
      (anioT !== null && mesT !== null ? periodKey(anioT, mesT) : null) ?? addMonths(period, 1);

    records.push({
      id: records.length,
      rawIndex,
      excelRow,
      period,
      fechaTablon,
      transitionPeriod,
      cartera,
      titulizado,
      flagIndividualizado,
      stage: origin,
      stageDespues,
      destination,
      transition: transitionKey(origin, destination),
      transitionClass: classifyTransition(origin, destination),
      transitionObservable: true,
      nContratos,
      ead,
      provision,
      tiempoEnCartera,
      tiempoAVencimiento,
      aniosTtm,
      eadS1,
      eadS2,
      eadS3,
      warnings,
    });
  });

  return { records, discarded, inconsistentTransitions, unrecognized };
}
