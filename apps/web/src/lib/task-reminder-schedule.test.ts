import { describe, expect, it } from "vitest";
import {
  taskReminderDateRange,
  taskReminderMatchesTime,
  taskReminderSlot,
} from "./task-reminder-schedule";

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

  it("uses the due date as a Lima calendar day", () => {
    const range = taskReminderDateRange("2026-11-11T08:00");
    expect(range.start.toISOString()).toBe("2026-11-11T05:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-11-12T05:00:00.000Z");
  });

  it("sends a one-time task reminder only at its configured hour", () => {
    expect(taskReminderMatchesTime("11:30", "11:30", false)).toBe(true);
    expect(taskReminderMatchesTime("11:00", "11:30", false)).toBe(false);
  });

  it("repeats checkout reminders each hour from the configured time", () => {
    expect(taskReminderMatchesTime("11:30", "09:30", true)).toBe(true);
    expect(taskReminderMatchesTime("11:00", "09:30", true)).toBe(false);
    expect(taskReminderMatchesTime("09:00", "09:30", true)).toBe(false);
  });
});
