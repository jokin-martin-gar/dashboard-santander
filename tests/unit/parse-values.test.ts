import { describe, expect, it } from "vitest";
import {
  detectNumberLocale,
  excelSerialToIso,
  inferColumnLocale,
  isNullLike,
  parseCategory,
  parseExcelDate,
  parseFlag,
  parseNumber,
  parsePercent,
} from "@/lib/excel/parse-values";

describe("parseNumber – formato español", () => {
  it("convierte miles con punto y decimales con coma", () => {
    expect(parseNumber("40.852.201.826,68")).toBeCloseTo(40852201826.68, 2);
    expect(parseNumber("1.234,5")).toBe(1234.5);
    expect(parseNumber("0,5")).toBe(0.5);
    expect(parseNumber(" 2.130 €")).toBe(2.13); // ambiguo sin pista → decimal
    expect(parseNumber("2.130", { locale: "es" })).toBe(2130);
    expect(parseNumber("-1.234,56")).toBe(-1234.56);
    expect(parseNumber("(1.234,56)")).toBe(-1234.56);
  });
});

describe("parseNumber – formato internacional", () => {
  it("convierte números con punto decimal y comas de miles", () => {
    expect(parseNumber("40852201826.68")).toBeCloseTo(40852201826.68, 2);
    expect(parseNumber("40,852,201,826.68")).toBeCloseTo(40852201826.68, 2);
    expect(parseNumber(" 163,974 ", { locale: "en" })).toBe(163974);
    expect(parseNumber("1e3")).toBe(1000);
  });
  it("respeta números nativos y rechaza no finitos", () => {
    expect(parseNumber(12.5)).toBe(12.5);
    expect(parseNumber(Infinity)).toBeNull();
    expect(parseNumber(NaN)).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("1.2.3,4,5")).toBeNull();
  });
  it("interpreta porcentajes en texto", () => {
    expect(parseNumber("12,5 %")).toBeCloseTo(0.125);
    expect(parsePercent("0.95%")).toBeCloseTo(0.0095);
    expect(parsePercent(0.25)).toBe(0.25);
    expect(parsePercent("25")).toBe(0.25);
  });
});

describe("detección de convención numérica", () => {
  it("detecta casos inequívocos", () => {
    expect(detectNumberLocale("1.234,56")).toBe("es");
    expect(detectNumberLocale("1,234.56")).toBe("en");
    expect(detectNumberLocale("1.234.567")).toBe("es");
    expect(detectNumberLocale("1,234")).toBeNull();
  });
  it("infiere la convención de una columna", () => {
    expect(inferColumnLocale(["1.234,5", "2.000", "3"])).toBe("es");
    expect(inferColumnLocale(["1,234.5", "2,000"])).toBe("en");
    expect(inferColumnLocale([1, 2, 3])).toBeNull();
  });
});

describe("valores nulos", () => {
  it.each(["", "  ", "-", "–", "—", "null", "NULL", "N/A", "n/a", "#N/A", "n.d.", null, undefined, NaN])(
    "%s es nulo",
    (v) => {
      expect(isNullLike(v)).toBe(true);
      expect(parseNumber(v)).toBeNull();
    },
  );
  it("0 no es nulo", () => {
    expect(isNullLike(0)).toBe(false);
    expect(parseNumber(0)).toBe(0);
    expect(parseNumber("0")).toBe(0);
  });
});

describe("fechas de Excel", () => {
  it("convierte números de serie", () => {
    expect(excelSerialToIso(44957)).toBe("2023-01-31");
    expect(excelSerialToIso(46203)).toBe("2026-06-30");
    expect(excelSerialToIso(1)).toBe("1900-01-01");
    expect(excelSerialToIso(61)).toBe("1900-03-01");
    expect(excelSerialToIso(60)).toBeNull(); // 29/02/1900 inexistente
    expect(excelSerialToIso(44957.75)).toBe("2023-01-31");
  });
  it("convierte textos y objetos Date", () => {
    expect(parseExcelDate("2026-06-30")).toBe("2026-06-30");
    expect(parseExcelDate("30/06/2026")).toBe("2026-06-30");
    expect(parseExcelDate("01-02-2025")).toBe("2025-02-01");
    expect(parseExcelDate("44957")).toBe("2023-01-31");
    expect(parseExcelDate(new Date(2025, 0, 15))).toBe("2025-01-15");
    expect(parseExcelDate("31/02/2025")).toBeNull();
    expect(parseExcelDate("-")).toBeNull();
  });
});

describe("categorías y flags", () => {
  it("normaliza espacios", () => {
    expect(parseCategory("  01.   Carterizadas ")).toBe("01. Carterizadas");
    expect(parseCategory("-")).toBeNull();
  });
  it("normaliza flags S/N", () => {
    expect(parseFlag("s")).toBe("S");
    expect(parseFlag("Sí")).toBe("S");
    expect(parseFlag("no")).toBe("N");
    expect(parseFlag("VE")).toBe("VE");
  });
});
