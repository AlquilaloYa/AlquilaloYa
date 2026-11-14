import { describe, expect, it } from "vitest";
import {
  calcularImpuestoRenta,
  calcularMontoPorcentual,
} from "./local-utility-billing";

describe("local utility billing", () => {
  it("calculates receipt shares in soles rounded to cents", () => {
    expect(calcularMontoPorcentual(100.01, 50)).toBe(50.01);
    expect(calcularMontoPorcentual(250, 0)).toBe(0);
  });

  it("calculates income tax separately from rent", () => {
    expect(calcularImpuestoRenta(1200, 5)).toBe(60);
  });
});
