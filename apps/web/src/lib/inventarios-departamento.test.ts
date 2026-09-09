import { describe, expect, it } from "vitest";
import { resolverDepartamentoInventarioId } from "./inventarios-departamento";

describe("resolverDepartamentoInventarioId", () => {
  it("prioriza el departamento activo del formulario sobre la vista previa", () => {
    expect(resolverDepartamentoInventarioId("dep-activo", "dep-vista")).toBe("dep-activo");
  });

  it("usa el departamento de vista cuando el activo no existe", () => {
    expect(resolverDepartamentoInventarioId(null, "dep-vista")).toBe("dep-vista");
  });

  it("devuelve null si no hay departamento seleccionado", () => {
    expect(resolverDepartamentoInventarioId(null, null)).toBeNull();
  });
});
