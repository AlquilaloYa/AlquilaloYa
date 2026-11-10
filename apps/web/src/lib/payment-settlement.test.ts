import { describe, expect, it } from "vitest";
import { settleVerifiedPayment } from "./payment-settlement";

describe("verified payment settlement", () => {
  it("uses the expected installment amount when legacy vouchers have no amount", () => {
    expect(settleVerifiedPayment([{ }, {}], 1650, 0)).toEqual({
      estado: "PAGADO",
      montoPagado: 1650,
    });
  });

  it("preserves the amount of a verified partial payment", () => {
    expect(settleVerifiedPayment([{ monto: 800 }], 1650, 0)).toEqual({
      estado: "PARCIAL",
      montoPagado: 800,
    });
  });

  it("uses the expected total if one of several vouchers has no amount", () => {
    expect(
      settleVerifiedPayment([{ monto: 800 }, {}], 1650, 0),
    ).toEqual({ estado: "PAGADO", montoPagado: 1650 });
  });

  it("preserves a previously entered amount when vouchers have no amounts", () => {
    expect(settleVerifiedPayment([{}], 1650, 800)).toEqual({
      estado: "PARCIAL",
      montoPagado: 800,
    });
  });
});
