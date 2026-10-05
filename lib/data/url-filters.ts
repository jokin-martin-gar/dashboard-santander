import type { Dataset, Destination, Stage, TransitionClass, TransitionKey } from "@/types/data";
import { EMPTY_FILTERS, type Filters } from "@/types/filters";
import { isPeriodKey } from "./periods";
import { TRANSITION_CLASSES, isTransitionKey } from "./transitions";

const SEP = "~";

/** Serializa los filtros a parámetros de URL (sólo los no vacíos). */
export function filtersToSearchParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.periodFrom) p.set("desde", f.periodFrom);
  if (f.periodTo) p.set("hasta", f.periodTo);
  const list = (key: string, values: (string | number)[]) => {
    if (values.length) p.set(key, values.join(SEP));
  };
  list("cartera", f.carteras);
  list("tit", f.titulizado);
  list("flag", f.flags);
  list("origen", f.origen);
  list("destino", f.destino);
  list("tipo", f.clases);
  list("trans", f.transiciones);
  return p;
}

/**
 * Lee los filtros de la URL descartando valores que no existen en el dataset actual
 * (evita filtros "fantasma" al cambiar de Excel).
 */
export function searchParamsToFilters(params: URLSearchParams, dataset: Dataset | null): Filters {
  const list = (key: string) => (params.get(key) ?? "").split(SEP).filter(Boolean);
  const periods = new Set(dataset?.periods.map((p) => p.key) ?? []);
  const validPeriod = (k: string | null) => (k && isPeriodKey(k) && (!dataset || periods.has(k)) ? k : null);
  const inDim = (values: string[], dim: string[] | undefined) => (dim ? values.filter((v) => dim.includes(v)) : values);
  const uniq = <T,>(a: T[]) => [...new Set(a)];

  return {
    ...EMPTY_FILTERS,
    periodFrom: validPeriod(params.get("desde")),
    periodTo: validPeriod(params.get("hasta")),
    carteras: uniq(inDim(list("cartera"), dataset?.dimensions.carteras)),
    titulizado: uniq(inDim(list("tit"), dataset?.dimensions.titulizado)),
    flags: uniq(inDim(list("flag"), dataset?.dimensions.flags)),
    origen: uniq(list("origen").filter((s) => ["1", "2", "3"].includes(s)).map((s) => Number(s) as Stage)),
    destino: uniq(
      list("destino")
        .filter((s) => ["1", "2", "3", "S"].includes(s))
        .map((s) => (s === "S" ? "S" : (Number(s) as Stage)) as Destination),
    ),
    clases: uniq(list("tipo").filter((s): s is TransitionClass => (TRANSITION_CLASSES as string[]).includes(s))),
    transiciones: uniq(list("trans").filter((s): s is TransitionKey => isTransitionKey(s))),
  };
}
