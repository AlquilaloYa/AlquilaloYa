import { describe, it, expect } from "vitest";
import { inicioDiaLima, esJornadaDeHoy, mesLima, rangoMesLima } from "./attendance-day";

const NOW = Date.parse("2026-10-12T14:06:52Z");

describe("inicioDiaLima", () => {
  it("devuelve las 00:00 de Lima (05:00 UTC) del día correspondiente", () => {
    expect(inicioDiaLima(NOW).toISOString()).toBe("2026-10-12T05:00:00.000Z");
  });

  it("antes de la medianoche de Lima, el día sigue siendo el anterior", () => {
    // 2026-10-12T04:30Z = 2026-10-11 23:30 en Lima
    expect(inicioDiaLima(Date.parse("2026-10-12T04:30:00Z")).toISOString()).toBe(
      "2026-10-11T05:00:00.000Z"
    );
  });
});

describe("esJornadaDeHoy", () => {
  it("acepta un registro de hoy", () => {
    expect(esJornadaDeHoy(new Date("2026-10-12T14:00:00Z"), NOW)).toBe(true);
  });

  describe("rangoMesLima", () => {
    it("uses the current month in Lima, including the UTC month boundary", () => {
      expect(mesLima(Date.parse("2026-11-01T04:30:00Z"))).toBe("2026-10");
      expect(mesLima(Date.parse("2026-11-01T05:00:00Z"))).toBe("2026-11");
    });

    it("returns UTC boundaries corresponding to midnight in Lima", () => {
      expect(rangoMesLima("2026-10")).toEqual({
        start: new Date("2026-10-01T05:00:00.000Z"),
        end: new Date("2026-11-01T05:00:00.000Z"),
      });
    });

    it("rejects malformed or out-of-range months", () => {
      expect(rangoMesLima("2026-13")).toBeNull();
      expect(rangoMesLima("October 2026")).toBeNull();
    });
  });

  it("acepta el límite exacto (00:00 Lima)", () => {
    expect(esJornadaDeHoy(new Date("2026-10-12T05:00:00Z"), NOW)).toBe(true);
  });

  it("rechaza un registro de minutos antes del inicio del día", () => {
    expect(esJornadaDeHoy(new Date("2026-10-12T04:59:59Z"), NOW)).toBe(false);
  });

  it("rechaza un registro de días anteriores", () => {
    expect(esJornadaDeHoy(new Date("2026-10-10T13:59:00Z"), NOW)).toBe(false);
  });

  it("considera 'hoy' la jornada iniciada la noche anterior (día Lima)", () => {
    const noche = Date.parse("2026-10-12T04:30:00Z"); // 2026-10-11 23:30 Lima
    expect(esJornadaDeHoy(new Date("2026-10-12T04:00:00Z"), noche)).toBe(true);
    expect(esJornadaDeHoy(new Date("2026-10-11T04:00:00Z"), noche)).toBe(false);
  });

  it("trata fechas nulas como fuera de la jornada", () => {
    expect(esJornadaDeHoy(null, NOW)).toBe(false);
    expect(esJornadaDeHoy(undefined, NOW)).toBe(false);
  });
});
