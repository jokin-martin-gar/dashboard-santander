"use client";

import { useId, useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface MultiOption {
  value: string;
  label: string;
  swatch?: string;
}

interface MultiSelectProps {
  label: string;
  options: MultiOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  testId?: string;
  className?: string;
}

/** Selector múltiple accesible (popover + lista de casillas con búsqueda cuando hay muchas opciones). */
export function MultiSelect({ label, options, selected, onChange, testId, className }: MultiSelectProps) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const summary =
    selected.length === 0
      ? "Todos"
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} seleccionados`;

  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <Popover>
      <PopoverTrigger
        data-testid={testId}
        aria-label={`${label}: ${summary}`}
        className={cn(
          "flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-card px-2.5 text-left text-[13px] transition-colors hover:bg-secondary aria-expanded:bg-secondary",
          selected.length > 0 && "border-[#9db6d6] bg-[#f3f7fc]",
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <span className="text-muted-foreground">{label}: </span>
          <span className="font-medium text-foreground">{summary}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="flex flex-col">
          {options.length > 8 ? (
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="size-4 text-muted-foreground" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Buscar ${label.toLowerCase()}…`}
                aria-label={`Buscar en ${label}`}
                className="h-7 w-full bg-transparent text-[13px] outline-none placeholder:text-subtle"
              />
            </div>
          ) : null}
          <ul id={listId} role="group" aria-label={label} className="max-h-72 overflow-y-auto p-1">
            {visible.map((o) => {
              const checked = selected.includes(o.value);
              return (
                <li key={o.value}>
                  <label className="relative flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-secondary has-focus-visible:bg-secondary">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(o.value)}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                        checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
                      )}
                    >
                      {checked ? <Check className="size-3" /> : null}
                    </span>
                    {o.swatch ? (
                      <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: o.swatch }} aria-hidden />
                    ) : null}
                    <span className="truncate">{o.label}</span>
                  </label>
                </li>
              );
            })}
            {!visible.length ? <li className="px-2 py-3 text-[13px] text-muted-foreground">Sin coincidencias</li> : null}
          </ul>
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[12.5px]">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onChange(visible.map((o) => o.value))}
            >
              Seleccionar visibles
            </button>
            <button
              type="button"
              className="font-medium text-foreground disabled:opacity-40"
              disabled={!selected.length}
              onClick={() => onChange([])}
            >
              Limpiar
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
