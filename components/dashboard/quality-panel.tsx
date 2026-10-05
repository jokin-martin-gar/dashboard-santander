"use client";

import { AlertTriangle, CircleAlert, Info, ShieldCheck } from "lucide-react";
import type { CanonicalColumn, Dataset, QualityIssue } from "@/types/data";
import { CANONICAL_LABEL } from "@/lib/excel/headers";
import { formatIsoDate, periodLabel } from "@/lib/data/periods";
import { formatCount, formatPercent } from "@/lib/formatters/number";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const SEVERITY: Record<QualityIssue["severity"], { icon: typeof Info; cls: string; label: string }> = {
  error: { icon: CircleAlert, cls: "text-destructive", label: "Error" },
  warning: { icon: AlertTriangle, cls: "text-warning-fg", label: "Aviso" },
  info: { icon: Info, cls: "text-muted-foreground", label: "Info" },
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" | "good" }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="text-[11.5px] text-muted-foreground">{label}</div>
      <div className={cn("text-[17px] font-semibold tabular", tone === "bad" && "text-destructive", tone === "good" && "text-positive")}>{value}</div>
    </div>
  );
}

export function QualityPanel({ dataset, open, onOpenChange }: { dataset: Dataset; open: boolean; onOpenChange: (o: boolean) => void }) {
  const q = dataset.quality;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" data-testid="quality-panel">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-positive" aria-hidden /> Calidad de datos
          </SheetTitle>
          <SheetDescription>
            {dataset.fileName} · hoja «{dataset.sheetName}» · procesado en {formatCount(dataset.parseMs)} ms
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-8 text-[13px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Filas cargadas" value={formatCount(q.totalRows)} />
            <Stat label="Filas válidas" value={formatCount(q.validRows)} tone="good" />
            <Stat label="Filas descartadas" value={formatCount(q.discardedRows)} tone={q.discardedRows ? "bad" : undefined} />
            <Stat label="Filas con advertencias" value={formatCount(q.rowsWithWarnings)} />
            <Stat label="Duplicados (exactos / clave)" value={`${formatCount(q.exactDuplicates)} / ${formatCount(q.keyDuplicates)}`} />
            <Stat label="Transiciones incoherentes" value={formatCount(q.inconsistentTransitions)} tone={q.inconsistentTransitions ? "bad" : undefined} />
            <Stat label="Fecha mínima" value={formatIsoDate(q.minFecha)} />
            <Stat label="Fecha máxima" value={formatIsoDate(q.maxFecha)} />
            <Stat label="Meses" value={`${formatCount(dataset.periods.length)} (${q.minPeriod ? periodLabel(q.minPeriod) : "N/D"} – ${q.maxPeriod ? periodLabel(q.maxPeriod) : "N/D"})`} />
          </div>

          <section>
            <h3 className="mb-2 font-semibold">Incidencias</h3>
            {q.issues.length ? (
              <ul className="flex flex-col gap-2" data-testid="quality-issues">
                {q.issues.map((i) => {
                  const s = SEVERITY[i.severity];
                  const Icon = s.icon;
                  return (
                    <li key={i.code + i.title} className="flex gap-2.5 rounded-lg border border-border px-3 py-2">
                      <Icon className={cn("mt-0.5 size-4 shrink-0", s.cls)} aria-label={s.label} />
                      <div className="min-w-0">
                        <div className="font-medium">
                          {i.title}
                          {i.count !== undefined ? <span className="ml-1.5 font-normal text-muted-foreground tabular">({formatCount(i.count)})</span> : null}
                        </div>
                        {i.detail ? <p className="mt-0.5 text-[12.5px] text-muted-foreground">{i.detail}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground">Sin incidencias.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Nulos por columna</h3>
            <table className="w-full text-[12.5px]">
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="py-1 text-left font-medium">Columna</th>
                  <th scope="col" className="py-1 text-right font-medium">Nulos</th>
                  <th scope="col" className="py-1 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {q.nullsByColumn.map((n) => (
                  <tr key={n.column} className="border-t border-border">
                    <th scope="row" className="py-1 text-left font-normal">{n.column}</th>
                    <td className={cn("py-1 text-right", n.nulls > 0 && "font-medium text-warning-fg")}>{formatCount(n.nulls)}</td>
                    <td className="py-1 text-right text-muted-foreground">{formatPercent(n.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1.5 text-[12px] text-subtle">
              stage_despues vacío es esperado en las salidas de cartera. EAD vacío se excluye de los importes.
            </p>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Valores categóricos no reconocidos</h3>
            {q.unrecognizedValues.length ? (
              <ul className="list-disc pl-5">
                {q.unrecognizedValues.map((u) => (
                  <li key={u.column}>
                    <span className="font-medium">{u.column}</span>: {u.values.join(", ")}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Ninguno.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Correspondencia de columnas</h3>
            <table className="w-full text-[12.5px]">
              <tbody>
                {(Object.keys(dataset.mapping.resolved) as CanonicalColumn[]).map((c) => (
                  <tr key={c} className="border-t border-border">
                    <th scope="row" className="py-1 text-left font-normal text-muted-foreground">{CANONICAL_LABEL[c]}</th>
                    <td className="py-1 text-right font-mono text-[12px]">
                      {dataset.mapping.resolved[c] ?? <span className="text-subtle">no encontrada</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dataset.mapping.unrecognized.length ? (
              <p className="mt-1.5 text-[12px] text-muted-foreground">Columnas ignoradas: {dataset.mapping.unrecognized.join(", ")}</p>
            ) : null}
          </section>

          {q.discarded.length ? (
            <section>
              <h3 className="mb-2 font-semibold">Filas descartadas</h3>
              <ul className="max-h-48 overflow-y-auto text-[12.5px]">
                {q.discarded.slice(0, 200).map((d) => (
                  <li key={d.excelRow} className="border-t border-border py-1">
                    Fila {d.excelRow}: {d.reason}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
