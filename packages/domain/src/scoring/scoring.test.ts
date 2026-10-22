import { describe, expect, it } from "vitest";
import { bandForScore, computeTenantScore } from "./scoring";

describe("computeTenantScore", () => {
  it("da el puntaje máximo a un inquilino sin atrasos ni incidencias", () => {
    const result = computeTenantScore({ pagos: [], incidencias: [] });
    expect(result.score).toBe(100);
    expect(result.band.band).toBe("EXCELENTE");
  });

  it("penaliza 1 punto por cada día de atraso en cuota pagada", () => {
    const result = computeTenantScore({
      pagos: [{ diasAtrasoPagado: 4, diasVencidoPendiente: 0 }],
      incidencias: [],
    });
    expect(result.score).toBe(96);
    expect(result.breakdown.penalizacionTardanza).toBe(4);
    expect(result.breakdown.cuotasPagadasConAtraso).toBe(1);
  });

  it("penaliza 1 punto por cada día en cuotas vencidas sin pagar", () => {
    const result = computeTenantScore({
      pagos: [{ diasAtrasoPagado: 0, diasVencidoPendiente: 40 }],
      incidencias: [],
    });
    expect(result.score).toBe(60);
    expect(result.breakdown.penalizacionTardanza).toBe(40);
    expect(result.breakdown.cuotasVencidasPendientes).toBe(1);
    expect(result.breakdown.diasVencidoMaximo).toBe(40);
  });

  it("reduce el puntaje por reportes según severidad (leve -4, media -9, grave -20)", () => {
    const leve = computeTenantScore({
      pagos: [],
      incidencias: [{ tipo: "CONVIVENCIA", severidad: "LEVE" }],
    });
    const media = computeTenantScore({
      pagos: [],
      incidencias: [{ tipo: "CONVIVENCIA", severidad: "MEDIA" }],
    });
    const grave = computeTenantScore({
      pagos: [],
      incidencias: [{ tipo: "CONVIVENCIA", severidad: "GRAVE" }],
    });
    expect(leve.score).toBe(96);
    expect(media.score).toBe(91);
    expect(grave.score).toBe(80);
  });

  it("combina tardanza y reportes en el mismo puntaje", () => {
    const result = computeTenantScore({
      pagos: [{ diasAtrasoPagado: 10, diasVencidoPendiente: 0 }],
      incidencias: [{ tipo: "CONVIVENCIA", severidad: "GRAVE" }],
    });
    expect(result.score).toBe(70);
  });

  it("nunca baja del mínimo de 1 aunque las penalizaciones sean extremas", () => {
    const result = computeTenantScore({
      pagos: Array.from({ length: 20 }, () => ({
        diasAtrasoPagado: 90,
        diasVencidoPendiente: 90,
      })),
      incidencias: Array.from({ length: 10 }, () => ({
        tipo: "CONVIVENCIA",
        severidad: "GRAVE",
      })),
    });
    expect(result.score).toBe(1);
    expect(result.band.band).toBe("CRITICO");
  });
});

describe("bandForScore", () => {
  it("clasifica los extremos y el rango medio", () => {
    expect(bandForScore(100).band).toBe("EXCELENTE");
    expect(bandForScore(1).band).toBe("CRITICO");
    expect(bandForScore(60).band).toBe("REGULAR");
  });
});
