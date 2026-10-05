"use client";

import { useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import type { Destination, Stage, TransitionKey } from "@/types/data";
import type { TransitionFlow, TransitionSummary } from "@/lib/calculations/aggregations";
import type { MetricTotals } from "@/lib/calculations/metrics";
import { DESTINATIONS, STAGES, destinationLabel, stageLabel, transitionKey } from "@/lib/data/transitions";
import { STAGE_COLORS, destinationColor, sequentialColor, sequentialTextColor } from "@/lib/theme/colors";
import {
  formatCount,
  formatCountCompact,
  formatEurCompact,
  formatEurFull,
  formatPercent,
} from "@/lib/formatters/number";
import { safeDivide } from "@/lib/calculations/metrics";
import { cn } from "@/lib/utils";
import { FloatingTooltip, TooltipRow, type TooltipAnchor } from "./floating-tooltip";
import { FlowTooltipContent } from "./sankey-chart";

export type MatrixMetric = "ead" | "nContratos" | "provision" | "coverage";

export const MATRIX_METRICS: { value: MatrixMetric; label: string }[] = [
  { value: "ead", label: "EAD" },
  { value: "nContratos", label: "Contratos" },
  { value: "provision", label: "Provisión" },
  { value: "coverage", label: "Coverage" },
];

function flowValue(f: TransitionFlow, m: MatrixMetric): number | null {
  if (m === "ead") return f.ead;
  if (m === "nContratos") return f.nContratos;
  if (m === "provision") return f.provision;
  return f.coverage;
}

function totalsValue(t: MetricTotals, m: MatrixMetric): number | null {
  if (m === "ead") return t.ead;
  if (m === "nContratos") return t.nContratos;
  if (m === "provision") return t.provision;
  return t.coverage;
}

function fmt(v: number | null, m: MatrixMetric, compact = true): string {
  if (m === "coverage") return formatPercent(v);
  if (m === "nContratos") return compact ? formatCountCompact(v) : formatCount(v);
  return compact ? formatEurCompact(v) : formatEurFull(v);
}

interface Props {
  summary: TransitionSummary;
  metric: MatrixMetric;
  selected: TransitionKey[];
  onToggle: (key: TransitionKey) => void;
}

export function TransitionMatrix({ summary, metric, selected, onToggle }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ content: ReactNode; anchor: TooltipAnchor } | null>(null);
  const byKey = new Map(summary.flows.map((f) => [f.key, f]));
  const maxCoverage = Math.max(0, ...summary.flows.map((f) => f.coverage ?? 0));

  const intensity = (f: TransitionFlow, row: Stage): number => {
    if (metric === "coverage") return maxCoverage > 0 ? (f.coverage ?? 0) / maxCoverage : 0;
    const rowTotal = totalsValue(summary.originTotals[row], metric) ?? 0;
    return safeDivide(flowValue(f, metric), rowTotal) ?? 0;
  };

  const place = (e: MouseEvent | FocusEvent, content: ReactNode) => {
    const box = wrap.current?.getBoundingClientRect();
    const target = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!box) return;
    const anchor =
      "clientX" in e && e.clientX
        ? { x: e.clientX - box.left, y: e.clientY - box.top }
        : { x: target.left - box.left + target.width / 2, y: target.top - box.top };
    setTip({ content, anchor });
  };

  const totalTip = (label: string, t: MetricTotals) => (
    <div className="min-w-[200px]">
      <div className="mb-1.5 font-semibold">{label}</div>
      <TooltipRow label="EAD" value={formatEurFull(t.ead)} />
      <TooltipRow label="Contratos" value={formatCount(t.nContratos)} />
      <TooltipRow label="Provisión" value={formatEurFull(t.provision)} />
      <TooltipRow label="Coverage" value={formatPercent(t.coverage)} />
    </div>
  );

  return (
    <div ref={wrap} className="relative" onMouseLeave={() => setTip(null)}>
      <div className="overflow-x-auto" data-testid="transition-matrix">
        <table className="w-full min-w-[520px] border-separate border-spacing-1 text-[13px]">
          <caption className="sr-only">
            Matriz de transiciones: filas = stage de origen, columnas = stage de destino. Valores en {metric}.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-[92px] text-left text-[12px] font-medium text-subtle">
                Origen ↓ / Destino →
              </th>
              {DESTINATIONS.map((d) => (
                <th key={String(d)} scope="col" className="px-1 pb-1 text-center text-[12px] font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block size-2 rounded-sm" style={{ background: destinationColor(d) }} aria-hidden />
                    {d === "S" ? "Salida" : stageLabel(d)}
                  </span>
                </th>
              ))}
              <th scope="col" className="px-1 pb-1 text-center text-[12px] font-semibold text-foreground">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {STAGES.map((s) => {
              const rowTotals = summary.originTotals[s];
              return (
                <tr key={s}>
                  <th scope="row" className="pr-2 text-left text-[12.5px] font-medium whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block size-2 rounded-sm" style={{ background: STAGE_COLORS[s] }} aria-hidden />
                      {stageLabel(s)}
                    </span>
                  </th>
                  {DESTINATIONS.map((d: Destination) => {
                    const key = transitionKey(s, d);
                    const f = byKey.get(key);
                    if (!f) {
                      return (
                        <td key={key} className="h-14 rounded-md bg-secondary/50 text-center text-subtle" aria-label={`${stageLabel(s)} → ${destinationLabel(d)}: sin datos`}>
                          —
                        </td>
                      );
                    }
                    const t = intensity(f, s);
                    const isSel = selected.includes(key);
                    const dim = selected.length > 0 && !isSel;
                    const v = flowValue(f, metric);
                    return (
                      <td key={key} className="h-14 p-0">
                        <button
                          type="button"
                          data-testid={`matrix-cell-${key}`}
                          aria-pressed={isSel}
                          aria-label={`${stageLabel(s)} → ${destinationLabel(d)}: ${fmt(v, metric, false)}. Pulsar para filtrar.`}
                          onClick={() => onToggle(key)}
                          onMouseMove={(e) => place(e, <FlowTooltipContent flow={f} />)}
                          onFocus={(e) => place(e, <FlowTooltipContent flow={f} />)}
                          onBlur={() => setTip(null)}
                          className={cn(
                            "flex h-full w-full flex-col items-center justify-center rounded-md px-1 transition-[opacity,box-shadow] duration-150",
                            isSel && "ring-2 ring-foreground ring-offset-1",
                            dim && "opacity-40",
                          )}
                          style={{ background: sequentialColor(t), color: sequentialTextColor(t) }}
                        >
                          <span className="font-semibold tabular">{fmt(v, metric)}</span>
                          {metric !== "coverage" ? (
                            <span className="text-[11px] tabular opacity-80">{formatPercent(f.pctOfOrigin === null ? null : t, 1)}</span>
                          ) : null}
                        </button>
                      </td>
                    );
                  })}
                  <td className="h-14 p-0">
                    <div
                      tabIndex={0}
                      onMouseMove={(e) => place(e, totalTip(`Total ${stageLabel(s)}`, rowTotals))}
                      onFocus={(e) => place(e, totalTip(`Total ${stageLabel(s)}`, rowTotals))}
                      onBlur={() => setTip(null)}
                      className="flex h-full flex-col items-center justify-center rounded-md border border-border bg-card font-semibold tabular"
                    >
                      {fmt(totalsValue(rowTotals, metric), metric)}
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr>
              <th scope="row" className="pr-2 text-left text-[12.5px] font-semibold">
                Total
              </th>
              {DESTINATIONS.map((d) => {
                const t = summary.destinationTotals[String(d)];
                return (
                  <td key={String(d)} className="h-11 p-0">
                    <div
                      tabIndex={0}
                      onMouseMove={(e) => place(e, totalTip(`Total destino ${destinationLabel(d)}`, t))}
                      onFocus={(e) => place(e, totalTip(`Total destino ${destinationLabel(d)}`, t))}
                      onBlur={() => setTip(null)}
                      className="flex h-full items-center justify-center rounded-md border border-border bg-card font-semibold tabular"
                    >
                      {t.rows ? fmt(totalsValue(t, metric), metric) : "—"}
                    </div>
                  </td>
                );
              })}
              <td className="h-11 p-0">
                <div
                  tabIndex={0}
                  onMouseMove={(e) => place(e, totalTip("Total general", summary.total))}
                  onFocus={(e) => place(e, totalTip("Total general", summary.total))}
                  onBlur={() => setTip(null)}
                  className="flex h-full items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground tabular"
                >
                  {fmt(totalsValue(summary.total, metric), metric)}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <FloatingTooltip anchor={tip?.anchor ?? null}>{tip?.content}</FloatingTooltip>
    </div>
  );
}
