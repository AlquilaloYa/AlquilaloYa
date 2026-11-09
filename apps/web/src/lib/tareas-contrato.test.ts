import { describe, expect, it } from "vitest";
import { calcularFechaCheckOut } from "./tareas-contrato";

describe("calcularFechaCheckOut", () => {
  it("adds registered extra days to the end of the current contract period", () => {
    expect(
      calcularFechaCheckOut("2026-11-30", [
        { fechaFinPeriodo: "2026-11-30", dias: 3 },
      ]),
    ).toEqual({ fecha: "2026-12-03", diasExtras: 3 });
  });

  it("does not apply extra days registered for a previous period after an addendum", () => {
    expect(
      calcularFechaCheckOut("2026-12-31", [
        { fechaFinPeriodo: "2026-11-30", dias: 3 },
      ]),
    ).toEqual({ fecha: "2026-12-31", diasExtras: 0 });
  });

  it("combines extra-day charges attached to the same period", () => {
    expect(
      calcularFechaCheckOut("2026-11-30", [
        { fechaFinPeriodo: new Date("2026-11-30T00:00:00.000Z"), dias: 2 },
        { fechaFinPeriodo: "2026-11-30", dias: 4 },
      ]),
    ).toEqual({ fecha: "2026-12-06", diasExtras: 6 });
  });
});
