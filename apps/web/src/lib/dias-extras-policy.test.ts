import { describe, expect, it } from "vitest";
import { evaluarDiasExtras } from "./dias-extras-policy";

describe("evaluarDiasExtras", () => {
  it("cobra S/ 100 por cada día dentro del límite", () => {
    expect(evaluarDiasExtras(1)).toMatchObject({
      valido: true,
      permitido: true,
      requiereAdenda: false,
      monto: 100,
    });
    expect(evaluarDiasExtras(7)).toMatchObject({
      valido: true,
      permitido: true,
      requiereAdenda: false,
      monto: 700,
    });
  });

  it("deriva más de siete días a Adendas", () => {
    expect(evaluarDiasExtras(8)).toMatchObject({
      valido: true,
      permitido: false,
      requiereAdenda: true,
      monto: 0,
    });
  });

  it("limita el acumulado de días extras del mismo período a siete", () => {
    expect(evaluarDiasExtras(4, 4)).toMatchObject({
      permitido: false,
      requiereAdenda: true,
    });
    expect(evaluarDiasExtras(3, 4)).toMatchObject({
      permitido: true,
      monto: 300,
    });
  });
});
