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

  it("adds the new voucher amount to the already verified amount", () => {
    expect(
      settleVerifiedPayment(
        [{ monto: 800, verificadoEn: "2026-11-01T12:00:00.000Z" }, { monto: 850 }],
        1650,
        800,
      ),
    ).toEqual({ estado: "PAGADO", montoPagado: 1650 });
  });

  it("keeps PARCIAL when the accumulated amount still does not cover the total", () => {
    expect(
      settleVerifiedPayment(
        [{ monto: 800, verificadoEn: "2026-11-01T12:00:00.000Z" }, { monto: 300 }],
        1650,
        800,
      ),
    ).toEqual({ estado: "PARCIAL", montoPagado: 1100 });
  });

  it("falls back to the recorded amount when a second deposit has no amounts", () => {
    expect(
      settleVerifiedPayment(
        [{ monto: 800, verificadoEn: "2026-11-01T12:00:00.000Z" }, {}],
        1650,
        800,
      ),
    ).toEqual({ estado: "PARCIAL", montoPagado: 800 });
  });

  it("does not double count a legacy PAGADO payment whose voucher is verified now", () => {
    expect(
      settleVerifiedPayment([{ monto: 1700 }], 1700, 1700),
    ).toEqual({ estado: "PAGADO", montoPagado: 1700 });
  });
});
