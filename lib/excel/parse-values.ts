/**
 * Parsers tolerantes para los valores de celda del Excel.
 *
 * Reglas:
 * - Los marcadores de ausencia ("", "-", "–", "—", "null", "N/A", "n.d.", "#N/A", ...) devuelven null.
 *   Nunca se convierten en 0 aquí: la decisión de tratar un nulo como 0 se toma en las agregaciones.
 * - Los números pueden llegar como number (lo normal en este Excel) o como texto en formato
 *   español ("40.852.201.826,68") o internacional ("40852201826.68" / "40,852,201,826.68").
 */

const NULL_MARKERS = new Set([
  "",
  "-",
  "–",
  "—",
  "−",
  "null",
  "nul",
  "none",
  "nan",
  "n/a",
  "na",
  "n.a.",
  "n/d",
  "nd",
  "n.d.",
  "#n/a",
  "#n/d",
  "#¡valor!",
  "#value!",
  "#ref!",
  "#div/0!",
  "#¡div/0!",
]);

export function isNullLike(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return Number.isNaN(value);
  if (typeof value === "string") return NULL_MARKERS.has(value.trim().toLowerCase());
  return false;
}

export type NumberLocale = "es" | "en";

/** Determina la convención de un texto numérico si es inequívoca. */
export function detectNumberLocale(text: string): NumberLocale | null {
  const s = text.replace(/[\s €$%]/g, "");
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) return lastComma > lastDot ? "es" : "en";
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  if (dots > 1) return "es";
  if (commas > 1) return "en";
  // Un único separador seguido de un número de dígitos distinto de 3 → es decimal.
  if (commas === 1 && !/,\d{3}$/.test(s)) return "es";
  if (dots === 1 && !/\.\d{3}$/.test(s)) return "en";
  return null;
}

/**
 * Infiere la convención numérica de una columna a partir de sus valores de texto.
 * Devuelve null si no hay evidencia suficiente.
 */
export function inferColumnLocale(values: unknown[]): NumberLocale | null {
  let es = 0;
  let en = 0;
  for (const v of values) {
    if (typeof v !== "string") continue;
    const loc = detectNumberLocale(v);
    if (loc === "es") es++;
    else if (loc === "en") en++;
  }
  if (es === 0 && en === 0) return null;
  return es >= en ? "es" : "en";
}

export interface ParseNumberOptions {
  /** Convención a usar cuando el texto es ambiguo ("1.234" o "1,234"). */
  locale?: NumberLocale | null;
}

/**
 * Convierte un valor de celda a número finito o null.
 * - Acepta signo, paréntesis contables "(1.234,5)", símbolos € y espacios (incl. NBSP).
 * - Los porcentajes en texto ("12,5 %") se devuelven como fracción (0.125).
 * - Casos ambiguos con un único separador y 3 dígitos detrás: se usa `options.locale`; si no se
 *   indica, se interpretan como separador decimal (no se multiplica la magnitud por 1000).
 */
export function parseNumber(value: unknown, options: ParseNumberOptions = {}): number | null {
  if (isNullLike(value)) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return null;
  if (value instanceof Date) return null;
  if (typeof value !== "string") return null;

  let s = value.trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  const isPercent = s.includes("%");
  s = s.replace(/[\s  €$%]/g, "").replace(/^[−–]/, "-");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (s === "" || !/^[\d.,]+(e[+-]?\d+)?$/i.test(s)) return null;

  const locale = detectNumberLocale(s) ?? options.locale ?? null;
  let normalized: string;
  if (locale === "es") {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (locale === "en") {
    normalized = s.replace(/,/g, "");
  } else {
    // Ambiguo sin pista: un único separador se trata como decimal.
    normalized = s.replace(",", ".");
  }
  if ((normalized.match(/\./g) ?? []).length > 1) return null;

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  const signed = negative ? -n : n;
  return isPercent ? signed / 100 : signed;
}

/** Parsea porcentajes: número (fracción) o texto con o sin "%". "12,5 %" → 0.125; 0.125 → 0.125. */
export function parsePercent(value: unknown): number | null {
  if (typeof value === "string" && !value.includes("%")) {
    const n = parseNumber(value);
    return n === null ? null : n > 1 ? n / 100 : n;
  }
  return parseNumber(value);
}

const MS_PER_DAY = 86_400_000;
/** Época de Excel (sistema 1900) ajustada por el bug del 29/02/1900 para seriales ≥ 61. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

function toIso(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Convierte un número de serie de Excel (sistema 1900) a fecha ISO "yyyy-mm-dd". */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  const whole = Math.floor(serial);
  // Excel considera 1900 bisiesto: el serial 60 es el inexistente 29/02/1900.
  if (whole === 60) return null;
  const adjusted = whole < 60 ? whole + 1 : whole;
  const d = new Date(EXCEL_EPOCH_UTC + adjusted * MS_PER_DAY);
  return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Convierte un valor de celda a fecha ISO.
 * Acepta: serial de Excel, Date, "yyyy-mm-dd", "dd/mm/yyyy", "dd-mm-yyyy", "dd.mm.yyyy" y
 * seriales almacenados como texto. Las fechas con barra se interpretan en formato español (día/mes).
 */
export function parseExcelDate(value: unknown): string | null {
  if (isNullLike(value)) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return toIso(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === "number") return excelSerialToIso(value);
  if (typeof value !== "string") return null;
  const s = value.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s.*)?$/.exec(s);
  if (m) return toIso(Number(m[3]), Number(m[2]), Number(m[1]));
  if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToIso(Number(s));
  return null;
}

/** Normaliza un texto categórico: trim, colapsa espacios. Devuelve null para marcadores de ausencia. */
export function parseCategory(value: unknown): string | null {
  if (isNullLike(value)) return null;
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** Normaliza flags S/N: "S", "si", "sí", "y", "yes", "true", "1" → "S"; equivalentes negativos → "N". */
export function parseFlag(value: unknown): string | null {
  const s = parseCategory(value);
  if (s === null) return null;
  const k = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (["s", "si", "y", "yes", "true", "1", "verdadero"].includes(k)) return "S";
  if (["n", "no", "false", "0", "falso"].includes(k)) return "N";
  return s.toUpperCase();
}
