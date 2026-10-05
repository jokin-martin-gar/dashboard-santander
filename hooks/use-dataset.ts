"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dataset } from "@/types/data";
import { DatasetError, datasetFromWorkbook } from "@/lib/data/build-dataset";
import { ExcelReadError, isAcceptedExcelName, readWorkbook, type LoadedWorkbook, type SheetSummary } from "@/lib/excel/read-workbook";

export type LoadStatus = "idle" | "downloading" | "parsing" | "ready" | "error";

export interface LoadError {
  kind: "no_default_file" | "invalid_file" | "missing_columns" | "empty_sheet" | "no_valid_rows" | "unexpected";
  title: string;
  message: string;
  details: string[];
}

export interface DatasetState {
  status: LoadStatus;
  dataset: Dataset | null;
  sheets: SheetSummary[];
  error: LoadError | null;
}

const DEFAULT_URL = "/api/default-excel";

/** Cede el hilo para que la interfaz pinte el estado de progreso antes del trabajo pesado. */
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 30));

export function toLoadError(e: unknown): LoadError {
  if (e instanceof DatasetError) {
    const titles: Record<DatasetError["code"], string> = {
      missing_columns: "Faltan columnas necesarias",
      empty_sheet: "La hoja está vacía",
      no_valid_rows: "No hay filas válidas",
    };
    return { kind: e.code, title: titles[e.code], message: e.message, details: e.details };
  }
  if (e instanceof ExcelReadError) {
    const kind = e.code === "empty_sheet" || e.code === "empty_workbook" ? "empty_sheet" : "invalid_file";
    return {
      kind,
      title: kind === "empty_sheet" ? "La hoja está vacía" : "Archivo no válido",
      message: e.message,
      details: [],
    };
  }
  return {
    kind: "unexpected",
    title: "Error inesperado",
    message: "Se ha producido un error al procesar el archivo. Los datos anteriores se conservan.",
    details: [e instanceof Error ? e.message : String(e)],
  };
}

export interface LoadResult {
  ok: boolean;
  error?: LoadError;
  dataset?: Dataset;
}

/**
 * Gestiona el ciclo de vida del Excel. El binario sólo vive en memoria del navegador:
 * nunca se envía a ningún servicio externo.
 */
export function useDataset() {
  const [state, setState] = useState<DatasetState>({ status: "downloading", dataset: null, sheets: [], error: null });
  const workbookRef = useRef<{ wb: LoadedWorkbook; fileName: string; source: Dataset["source"] } | null>(null);

  const parseInto = useCallback(
    async (wb: LoadedWorkbook, sheetName: string, fileName: string, source: Dataset["source"]): Promise<LoadResult> => {
      setState((s) => ({ ...s, status: "parsing", sheets: wb.sheets }));
      await yieldToUi();
      try {
        const dataset = datasetFromWorkbook(wb, sheetName, { fileName, source });
        workbookRef.current = { wb, fileName, source };
        setState({ status: "ready", dataset, sheets: wb.sheets, error: null });
        return { ok: true, dataset };
      } catch (e) {
        const error = toLoadError(e);
        // Se conserva el dataset anterior (si existe) para no romper la aplicación.
        setState((s) => ({ ...s, status: s.dataset ? "ready" : "error", error: s.dataset ? s.error : error }));
        return { ok: false, error };
      }
    },
    [],
  );

  /** Procesa la respuesta de /api/default-excel (Excel de la carpeta data/). */
  const handleDefaultResponse = useCallback(async (res: Response): Promise<LoadResult> => {
    try {
      if (!res.ok) {
        const error: LoadError = {
          kind: "no_default_file",
          title: "No se ha encontrado el Excel predeterminado",
          message: "Coloque un archivo .xlsx en la carpeta data/ del proyecto o cargue uno manualmente.",
          details: [],
        };
        setState((s) => ({ ...s, status: s.dataset ? "ready" : "error", error }));
        return { ok: false, error };
      }
      const fileName = decodeURIComponent(res.headers.get("X-File-Name") ?? "BBDD.xlsx");
      const buf = await res.arrayBuffer();
      setState((s) => ({ ...s, status: "parsing" }));
      await yieldToUi();
      const wb = readWorkbook(buf);
      return await parseInto(wb, wb.bestSheet, fileName, "default");
    } catch (e) {
      const error = toLoadError(e);
      setState((s) => ({ ...s, status: s.dataset ? "ready" : "error", error }));
      return { ok: false, error };
    }
  }, [parseInto]);

  const fetchDefaultError = useCallback((e: unknown): LoadResult => {
    const error = toLoadError(e);
    setState((s) => ({ ...s, status: s.dataset ? "ready" : "error", error }));
    return { ok: false, error };
  }, []);

  const loadDefault = useCallback((): Promise<LoadResult> => {
    setState((s) => ({ ...s, status: "downloading", error: null }));
    return fetch(DEFAULT_URL, { cache: "no-store" }).then(handleDefaultResponse, fetchDefaultError);
  }, [handleDefaultResponse, fetchDefaultError]);

  /** Lee un archivo subido. Devuelve el libro para que el diálogo pueda ofrecer cambio de hoja. */
  const loadFile = useCallback(
    async (file: File, sheetName?: string): Promise<LoadResult & { sheets?: SheetSummary[]; selectedSheet?: string }> => {
      if (!isAcceptedExcelName(file.name)) {
        return {
          ok: false,
          error: {
            kind: "invalid_file",
            title: "Formato no admitido",
            message: `«${file.name}» no es un archivo Excel. Se admiten .xlsx y .xls.`,
            details: [],
          },
        };
      }
      try {
        const buf = await file.arrayBuffer();
        await yieldToUi();
        const wb = readWorkbook(buf);
        const sheet = sheetName && wb.workbook.SheetNames.includes(sheetName) ? sheetName : wb.bestSheet;
        // Si falla, el diálogo conserva el archivo y puede reintentar con otra hoja.
        const result = await parseInto(wb, sheet, file.name, "upload");
        return { ...result, sheets: wb.sheets, selectedSheet: sheet };
      } catch (e) {
        return { ok: false, error: toLoadError(e) };
      }
    },
    [parseInto],
  );

  /** Cambia de hoja dentro del libro cargado actualmente. */
  const selectSheet = useCallback(
    async (sheetName: string): Promise<LoadResult> => {
      const cur = workbookRef.current;
      if (!cur) return { ok: false, error: toLoadError(new Error("No hay libro cargado")) };
      return parseInto(cur.wb, sheetName, cur.fileName, cur.source);
    },
    [parseInto],
  );

  useEffect(() => {
    // Carga inicial del Excel predeterminado (el estado inicial ya es "downloading").
    fetch(DEFAULT_URL, { cache: "no-store" }).then(handleDefaultResponse, fetchDefaultError);
  }, [handleDefaultResponse, fetchDefaultError]);

  return { ...state, loadDefault, loadFile, selectSheet };
}
