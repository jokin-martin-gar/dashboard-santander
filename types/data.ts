/**
 * Modelo de datos normalizado del dashboard.
 *
 * Cada fila del Excel es un registro AGREGADO (no un contrato): agrupa los contratos de un
 * mes (Año/Mes), una subcartera (Cartera × titulizado × flag_individualizado) y una
 * transición (stage → stage del mes siguiente). Ver docs/data-audit.md.
 */

export type Stage = 1 | 2 | 3;

/** Destino de una transición: un stage o la salida de la cartera ("S"). */
export type Destination = Stage | "S";

/** Clave canónica de transición: "1-2", "3-S", ... */
export type TransitionKey = `${Stage}-${Destination}`;

export type TransitionClass = "permanencia" | "deterioro" | "cura" | "salida";

/** Período mensual de snapshot con formato "YYYY-MM". */
export type PeriodKey = string;

export interface RiskRecord {
  /** Índice estable del registro (posición en el array de registros válidos). */
  id: number;
  /** Índice de la fila en los datos brutos de la hoja (0 = primera fila de datos). */
  rawIndex: number;
  /** Número de fila en Excel (1 = cabecera). */
  excelRow: number;

  period: PeriodKey;
  /** fechatablon normalizada (ISO yyyy-mm-dd). Fecha de corte de la subcartera dentro del mes. */
  fechaTablon: string | null;
  /** Período de destino de la transición ("YYYY-MM"), normalmente period + 1 mes. */
  transitionPeriod: PeriodKey | null;

  cartera: string;
  titulizado: string;
  flagIndividualizado: string;

  stage: Stage;
  /** stage_despues: null cuando el contrato sale de la cartera. */
  stageDespues: Stage | null;
  destination: Destination;
  transition: TransitionKey;
  transitionClass: TransitionClass;
  /**
   * false cuando el período siguiente no existe en el fichero: el destino no es observable y la
   * fila aparece como "Salida Cartera" por construcción (último mes disponible).
   */
  transitionObservable: boolean;

  nContratos: number | null;
  ead: number | null;
  provision: number | null;
  tiempoEnCartera: number | null;
  tiempoAVencimiento: number | null;
  aniosTtm: number | null;

  eadS1: number | null;
  eadS2: number | null;
  eadS3: number | null;

  /** Códigos de advertencia de calidad asociados a la fila. */
  warnings: RowWarningCode[];
}

export type RowWarningCode =
  | "ead_missing"
  | "provision_missing"
  | "n_contratos_missing"
  | "transition_inconsistent"
  | "ead_split_mismatch"
  | "provision_gt_ead"
  | "tiempo_outlier"
  | "duplicate_row"
  | "duplicate_key"
  | "period_mismatch";

export interface PeriodInfo {
  key: PeriodKey;
  /** Etiqueta corta en español: "jun 2026". */
  label: string;
  /** Fecha máxima de fechatablon observada en el período. */
  maxFechaTablon: string | null;
  /** Fechas de corte distintas que componen el período. */
  fechasTablon: string[];
  rows: number;
  /** true si el período siguiente existe en el fichero y por tanto las transiciones son observables. */
  transitionsObservable: boolean;
}

export interface ColumnMapping {
  /** Clave canónica → encabezado real del Excel (o null si no existe). */
  resolved: Record<CanonicalColumn, string | null>;
  /** Índice de columna de cada clave canónica. */
  indexes: Record<CanonicalColumn, number>;
  duplicates: { header: string; column: number; keptColumn: number }[];
  unrecognized: string[];
}

export type CanonicalColumn =
  | "nContratos"
  | "fechaTablon"
  | "anio"
  | "mes"
  | "cartera"
  | "titulizado"
  | "flagIndividualizado"
  | "stage"
  | "stageDespues"
  | "transiciones"
  | "ead"
  | "provision"
  | "tiempoEnCartera"
  | "tiempoAVencimiento"
  | "aniosTtm"
  | "anioTransiciones"
  | "mesTransiciones"
  | "eadS1"
  | "eadS2"
  | "eadS3";

export interface DiscardedRow {
  excelRow: number;
  reason: string;
}

export interface QualityIssue {
  severity: "info" | "warning" | "error";
  code: string;
  title: string;
  detail: string;
  count?: number;
}

export interface QualityReport {
  totalRows: number;
  validRows: number;
  discardedRows: number;
  rowsWithWarnings: number;
  discarded: DiscardedRow[];
  exactDuplicates: number;
  keyDuplicates: number;
  nullsByColumn: { column: string; nulls: number; pct: number }[];
  minFecha: string | null;
  maxFecha: string | null;
  minPeriod: PeriodKey | null;
  maxPeriod: PeriodKey | null;
  inconsistentTransitions: number;
  unrecognizedValues: { column: string; values: string[] }[];
  /** Períodos cuyo total de N_contratos se desvía fuertemente de sus vecinos. */
  contractAnomalies: { period: PeriodKey; total: number; reference: number; ratio: number }[];
  warningCounts: Partial<Record<RowWarningCode, number>>;
  issues: QualityIssue[];
}

export interface RawSheet {
  headers: string[];
  /** Valores tal como los entrega SheetJS (raw), sin transformar. */
  rows: unknown[][];
  /** Número de fila en Excel (base 1) de cada elemento de `rows`. */
  excelRows: number[];
}

export interface Dataset {
  fileName: string;
  sheetName: string;
  sheetNames: string[];
  source: "default" | "upload";
  loadedAt: string;
  parseMs: number;
  records: RiskRecord[];
  raw: RawSheet;
  mapping: ColumnMapping;
  periods: PeriodInfo[];
  dimensions: {
    carteras: string[];
    titulizado: string[];
    flags: string[];
  };
  quality: QualityReport;
}
