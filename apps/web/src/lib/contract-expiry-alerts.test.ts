import { describe, expect, it } from "vitest";
import {
  daysUntilDate,
  expiryMilestonesForDays,
  limaToday,
} from "./contract-expiry-alerts";

describe("contract expiry alert dates", () => {
  it("calculates calendar days without host timezone dependence", () => {
    expect(daysUntilDate("2026-01-01", "2026-03-02")).toBe(60);
    expect(daysUntilDate("2026-02-27", "2026-03-01")).toBe(2);
    expect(daysUntilDate("2026-03-01", "2026-02-28")).toBe(-1);
  });

  it("returns milestone alerts as each window is entered", () => {
    // Solo un preaviso: cuando al inquilino le queda 1 mes (30 dias).
    expect(expiryMilestonesForDays(61)).toEqual([]);
    expect(expiryMilestonesForDays(45)).toEqual([]);
    expect(expiryMilestonesForDays(31)).toEqual([]);
    expect(expiryMilestonesForDays(30)).toEqual([30]);
    expect(expiryMilestonesForDays(1)).toEqual([30]);
    expect(expiryMilestonesForDays(0)).toEqual([30]);
    expect(expiryMilestonesForDays(-1)).toEqual([]);
  });

  it("derives today's date in Lima", () => {
    expect(limaToday(new Date("2026-03-01T04:30:00.000Z"))).toBe("2026-02-28");
    expect(limaToday(new Date("2026-03-01T05:30:00.000Z"))).toBe("2026-03-01");
  });

  it("rejects invalid DATE values", () => {
    expect(() => daysUntilDate("2026-02-30", "2026-03-01")).toThrow(
      "Fecha contractual inválida",
    );
  });
});
