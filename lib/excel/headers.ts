import type { CanonicalColumn, ColumnMapping } from "@/types/data";

/**
 * Normaliza un encabezado para compararlo: elimina acentos (ñ → n), pasa a minúsculas,
 * convierte espacios/guiones/puntos en "_" y colapsa separadores repetidos.
 */
export function normalizeHeader(header: unknown): string {
  return String(header ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[  ]/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[\s\-–—.\/]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Alias aceptados por columna canónica (ya normalizados). El primero es el nombre esperado. */
export const COLUMN_ALIASES: Record<CanonicalColumn, readonly string[]> = {
  nContratos: ["n_contratos", "ncontratos", "num_contratos", "numero_contratos", "n_contrato", "contratos"],
  fechaTablon: ["fechatablon", "fecha_tablon", "fecha", "fecha_datos", "fecha_snapshot"],
  anio: ["ano", "anio", "year"],
  mes: ["mes", "month"],
  cartera: ["cartera", "portfolio", "segmento"],
  titulizado: ["titulizado", "titulizada", "titulizacion"],
  flagIndividualizado: ["flag_individualizado", "individualizado", "flag_individual"],
  stage: ["stage", "stage_origen", "stage_antes"],
  stageDespues: ["stage_despues", "stage_destino", "stage_after"],
  transiciones: ["transiciones", "transicion", "transition", "transitions"],
  ead: ["ead", "exposicion", "exposure"],
  provision: ["provision", "provisiones", "provisions"],
  tiempoEnCartera: ["tiempo_en_cartera", "antiguedad"],
  tiempoAVencimiento: ["tiempo_a_vencimiento", "tiempo_vencimiento"],
  aniosTtm: ["anos_ttm", "anios_ttm", "years_ttm", "ttm"],
  anioTransiciones: ["ano_transiciones", "anio_transiciones", "ano_transicion"],
  mesTransiciones: ["mes_transiciones", "mes_transicion"],
  eadS1: ["ead_s1", "ead_stage1", "ead_stage_1"],
  eadS2: ["ead_s2", "ead_stage2", "ead_stage_2"],
  eadS3: ["ead_s3", "ead_stage3", "ead_stage_3"],
};

export const CANONICAL_COLUMNS = Object.keys(COLUMN_ALIASES) as CanonicalColumn[];

/** Nombre de columna esperado (para mensajes y exportación). */
export const CANONICAL_LABEL: Record<CanonicalColumn, string> = {
  nContratos: "N_contratos",
  fechaTablon: "fechatablon",
  anio: "Año",
  mes: "Mes",
  cartera: "Cartera",
  titulizado: "titulizado",
  flagIndividualizado: "flag_individualizado",
  stage: "stage",
  stageDespues: "stage_despues",
  transiciones: "Transiciones",
  ead: "EAD",
  provision: "Provision",
  tiempoEnCartera: "tiempo_en_cartera",
  tiempoAVencimiento: "tiempo_a_vencimiento",
  aniosTtm: "años_ttm",
  anioTransiciones: "Año_Transiciones",
  mesTransiciones: "Mes_Transiciones",
  eadS1: "EAD_S1",
  eadS2: "EAD_S2",
  eadS3: "EAD_S3",
};

/**
 * Asocia los encabezados reales a las columnas canónicas.
 * - Si un encabezado aparece duplicado, se conserva la PRIMERA aparición y se informa del resto.
 * - Los encabezados no reconocidos se informan pero no bloquean la carga.
 */
export function mapColumns(headers: unknown[]): ColumnMapping {
  const resolved = Object.fromEntries(CANONICAL_COLUMNS.map((c) => [c, null])) as Record<
    CanonicalColumn,
    string | null
  >;
  const indexes = Object.fromEntries(CANONICAL_COLUMNS.map((c) => [c, -1])) as Record<CanonicalColumn, number>;
  const duplicates: ColumnMapping["duplicates"] = [];
  const unrecognized: string[] = [];

  const lookup = new Map<string, CanonicalColumn>();
  // Prioridad por orden de alias: los alias exactos se registran primero.
  for (const col of CANONICAL_COLUMNS) {
    for (const alias of COLUMN_ALIASES[col]) {
      if (!lookup.has(alias)) lookup.set(alias, col);
    }
  }

  headers.forEach((h, i) => {
    const raw = String(h ?? "").trim();
    if (raw === "") return;
    const col = lookup.get(normalizeHeader(raw));
    if (!col) {
      unrecognized.push(raw);
      return;
    }
    if (indexes[col] >= 0) {
      duplicates.push({ header: raw, column: i, keptColumn: indexes[col] });
      return;
    }
    resolved[col] = raw;
    indexes[col] = i;
  });

  return { resolved, indexes, duplicates, unrecognized };
}

/** Requisitos mínimos para poder construir el dashboard. */
export function missingRequiredColumns(mapping: ColumnMapping): string[] {
  const m = mapping.indexes;
  const missing: string[] = [];
  const need: CanonicalColumn[] = ["nContratos", "cartera", "stage", "ead", "provision"];
  for (const c of need) if (m[c] < 0) missing.push(CANONICAL_LABEL[c]);
  if (m.fechaTablon < 0 && (m.anio < 0 || m.mes < 0)) missing.push("fechatablon (o Año + Mes)");
  if (m.transiciones < 0 && m.stageDespues < 0) missing.push("Transiciones (o stage_despues)");
  return missing;
}

/** Puntuación de una hoja: número de columnas canónicas reconocidas en sus encabezados. */
export function scoreHeaders(headers: unknown[]): number {
  const m = mapColumns(headers);
  return CANONICAL_COLUMNS.filter((c) => m.indexes[c] >= 0).length;
}
