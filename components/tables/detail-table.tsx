"use client";

import { useMemo, useState } from "react";
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, Download, Search } from "lucide-react";
import type { RiskRecord } from "@/types/data";
import { TRANSITION_CLASS_LABEL, transitionExcelLabel } from "@/lib/data/transitions";
import { periodLabel, formatIsoDate } from "@/lib/data/periods";
import { safeDivide } from "@/lib/calculations/metrics";
import { formatCount, formatEurFull, formatNumber, formatPercent } from "@/lib/formatters/number";
import { exportRecords } from "@/lib/export/export-data";
import { CLASS_COLORS, STAGE_COLORS, destinationColor } from "@/lib/theme/colors";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { RowDetailDialog } from "./row-detail-dialog";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  columnVisibilityFeature,
});

const helper = createColumnHelper<typeof features, RiskRecord>();
const u = <T,>(v: T | null): T | undefined => (v === null ? undefined : v);
const coverageOf = (r: RiskRecord) => (r.ead === null ? null : safeDivide(r.provision, r.ead));

const TEXT_COLUMNS = new Set(["period", "cartera", "titulizado", "flag", "transicion"]);

const columns = helper.columns([
  helper.accessor((r) => `${r.period} ${r.fechaTablon ?? ""}`, {
    id: "period",
    header: "Fecha",
    sortFn: "alphanumeric",
    cell: (info) => (
      <div className="leading-tight">
        <div className="font-medium">{periodLabel(info.row.original.period)}</div>
        <div className="text-[11.5px] text-subtle tabular">{formatIsoDate(info.row.original.fechaTablon)}</div>
      </div>
    ),
  }),
  helper.accessor((r) => r.cartera, { id: "cartera", header: "Cartera", sortFn: "alphanumeric" }),
  helper.accessor((r) => r.titulizado, { id: "titulizado", header: "Titulizado", sortFn: "alphanumeric" }),
  helper.accessor((r) => r.flagIndividualizado, { id: "flag", header: "Individualizado", sortFn: "alphanumeric" }),
  helper.accessor((r) => r.stage, {
    id: "stage",
    header: "Stage",
    sortFn: "basic",
    cell: (info) => (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block size-2 rounded-sm" style={{ background: STAGE_COLORS[info.row.original.stage] }} aria-hidden />
        {info.row.original.stage}
      </span>
    ),
  }),
  helper.accessor((r) => u(r.stageDespues), {
    id: "stageDespues",
    header: "Stage después",
    sortFn: "basic",
    sortUndefined: "last",
    cell: (info) =>
      info.row.original.stageDespues === null ? (
        <span className="text-subtle">— (salida)</span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-sm" style={{ background: destinationColor(info.row.original.destination) }} aria-hidden />
          {info.row.original.stageDespues}
        </span>
      ),
  }),
  helper.accessor((r) => transitionExcelLabel(r.transition), {
    id: "transicion",
    header: "Transición",
    sortFn: "alphanumeric",
    cell: (info) => {
      const r = info.row.original;
      return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="inline-block size-2 rounded-full" style={{ background: CLASS_COLORS[r.transitionClass] }} aria-hidden />
          {transitionExcelLabel(r.transition)}
          <span className="text-[11px] text-subtle">{TRANSITION_CLASS_LABEL[r.transitionClass]}</span>
        </span>
      );
    },
  }),
  helper.accessor((r) => u(r.nContratos), {
    id: "nContratos",
    header: "N_contratos",
    sortFn: "basic",
    sortUndefined: "last",
    meta: { numeric: true },
    cell: (info) => formatCount(info.row.original.nContratos),
  }),
  helper.accessor((r) => u(r.ead), {
    id: "ead",
    header: "EAD (€)",
    sortFn: "basic",
    sortUndefined: "last",
    meta: { numeric: true },
    cell: (info) =>
      info.row.original.ead === null ? <span className="text-subtle">N/D</span> : formatEurFull(info.row.original.ead).replace(" €", ""),
  }),
  helper.accessor((r) => u(r.provision), {
    id: "provision",
    header: "Provisión (€)",
    sortFn: "basic",
    sortUndefined: "last",
    meta: { numeric: true },
    cell: (info) => formatEurFull(info.row.original.provision).replace(" €", ""),
  }),
  helper.accessor((r) => u(coverageOf(r)), {
    id: "coverage",
    header: "Coverage",
    sortFn: "basic",
    sortUndefined: "last",
    meta: { numeric: true },
    cell: (info) => formatPercent(coverageOf(info.row.original)),
  }),
  helper.accessor((r) => u(r.tiempoEnCartera), {
    id: "tiempoEnCartera",
    header: "T. en cartera (días)",
    sortFn: "basic",
    sortUndefined: "last",
    meta: { numeric: true },
    cell: (info) => formatNumber(info.row.original.tiempoEnCartera, 1),
  }),
  helper.accessor((r) => u(r.tiempoAVencimiento), {
    id: "tiempoAVencimiento",
    header: "T. a vencimiento (días)",
    sortFn: "basic",
    sortUndefined: "last",
    meta: { numeric: true },
    cell: (info) => formatNumber(info.row.original.tiempoAVencimiento, 1),
  }),
  helper.accessor((r) => u(r.aniosTtm), {
    id: "aniosTtm",
    header: "Años TTM",
    sortFn: "basic",
    sortUndefined: "last",
    meta: { numeric: true },
    cell: (info) => formatNumber(info.row.original.aniosTtm, 2),
  }),
  helper.accessor((r) => r.warnings.length, {
    id: "warnings",
    header: "Avisos",
    sortFn: "basic",
    meta: { numeric: true },
    cell: (info) =>
      info.row.original.warnings.length ? (
        <span className="rounded bg-warning-bg px-1.5 py-0.5 text-[11.5px] font-medium text-warning-fg">
          {info.row.original.warnings.length}
        </span>
      ) : (
        <span className="text-subtle">—</span>
      ),
  }),
]);

const PAGE_SIZES = [25, 50, 100];

export function DetailTable({ records }: { records: RiskRecord[] }) {
  const [onlyWarnings, setOnlyWarnings] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "ead", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [detail, setDetail] = useState<RiskRecord | null>(null);

  const data = useMemo(() => (onlyWarnings ? records.filter((r) => r.warnings.length) : records), [records, onlyWarnings]);

  const table = useTable({
    features,
    columns,
    data,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    getColumnCanGlobalFilter: (column) => TEXT_COLUMNS.has(column.id),
    initialState: { pagination: { pageIndex: 0, pageSize: 25 } },
    getRowId: (r) => String(r.id),
  });

  const filteredRows = table.getPrePaginatedRowModel().rows;
  const pageRows = table.getRowModel().rows;
  const { pageIndex, pageSize } = table.state.pagination;
  const total = filteredRows.length;
  const from = total ? pageIndex * pageSize + 1 : 0;
  const to = Math.min(total, (pageIndex + 1) * pageSize);
  const doExport = (format: "xlsx" | "csv") =>
    exportRecords(
      filteredRows.map((r) => r.original),
      format,
      "detalle_filtrado",
    );

  return (
    <div className="flex flex-col gap-3" data-testid="detail-table">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Buscar cartera, transición, fecha…"
            aria-label="Buscar en la tabla"
            data-testid="table-search"
            className="h-9 w-full rounded-lg border border-input bg-card pr-3 pl-8 text-[13px] placeholder:text-subtle"
          />
        </div>
        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-2.5 text-[13px]">
          <input type="checkbox" checked={onlyWarnings} onChange={(e) => setOnlyWarnings(e.target.checked)} className="accent-[#33415c]" />
          Sólo filas con avisos
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Popover>
            <PopoverTrigger
              render={<Button variant="outline" className="h-9" />}
              aria-label="Configurar columnas"
              data-testid="columns-toggle"
            >
              <Columns3 aria-hidden /> Columnas
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 p-1">
              <ul className="max-h-80 overflow-y-auto">
                {table.getAllLeafColumns().map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-secondary">
                      <input
                        type="checkbox"
                        checked={c.getIsVisible()}
                        onChange={() => c.toggleVisibility()}
                        className="accent-[#33415c]"
                      />
                      {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}
                    </label>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" className="h-9" />} data-testid="table-export" disabled={!total}>
              <Download aria-hidden /> Exportar
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => doExport("xlsx")} data-testid="table-export-xlsx">
                Excel (.xlsx) · {formatCount(total)} filas
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("csv")} data-testid="table-export-csv">
                CSV (;) · {formatCount(total)} filas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto rounded-lg border border-border" tabIndex={0} aria-label="Tabla de detalle, desplazable">
        <table className="w-full min-w-[1280px] border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-[#f8f8f6]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const numeric = (h.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric;
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                      className={cn(
                        "border-b border-border px-3 py-2 font-medium whitespace-nowrap text-muted-foreground",
                        numeric ? "text-right" : "text-left",
                      )}
                    >
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        data-testid={`sort-${h.column.id}`}
                        className={cn("inline-flex items-center gap-1 hover:text-foreground", numeric && "flex-row-reverse")}
                      >
                        {typeof h.column.columnDef.header === "string" ? h.column.columnDef.header : h.column.id}
                        {sorted === "asc" ? (
                          <ArrowUp className="size-3.5" aria-hidden />
                        ) : sorted === "desc" ? (
                          <ArrowDown className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                key={row.id}
                onClick={() => setDetail(row.original)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setDetail(row.original);
                }}
                tabIndex={0}
                aria-label={`Fila Excel ${row.original.excelRow}: ver valores originales`}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-[#f8f9fb] focus-visible:bg-[#f3f7fc]"
              >
                {row.getVisibleCells().map((cell) => {
                  const numeric = (cell.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric;
                  return (
                    <td key={cell.id} className={cn("px-3 py-2 whitespace-nowrap", numeric && "text-right tabular")}>
                      <table.FlexRender cell={cell} />
                    </td>
                  );
                })}
              </tr>
            ))}
            {!pageRows.length ? (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className="px-3 py-10 text-center text-muted-foreground">
                  No hay filas que cumplan los filtros y la búsqueda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
        <span data-testid="table-range" className="tabular">
          {formatCount(from)}–{formatCount(to)} de {formatCount(total)} filas · clic en una fila para ver valores originales
        </span>
        <div className="flex items-center gap-1">
          <label className="mr-2 flex items-center gap-1.5">
            Filas
            <select
              value={pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="h-8 rounded-md border border-input bg-card px-1.5 text-foreground"
              aria-label="Filas por página"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <Button variant="ghost" size="icon-sm" onClick={() => table.firstPage()} disabled={!table.getCanPreviousPage()} aria-label="Primera página">
            <ChevronsLeft aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Página anterior" data-testid="page-prev">
            <ChevronLeft aria-hidden />
          </Button>
          <span className="px-1 tabular">
            {total ? pageIndex + 1 : 0} / {table.getPageCount()}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Página siguiente" data-testid="page-next">
            <ChevronRight aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => table.lastPage()} disabled={!table.getCanNextPage()} aria-label="Última página">
            <ChevronsRight aria-hidden />
          </Button>
        </div>
      </div>
      <RowDetailDialog record={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
