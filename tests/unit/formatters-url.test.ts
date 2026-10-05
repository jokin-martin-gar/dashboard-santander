import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatEurCompact,
  formatEurFull,
  formatPercent,
  formatPp,
  withSign,
} from "@/lib/formatters/number";
import { filtersToSearchParams, searchParamsToFilters } from "@/lib/data/url-filters";
import { EMPTY_FILTERS } from "@/types/filters";
import { addMonths, periodLabel } from "@/lib/data/periods";

describe("formateo español", () => {
  it("abrevia importes", () => {
    expect(formatEurCompact(282262344512.35)).toBe("282 MM€");
    expect(formatEurCompact(10330000000)).toBe("10,3 MM€");
    expect(formatEurCompact(2685300000)).toBe("2,69 MM€");
    expect(formatEurCompact(81075970)).toBe("81,1 M€");
    expect(formatEurCompact(2135.08)).toBe("2,14 k€");
    expect(formatEurCompact(950)).toBe("950 €");
  });
  it("valor completo y porcentajes", () => {
    expect(formatEurFull(1234567.891)).toBe("1.234.567,89 €");
    expect(formatPercent(0.009513)).toBe("0,95 %");
    expect(formatPp(0.0012)).toBe("+0,12 p.p.");
    expect(formatCount(6561155)).toBe("6.561.155");
    expect(formatCount(1234)).toBe("1.234");
  });
  it("nunca muestra NaN ni Infinity", () => {
    expect(formatEurCompact(null)).toBe("N/D");
    expect(formatPercent(NaN)).toBe("N/D");
    expect(formatCount(Infinity)).toBe("N/D");
    expect(withSign("N/D", null)).toBe("N/D");
    expect(withSign("1,2 M€", -1)).toBe("−1,2 M€");
  });
});

describe("períodos", () => {
  it("etiquetas y aritmética de meses", () => {
    expect(periodLabel("2026-06")).toBe("jun 2026");
    expect(addMonths("2025-12", 1)).toBe("2026-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});

describe("filtros en la URL", () => {
  it("ida y vuelta", () => {
    const f = {
      ...EMPTY_FILTERS,
      periodFrom: "2025-01",
      periodTo: "2025-06",
      carteras: ["01. Carterizadas", "15. Corporates"],
      origen: [1 as const],
      destino: ["S" as const, 2 as const],
      clases: ["deterioro" as const],
      transiciones: ["1-2" as const],
    };
    const back = searchParamsToFilters(filtersToSearchParams(f), null);
    expect(back).toEqual(f);
  });
  it("descarta valores inválidos", () => {
    const p = new URLSearchParams("origen=1~7&tipo=foo~cura&trans=1-9~2-S&desde=xx");
    const f = searchParamsToFilters(p, null);
    expect(f.origen).toEqual([1]);
    expect(f.clases).toEqual(["cura"]);
    expect(f.transiciones).toEqual(["2-S"]);
    expect(f.periodFrom).toBeNull();
  });
});
