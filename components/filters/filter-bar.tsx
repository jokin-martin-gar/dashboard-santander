"use client";

import { useState } from "react";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type { Destination, Stage, TransitionClass, TransitionKey } from "@/types/data";
import type { Filters } from "@/types/filters";
import {
  DESTINATIONS,
  STAGES,
  TRANSITION_CLASSES,
  TRANSITION_CLASS_LABEL,
  destinationLabel,
  stageLabel,
  transitionLabel,
} from "@/lib/data/transitions";
import { periodLabel } from "@/lib/data/periods";
import { countActiveFilters } from "@/lib/calculations/filters";
import { CLASS_COLORS, STAGE_COLORS, destinationColor } from "@/lib/theme/colors";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { MultiSelect } from "./multi-select";
import { PeriodSelect } from "./period-select";

const FLAG_LABEL: Record<string, string> = { S: "Sí (S)", N: "No (N)" };

function FilterControls({ stacked = false }: { stacked?: boolean }) {
  const { dataset, data, filters, setFilters } = useDashboard();
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const cls = stacked ? "w-full" : "max-w-[230px]";

  return (
    <>
      <PeriodSelect
        periods={dataset.periods}
        resolved={data.periods}
        onChange={(from, to) => setFilters((f) => ({ ...f, periodFrom: from, periodTo: to }))}
      />
      <MultiSelect
        label="Cartera"
        testId="filter-cartera"
        className={cls}
        options={dataset.dimensions.carteras.map((c) => ({ value: c, label: c }))}
        selected={filters.carteras}
        onChange={(v) => set("carteras", v)}
      />
      <MultiSelect
        label="Titulizado"
        testId="filter-titulizado"
        className={cls}
        options={dataset.dimensions.titulizado.map((c) => ({ value: c, label: FLAG_LABEL[c] ?? c }))}
        selected={filters.titulizado}
        onChange={(v) => set("titulizado", v)}
      />
      <MultiSelect
        label="Individualizado"
        testId="filter-flag"
        className={cls}
        options={dataset.dimensions.flags.map((c) => ({ value: c, label: FLAG_LABEL[c] ?? c }))}
        selected={filters.flags}
        onChange={(v) => set("flags", v)}
      />
      <MultiSelect
        label="Stage origen"
        testId="filter-origen"
        className={cls}
        options={STAGES.map((s) => ({ value: String(s), label: stageLabel(s), swatch: STAGE_COLORS[s] }))}
        selected={filters.origen.map(String)}
        onChange={(v) => set("origen", v.map((x) => Number(x) as Stage))}
      />
      <MultiSelect
        label="Stage destino"
        testId="filter-destino"
        className={cls}
        options={DESTINATIONS.map((d) => ({ value: String(d), label: destinationLabel(d), swatch: destinationColor(d) }))}
        selected={filters.destino.map(String)}
        onChange={(v) => set("destino", v.map((x) => (x === "S" ? "S" : (Number(x) as Stage)) as Destination))}
      />
      <MultiSelect
        label="Tipo de transición"
        testId="filter-clase"
        className={cls}
        options={TRANSITION_CLASSES.map((c) => ({ value: c, label: TRANSITION_CLASS_LABEL[c], swatch: CLASS_COLORS[c] }))}
        selected={filters.clases}
        onChange={(v) => set("clases", v as TransitionClass[])}
      />
    </>
  );
}

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

function useChips(): Chip[] {
  const { filters, setFilters, data } = useDashboard();
  const chips: Chip[] = [];
  const remove = <K extends keyof Filters>(key: K, value: unknown) =>
    setFilters((f) => ({ ...f, [key]: (f[key] as unknown[]).filter((x) => x !== value) }));
  if (data.periods.inRange.length > 1 || filters.periodTo) {
    chips.push({
      key: "period",
      label:
        data.periods.from === data.periods.to
          ? `Mes: ${periodLabel(data.periods.to)}`
          : `Período: ${periodLabel(data.periods.from)} – ${periodLabel(data.periods.to)}`,
      onRemove: () => setFilters((f) => ({ ...f, periodFrom: null, periodTo: null })),
    });
  }
  filters.carteras.forEach((c) => chips.push({ key: `c-${c}`, label: `Cartera: ${c}`, onRemove: () => remove("carteras", c) }));
  filters.titulizado.forEach((c) => chips.push({ key: `t-${c}`, label: `Titulizado: ${c}`, onRemove: () => remove("titulizado", c) }));
  filters.flags.forEach((c) => chips.push({ key: `f-${c}`, label: `Individualizado: ${c}`, onRemove: () => remove("flags", c) }));
  filters.origen.forEach((s) => chips.push({ key: `o-${s}`, label: `Origen: ${stageLabel(s)}`, onRemove: () => remove("origen", s) }));
  filters.destino.forEach((d) =>
    chips.push({ key: `d-${d}`, label: `Destino: ${destinationLabel(d)}`, onRemove: () => remove("destino", d) }),
  );
  filters.clases.forEach((c) =>
    chips.push({ key: `k-${c}`, label: `Tipo: ${TRANSITION_CLASS_LABEL[c]}`, onRemove: () => remove("clases", c) }),
  );
  filters.transiciones.forEach((t: TransitionKey) =>
    chips.push({ key: `x-${t}`, label: `Transición: ${transitionLabel(t)}`, onRemove: () => remove("transiciones", t) }),
  );
  return chips;
}

export function ActiveFilters() {
  const chips = useChips();
  const { resetFilters } = useDashboard();
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros activos" data-testid="active-filters">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#c9d7ea] bg-[#f3f7fc] py-0.5 pr-1 pl-2.5 text-[12.5px] text-foreground"
        >
          <span className="truncate">{c.label}</span>
          <button
            type="button"
            onClick={c.onRemove}
            aria-label={`Quitar filtro ${c.label}`}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-[#dfe8f4] hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={resetFilters}
        className="ml-1 text-[12.5px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Quitar todos
      </button>
    </div>
  );
}

export function FilterBar() {
  const { filters, resetFilters } = useDashboard();
  const [open, setOpen] = useState(false);
  const active = countActiveFilters(filters) + (filters.periodTo || filters.periodFrom ? 1 : 0);

  return (
    <div className="flex flex-col gap-2.5" data-testid="filter-bar">
      {/* Escritorio */}
      <div className="hidden flex-wrap items-center gap-2 lg:flex">
        <FilterControls />
        <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!active} className="ml-auto">
          <RotateCcw aria-hidden /> Restablecer
        </Button>
      </div>
      {/* Móvil / tablet: drawer */}
      <div className="flex items-center gap-2 lg:hidden">
        <Button variant="outline" onClick={() => setOpen(true)} className="h-9" data-testid="open-filters">
          <SlidersHorizontal aria-hidden /> Filtros
          {active ? (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground tabular">{active}</span>
          ) : null}
        </Button>
        <Button variant="ghost" onClick={resetFilters} disabled={!active} className="h-9">
          <RotateCcw aria-hidden /> Restablecer
        </Button>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[min(92vw,380px)] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription>Afectan a todos los indicadores, gráficos y tablas.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-6">
            <FilterControls stacked />
            <Button variant="outline" onClick={resetFilters} disabled={!active}>
              <RotateCcw aria-hidden /> Restablecer filtros
            </Button>
            <Button onClick={() => setOpen(false)}>Ver resultados</Button>
          </div>
        </SheetContent>
      </Sheet>
      <ActiveFilters />
    </div>
  );
}
