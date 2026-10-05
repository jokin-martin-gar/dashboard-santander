"use client";

import { useState } from "react";
import type { Stage, TransitionKey } from "@/types/data";
import { useDataset } from "@/hooks/use-dataset";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { hasTransitionFilters } from "@/lib/calculations/filters";
import { addMonths, periodLabel } from "@/lib/data/periods";
import { Segmented } from "@/components/charts/segmented";
import { SankeyChart, TransitionLegend, type FlowMetric } from "@/components/charts/sankey-chart";
import { MATRIX_METRICS, TransitionMatrix, type MatrixMetric } from "@/components/charts/transition-matrix";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { StageDistribution } from "@/components/charts/stage-distribution";
import { FilterBar } from "@/components/filters/filter-bar";
import { DetailTable } from "@/components/tables/detail-table";
import { Button } from "@/components/ui/button";
import { DashboardContext, type DashboardContextValue } from "./dashboard-context";
import { DashboardHeader } from "./header";
import { KpiCards } from "./kpi-cards";
import { SectionCard } from "./section-card";
import { PortfolioQualityBlock } from "./portfolio-quality";
import { AgeingAnalysis } from "./ageing-analysis";
import { QualityPanel } from "./quality-panel";
import { UploadDialog } from "./upload-dialog";
import { ErrorState, LoadingState, Notice } from "./states";

const NAV = [
  { href: "#resumen", label: "Resumen" },
  { href: "#transiciones", label: "Transiciones" },
  { href: "#evolucion", label: "Evolución" },
  { href: "#antiguedad", label: "Antigüedad" },
  { href: "#detalle", label: "Detalle" },
];

export function Dashboard() {
  const ds = useDataset();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      {ds.dataset ? (
        <DashboardBody
          ds={ds}
          onUpload={() => setUploadOpen(true)}
          onQuality={() => setQualityOpen(true)}
          qualityOpen={qualityOpen}
          setQualityOpen={setQualityOpen}
        />
      ) : ds.status === "error" && ds.error ? (
        <>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Dashboard de Riesgo y Transiciones</h1>
          <ErrorState error={ds.error} onUpload={() => setUploadOpen(true)} onRetry={() => void ds.loadDefault()} />
        </>
      ) : (
        <>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Dashboard de Riesgo y Transiciones</h1>
          <LoadingState status={ds.status} />
        </>
      )}
      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        loadFile={ds.loadFile}
        onRestoreDefault={() => void ds.loadDefault()}
      />
    </div>
  );
}

function DashboardBody({
  ds,
  onUpload,
  onQuality,
  qualityOpen,
  setQualityOpen,
}: {
  ds: ReturnType<typeof useDataset>;
  onUpload: () => void;
  onQuality: () => void;
  qualityOpen: boolean;
  setQualityOpen: (o: boolean) => void;
}) {
  const dataset = ds.dataset!;
  const { filters, setFilters, toggleValue, reset } = useUrlFilters(dataset);
  const data = useDashboardData(dataset, filters);
  const [flowMetric, setFlowMetric] = useState<FlowMetric>("ead");
  const [showPermanence, setShowPermanence] = useState(true);
  const [matrixMetric, setMatrixMetric] = useState<MatrixMetric>("ead");

  if (!data) return null;
  const ctx: DashboardContextValue = { dataset, data, filters, setFilters, toggleValue, resetFilters: reset };
  const p = data.periods;
  const tp = p.transitionPeriod;
  const transitionWindow = tp ? `${periodLabel(tp)} → ${periodLabel(addMonths(tp, 1) ?? tp)}` : null;
  const stockNotObservable = tp !== p.stockPeriod;
  const noResults = data.filteredCount === 0;
  const toggleTransition = (k: TransitionKey) => toggleValue("transiciones", k);
  const anomalies = dataset.quality.contractAnomalies.map((a) => a.period);

  return (
    <DashboardContext.Provider value={ctx}>
      <DashboardHeader
        onUpload={onUpload}
        onReload={() => void ds.loadDefault()}
        onQuality={onQuality}
        onSelectSheet={(s) => void ds.selectSheet(s)}
        busy={ds.status === "downloading" || ds.status === "parsing"}
      />
      <nav aria-label="Secciones" className="-mx-1 hidden gap-1 overflow-x-auto md:flex">
        {NAV.map((n) => (
          <a key={n.href} href={n.href} className="rounded-md px-2.5 py-1 text-[13px] text-muted-foreground hover:bg-secondary hover:text-foreground">
            {n.label}
          </a>
        ))}
      </nav>

      <div className="sticky top-0 z-20 -mx-4 border-b border-border/70 bg-background/95 px-4 py-2.5 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <FilterBar />
      </div>

      {ds.error && ds.status === "ready" ? (
        <Notice testId="load-warning">
          {ds.error.title}: {ds.error.message}
        </Notice>
      ) : null}

      {noResults ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-[13.5px]" role="status" data-testid="no-results">
          <span>Ningún registro cumple la combinación de filtros seleccionada.</span>
          <Button variant="outline" onClick={reset}>
            Restablecer filtros
          </Button>
        </div>
      ) : null}

      {stockNotObservable && tp ? (
        <Notice testId="transition-notice">
          Las transiciones de {periodLabel(p.stockPeriod)} todavía no son observables (el fichero no contiene el mes
          siguiente). Sankey, matriz, calidad de cartera y EAD deteriorado usan <strong>{transitionWindow}</strong>
          {hasTransitionFilters(filters) ? "; con filtros de transición activos, los KPI también se refieren a ese mes" : ""}.
        </Notice>
      ) : null}

      <section id="resumen" aria-label="Indicadores principales" className="scroll-mt-28">
        <KpiCards />
      </section>

      <div id="transiciones" className="grid scroll-mt-28 grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Transiciones entre stages"
          subtitle={transitionWindow ? `${transitionWindow} · grosor según ${flowMetric === "ead" ? "EAD de origen" : "nº de contratos"} · clic en un flujo para filtrar` : "Sin transiciones observables"}
          description="Diagrama Sankey: a la izquierda el stage de origen, a la derecha el stage del mes siguiente o la salida de cartera."
          testId="section-sankey"
          actions={
            <>
              <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <input type="checkbox" checked={showPermanence} onChange={(e) => setShowPermanence(e.target.checked)} className="accent-[#33415c]" data-testid="toggle-permanence" />
                Permanencias
              </label>
              <Segmented
                label="Métrica del Sankey"
                value={flowMetric}
                onChange={setFlowMetric}
                options={[
                  { value: "ead", label: "EAD" },
                  { value: "nContratos", label: "Contratos" },
                ]}
              />
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <SankeyChart
              summary={data.transitions}
              metric={flowMetric}
              showPermanence={showPermanence}
              selected={filters.transiciones}
              onToggle={toggleTransition}
            />
            <TransitionLegend />
          </div>
        </SectionCard>

        <SectionCard
          title="Distribución por stage"
          subtitle={p.kpiPeriod ? `${periodLabel(p.kpiPeriod)} · clic para filtrar por stage de origen` : undefined}
          testId="section-distribution"
        >
          <StageDistribution
            slices={data.distribution.slices}
            total={data.distribution.total}
            selected={filters.origen}
            onToggle={(s: Stage) => toggleValue("origen", s)}
          />
        </SectionCard>

        <SectionCard
          className="xl:col-span-2"
          title="Matriz de transiciones"
          subtitle={`${transitionWindow ?? ""} · intensidad = peso sobre el total de la fila${matrixMetric === "coverage" ? " (coverage: sobre el máximo)" : ""}`}
          testId="section-matrix"
          actions={<Segmented label="Métrica de la matriz" value={matrixMetric} onChange={setMatrixMetric} options={MATRIX_METRICS} />}
        >
          <TransitionMatrix summary={data.transitions} metric={matrixMetric} selected={filters.transiciones} onToggle={toggleTransition} />
        </SectionCard>

        <SectionCard title="Calidad de la cartera" subtitle={transitionWindow ?? undefined} testId="section-quality">
          <PortfolioQualityBlock quality={data.quality} rates={data.rates} />
        </SectionCard>
      </div>

      <SectionCard
        id="evolucion"
        className="scroll-mt-28"
        title="Evolución mensual"
        subtitle={
          data.singleMonth
            ? `Histórico hasta ${periodLabel(p.to)} · mes de referencia marcado`
            : `${periodLabel(p.from)} – ${periodLabel(p.to)} · un punto por snapshot mensual`
        }
        description="Serie temporal mensual de la métrica seleccionada; los meses sin datos se muestran como huecos."
        testId="section-timeseries"
      >
        <TimeSeriesChart
          byPeriod={data.byPeriod}
          periods={data.chartPeriods}
          referencePeriod={p.kpiPeriod}
          highlightReference={data.singleMonth}
          anomalies={anomalies}
        />
      </SectionCard>

      <SectionCard
        id="antiguedad"
        className="scroll-mt-28"
        title="Antigüedad y vencimiento"
        subtitle={p.kpiPeriod ? `${periodLabel(p.kpiPeriod)} · distribución del EAD por rangos` : undefined}
        testId="section-ageing"
      >
        <AgeingAnalysis records={data.kpiRecords} allRecords={dataset.records} />
      </SectionCard>

      <SectionCard
        id="detalle"
        className="scroll-mt-28"
        title="Detalle de registros"
        subtitle={`${data.tableRecords.length.toLocaleString("es-ES")} filas agregadas del Excel en el período y filtros seleccionados`}
        testId="section-table"
      >
        <DetailTable records={data.tableRecords} />
      </SectionCard>

      <footer className="pt-2 pb-6 text-[12px] leading-relaxed text-subtle">
        Importes en euros. EAD, provisión y contratos son stocks mensuales: con un rango de fechas los indicadores
        muestran el último mes, nunca la suma de meses. Coverage = Σ provisión / Σ EAD (filas con EAD informado).
        Reglas completas en docs/data-audit.md.
      </footer>

      <QualityPanel dataset={dataset} open={qualityOpen} onOpenChange={setQualityOpen} />
    </DashboardContext.Provider>
  );
}
