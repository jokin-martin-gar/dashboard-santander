"use client";

import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { sankey, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from "d3-sankey";
import type { Destination, Stage, TransitionKey } from "@/types/data";
import type { TransitionFlow, TransitionSummary } from "@/lib/calculations/aggregations";
import {
  TRANSITION_CLASSES,
  TRANSITION_CLASS_LABEL,
  destinationLabel,
  stageLabel,
  transitionLabel,
} from "@/lib/data/transitions";
import { CLASS_COLORS, STAGE_COLORS, destinationColor } from "@/lib/theme/colors";
import { formatCount, formatEurCompact, formatEurFull, formatPercent } from "@/lib/formatters/number";
import { useElementWidth } from "@/hooks/use-element-width";
import { cn } from "@/lib/utils";
import { FloatingTooltip, TooltipRow, type TooltipAnchor } from "./floating-tooltip";

export type FlowMetric = "ead" | "nContratos";

interface NodeDatum {
  id: string;
  side: "origin" | "destination";
  stage: Destination;
  total: number;
}
interface LinkDatum {
  flow: TransitionFlow;
}
type N = SankeyNode<NodeDatum, LinkDatum>;
type L = SankeyLink<NodeDatum, LinkDatum>;

const HEIGHT = 420;
const TOP = 26;
const LABEL_LEFT = 118;
const LABEL_RIGHT = 150;

function fmt(v: number, metric: FlowMetric) {
  return metric === "ead" ? formatEurCompact(v) : formatCount(v);
}

export function FlowTooltipContent({ flow }: { flow: TransitionFlow }) {
  return (
    <div className="min-w-[210px]">
      <div className="mb-1.5 flex items-center gap-2 font-semibold text-foreground">
        <span className="inline-block size-2.5 rounded-sm" style={{ background: CLASS_COLORS[flow.transitionClass] }} aria-hidden />
        {transitionLabel(flow.key)}
      </div>
      <div className="mb-1.5 text-[11.5px] text-muted-foreground">{TRANSITION_CLASS_LABEL[flow.transitionClass]}</div>
      <TooltipRow label="EAD" value={formatEurFull(flow.ead)} />
      <TooltipRow label={`% EAD de ${stageLabel(flow.from)}`} value={formatPercent(flow.pctOfOrigin)} />
      <TooltipRow label="Contratos" value={formatCount(flow.nContratos)} />
      <TooltipRow label="Provisión" value={formatEurFull(flow.provision)} />
      <TooltipRow label="Coverage" value={formatPercent(flow.coverage)} />
    </div>
  );
}

interface SankeyChartProps {
  summary: TransitionSummary;
  metric: FlowMetric;
  showPermanence: boolean;
  selected: TransitionKey[];
  onToggle: (key: TransitionKey) => void;
}

export function SankeyChart({ summary, metric, showPermanence, selected, onToggle }: SankeyChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ flow: TransitionFlow; anchor: TooltipAnchor } | null>(null);

  const flows = useMemo(
    () =>
      summary.flows.filter((f) => (metric === "ead" ? f.ead : f.nContratos) > 0 && (showPermanence || f.transitionClass !== "permanencia")),
    [summary, metric, showPermanence],
  );

  const graph = useMemo(() => {
    if (width < 360 || !flows.length) return null;
    const nodeIds = new Set<string>();
    for (const f of flows) {
      nodeIds.add(`o${f.from}`);
      nodeIds.add(`d${f.to}`);
    }
    const order = ["o1", "o2", "o3", "d1", "d2", "d3", "dS"];
    const nodes: NodeDatum[] = order
      .filter((id) => nodeIds.has(id))
      .map((id) => ({
        id,
        side: id.startsWith("o") ? "origin" : "destination",
        stage: (id.endsWith("S") ? "S" : Number(id.slice(1))) as Destination,
        total: 0,
      }));
    const links = flows.map((f) => ({
      source: `o${f.from}`,
      target: `d${f.to}`,
      value: metric === "ead" ? f.ead : f.nContratos,
      flow: f,
    }));
    const layout = sankey<NodeDatum, LinkDatum>()
      .nodeId((d) => d.id)
      .nodeWidth(12)
      .nodePadding(36)
      .nodeSort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
      .linkSort(null)
      .extent([
        [LABEL_LEFT, TOP],
        [width - LABEL_RIGHT, HEIGHT - 8],
      ]);
    const g = layout({ nodes: nodes.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) });
    for (const n of g.nodes) n.total = n.value ?? 0;
    return g;
  }, [flows, width, metric]);

  const path = sankeyLinkHorizontal<NodeDatum, LinkDatum>();
  const hasSelection = selected.length > 0;

  const showTip = (flow: TransitionFlow, e: MouseEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setHover({ flow, anchor: { x: e.clientX - box.left, y: e.clientY - box.top } });
  };
  const focusTip = (l: L) => {
    const s = l.source as N;
    const t = l.target as N;
    setHover({
      flow: l.flow,
      anchor: { x: ((s.x1 ?? 0) + (t.x0 ?? 0)) / 2, y: ((l.y0 ?? 0) + (l.y1 ?? 0)) / 2 },
    });
  };
  const onKey = (e: KeyboardEvent, key: TransitionKey) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle(key);
    }
  };

  if (!flows.length) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-lg bg-secondary/60 text-center text-[13px] text-muted-foreground">
        No hay flujos con valor distinto de cero para los filtros seleccionados.
      </div>
    );
  }

  return (
    <div ref={ref} className="relative w-full" data-testid="sankey">
      {width > 0 && width < 560 ? (
        <SankeyMobileList summary={summary} flows={flows} metric={metric} selected={selected} onToggle={onToggle} />
      ) : graph ? (
        <svg
          width={width}
          height={HEIGHT}
          role="group"
          aria-label="Diagrama Sankey de transiciones entre stages"
          className="block overflow-visible"
          onMouseLeave={() => setHover(null)}
        >
          <g fill="none">
            {graph.links.map((l) => {
              const f = l.flow;
              const isSel = selected.includes(f.key);
              const dim = hasSelection && !isSel;
              const active = hover?.flow.key === f.key;
              return (
                <path
                  key={f.key}
                  d={path(l) ?? undefined}
                  stroke={CLASS_COLORS[f.transitionClass]}
                  strokeWidth={Math.max(1.5, l.width ?? 0)}
                  strokeOpacity={dim ? 0.12 : active || isSel ? 0.75 : 0.42}
                  className="cursor-pointer outline-none transition-[stroke-opacity] duration-150 focus-visible:[stroke-opacity:0.85]"
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSel}
                  aria-label={`${transitionLabel(f.key)}: ${formatEurFull(f.ead)}, ${formatPercent(f.pctOfOrigin)} del EAD de origen, ${formatCount(f.nContratos)} contratos. Pulsar para filtrar.`}
                  data-testid={`sankey-link-${f.key}`}
                  onMouseMove={(e) => showTip(f, e)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => focusTip(l)}
                  onBlur={() => setHover(null)}
                  onClick={() => onToggle(f.key)}
                  onKeyDown={(e) => onKey(e, f.key)}
                />
              );
            })}
          </g>
          {graph.nodes.map((n) => {
            const isOrigin = n.side === "origin";
            const color = isOrigin ? STAGE_COLORS[n.stage as Stage] : destinationColor(n.stage);
            const y = ((n.y0 ?? 0) + (n.y1 ?? 0)) / 2;
            const name = isOrigin ? stageLabel(n.stage as Stage) : destinationLabel(n.stage);
            return (
              <g key={n.id}>
                <rect
                  x={n.x0}
                  y={n.y0}
                  width={(n.x1 ?? 0) - (n.x0 ?? 0)}
                  height={Math.max(2, (n.y1 ?? 0) - (n.y0 ?? 0))}
                  rx={2}
                  fill={color}
                />
                <text
                  x={isOrigin ? (n.x0 ?? 0) - 10 : (n.x1 ?? 0) + 10}
                  y={y}
                  dy="-0.15em"
                  textAnchor={isOrigin ? "end" : "start"}
                  className="fill-foreground text-[12.5px] font-medium"
                >
                  {name}
                </text>
                <text
                  x={isOrigin ? (n.x0 ?? 0) - 10 : (n.x1 ?? 0) + 10}
                  y={y}
                  dy="1.05em"
                  textAnchor={isOrigin ? "end" : "start"}
                  className="fill-muted-foreground text-[12px] tabular"
                >
                  {fmt(n.total, metric)}
                </text>
              </g>
            );
          })}
          <text x={LABEL_LEFT} y={12} className="fill-subtle text-[11px] font-medium uppercase tracking-wide" textAnchor="start">
            Origen
          </text>
          <text x={width - LABEL_RIGHT} y={12} className="fill-subtle text-[11px] font-medium uppercase tracking-wide" textAnchor="end">
            Destino (mes siguiente)
          </text>
        </svg>
      ) : null}
      <FloatingTooltip anchor={hover?.anchor ?? null}>{hover ? <FlowTooltipContent flow={hover.flow} /> : null}</FloatingTooltip>
    </div>
  );
}

/** Representación alternativa para pantallas estrechas: barras por stage de origen. */
function SankeyMobileList({
  summary,
  flows,
  metric,
  selected,
  onToggle,
}: {
  summary: TransitionSummary;
  flows: TransitionFlow[];
  metric: FlowMetric;
  selected: TransitionKey[];
  onToggle: (key: TransitionKey) => void;
}) {
  const origins = ([1, 2, 3] as Stage[]).filter((s) => flows.some((f) => f.from === s));
  return (
    <div className="flex flex-col gap-4" data-testid="sankey-mobile">
      {origins.map((s) => {
        const fs = flows.filter((f) => f.from === s);
        const total = metric === "ead" ? (summary.originTotals[s].ead ?? 0) : (summary.originTotals[s].nContratos ?? 0);
        return (
          <div key={s}>
            <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="inline-block size-2.5 rounded-sm" style={{ background: STAGE_COLORS[s] }} aria-hidden />
                Desde {stageLabel(s)}
              </span>
              <span className="tabular text-muted-foreground">{fmt(total, metric)}</span>
            </div>
            <ul className="flex flex-col gap-1">
              {fs.map((f) => {
                const v = metric === "ead" ? f.ead : f.nContratos;
                const pct = total > 0 ? v / total : 0;
                const isSel = selected.includes(f.key);
                return (
                  <li key={f.key}>
                    <button
                      type="button"
                      onClick={() => onToggle(f.key)}
                      aria-pressed={isSel}
                      className={cn(
                        "grid w-full grid-cols-[92px_1fr_auto] items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12.5px] hover:bg-secondary",
                        isSel && "bg-secondary ring-1 ring-border",
                      )}
                    >
                      <span className="truncate">→ {f.to === "S" ? "Salida" : destinationLabel(f.to)}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-secondary">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${Math.max(pct * 100, 1)}%`, background: CLASS_COLORS[f.transitionClass] }}
                        />
                      </span>
                      <span className="tabular text-muted-foreground">{formatPercent(pct, 1)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function TransitionLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground" aria-label="Leyenda de tipos de transición">
      {TRANSITION_CLASSES.map((c) => (
        <li key={c} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: CLASS_COLORS[c] }} aria-hidden />
          {TRANSITION_CLASS_LABEL[c]}
        </li>
      ))}
      <li className="flex items-center gap-1.5 text-subtle">
        <span className="flex gap-0.5" aria-hidden>
          {([1, 2, 3] as Stage[]).map((s) => (
            <span key={s} className="inline-block h-2.5 w-1.5 rounded-sm" style={{ background: STAGE_COLORS[s] }} />
          ))}
        </span>
        Nodos: color del stage
      </li>
    </ul>
  );
}
