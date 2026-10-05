"use client";

import { useId } from "react";
import { CalendarRange, ChevronDown } from "lucide-react";
import type { PeriodInfo } from "@/types/data";
import type { ResolvedPeriods } from "@/lib/calculations/filters";

interface PeriodSelectProps {
  periods: PeriodInfo[];
  resolved: ResolvedPeriods;
  onChange: (from: string, to: string) => void;
}

function MonthSelect({
  label,
  value,
  periods,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  periods: PeriodInfo[];
  onChange: (v: string) => void;
  testId: string;
}) {
  const id = useId();
  return (
    <div className="relative min-w-0 flex-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full min-w-[104px] cursor-pointer appearance-none rounded-lg border border-input bg-card pr-7 pl-2.5 text-[13px] font-medium tabular hover:bg-secondary"
      >
        {[...periods].reverse().map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}

/** Rango de meses (desde / hasta). Los KPI muestran siempre el último mes del rango. */
export function PeriodSelect({ periods, resolved, onChange }: PeriodSelectProps) {
  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="period-select" role="group" aria-label="Período">
      <CalendarRange className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden />
      <MonthSelect
        label="Desde"
        testId="period-from"
        value={resolved.from}
        periods={periods}
        onChange={(v) => onChange(v, resolved.to < v ? v : resolved.to)}
      />
      <span className="text-[13px] text-muted-foreground" aria-hidden>
        –
      </span>
      <MonthSelect
        label="Hasta (mes de referencia)"
        testId="period-to"
        value={resolved.to}
        periods={periods}
        onChange={(v) => onChange(resolved.from > v ? v : resolved.from, v)}
      />
    </div>
  );
}
