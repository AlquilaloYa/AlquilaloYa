import { describe, expect, it } from "vitest";
import { parseWorkOrderMaterial } from "./work-order-materials-validation";

describe("parseWorkOrderMaterial", () => {
  it("normaliza campos y calcula costo total con redondeo a centavos", () => {
    expect(
      parseWorkOrderMaterial({
        material: "  Tubo PVC ",
        quantity: "1.555",
        unit: " m ",
        unitCost: "0.15",
        observations: "  Corte a medida ",
      }),
    ).toEqual({
      data: {
        material: "Tubo PVC",
        quantity: "1.555",
        unit: "m",
        unitCost: "0.15",
        totalCost: "0.23",
        observations: "Corte a medida",
      },
    });
  });

  it("permite costo cero y redondea un medio centavo hacia arriba", () => {
    expect(
      parseWorkOrderMaterial({
        material: "Sellador",
        quantity: 0.005,
        unit: "unidad",
        unitCost: 1,
      }),
    ).toMatchObject({ data: { totalCost: "0.01", observations: "" } });

    expect(
      parseWorkOrderMaterial({
        material: "Cinta",
        quantity: 1,
        unit: "rollo",
        unitCost: 0,
      }),
    ).toMatchObject({ data: { totalCost: "0.00" } });
  });

  it.each([
    null,
    [],
    { material: "Tubo", quantity: 0, unit: "m", unitCost: 1 },
    { material: "Tubo", quantity: 1.0001, unit: "m", unitCost: 1 },
    { material: "Tubo", quantity: 1, unit: "m", unitCost: -1 },
    { material: "Tubo", quantity: 1, unit: "m", unitCost: 1.001 },
    { material: "Tubo", quantity: 1, unit: "m", unitCost: 1, observations: 7 },
  ])("rechaza datos inválidos (%j)", (value) => {
    expect(parseWorkOrderMaterial(value)).toHaveProperty("error");
  });

  it("rechaza cantidades y totales que exceden el límite de almacenamiento", () => {
    expect(
      parseWorkOrderMaterial({
        material: "Material",
        quantity: "1000000000",
        unit: "unidad",
        unitCost: 1,
      }),
    ).toHaveProperty("error");

    expect(
      parseWorkOrderMaterial({
        material: "Material",
        quantity: "999999999.999",
        unit: "unidad",
        unitCost: "9999999999.99",
      }),
    ).toHaveProperty("error");
  });

  it("permite totales con la precisión de la columna de base de datos", () => {
    expect(
      parseWorkOrderMaterial({
        material: "Material",
        quantity: "10",
        unit: "unidad",
        unitCost: "9999999999.99",
      }),
    ).toMatchObject({
      data: { totalCost: "99999999999.90" },
    });
  });
});
