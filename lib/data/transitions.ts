import type { Destination, Stage, TransitionClass, TransitionKey } from "@/types/data";

export const STAGES: readonly Stage[] = [1, 2, 3];
export const DESTINATIONS: readonly Destination[] = [1, 2, 3, "S"];

export const SALIDA_LABEL = "Salida Cartera";

/** Parsea un stage: 1, "1", "S1", "Stage 1", "stage-2"... → 1 | 2 | 3 o null. */
export function parseStage(value: unknown): Stage | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value === 1 || value === 2 || value === 3 ? value : null;
  if (typeof value !== "string") return null;
  const m = /^\s*(?:stage|s|fase)?\s*[-_ ]?\s*([123])(?:[.,]0+)?\s*$/i.exec(value);
  return m ? (Number(m[1]) as Stage) : null;
}

function normalizeDashes(s: string): string {
  return s.replace(/[‐-―−]/g, "-");
}

function isSalidaText(s: string): boolean {
  const k = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .trim();
  return /^salida( de)?( (la )?cartera)?$/.test(k) || k === "out" || k === "exit";
}

/**
 * Parsea el texto de la columna Transiciones. Acepta "1-2", "1 – 2", "S1-S2", "1→2",
 * "1-Salida Cartera", "1 - salida de cartera", "1-SALIDA_CARTERA".
 */
export function parseTransition(value: unknown): { from: Stage; to: Destination } | null {
  if (typeof value !== "string") return null;
  const s = normalizeDashes(value).replace(/→|->|>/g, "-").trim();
  const idx = s.indexOf("-");
  if (idx < 0) return null;
  const from = parseStage(s.slice(0, idx));
  if (from === null) return null;
  const rest = s.slice(idx + 1).trim();
  const toStage = parseStage(rest);
  if (toStage !== null) return { from, to: toStage };
  if (isSalidaText(rest)) return { from, to: "S" };
  return null;
}

export function transitionKey(from: Stage, to: Destination): TransitionKey {
  return `${from}-${to}`;
}

export function parseTransitionKey(key: string): { from: Stage; to: Destination } | null {
  const m = /^([123])-([123S])$/.exec(key);
  if (!m) return null;
  const to = m[2] === "S" ? "S" : (Number(m[2]) as Stage);
  return { from: Number(m[1]) as Stage, to };
}

export function isTransitionKey(key: string): key is TransitionKey {
  return parseTransitionKey(key) !== null;
}

/**
 * Clasificación de transiciones:
 * - Permanencia: 1-1, 2-2, 3-3
 * - Deterioro: 1-2, 1-3, 2-3
 * - Cura/mejora: 2-1, 3-2, 3-1
 * - Salida: n-Salida Cartera (nunca se convierte en "Stage 0")
 */
export function classifyTransition(from: Stage, to: Destination): TransitionClass {
  if (to === "S") return "salida";
  if (to === from) return "permanencia";
  return to > from ? "deterioro" : "cura";
}

export const ALL_TRANSITIONS: readonly TransitionKey[] = STAGES.flatMap((f) =>
  DESTINATIONS.map((t) => transitionKey(f, t)),
);

/** Transiciones que definen el "EAD deteriorado" (definición inicial del encargo). */
export const DETERIORATION_TRANSITIONS: readonly TransitionKey[] = ["1-2", "1-3", "2-3"];
export const CURE_TRANSITIONS: readonly TransitionKey[] = ["2-1", "3-2", "3-1"];

export function stageLabel(s: Stage): string {
  return `Stage ${s}`;
}

export function destinationLabel(d: Destination): string {
  return d === "S" ? SALIDA_LABEL : stageLabel(d);
}

export function transitionLabel(key: TransitionKey): string {
  const p = parseTransitionKey(key);
  if (!p) return key;
  return `${stageLabel(p.from)} → ${destinationLabel(p.to)}`;
}

/** Etiqueta corta tal y como aparece en el Excel ("1-2", "1-Salida Cartera"). */
export function transitionExcelLabel(key: TransitionKey): string {
  const p = parseTransitionKey(key);
  if (!p) return key;
  return p.to === "S" ? `${p.from}-${SALIDA_LABEL}` : key;
}

export const TRANSITION_CLASSES: readonly TransitionClass[] = ["permanencia", "deterioro", "cura", "salida"];

export const TRANSITION_CLASS_LABEL: Record<TransitionClass, string> = {
  permanencia: "Permanencia",
  deterioro: "Deterioro",
  cura: "Cura / mejora",
  salida: "Salida",
};
