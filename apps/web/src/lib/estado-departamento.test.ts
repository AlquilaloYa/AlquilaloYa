import { describe, expect, it } from "vitest";
import { clasificarSinOcupante, normalizarEstadoManual } from "./estado-departamento";

const HOY = "2026-10-05";

describe("normalizarEstadoManual", () => {
  it("deja pasar los estados conocidos", () => {
    expect(normalizarEstadoManual("MANTENIMIENTO")).toBe("MANTENIMIENTO");
    expect(normalizarEstadoManual("BLOQUEADO")).toBe("BLOQUEADO");
    expect(normalizarEstadoManual("DISPONIBLE")).toBe("DISPONIBLE");
  });

  it("degrada a modo automatico lo desconocido o vacio", () => {
    expect(normalizarEstadoManual(null)).toBeNull();
    expect(normalizarEstadoManual(undefined)).toBeNull();
    expect(normalizarEstadoManual("")).toBeNull();
    expect(normalizarEstadoManual("LIBRE")).toBeNull();
  });
});

describe("clasificarSinOcupante", () => {
  it("respeta el mantenimiento manual", () => {
    expect(
      clasificarSinOcupante({ estadoManual: "MANTENIMIENTO", ultimoFin: null, hoy: HOY })
    ).toEqual({ enMantenimiento: true, bloqueado: false });
  });

  it("respeta el bloqueo manual", () => {
    expect(clasificarSinOcupante({ estadoManual: "BLOQUEADO", ultimoFin: null, hoy: HOY })).toEqual({
      enMantenimiento: false,
      bloqueado: true,
    });
  });

  it("mantiene en mantenimiento automatico cuando no hay estado manual y el contrato vencio", () => {
    expect(clasificarSinOcupante({ estadoManual: null, ultimoFin: "2026-09-30", hoy: HOY })).toEqual({
      enMantenimiento: true,
      bloqueado: false,
    });
  });

  it("deja disponible una unidad sin contrato previo en modo automatico", () => {
    expect(clasificarSinOcupante({ estadoManual: null, ultimoFin: null, hoy: HOY })).toEqual({
      enMantenimiento: false,
      bloqueado: false,
    });
  });

  it("deja disponible una unidad cuyo contrato sigue vigente en modo automatico", () => {
    expect(clasificarSinOcupante({ estadoManual: null, ultimoFin: "2026-12-31", hoy: HOY })).toEqual({
      enMantenimiento: false,
      bloqueado: false,
    });
  });

  it("DISPONIBLE gana al mantenimiento automatico por contrato vencido", () => {
    expect(
      clasificarSinOcupante({ estadoManual: "DISPONIBLE", ultimoFin: "2026-09-30", hoy: HOY })
    ).toEqual({ enMantenimiento: false, bloqueado: false });
  });

  it("no manda mantenimiento automatico un dia antes del vencimiento", () => {
    expect(clasificarSinOcupante({ estadoManual: null, ultimoFin: "2026-10-06", hoy: HOY })).toEqual({
      enMantenimiento: false,
      bloqueado: false,
    });
  });
});
