import type { Destination, PeriodKey, Stage, TransitionClass, TransitionKey } from "./data";

export interface Filters {
  /** Inicio del rango de meses (incluido). null = igual que periodTo. */
  periodFrom: PeriodKey | null;
  /** Fin del rango (incluido). null = último mes disponible. */
  periodTo: PeriodKey | null;
  carteras: string[];
  titulizado: string[];
  flags: string[];
  origen: Stage[];
  destino: Destination[];
  clases: TransitionClass[];
  /** Transiciones concretas (clic en Sankey / matriz). */
  transiciones: TransitionKey[];
}

export const EMPTY_FILTERS: Filters = {
  periodFrom: null,
  periodTo: null,
  carteras: [],
  titulizado: [],
  flags: [],
  origen: [],
  destino: [],
  clases: [],
  transiciones: [],
};

export type MultiFilterKey = Exclude<keyof Filters, "periodFrom" | "periodTo">;
