import { describe, expect, it } from "vitest";
import { work123DateKey, work123LocalDate } from "./work-123-calendar";

describe("Work 123 calendar dates", () => {
  it("keeps a scheduled date on its calendar day when its API timestamp is UTC", () => {
    expect(work123DateKey("2026-10-27T00:00:00.000Z")).toBe("2026-10-27");
  });

  it("uses the same day for date-only values and local dates", () => {
    expect(work123DateKey("2026-10-27")).toBe("2026-10-27");
    expect(work123DateKey(new Date(2026, 9, 27, 12))).toBe("2026-10-27");
  });

  it("parses a date-only value as a local calendar date", () => {
    const date = work123LocalDate("2026-10-27T00:00:00.000Z");
    expect(date && [date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([
      2026,
      9,
      27,
    ]);
  });

  it("rejects invalid date-only values", () => {
    expect(work123DateKey("2026-02-30")).toBeNull();
    expect(work123LocalDate("")).toBeNull();
  });
});
