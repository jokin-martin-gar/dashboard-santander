"use client";

import { createContext, useContext } from "react";
import type { Dataset } from "@/types/data";
import type { Filters, MultiFilterKey } from "@/types/filters";
import type { DashboardData } from "@/hooks/use-dashboard-data";
import type { FiltersUpdater } from "@/hooks/use-url-filters";

export interface DashboardContextValue {
  dataset: Dataset;
  data: DashboardData;
  filters: Filters;
  setFilters: (u: FiltersUpdater) => void;
  toggleValue: <K extends MultiFilterKey>(key: K, value: Filters[K][number]) => void;
  resetFilters: () => void;
}

export const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard debe usarse dentro de <DashboardContext.Provider>");
  return ctx;
}
