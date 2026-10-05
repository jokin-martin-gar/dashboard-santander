import type { Destination, Stage, TransitionClass } from "@/types/data";

/**
 * Paleta única del dashboard. Validada con el script de la guía de visualización
 * (separación CVD ≈ 7,4–7,7 → siempre se acompaña de etiquetas directas y leyendas con texto;
 * el gris de "Salida" es intencionadamente acromático).
 */
export const STAGE_COLORS: Record<Stage, string> = {
  1: "#0a9a7a", // verde azulado
  2: "#c47f00", // ámbar
  3: "#d63c3c", // rojo
};

export const SALIDA_COLOR = "#a1a6ae";

export const DESTINATION_COLORS: Record<string, string> = {
  "1": STAGE_COLORS[1],
  "2": STAGE_COLORS[2],
  "3": STAGE_COLORS[3],
  S: SALIDA_COLOR,
};

export function destinationColor(d: Destination): string {
  return DESTINATION_COLORS[String(d)];
}

export const CLASS_COLORS: Record<TransitionClass, string> = {
  permanencia: "#3a6fb0", // azul
  deterioro: "#e8590c", // naranja
  cura: "#2b9a3e", // verde
  salida: SALIDA_COLOR, // gris
};

/** Rampa secuencial (un solo tono, claro → oscuro) para el heatmap. */
export const SEQUENTIAL_BLUE = [
  "#eef5fd",
  "#cde2fb",
  "#b7d3f6",
  "#9ec5f4",
  "#86b6ef",
  "#6da7ec",
  "#5598e7",
  "#3987e5",
  "#2a78d6",
  "#256abf",
  "#1c5cab",
  "#184f95",
];

/** Color del heatmap para una intensidad t ∈ [0, 1]. */
export function sequentialColor(t: number): string {
  if (!Number.isFinite(t) || t <= 0) return SEQUENTIAL_BLUE[0];
  const i = Math.min(SEQUENTIAL_BLUE.length - 1, Math.round(t * (SEQUENTIAL_BLUE.length - 1)));
  return SEQUENTIAL_BLUE[i];
}

/** Texto legible sobre una celda del heatmap. */
export function sequentialTextColor(t: number): string {
  return t > 0.55 ? "#ffffff" : "#0b0b0b";
}

export const CHART = {
  grid: "#e7e6e1",
  axis: "#c3c2b7",
  tick: "#6b6a65",
  ink: "#0b0b0b",
  inkSecondary: "#52514e",
  highlight: "#3a6fb0",
};
