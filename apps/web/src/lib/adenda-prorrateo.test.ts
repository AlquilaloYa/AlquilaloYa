import { describe, expect, it } from "vitest";
import {
  addMonthsIso,
  calcularProrrateoUltimaCuota,
} from "./adenda-prorrateo";

describe("adenda daily proration", () => {
  it("uses the actual number of days in a 31-day month", () => {
    expect(
      calcularProrrateoUltimaCuota("2026-01-01", "2026-01-13", 900, 150)
    ).toEqual({
      dias: 12,
      desde: "2026-01-01",
      hasta: "2026-01-13",
      monto: 348.39,
      mantenimiento: 58.06,
    });
  });

  it("uses 28 days in February and handles a period crossing months", () => {
    expect(
      calcularProrrateoUltimaCuota("2026-02-01", "2026-02-13", 900, 150)?.monto
    ).toBe(385.71);
    expect(
      calcularProrrateoUltimaCuota("2028-02-01", "2028-02-13", 900, 150)?.monto
    ).toBe(372.41);
    expect(
      calcularProrrateoUltimaCuota("2026-01-30", "2026-02-03", 900, 150)?.monto
    ).toBe(122.35);
  });

  it("does not prorate a complete monthly period", () => {
    expect(
      calcularProrrateoUltimaCuota("2026-11-01", "2026-12-01", 900, 150)
    ).toBeNull();
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsIso("2028-01-31", 1)).toBe("2028-02-29");
    expect(
      calcularProrrateoUltimaCuota("2026-01-31", "2026-02-28", 900, 150)
    ).toBeNull();
  });

  it("does not count the checkout date as an occupied day", () => {
    expect(
      calcularProrrateoUltimaCuota("2026-02-27", "2026-03-01", 900, 150)
        ?.dias
    ).toBe(2);
  });
});
