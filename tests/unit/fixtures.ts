/**
 * Datos sintéticos AISLADOS para tests unitarios. No se usan en la aplicación.
 */
import type { RiskRecord, Stage, Destination } from "@/types/data";
import { classifyTransition, transitionKey } from "@/lib/data/transitions";

let nextId = 0;

export function rec(partial: Partial<RiskRecord> & { stage: Stage; destination: Destination; period?: string }): RiskRecord {
  const { stage, destination } = partial;
  const id = nextId++;
  return {
    id,
    rawIndex: id,
    excelRow: id + 2,
    period: partial.period ?? "2026-01",
    fechaTablon: partial.fechaTablon ?? "2026-01-31",
    transitionPeriod: partial.transitionPeriod ?? "2026-02",
    cartera: partial.cartera ?? "A",
    titulizado: partial.titulizado ?? "N",
    flagIndividualizado: partial.flagIndividualizado ?? "N",
    stage,
    stageDespues: destination === "S" ? null : destination,
    destination,
    transition: transitionKey(stage, destination),
    transitionClass: classifyTransition(stage, destination),
    transitionObservable: partial.transitionObservable ?? true,
    nContratos: partial.nContratos === undefined ? 1 : partial.nContratos,
    ead: partial.ead === undefined ? 100 : partial.ead,
    provision: partial.provision === undefined ? 1 : partial.provision,
    tiempoEnCartera: partial.tiempoEnCartera ?? null,
    tiempoAVencimiento: partial.tiempoAVencimiento ?? null,
    aniosTtm: partial.aniosTtm ?? null,
    eadS1: null,
    eadS2: null,
    eadS3: null,
    warnings: [],
  };
}
