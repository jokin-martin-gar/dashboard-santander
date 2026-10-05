"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RiskRecord, Stage } from "@/types/data";
import {
  AGE_VARIABLES,
  AGE_OUTLIER_YEARS,
  ageHistogram,
  ageMeans,
  binsFromEdges,
  deriveEdges,
  type AgeVariable,
} from "@/lib/calculations/ageing";
import { CHART, STAGE_COLORS } from "@/lib/theme/colors";
import { formatEurCompact, formatEurFull, formatPercent, formatYears } from "@/lib/formatters/number";
import { Segmented } from "@/components/charts/segmented";
import { InfoTip } from "./info-tip";

type View = "ead" | "pct";
const VIEWS: { value: View; label: string }[] = [
  { value: "ead", label: "EAD total" },
  { value: "pct", label: "% por stage" },
];
const VAR_OPTIONS = AGE_VARIABLES.map((v) => ({ value: v.key, label: v.label }));

interface Props {
  /** Registros del mes de referencia (ya filtrados). */
  records: RiskRecord[];
  /** Todo el fichero: los rangos se derivan de la distribución completa para ser estables. */
  allRecords: RiskRecord[];
}

export function AgeingAnalysis({ records, allRecords }: Props) {
  const [variable, setVariable] = useState<AgeVariable>("tiempoEnCartera");
  const [view, setView] = useState<View>("pct");
  const bins = useMemo(() => binsFromEdges(deriveEdges(allRecords, variable)), [allRecords, variable]);
  const hist = useMemo(() => ageHistogram(records, variable, bins), [records, variable, bins]);
  const means = useMemo(() => ageMeans(records), [records]);
  const def = AGE_VARIABLES.find((v) => v.key === variable)!;
  const hasData = hist.some((h) => h.total > 0);

  return (
    <div className="flex flex-col gap-4" data-testid="ageing">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented label="Variable de antigüedad" value={variable} options={VAR_OPTIONS} onChange={setVariable} />
        <Segmented label="Vista" value={view} options={VIEWS} onChange={setView} />
      </div>
      <p className="text-[12.5px] text-muted-foreground">
        {def.description} Rangos derivados de los cuantiles p10–p90 del EAD de todo el fichero.
      </p>
      {!hasData ? (
        <div className="flex h-[240px] items-center justify-center rounded-lg bg-secondary/60 text-[13px] text-muted-foreground">
          Sin EAD informado para los filtros seleccionados.
        </div>
      ) : (
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hist} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="bin" tick={{ fill: CHART.tick, fontSize: 11.5 }} tickLine={false} axisLine={{ stroke: CHART.axis }} interval={0} />
              <YAxis
                tickFormatter={(v: number) => (view === "pct" ? formatPercent(v, 0) : formatEurCompact(v))}
                tick={{ fill: CHART.tick, fontSize: 11.5 }}
                tickLine={false}
                axisLine={false}
                width={view === "pct" ? 44 : 70}
              />
              <Tooltip
                cursor={{ fill: "rgba(15,17,21,0.04)" }}
                formatter={(v, name) => [view === "pct" ? formatPercent(Number(v)) : formatEurFull(Number(v)), String(name)]}
                contentStyle={{ borderRadius: 8, borderColor: "#e5e4df", fontSize: 12 }}
              />
              {view === "ead" ? (
                <Bar dataKey="total" name="EAD" fill="#33415c" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              ) : (
                ([1, 2, 3] as Stage[]).map((s) => (
                  <Bar key={s} dataKey={`pct${s}`} name={`Stage ${s}`} fill={STAGE_COLORS[s]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                ))
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {view === "pct" ? (
        <div className="flex flex-wrap gap-x-4 text-[12px] text-muted-foreground" aria-label="Leyenda">
          {([1, 2, 3] as Stage[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: STAGE_COLORS[s] }} aria-hidden />
              Stage {s} (% de su EAD)
            </span>
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[12.5px]" data-testid="ageing-means">
          <caption className="mb-1.5 text-left text-[12.5px] font-medium text-foreground">
            <span className="inline-flex items-center gap-1">
              Media y mediana ponderadas por EAD (años)
              <InfoTip label="Cálculo de medias">
                Media ponderada por EAD sobre las medias de cada fila, excluyendo valores superiores a {AGE_OUTLIER_YEARS}{" "}
                años. Mediana ponderada por EAD con todos los valores. Las filas sin EAD no intervienen.
              </InfoTip>
            </span>
          </caption>
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="py-1.5 pr-2 text-left font-medium">Variable</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Total</th>
              {([1, 2, 3] as Stage[]).map((s) => (
                <th key={s} scope="col" className="px-2 py-1.5 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block size-2 rounded-sm" style={{ background: STAGE_COLORS[s] }} aria-hidden />
                    Stage {s}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular">
            {means.map((m) => (
              <tr key={m.variable} className="border-t border-border">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                  {AGE_VARIABLES.find((v) => v.key === m.variable)!.label}
                </th>
                {[m.total, m.byStage[1], m.byStage[2], m.byStage[3]].map((st, i) => (
                  <td key={i} className="px-2 py-1.5 text-right">
                    <span className="font-medium">{formatYears(st.mean)}</span>
                    <span className="ml-1.5 text-[11.5px] text-subtle">med. {formatYears(st.median)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
