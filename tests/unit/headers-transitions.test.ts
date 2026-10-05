import { describe, expect, it } from "vitest";
import { mapColumns, missingRequiredColumns, normalizeHeader } from "@/lib/excel/headers";
import {
  classifyTransition,
  parseStage,
  parseTransition,
  transitionExcelLabel,
  transitionLabel,
} from "@/lib/data/transitions";

describe("normalizeHeader", () => {
  it("es tolerante a espacios, mayúsculas, acentos y guiones", () => {
    expect(normalizeHeader("  Año ")).toBe("ano");
    expect(normalizeHeader("años_ttm")).toBe("anos_ttm");
    expect(normalizeHeader("AÑOS TTM")).toBe("anos_ttm");
    expect(normalizeHeader("N_Contratos")).toBe("n_contratos");
    expect(normalizeHeader("N contratos")).toBe("n_contratos");
    expect(normalizeHeader("Stage-Después")).toBe("stage_despues");
    expect(normalizeHeader("Provisión")).toBe("provision");
    expect(normalizeHeader("Fecha Tablón")).toBe("fecha_tablon");
  });
});

describe("mapColumns", () => {
  it("resuelve encabezados reales y detecta duplicados y desconocidos", () => {
    const m = mapColumns([" N_contratos", "fechatablon", "AÑO", "Mes", "Cartera", "stage", "Transiciones", "EAD", "Provisión", "EAD", "Extra"]);
    expect(m.indexes.nContratos).toBe(0);
    expect(m.indexes.anio).toBe(2);
    expect(m.indexes.provision).toBe(8);
    expect(m.indexes.ead).toBe(7);
    expect(m.duplicates).toEqual([{ header: "EAD", column: 9, keptColumn: 7 }]);
    expect(m.unrecognized).toEqual(["Extra"]);
    expect(missingRequiredColumns(m)).toEqual([]);
  });
  it("informa de columnas obligatorias ausentes", () => {
    const m = mapColumns(["Cartera", "stage"]);
    const missing = missingRequiredColumns(m);
    expect(missing).toContain("EAD");
    expect(missing).toContain("N_contratos");
    expect(missing).toContain("fechatablon (o Año + Mes)");
  });
});

describe("transiciones", () => {
  it("parsea stages", () => {
    expect(parseStage(1)).toBe(1);
    expect(parseStage("3")).toBe(3);
    expect(parseStage("Stage 2")).toBe(2);
    expect(parseStage("S1")).toBe(1);
    expect(parseStage(4)).toBeNull();
    expect(parseStage(null)).toBeNull();
  });
  it("normaliza variantes de texto", () => {
    expect(parseTransition("1-2")).toEqual({ from: 1, to: 2 });
    expect(parseTransition(" 1 – 2 ")).toEqual({ from: 1, to: 2 });
    expect(parseTransition("S3-S1")).toEqual({ from: 3, to: 1 });
    expect(parseTransition("1-Salida Cartera")).toEqual({ from: 1, to: "S" });
    expect(parseTransition("2 - SALIDA DE CARTERA")).toEqual({ from: 2, to: "S" });
    expect(parseTransition("3-salida_cartera")).toEqual({ from: 3, to: "S" });
    expect(parseTransition("1-0")).toBeNull();
    expect(parseTransition("foo")).toBeNull();
  });
  it("clasifica transiciones", () => {
    expect(classifyTransition(1, 1)).toBe("permanencia");
    expect(classifyTransition(2, 2)).toBe("permanencia");
    expect(classifyTransition(1, 2)).toBe("deterioro");
    expect(classifyTransition(1, 3)).toBe("deterioro");
    expect(classifyTransition(2, 3)).toBe("deterioro");
    expect(classifyTransition(2, 1)).toBe("cura");
    expect(classifyTransition(3, 1)).toBe("cura");
    expect(classifyTransition(3, 2)).toBe("cura");
  });
  it("conserva Salida Cartera como nodo propio (no Stage 0)", () => {
    expect(classifyTransition(1, "S")).toBe("salida");
    expect(classifyTransition(3, "S")).toBe("salida");
    expect(transitionLabel("2-S")).toBe("Stage 2 → Salida Cartera");
    expect(transitionExcelLabel("2-S")).toBe("2-Salida Cartera");
  });
});
