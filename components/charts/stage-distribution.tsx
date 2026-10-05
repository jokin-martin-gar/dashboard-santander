"use client";

import { useState } from "react";
import type { Stage } from "@/types/data";
import type { StageSlice } from "@/lib/calculations/aggregations";
import type { MetricTotals } from "@/lib/calculations/metrics";
import { stageLabel } from "@/lib/data/transitions";
import { STAGE_COLORS } from "@/lib/theme/colors";
import { formatCount, formatEurCompact, formatEurFull, formatPercent } from "@/lib/formatters/number";
import { cn } from "@/lib/utils";
import { Segmented } from "./segmented";

type DistMetric = "ead" | "nContratos" | "provision" | "coverage";
const METRICS: { value: DistMetric; label: string }[] = [
  { value: "ead", label: "EAD" },
  { value: "nContratos", label: "Contratos" },
  { value: "provision", label: "Provisión" },
  { value: "coverage", label: "Coverage" },
];

function val(t: MetricTotals, m: DistMetric) {
  return m === "ead" ? t.ead : m === "nContratos" ? t.nContratos : m === "provision" ? t.provision : t.coverage;
}
function share(s: StageSlice, m: DistMetric) {
  return m === "ead" ? s.shareEad : m === "nContratos" ? s.shareContratos : m === "provision" ? s.shareProvision : null;
}
function fmt(v: number | null, m: DistMetric, full = false) {
  if (m === "coverage") return formatPercent(v);
  if (m === "nContratos") return formatCount(v);
  return full ? formatEurFull(v) : formatEurCompact(v);
}

interface Props {
  slices: StageSlice[];
  total: MetricTotals;
  selected: Stage[];
  onToggle: (s: Stage) => void;
}

export function StageDistribution({ slices, total, selected, onToggle }: Props) {
  const [metric, setMetric] = useState<DistMetric>("ead");
  const max = Math.max(0, ...slices.map((s) => val(s.totals, metric) ?? 0));
  const empty = !slices.some((s) => s.totals.rows > 0);

  return (
    <div className="flex flex-col gap-4" data-testid="stage-distribution">
      <Segmented label="Métrica de distribución" value={metric} options={METRICS} onChange={setMetric} />
      {empty ? (
        <div className="flex h-[160px] items-center justify-center rounded-lg bg-secondary/60 text-[13px] text-muted-foreground">
          Sin datos para los filtros seleccionados.
        </div>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {slices.map((s) => {
            const v = val(s.totals, metric);
            const sh = share(s, metric);
            const width = max > 0 && v !== null ? (v / max) * 100 : 0;
            const isSel = selected.includes(s.stage);
            const dim = selected.length > 0 && !isSel;
            return (
              <li key={s.stage}>
                <button
                  type="button"
                  onClick={() => onToggle(s.stage)}
                  aria-pressed={isSel}
                  data-testid={`stage-bar-${s.stage}`}
                  aria-label={`${stageLabel(s.stage)}: ${fmt(v, metric, true)}${sh !== null ? `, ${formatPercent(sh)} del total` : ""}. Pulsar para filtrar por stage de origen.`}
                  className={cn(
                    "group w-full rounded-lg px-2 py-1.5 text-left transition-opacity hover:bg-secondary/70",
                    isSel && "bg-secondary ring-1 ring-border",
                    dim && "opacity-45",
                  )}
                >
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-[13px] font-medium">
                      <span className="inline-block size-2.5 rounded-sm" style={{ background: STAGE_COLORS[s.stage] }} aria-hidden />
                      {stageLabel(s.stage)}
                    </span>
                    <span className="flex items-baseline gap-2 tabular">
                      <span className="text-[14px] font-semibold">{fmt(v, metric)}</span>
                      {sh !== null ? <span className="text-[12px] text-muted-foreground">{formatPercent(sh)}</span> : null}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{ width: `${v ? Math.max(width, 0.8) : 0}%`, background: STAGE_COLORS[s.stage] }}
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground tabular">
                    {metric !== "ead" ? <span>EAD {formatEurCompact(s.totals.ead)}</span> : null}
                    {metric !== "nContratos" ? <span>{formatCount(s.totals.nContratos)} contratos</span> : null}
                    {metric !== "provision" ? <span>Prov. {formatEurCompact(s.totals.provision)}</span> : null}
                    {metric !== "coverage" ? <span>Cov. {formatPercent(s.totals.coverage)}</span> : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex justify-between border-t border-border pt-2.5 text-[12.5px]">
        <span className="text-muted-foreground">Total</span>
        <span className="font-semibold tabular">{fmt(val(total, metric), metric)}</span>
      </div>
    </div>
  );
}
