import { describe, it, expect } from "vitest";
import { ESTADOS_CONTRATO_OCUPANTES } from "./estado-contrato";

/**
 * La disponibilidad (endpoints públicos y panel interno) debe considerar
 * ocupados los contratos ya iniciados en EMITIDO/PENDIENTE_FIRMA, igual que
 * `lib/matching.ts`. Este test fija el conjunto para evitar regresiones.
 */
describe("ESTADOS_CONTRATO_OCUPANTES", () => {
  it("incluye los estados de alquiler comprometido", () => {
    for (const estado of ["EMITIDO", "PENDIENTE_FIRMA", "FIRMADO", "NOTARIADO", "ACTIVO", "VIGENTE"]) {
      expect(ESTADOS_CONTRATO_OCUPANTES).toContain(estado);
    }
  });

  it("no incluye estados no ocupantes", () => {
    for (const estado of ["BORRADOR", "PENDIENTE_EMISION", "CANCELADO", "RESUELTO"]) {
      expect(ESTADOS_CONTRATO_OCUPANTES).not.toContain(estado);
    }
  });
});
