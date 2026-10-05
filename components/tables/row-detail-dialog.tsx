"use client";

import type { CanonicalColumn, RiskRecord } from "@/types/data";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { transitionExcelLabel, TRANSITION_CLASS_LABEL } from "@/lib/data/transitions";
import { warningText } from "@/lib/validators/quality";
import { formatNumber } from "@/lib/formatters/number";

function normalizedValue(r: RiskRecord, col: CanonicalColumn | undefined): string {
  if (!col) return "— (columna no utilizada)";
  const n = (v: number | null, d = 6) => (v === null ? "null" : formatNumber(v, d));
  switch (col) {
    case "nContratos":
      return n(r.nContratos, 0);
    case "fechaTablon":
      return r.fechaTablon ?? "null";
    case "anio":
    case "mes":
      return `${r.period} (período)`;
    case "cartera":
      return r.cartera;
    case "titulizado":
      return r.titulizado;
    case "flagIndividualizado":
      return r.flagIndividualizado;
    case "stage":
      return String(r.stage);
    case "stageDespues":
      return r.stageDespues === null ? "null (Salida Cartera)" : String(r.stageDespues);
    case "transiciones":
      return `${transitionExcelLabel(r.transition)} → ${TRANSITION_CLASS_LABEL[r.transitionClass]}${r.transitionObservable ? "" : " (no observable)"}`;
    case "ead":
      return n(r.ead);
    case "provision":
      return n(r.provision);
    case "tiempoEnCartera":
      return n(r.tiempoEnCartera);
    case "tiempoAVencimiento":
      return n(r.tiempoAVencimiento);
    case "aniosTtm":
      return n(r.aniosTtm);
    case "anioTransiciones":
    case "mesTransiciones":
      return `${r.transitionPeriod ?? "null"} (período destino)`;
    case "eadS1":
      return n(r.eadS1);
    case "eadS2":
      return n(r.eadS2);
    case "eadS3":
      return n(r.eadS3);
  }
}

function showRaw(v: unknown): string {
  if (v === null || v === undefined) return "(vacía)";
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

export function RowDetailDialog({ record, onClose }: { record: RiskRecord | null; onClose: () => void }) {
  const { dataset } = useDashboard();
  const byIndex = new Map<number, CanonicalColumn>();
  for (const [k, i] of Object.entries(dataset.mapping.indexes)) if (i >= 0) byIndex.set(i, k as CanonicalColumn);
  const rawRow = record ? dataset.raw.rows[record.rawIndex] : null;

  return (
    <Dialog open={record !== null} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fila {record?.excelRow} del Excel</DialogTitle>
          <DialogDescription>Valor original de cada celda frente al valor normalizado que usa el dashboard.</DialogDescription>
        </DialogHeader>
        {record && rawRow ? (
          <div className="flex flex-col gap-3">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead className="text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-1.5 pr-3 text-left font-medium">Columna</th>
                    <th scope="col" className="py-1.5 pr-3 text-left font-medium">Original</th>
                    <th scope="col" className="py-1.5 text-left font-medium">Normalizado</th>
                  </tr>
                </thead>
                <tbody>
                  {dataset.raw.headers.map((h, i) => (
                    <tr key={`${h}-${i}`} className="border-t border-border align-top">
                      <th scope="row" className="py-1.5 pr-3 text-left font-medium whitespace-nowrap">{h || `(col ${i + 1})`}</th>
                      <td className="py-1.5 pr-3 font-mono text-[12px] break-all text-muted-foreground">{showRaw(rawRow[i])}</td>
                      <td className="py-1.5 font-mono text-[12px] break-all">{normalizedValue(record, byIndex.get(i))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {record.warnings.length ? (
              <div className="rounded-lg bg-warning-bg px-3 py-2 text-[12.5px] text-warning-fg">
                <div className="font-medium">Avisos</div>
                <ul className="mt-1 list-disc pl-5">
                  {record.warnings.map((w) => (
                    <li key={w}>{warningText(w)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
