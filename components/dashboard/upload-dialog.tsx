"use client";

import { useRef, useState, type DragEvent } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, UploadCloud, XCircle } from "lucide-react";
import type { Dataset } from "@/types/data";
import type { SheetSummary } from "@/lib/excel/read-workbook";
import type { LoadError, LoadResult } from "@/hooks/use-dataset";
import { formatCount } from "@/lib/formatters/number";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Phase =
  | { kind: "idle" }
  | { kind: "processing"; fileName: string }
  | { kind: "done"; file: File; dataset: Dataset; sheets: SheetSummary[]; sheet: string }
  | { kind: "error"; file?: File; error: LoadError; sheets?: SheetSummary[]; sheet?: string };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  loadFile: (file: File, sheet?: string) => Promise<LoadResult & { sheets?: SheetSummary[]; selectedSheet?: string }>;
  onRestoreDefault: () => void;
}

export function UploadDialog({ open, onOpenChange, loadFile, onRestoreDefault }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);

  const process = async (file: File, sheet?: string) => {
    setPhase({ kind: "processing", fileName: file.name });
    const r = await loadFile(file, sheet);
    if (r.ok && r.dataset) {
      setPhase({ kind: "done", file, dataset: r.dataset, sheets: r.sheets ?? [], sheet: r.selectedSheet ?? r.dataset.sheetName });
    } else {
      setPhase({ kind: "error", file, error: r.error!, sheets: r.sheets, sheet: r.selectedSheet });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void process(f);
  };

  const sheets = phase.kind === "done" || phase.kind === "error" ? (phase.sheets ?? []) : [];
  const currentSheet = phase.kind === "done" || phase.kind === "error" ? phase.sheet : undefined;
  const file = phase.kind === "done" || phase.kind === "error" ? phase.file : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setPhase({ kind: "idle" });
      }}
    >
      <DialogContent className="sm:max-w-lg" data-testid="upload-dialog">
        <DialogHeader>
          <DialogTitle>Cargar o sustituir el Excel</DialogTitle>
          <DialogDescription>
            El archivo se procesa sólo en este navegador y no se envía a ningún servidor. Sustituye los datos durante la
            sesión; el Excel de data/ no se modifica.
          </DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
            dragging ? "border-ring bg-[#f3f7fc]" : "border-input bg-secondary/40",
          )}
        >
          {phase.kind === "processing" ? (
            <>
              <Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden />
              <p className="text-[13px]" role="status">
                Analizando «{phase.fileName}»…
              </p>
            </>
          ) : (
            <>
              <UploadCloud className="size-7 text-muted-foreground" aria-hidden />
              <p className="text-[13px]">Arrastre aquí un archivo .xlsx o .xls</p>
              <Button variant="outline" onClick={() => inputRef.current?.click()}>
                Seleccionar archivo
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="sr-only"
                data-testid="upload-input"
                aria-label="Seleccionar archivo Excel"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void process(f);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>

        {sheets.length > 1 && file ? (
          <label className="flex items-center justify-between gap-3 text-[13px]">
            <span className="text-muted-foreground">Hoja ({sheets.length} disponibles)</span>
            <select
              className="h-9 rounded-lg border border-input bg-card px-2 text-[13px]"
              value={currentSheet}
              onChange={(e) => void process(file, e.target.value)}
              aria-label="Hoja del libro"
            >
              {sheets.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} · {formatCount(s.rows)} filas{s.score >= 8 ? " · recomendada" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {phase.kind === "done" ? (
          <div className="rounded-lg border border-border px-3.5 py-3 text-[13px]" role="status">
            <div className="flex items-center gap-2 font-medium text-positive">
              <CheckCircle2 className="size-4" aria-hidden /> {phase.dataset.fileName} cargado
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 tabular">
              <div>
                <dt className="text-[11.5px] text-muted-foreground">Filas válidas</dt>
                <dd className="font-semibold">{formatCount(phase.dataset.quality.validRows)}</dd>
              </div>
              <div>
                <dt className="text-[11.5px] text-muted-foreground">Descartadas</dt>
                <dd className="font-semibold">{formatCount(phase.dataset.quality.discardedRows)}</dd>
              </div>
              <div>
                <dt className="text-[11.5px] text-muted-foreground">Con advertencias</dt>
                <dd className="font-semibold">{formatCount(phase.dataset.quality.rowsWithWarnings)}</dd>
              </div>
            </dl>
            <Button className="mt-3 w-full" onClick={() => onOpenChange(false)}>
              Ver dashboard
            </Button>
          </div>
        ) : null}

        {phase.kind === "error" ? (
          <div className="rounded-lg border border-[#f3c4c4] bg-[#fdf3f3] px-3.5 py-3 text-[13px]" role="alert" data-testid="upload-error">
            <div className="flex items-center gap-2 font-medium text-destructive">
              <XCircle className="size-4" aria-hidden /> {phase.error.title}
            </div>
            <p className="mt-1 text-foreground">{phase.error.message}</p>
            {phase.error.details.length ? (
              <ul className="mt-1.5 list-disc pl-5 text-muted-foreground">
                {phase.error.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-[12px] text-muted-foreground">Los datos que se estaban mostrando no se han modificado.</p>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-[12.5px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <FileSpreadsheet className="size-4" aria-hidden /> Columnas requeridas: N_contratos, fecha, Cartera, stage, Transiciones, EAD, Provision
          </span>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            onRestoreDefault();
            onOpenChange(false);
          }}
        >
          Restaurar el Excel predeterminado (data/)
        </Button>
      </DialogContent>
    </Dialog>
  );
}
