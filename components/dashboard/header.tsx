"use client";

import { Download, FileSpreadsheet, RefreshCw, RotateCcw, ShieldCheck, Upload } from "lucide-react";
import type { Dataset } from "@/types/data";
import { formatIsoDate, periodLongLabel } from "@/lib/data/periods";
import { formatCount } from "@/lib/formatters/number";
import { exportRecords } from "@/lib/export/export-data";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useDashboard } from "./dashboard-context";

interface HeaderProps {
  onUpload: () => void;
  onReload: () => void;
  onQuality: () => void;
  onSelectSheet: (name: string) => void;
  busy: boolean;
}

function SourceInfo({ dataset }: { dataset: Dataset }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground" data-testid="source-info">
      <span className="inline-flex items-center gap-1.5">
        <FileSpreadsheet className="size-3.5" aria-hidden />
        <span className="font-medium text-foreground">{dataset.fileName}</span>
        {dataset.source === "upload" ? (
          <span className="rounded bg-[#eef3fa] px-1.5 py-px text-[11px] text-[#2f5a8f]">cargado en sesión</span>
        ) : null}
      </span>
      <span aria-hidden>·</span>
      <span>Fecha máx. {formatIsoDate(dataset.quality.maxFecha)}</span>
      <span aria-hidden>·</span>
      <span className="tabular" data-testid="records-count">
        {formatCount(dataset.quality.validRows)} registros procesados
      </span>
    </div>
  );
}

export function DashboardHeader({ onUpload, onReload, onQuality, onSelectSheet, busy }: HeaderProps) {
  const { dataset, data, resetFilters } = useDashboard();
  const ref = data.periods.kpiPeriod;
  const refInfo = dataset.periods.find((p) => p.key === ref);
  const warnings = dataset.quality.issues.filter((i) => i.severity !== "info").length;

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] sm:text-[26px]">
            Dashboard de Riesgo y Transiciones
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground" data-testid="reference-date">
            Datos a{" "}
            <span className="font-medium text-foreground">
              {ref ? periodLongLabel(ref) : "N/D"}
              {refInfo?.maxFechaTablon ? ` (corte ${formatIsoDate(refInfo.maxFechaTablon)})` : ""}
            </span>
            {data.periods.inRange.length > 1 ? (
              <span> · rango de {data.periods.inRange.length} meses, KPI al último mes</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-9" onClick={onQuality} data-testid="open-quality">
            <ShieldCheck aria-hidden /> Calidad
            {warnings ? (
              <span className="rounded-full bg-warning-bg px-1.5 text-[11px] font-semibold text-warning-fg tabular">{warnings}</span>
            ) : null}
          </Button>
          <Button variant="outline" className="h-9" onClick={onUpload} data-testid="open-upload">
            <Upload aria-hidden /> <span className="hidden sm:inline">Cargar Excel</span>
            <span className="sm:hidden">Cargar</span>
          </Button>
          <Button variant="ghost" size="icon" className="size-9" onClick={onReload} disabled={busy} aria-label="Recargar el Excel predeterminado" title="Recargar el Excel de data/">
            <RefreshCw className={busy ? "animate-spin" : undefined} aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" className="size-9" onClick={resetFilters} aria-label="Restablecer filtros" title="Restablecer filtros">
            <RotateCcw aria-hidden />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button className="h-9" />} data-testid="export-filtered">
              <Download aria-hidden /> Exportar
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportRecords(data.tableRecords, "xlsx", "riesgo_filtrado")} data-testid="export-xlsx">
                Datos filtrados (.xlsx) · {formatCount(data.tableRecords.length)} filas
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportRecords(data.tableRecords, "csv", "riesgo_filtrado")} data-testid="export-csv">
                Datos filtrados (.csv)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SourceInfo dataset={dataset} />
        {dataset.sheetNames.length > 1 ? (
          <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            Hoja
            <select
              value={dataset.sheetName}
              onChange={(e) => onSelectSheet(e.target.value)}
              className="h-8 rounded-md border border-input bg-card px-2 text-foreground"
            >
              {dataset.sheetNames.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </header>
  );
}
