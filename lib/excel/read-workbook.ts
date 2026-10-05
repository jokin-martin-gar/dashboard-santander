import * as XLSX from "xlsx";
import type { RawSheet } from "@/types/data";
import { scoreHeaders } from "./headers";

export class ExcelReadError extends Error {
  constructor(
    public readonly code: "invalid_file" | "unsupported_type" | "empty_workbook" | "empty_sheet" | "no_header",
    message: string,
  ) {
    super(message);
    this.name = "ExcelReadError";
  }
}

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".xlsm"];

export function isAcceptedExcelName(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export interface SheetSummary {
  name: string;
  rows: number;
  columns: number;
  /** Nº de columnas esperadas reconocidas en la fila de encabezados detectada. */
  score: number;
}

export interface LoadedWorkbook {
  workbook: XLSX.WorkBook;
  sheets: SheetSummary[];
  /** Hoja más probable: la de mayor puntuación de encabezados (empate → más filas). */
  bestSheet: string;
}

/** Lee el binario del Excel (en memoria; nunca se envía a ningún servicio). */
export function readWorkbook(data: ArrayBuffer | Uint8Array): LoadedWorkbook {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(data, { type: "array", cellDates: false, cellFormula: false, cellHTML: false, cellText: false });
  } catch (e) {
    throw new ExcelReadError(
      "invalid_file",
      `No se ha podido leer el archivo como Excel. ${e instanceof Error ? e.message : ""}`.trim(),
    );
  }
  if (!workbook.SheetNames.length) throw new ExcelReadError("empty_workbook", "El libro no contiene hojas.");

  const sheets: SheetSummary[] = workbook.SheetNames.map((name) => {
    const ws = workbook.Sheets[name];
    const ref = ws?.["!ref"];
    if (!ws || !ref) return { name, rows: 0, columns: 0, score: 0 };
    const range = XLSX.utils.decode_range(ref);
    const head = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
      range: { s: range.s, e: { r: Math.min(range.e.r, range.s.r + 20), c: range.e.c } },
    });
    const score = Math.max(0, ...head.map((r) => scoreHeaders(r)));
    return { name, rows: range.e.r - range.s.r, columns: range.e.c - range.s.c + 1, score };
  });

  const best = [...sheets].sort((a, b) => b.score - a.score || b.rows - a.rows)[0];
  return { workbook, sheets, bestSheet: best.name };
}

/**
 * Extrae la hoja como matriz de valores brutos. La fila de encabezados es la primera (en las 20
 * primeras) que reconoce más columnas esperadas; las filas completamente vacías se omiten.
 */
export function extractSheet(workbook: XLSX.WorkBook, sheetName: string): RawSheet {
  const ws = workbook.Sheets[sheetName];
  if (!ws || !ws["!ref"]) throw new ExcelReadError("empty_sheet", `La hoja «${sheetName}» está vacía.`);
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
  const startRow = XLSX.utils.decode_range(ws["!ref"]).s.r;

  let headerIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const s = scoreHeaders(aoa[i] ?? []);
    if (s > bestScore) {
      bestScore = s;
      headerIdx = i;
    }
  }
  if (headerIdx < 0 || bestScore < 3) {
    throw new ExcelReadError(
      "no_header",
      `No se ha encontrado una fila de encabezados reconocible en la hoja «${sheetName}».`,
    );
  }
  const headers = (aoa[headerIdx] ?? []).map((h) => (h === null || h === undefined ? "" : String(h)));
  const rows: unknown[][] = [];
  const excelRows: number[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    if (r.every((v) => v === null || v === undefined || (typeof v === "string" && v.trim() === ""))) continue;
    rows.push(r);
    excelRows.push(startRow + i + 1); // base 1
  }
  return { headers, rows, excelRows };
}
