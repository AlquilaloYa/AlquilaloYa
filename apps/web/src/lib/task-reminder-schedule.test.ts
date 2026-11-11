import { describe, expect, it } from "vitest";
import { taskReminderDateRange, taskReminderSlot } from "./task-reminder-schedule";

describe("task reminder schedule", () => {
  it("only produces half-hour slots from 8:00 to 18:00 in Lima", () => {
    expect(taskReminderSlot(new Date("2026-11-11T13:00:00.000Z"))).toBe("2026-11-11T08:00");
    expect(taskReminderSlot(new Date("2026-11-11T13:18:00.000Z"))).toBe("2026-11-11T08:00");
    expect(taskReminderSlot(new Date("2026-11-11T13:45:00.000Z"))).toBe("2026-11-11T08:30");
    expect(taskReminderSlot(new Date("2026-11-11T22:30:00.000Z"))).toBe("2026-11-11T17:30");
    expect(taskReminderSlot(new Date("2026-11-11T23:00:00.000Z"))).toBe("2026-11-11T18:00");
    expect(taskReminderSlot(new Date("2026-11-11T12:30:00.000Z"))).toBeNull();
    expect(taskReminderSlot(new Date("2026-11-11T23:29:00.000Z"))).toBe("2026-11-11T18:00");
    expect(taskReminderSlot(new Date("2026-11-11T23:30:00.000Z"))).toBeNull();
    expect(taskReminderSlot(new Date("2026-11-11T13:15:00.000Z"))).toBe("2026-11-11T08:00");
  });

  it("uses the due date as a calendar date, independent of Lima's UTC offset", () => {
    const range = taskReminderDateRange("2026-11-11T08:00");
    expect(range.start.toISOString()).toBe("2026-11-11T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-11-12T00:00:00.000Z");
  });
});
