"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TransitionClass } from "@/types/data";
import type { PortfolioQuality, RatePoint } from "@/lib/calculations/aggregations";
import { safeDivide } from "@/lib/calculations/metrics";
import { TRANSITION_CLASSES, TRANSITION_CLASS_LABEL } from "@/lib/data/transitions";
import { periodLabel, periodShortLabel } from "@/lib/data/periods";
import { CHART, CLASS_COLORS } from "@/lib/theme/colors";
import { formatEurCompact, formatEurFull, formatPercent } from "@/lib/formatters/number";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InfoTip } from "./info-tip";

const CLASS_HINT: Record<TransitionClass, string> = {
  permanencia: "1→1, 2→2, 3→3",
  deterioro: "1→2, 1→3, 2→3",
  cura: "2→1, 3→2, 3→1",
  salida: "1/2/3 → Salida Cartera",
};

function RateSpark({ data, dataKey, color, label }: { data: RatePoint[]; dataKey: "tasaDeterioro" | "tasaCura"; color: string; label: string }) {
  if (data.filter((d) => d[dataKey] !== null).length < 2) return null;
  return (
    <div className="mt-2 h-[86px]" aria-label={`Evolución mensual de la ${label}`} role="img">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="period" tickFormatter={periodShortLabel} tick={{ fill: CHART.tick, fontSize: 10.5 }} tickLine={false} axisLine={false} minTickGap={30} />
          <YAxis tickFormatter={(v: number) => formatPercent(v, 1)} tick={{ fill: CHART.tick, fontSize: 10.5 }} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            formatter={(v) => [formatPercent(Number(v)), label]}
            labelFormatter={(l) => periodLabel(String(l))}
            contentStyle={{ borderRadius: 8, borderColor: "#e5e4df", fontSize: 12 }}
          />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PortfolioQualityBlock({ quality, rates }: { quality: PortfolioQuality; rates: RatePoint[] }) {
  const total = quality.totalEad;
  return (
    <div className="flex flex-col gap-4" data-testid="portfolio-quality">
      <div className="grid grid-cols-2 gap-2.5">
        {TRANSITION_CLASSES.map((c) => {
          const v = quality.eadByClass[c];
          return (
            <div key={c} className="min-w-0 rounded-lg border border-border px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: CLASS_COLORS[c] }} aria-hidden />
                <span className="truncate">EAD {TRANSITION_CLASS_LABEL[c].toLowerCase()}</span>
              </div>
              <UiTooltip>
                <TooltipTrigger render={<span />} tabIndex={0} className="mt-1 block w-fit text-[18px] font-semibold tabular">
                  {formatEurCompact(v)}
                </TooltipTrigger>
                <TooltipContent>{formatEurFull(v)}</TooltipContent>
              </UiTooltip>
              <div className="text-[11.5px] text-subtle tabular">
                {formatPercent(safeDivide(v, total))} · {CLASS_HINT[c]}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="rounded-lg border border-border px-3.5 py-3" data-testid="tasa-deterioro">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-medium text-muted-foreground">Tasa de deterioro</span>
            <InfoTip label="Fórmula de la tasa de deterioro">
              EAD de 1→2, 1→3 y 2→3 / EAD con origen en Stage 1 o 2 (incluidas sus salidas). Stage 3 se excluye del
              denominador porque no puede deteriorarse más.
            </InfoTip>
          </div>
          <div className="mt-0.5 text-[24px] font-semibold tabular" style={{ color: "#b4470b" }}>
            {formatPercent(quality.tasaDeterioro)}
          </div>
          <div className="text-[11.5px] text-subtle tabular">
            {formatEurCompact(quality.eadDeteriorado)} / {formatEurCompact(quality.eadSusceptibleDeterioro)}
          </div>
          <RateSpark data={rates} dataKey="tasaDeterioro" color={CLASS_COLORS.deterioro} label="tasa de deterioro" />
        </div>
        <div className="rounded-lg border border-border px-3.5 py-3" data-testid="tasa-cura">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-medium text-muted-foreground">Tasa de cura</span>
            <InfoTip label="Fórmula de la tasa de cura">
              EAD de 2→1, 3→2 y 3→1 / EAD con origen en Stage 2 o 3 (incluidas sus salidas). Stage 1 se excluye del
              denominador porque no puede mejorar.
            </InfoTip>
          </div>
          <div className="mt-0.5 text-[24px] font-semibold tabular text-positive">{formatPercent(quality.tasaCura)}</div>
          <div className="text-[11.5px] text-subtle tabular">
            {formatEurCompact(quality.eadCura)} / {formatEurCompact(quality.eadSusceptibleCura)}
          </div>
          <RateSpark data={rates} dataKey="tasaCura" color={CLASS_COLORS.cura} label="tasa de cura" />
        </div>
      </div>
    </div>
  );
}
