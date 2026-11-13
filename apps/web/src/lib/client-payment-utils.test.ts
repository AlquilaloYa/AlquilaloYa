import { describe, expect, it } from "vitest";
import {
  monthlyPaymentCents,
  paymentReminderKind,
  servicePaymentCents,
  shiftIsoDate,
  validatePaymentAmount,
} from "./client-payment-utils";

describe("client payment utilities", () => {
  it("calculates client monthly obligations from rent and maintenance only", () => {
    expect(monthlyPaymentCents("1200.00", "50.00")).toBe(125000);
  });

  it("uses the ERP service total or sums only selected services", () => {
    expect(
      servicePaymentCents({
        montoTotal: "105.00",
        incluyeInternet: true,
        incluyeCargaElectrica: true,
        montoInternet: "39.00",
        montoCargaElectrica: "60.00",
      }),
    ).toBe(10500);
    expect(
      servicePaymentCents({
        montoTotal: null,
        incluyeInternet: true,
        incluyeCargaElectrica: false,
        montoInternet: "39.00",
        montoCargaElectrica: "60.00",
      }),
    ).toBe(3900);
    expect(
      servicePaymentCents({
        montoTotal: null,
        incluyeInternet: false,
        incluyeCargaElectrica: false,
        montoInternet: "invalid",
        montoCargaElectrica: "invalid",
      }),
    ).toBe(0);
  });

  it("sends reminders two days before and on the due date only", () => {
    expect(paymentReminderKind("2026-11-20", "2026-11-18")).toBe(
      "TWO_DAYS_BEFORE",
    );
    expect(paymentReminderKind("2026-11-20", "2026-11-20")).toBe("DUE_DATE");
    expect(paymentReminderKind("2026-11-20", "2026-11-19")).toBeNull();
    expect(shiftIsoDate("2026-11-30", 2)).toBe("2026-12-02");
  });

  it("allows partial deposits only before the due date", () => {
    const beforeDue = {
      amountCents: 5000,
      remainingCents: 125000,
      dueDate: "2026-11-20",
      today: "2026-11-19",
    };
    expect(validatePaymentAmount(beforeDue)).toBeNull();
    expect(validatePaymentAmount({ ...beforeDue, today: "2026-11-20" })).toBe(
      "full_payment_required",
    );
    expect(
      validatePaymentAmount({
        ...beforeDue,
        amountCents: 125001,
      }),
    ).toBe("amount_exceeds_balance");
  });
});
