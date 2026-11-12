import { describe, expect, it } from "vitest";
import { getEstadoSeparacion, type SeparacionRecord } from "./separaciones";

function crearSeparacion(
  tipoSeparacion: SeparacionRecord["tipoSeparacion"],
  fechaLimiteManual: string,
  garantiaExtendida = false
): Omit<SeparacionRecord, "estado"> & { estado: string } {
  const fechaSeparacion = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return {
    departamentoId: "departamento-6c",
    contactoId: "contacto",
    montoSeparacion: tipoSeparacion === "TOTAL" ? 1000 : 500,
    tipoSeparacion,
    garantiaExtendida,
    fechaSeparacion,
    fechaLimiteManual,
    fechaLimite48h: fechaLimiteManual,
    fechaLimite120h: fechaLimiteManual,
    fechaLimite168h: fechaLimiteManual,
    baucherSeparacion: "comprobante",
    estado: "SEPARADO",
  };
}

describe("getEstadoSeparacion", () => {
  it("mantiene la separación activa mientras no venza el plazo", () => {
    const separacion = crearSeparacion(
      "500",
      new Date(Date.now() + 60 * 60 * 1000).toISOString()
    );

    expect(getEstadoSeparacion(separacion)).toBe("SEPARADO");
  });

  it("considera vencida una separación de 500 sin garantía extendida", () => {
    const separacion = crearSeparacion(
      "500",
      new Date(Date.now() - 60 * 60 * 1000).toISOString()
    );

    expect(getEstadoSeparacion(separacion)).toBe("PERDER_TODO");
  });

  it("considera inactiva una separación total después de vencer", () => {
    const separacion = crearSeparacion(
      "TOTAL",
      new Date(Date.now() - 60 * 60 * 1000).toISOString()
    );

    expect(getEstadoSeparacion(separacion)).toBe("INACTIVO_168H");
  });
});
