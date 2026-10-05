"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Dataset } from "@/types/data";
import { EMPTY_FILTERS, type Filters, type MultiFilterKey } from "@/types/filters";
import { filtersToSearchParams, searchParamsToFilters } from "@/lib/data/url-filters";

export type FiltersUpdater = Filters | ((prev: Filters) => Filters);

/**
 * Estado de filtros sincronizado con la URL (?desde=…&cartera=…). Los valores que no existen en el
 * dataset cargado se descartan al derivar `filters` (sin efectos que dupliquen estado).
 */
export function useUrlFilters(dataset: Dataset | null) {
  const searchParams = useSearchParams();
  const [raw, setRaw] = useState<Filters>(() =>
    searchParamsToFilters(new URLSearchParams(searchParams.toString()), null),
  );

  const filters = useMemo(
    () => (dataset ? searchParamsToFilters(filtersToSearchParams(raw), dataset) : raw),
    [raw, dataset],
  );

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const qs = filtersToSearchParams(filters).toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    window.history.replaceState(window.history.state, "", url);
  }, [filters]);

  const setFilters = useCallback((u: FiltersUpdater) => {
    setRaw((prev) => (typeof u === "function" ? u(prev) : u));
  }, []);

  const toggleValue = useCallback(
    <K extends MultiFilterKey>(key: K, value: Filters[K][number]) => {
      setRaw((prev) => {
        const list = prev[key] as Filters[K][number][];
        const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
        return { ...prev, [key]: next };
      });
    },
    [],
  );

  const reset = useCallback(() => setRaw(EMPTY_FILTERS), []);

  return { filters, setFilters, toggleValue, reset };
}
