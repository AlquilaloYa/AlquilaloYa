import { describe, expect, it } from "vitest";
import {
  buildClientPortalAvailabilityOptions,
  emptyAvailabilityOptions,
  localDateInputValue,
} from "./client-portal-availability";

describe("client portal availability", () => {
  it("starts all three date pickers on the visitor's current local date", () => {
    const today = new Date(2026, 9, 24, 13, 30);
    expect(localDateInputValue(today)).toBe("2026-10-24");
    expect(emptyAvailabilityOptions(localDateInputValue(today))).toEqual([
      { date: "2026-10-24", time: "" },
      { date: "2026-10-24", time: "" },
      { date: "2026-10-24", time: "" },
    ]);
  });

  it("creates three distinct two-hour visit windows from local date and time picks", () => {
    const now = new Date(2026, 9, 24, 10);
    const options = buildClientPortalAvailabilityOptions(
      [
        { date: "2026-10-24", time: "11:00" },
        { date: "2026-10-24", time: "13:00" },
        { date: "2026-10-25", time: "09:00" },
      ],
      now,
    );

    expect(options).toHaveLength(3);
    for (const option of options) {
      expect(new Date(option.endsAt).getTime() - new Date(option.startsAt).getTime()).toBe(
        2 * 60 * 60 * 1000,
      );
    }
  });

  it("rejects missing, past, and duplicate date-time picks", () => {
    const now = new Date(2026, 9, 24, 10);
    expect(() =>
      buildClientPortalAvailabilityOptions(emptyAvailabilityOptions("2026-10-24"), now),
    ).toThrow("Selecciona una fecha y una hora futura");
    expect(() =>
      buildClientPortalAvailabilityOptions(
        [
          { date: "2026-10-24", time: "09:00" },
          { date: "2026-10-24", time: "13:00" },
          { date: "2026-10-25", time: "09:00" },
        ],
        now,
      ),
    ).toThrow("Selecciona una fecha y una hora futura");
    expect(() =>
      buildClientPortalAvailabilityOptions(
        [
          { date: "2026-10-24", time: "11:00" },
          { date: "2026-10-24", time: "11:00" },
          { date: "2026-10-25", time: "09:00" },
        ],
        now,
      ),
    ).toThrow("Elige tres fechas y horas distintas");
  });

  it("rejects malformed dates and times instead of normalizing them", () => {
    const now = new Date(2026, 9, 24, 8);
    expect(() =>
      buildClientPortalAvailabilityOptions(
        [
          { date: "2026-02-31", time: "09:00" },
          { date: "2026-10-25", time: "10:00" },
          { date: "2026-10-26", time: "11:00" },
        ],
        now,
      ),
    ).toThrow("Selecciona una fecha y una hora futura");
    expect(() =>
      buildClientPortalAvailabilityOptions(
        [
          { date: "2026-10-24", time: "24:00" },
          { date: "2026-10-25", time: "10:00" },
          { date: "2026-10-26", time: "11:00" },
        ],
        now,
      ),
    ).toThrow("Selecciona una fecha y una hora futura");
  });
});
