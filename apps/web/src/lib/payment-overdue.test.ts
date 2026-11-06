import { describe, expect, it } from "vitest";
import {
  addDaysToDate,
  daysBetweenDates,
  monthlyDueDate,
  todayInLima,
} from "./payment-overdue";

describe("payment overdue dates", () => {
  it("uses the due day from the contract start and clamps short months", () => {
    expect(monthlyDueDate("2026-01-31", "2026-02")).toBe("2026-02-28");
    expect(monthlyDueDate("2026-01-12", "2026-03")).toBe("2026-03-12");
  });

  it("adds a manually granted extension and counts overdue days by calendar date", () => {
    expect(addDaysToDate("2026-11-06", 0)).toBe("2026-11-06");
    expect(addDaysToDate("2026-11-06", 3)).toBe("2026-11-09");
    expect(daysBetweenDates("2026-11-09", "2026-11-11")).toBe(2);
  });

  it("uses the Lima calendar day rather than the server's UTC day", () => {
    expect(todayInLima(new Date("2026-11-06T04:30:00.000Z"))).toBe("2026-11-05");
  });
});
