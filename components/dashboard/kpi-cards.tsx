"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Variation } from "@/lib/calculations/metrics";
import {
  ND,
  formatCount,
  formatEurCompact,
  formatEurFull,
  formatPercent,
  formatPp,
  withSign,
} from "@/lib/formatters/number";
import { addMonths, periodLabel } from "@/lib/data/periods";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InfoTip } from "./info-tip";
import { useDashboard } from "./dashboard-context";

type Kind = "eur" | "count" | "percent";

interface KpiDef {
  id: string;
  label: string;
  variation: Variation;
  kind: Kind;
  formula: ReactNode;
  period: string | null;
  previous: string | null;
  /** Si un aumento es desfavorable (se colorea como alerta, además del signo y la flecha). */
  increaseIsAdverse?: boolean;
}

function formatValue(v: number | null, kind: Kind) {
  if (kind === "eur") return formatEurCompact(v);
  if (kind === "count") return formatCount(v);
  return formatPercent(v);
}

function formatFull(v: number | null, kind: Kind) {
  if (kind === "eur") return formatEurFull(v);
  if (kind === "count") return `${formatCount(v)} contratos`;
  return formatPercent(v, 4);
}

function Delta({ def }: { def: KpiDef }) {
  const { absolute, relative } = def.variation;
  if (absolute === null) {
    return (
      <span className="text-[12.5px] text-muted-foreground">
        Variación N/D <span className="text-subtle">· sin mes anterior</span>
      </span>
    );
  }
  const abs =
    def.kind === "percent"
      ? formatPp(absolute)
      : withSign(def.kind === "eur" ? formatEurCompact(Math.abs(absolute)) : formatCount(Math.abs(absolute)), absolute);
  const rel = relative === null ? ND : withSign(formatPercent(Math.abs(relative)), relative);
  const Icon = absolute > 0 ? ArrowUpRight : absolute < 0 ? ArrowDownRight : Minus;
  const adverse = def.increaseIsAdverse ? absolute > 0 : false;
  const favourable = def.increaseIsAdverse ? absolute < 0 : false;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px]">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium tabular",
          adverse ? "bg-[#fdeee6] text-negative" : favourable ? "bg-[#e9f5ec] text-positive" : "bg-secondary text-foreground",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {abs}
      </span>
      <span className="tabular text-muted-foreground">{rel}</span>
      <span className="text-subtle">vs {def.previous ? periodLabel(def.previous) : ND}</span>
    </span>
  );
}

function KpiCard({ def, index }: { def: KpiDef; index: number }) {
  const value = formatValue(def.variation.current, def.kind);
  return (
    <motion.article
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      data-testid={`kpi-${def.id}`}
      className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3.5 shadow-[0_1px_2px_rgba(15,17,21,0.04)]"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-[13px] font-medium text-muted-foreground">{def.label}</h3>
        <InfoTip label={`Fórmula de ${def.label}`}>{def.formula}</InfoTip>
      </div>
      <Tooltip>
        <TooltipTrigger
          render={<span />}
          tabIndex={0}
          className="w-fit rounded-sm text-[26px] leading-tight font-semibold tracking-[-0.02em] tabular text-foreground"
          aria-label={`${def.label}: ${formatFull(def.variation.current, def.kind)}`}
          data-testid={`kpi-${def.id}-value`}
        >
          {value}
        </TooltipTrigger>
        <TooltipContent side="bottom">{formatFull(def.variation.current, def.kind)}</TooltipContent>
      </Tooltip>
      <div className="text-[12px] text-subtle">{def.period ?? "Sin datos"}</div>
      <Delta def={def} />
    </motion.article>
  );
}

export function KpiCards() {
  const { data } = useDashboard();
  const k = data.kpis;
  const ref = k.period ? periodLabel(k.period) : null;
  const tRef = k.transitionPeriod
    ? `Transición ${periodLabel(k.transitionPeriod)} → ${periodLabel(addMonths(k.transitionPeriod, 1) ?? k.transitionPeriod)}`
    : "Sin transiciones observables";
  const rowsWithoutEad = k.current.rowsWithoutEad;

  const defs: KpiDef[] = [
    {
      id: "ead",
      label: "EAD total",
      variation: k.ead,
      kind: "eur",
      period: ref,
      previous: k.previousPeriod,
      formula: (
        <>
          Σ EAD del mes de referencia (stock, no se suman meses).
          {rowsWithoutEad > 0 ? ` ${rowsWithoutEad} filas sin EAD informado no aportan importe.` : ""}
        </>
      ),
    },
    {
      id: "provision",
      label: "Provisión total",
      variation: k.provision,
      kind: "eur",
      period: ref,
      previous: k.previousPeriod,
      formula: "Σ Provision del mes de referencia.",
    },
    {
      id: "contratos",
      label: "Nº de contratos",
      variation: k.nContratos,
      kind: "count",
      period: ref,
      previous: k.previousPeriod,
      formula: "Σ N_contratos (cada fila agrega varios contratos; no se cuentan filas).",
    },
    {
      id: "coverage",
      label: "Coverage ratio",
      variation: k.coverage,
      kind: "percent",
      period: ref,
      previous: k.previousPeriod,
      formula: "Σ Provision / Σ EAD, sobre las filas con EAD informado. N/D si el EAD es 0. Variación en puntos porcentuales.",
    },
    {
      id: "deteriorado",
      label: "EAD deteriorado",
      variation: k.eadDeteriorado,
      kind: "eur",
      period: tRef,
      previous: k.previousTransitionPeriod,
      increaseIsAdverse: true,
      formula: "Σ EAD de las transiciones 1→2, 1→3 y 2→3 del último mes con transiciones observables (EAD de origen).",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-5" data-testid="kpi-cards">
      {defs.map((d, i) => (
        <KpiCard key={d.id} def={d} index={i} />
      ))}
    </div>
  );
}
