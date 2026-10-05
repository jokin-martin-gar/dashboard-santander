import * as XLSX from "xlsx";
import type { RiskRecord } from "@/types/data";
import { TRANSITION_CLASS_LABEL, transitionExcelLabel } from "@/lib/data/transitions";
import { safeDivide } from "@/lib/calculations/metrics";

/** Fila exportable con los valores NORMALIZADOS (números reales, fechas ISO). */
export function toExportRow(r: RiskRecord) {
  return {
    Fila_Excel: r.excelRow,
    Periodo: r.period,
    fechatablon: r.fechaTablon,
    Cartera: r.cartera,
    titulizado: r.titulizado,
    flag_individualizado: r.flagIndividualizado,
    stage: r.stage,
    stage_despues: r.stageDespues,
    Transiciones: transitionExcelLabel(r.transition),
    Tipo_transicion: TRANSITION_CLASS_LABEL[r.transitionClass],
    Transicion_observable: r.transitionObservable ? "S" : "N",
    N_contratos: r.nContratos,
    EAD: r.ead,
    Provision: r.provision,
    Coverage_ratio: r.ead !== null ? safeDivide(r.provision, r.ead) : null,
    tiempo_en_cartera: r.tiempoEnCartera,
    tiempo_a_vencimiento: r.tiempoAVencimiento,
    años_ttm: r.aniosTtm,
    Advertencias: r.warnings.join(", "),
  };
}

export function buildExportSheet(records: readonly RiskRecord[]): XLSX.WorkSheet {
  return XLSX.utils.json_to_sheet(records.map(toExportRow));
}

/** CSV con separador ";" y coma decimal (compatible con Excel en configuración española). */
export function recordsToCsv(records: readonly RiskRecord[]): string {
  const rows = records.map(toExportRow);
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(";"), ...rows.map((r) => headers.map((h) => esc(r[h as keyof typeof r])).join(";"))].join(
    "\r\n",
  );
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportRecords(records: readonly RiskRecord[], format: "xlsx" | "csv", baseName: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    // BOM para que Excel detecte UTF-8 (acentos).
    download(new Blob(["﻿" + recordsToCsv(records)], { type: "text/csv;charset=utf-8" }), `${baseName}_${stamp}.csv`);
    return;
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildExportSheet(records), "Datos filtrados");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  download(
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${baseName}_${stamp}.xlsx`,
  );
}
