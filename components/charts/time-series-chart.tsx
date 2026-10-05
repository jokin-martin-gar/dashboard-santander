"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PeriodKey, RiskRecord, Stage } from "@/types/data";
import { timeSeries, type TimeMetric, type TimePoint } from "@/lib/calculations/aggregations";
import { periodLabel, periodShortLabel } from "@/lib/data/periods";
import { CHART, STAGE_COLORS } from "@/lib/theme/colors";
import {
  formatCount,
  formatCountCompact,
  formatEurCompact,
  formatEurFull,
  formatPercent,
} from "@/lib/formatters/number";
import { Segmented } from "./segmented";

export const TIME_METRICS: { value: TimeMetric; label: string }[] = [
  { value: "ead", label: "EAD" },
  { value: "provision", label: "Provisión" },
  { value: "coverage", label: "Coverage" },
  { value: "nContratos", label: "Contratos" },
];

type Mode = "total" | "stages" | "compare";
const MODES: { value: Mode; label: string }[] = [
  { value: "total", label: "Total" },
  { value: "stages", label: "Por stage" },
  { value: "compare", label: "Comparar stages" },
];

const TOTAL_COLOR = "#33415c";

export function fmtMetric(v: number | null | undefined, m: TimeMetric, compact = true): string {
  if (m === "coverage") return formatPercent(v ?? null);
  if (m === "nContratos") return compact ? formatCountCompact(v ?? null) : formatCount(v ?? null);
  return compact ? formatEurCompact(v ?? null) : formatEurFull(v ?? null);
}

interface TipProps {
  active?: boolean;
  payload?: { dataKey?: unknown; value?: unknown; color?: string; name?: unknown }[];
  label?: unknown;
  metric: TimeMetric;
}

function ChartTip({ active, payload, label, metric }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-[12.5px] shadow-lg">
      <div className="mb-1 font-semibold">{periodLabel(String(label))}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block size-2 rounded-sm" style={{ background: p.color }} aria-hidden />
            {String(p.name)}
          </span>
          <span className="font-medium tabular">
            {p.value === null || p.value === undefined ? "Sin datos" : fmtMetric(Number(p.value), metric, false)}
          </span>
        </div>
      ))}
    </div>
  );
}

const axisProps = {
  tick: { fill: CHART.tick, fontSize: 11.5 },
  tickLine: false,
  axisLine: { stroke: CHART.axis },
} as const;

interface Props {
  byPeriod: Map<PeriodKey, RiskRecord[]>;
  periods: PeriodKey[];
  referencePeriod: PeriodKey | null;
  highlightReference: boolean;
  anomalies: PeriodKey[];
}

export function TimeSeriesChart({ byPeriod, periods, referencePeriod, highlightReference, anomalies }: Props) {
  const [metric, setMetric] = useState<TimeMetric>("ead");
  const [mode, setMode] = useState<Mode>("total");
  const data = useMemo(() => timeSeries(byPeriod, periods, metric), [byPeriod, periods, metric]);
  const hasData = data.some((d) => d.total !== null);
  const anomalyPoints = metric === "nContratos" ? data.filter((d) => anomalies.includes(d.period) && d.total !== null) : [];
  const yFmt = (v: number) => fmtMetric(v, metric);
  const showBrush = data.length > 18;

  return (
    <div className="flex flex-col gap-3" data-testid="time-series">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented label="Métrica temporal" value={metric} options={TIME_METRICS} onChange={setMetric} />
        <Segmented label="Segmentación" value={mode} options={MODES} onChange={setMode} />
      </div>

      {!hasData ? (
        <div className="flex h-[260px] items-center justify-center rounded-lg bg-secondary/60 text-[13px] text-muted-foreground">
          Sin datos para los filtros seleccionados.
        </div>
      ) : mode === "stages" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {([1, 2, 3] as Stage[]).map((s) => (
            <div key={s} className="min-w-0 rounded-lg border border-border p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium">
                <span className="inline-block size-2.5 rounded-sm" style={{ background: STAGE_COLORS[s] }} aria-hidden />
                Stage {s}
                <span className="ml-auto text-[11px] font-normal text-subtle">escala propia</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="period" tickFormatter={periodShortLabel} {...axisProps} minTickGap={24} />
                  <YAxis tickFormatter={yFmt} {...axisProps} axisLine={false} width={78} />
                  <Tooltip content={<ChartTip metric={metric} />} />
                  <Area
                    type="monotone"
                    dataKey={`s${s}`}
                    name={`Stage ${s}`}
                    stroke={STAGE_COLORS[s]}
                    fill={STAGE_COLORS[s]}
                    fillOpacity={0.12}
                    strokeWidth={2}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          {mode === "total" ? (
            <AreaChart data={data} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="period" tickFormatter={periodShortLabel} {...axisProps} minTickGap={24} />
              <YAxis tickFormatter={yFmt} {...axisProps} axisLine={false} width={84} domain={["auto", "auto"]} />
              <Tooltip content={<ChartTip metric={metric} />} />
              {highlightReference && referencePeriod ? (
                <ReferenceLine x={referencePeriod} stroke={CHART.highlight} strokeDasharray="4 3" label={{ value: "Referencia", position: "insideTopRight", fill: CHART.inkSecondary, fontSize: 11 }} />
              ) : null}
              <Area
                type="monotone"
                dataKey="total"
                name="Total"
                stroke={TOTAL_COLOR}
                fill={TOTAL_COLOR}
                fillOpacity={0.08}
                strokeWidth={2}
                connectNulls={false}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 4 }}
              />
              {anomalyPoints.map((p) => (
                <ReferenceDot key={p.period} x={p.period} y={p.total ?? 0} r={5} fill="#fff" stroke="#c2410c" strokeWidth={2} />
              ))}
              {showBrush ? (
                <Brush dataKey="period" height={22} travellerWidth={8} stroke={CHART.axis} tickFormatter={periodShortLabel} />
              ) : null}
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="period" tickFormatter={periodShortLabel} {...axisProps} minTickGap={24} />
              <YAxis tickFormatter={yFmt} {...axisProps} axisLine={false} width={84} />
              <Tooltip content={<ChartTip metric={metric} />} />
              {highlightReference && referencePeriod ? (
                <ReferenceLine x={referencePeriod} stroke={CHART.highlight} strokeDasharray="4 3" />
              ) : null}
              {([1, 2, 3] as Stage[]).map((s) => (
                <Line
                  key={s}
                  type="monotone"
                  dataKey={`s${s}`}
                  name={`Stage ${s}`}
                  stroke={STAGE_COLORS[s]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
              {showBrush ? (
                <Brush dataKey="period" height={22} travellerWidth={8} stroke={CHART.axis} tickFormatter={periodShortLabel} />
              ) : null}
            </LineChart>
          )}
        </ResponsiveContainer>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        {mode === "compare" ? (
          ([1, 2, 3] as Stage[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ background: STAGE_COLORS[s] }} aria-hidden /> Stage {s}
            </span>
          ))
        ) : null}
        {mode === "compare" && metric !== "coverage" ? (
          <span className="text-subtle">Stage 1 concentra la mayor parte; use «Por stage» para ver la tendencia de Stage 2 y 3.</span>
        ) : null}
        {anomalyPoints.length ? (
          <span className="flex items-center gap-1.5 text-negative">
            <span className="inline-block size-2.5 rounded-full border-2 border-[#c2410c] bg-white" aria-hidden />
            N_contratos anómalo en {anomalyPoints.map((p) => periodLabel(p.period)).join(" y ")} (ver calidad de datos)
          </span>
        ) : null}
      </div>
      <DataTableToggle data={data} metric={metric} />
    </div>
  );
}

function DataTableToggle({ data, metric }: { data: TimePoint[]; metric: TimeMetric }) {
  return (
    <details className="group text-[12.5px]">
      <summary className="w-fit cursor-pointer rounded text-muted-foreground hover:text-foreground">Ver datos en tabla</summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-border">
        <table className="w-full text-right tabular">
          <thead className="sticky top-0 bg-secondary text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-1.5 text-left font-medium">Mes</th>
              <th scope="col" className="px-3 py-1.5 font-medium">Total</th>
              <th scope="col" className="px-3 py-1.5 font-medium">Stage 1</th>
              <th scope="col" className="px-3 py-1.5 font-medium">Stage 2</th>
              <th scope="col" className="px-3 py-1.5 font-medium">Stage 3</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.period} className="border-t border-border">
                <th scope="row" className="px-3 py-1 text-left font-normal">{periodLabel(d.period)}</th>
                <td className="px-3 py-1">{fmtMetric(d.total, metric, false)}</td>
                <td className="px-3 py-1">{fmtMetric(d.s1, metric, false)}</td>
                <td className="px-3 py-1">{fmtMetric(d.s2, metric, false)}</td>
                <td className="px-3 py-1">{fmtMetric(d.s3, metric, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
