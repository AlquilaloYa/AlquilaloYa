import { describe, expect, it } from "vitest";
import {
  canVerifyPayment,
  canViewVerificationPayment,
  paymentVerificationAccess,
} from "./payment-verification-access";

describe("payment verification account access", () => {
  it("limits Miguel to Angamos visibility and ANG170 verification", () => {
    const email = "Miguel.Carpio@sistema.com";

    expect(paymentVerificationAccess(email)).toEqual({
      scope: "angamos",
      verifyPrefix: "ANG170-",
      canVerify: true,
    });
    expect(canViewVerificationPayment(email, "ANG170-2C", "ANG170")).toBe(true);
    expect(canViewVerificationPayment(email, "BEN2195-18", "BEN2195")).toBe(false);
    expect(canVerifyPayment(email, "ANG170-2C")).toBe(true);
    expect(canVerifyPayment(email, "ANG171-1")).toBe(false);
  });

  it("limits Emely to viewing and verifying BEN2195 contracts", () => {
    const email = "emely.carpio@sistema.com";

    expect(paymentVerificationAccess(email)).toEqual({
      scope: "ben2195",
      verifyPrefix: "BEN2195-",
      canVerify: true,
    });
    expect(canViewVerificationPayment(email, "BEN2195-18", "BEN2195")).toBe(true);
    expect(canViewVerificationPayment(email, "ANG170-2C", "ANG170")).toBe(false);
    expect(canVerifyPayment(email, "BEN2195-18")).toBe(true);
    expect(canVerifyPayment(email, "ANG170-2C")).toBe(false);
  });

  it("hides both assigned portfolios from other accounts", () => {
    const email = "other@sistema.com";

    expect(canViewVerificationPayment(email, "ANG170-2C", "ANG170")).toBe(false);
    expect(canViewVerificationPayment(email, "BEN2195-18", "BEN2195")).toBe(false);
    expect(canViewVerificationPayment(email, "OTRO-1", "OTRO")).toBe(true);
    expect(canVerifyPayment(email, "ANG170-2C")).toBe(false);
    expect(canVerifyPayment(email, "BEN2195-18")).toBe(false);
    expect(canVerifyPayment(email, "OTRO-1")).toBe(true);
  });

  it("allows administrators to view both assigned portfolios without verifying them", () => {
    const email = "admin@sistema.com";

    expect(paymentVerificationAccess(email, true)).toEqual({
      scope: "all",
      verifyPrefix: null,
      canVerify: false,
    });
    expect(canViewVerificationPayment(email, "ANG170-2C", "ANG170", true)).toBe(true);
    expect(canViewVerificationPayment(email, "BEN2195-18", "BEN2195", true)).toBe(true);
    expect(canVerifyPayment(email, "ANG170-2C")).toBe(false);
    expect(canVerifyPayment(email, "BEN2195-18")).toBe(false);
  });

  it("does not grant administrator visibility by email alone", () => {
    const email = "admin@sistema.com";

    expect(canViewVerificationPayment(email, "ANG170-2C", "ANG170")).toBe(false);
    expect(canViewVerificationPayment(email, "BEN2195-18", "BEN2195")).toBe(false);
  });
});
