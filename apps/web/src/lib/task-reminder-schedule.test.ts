import { describe, expect, it } from "vitest";
import {
  taskReminderDateRange,
  taskReminderDateRangeForDays,
  taskReminderDaysUntil,
  taskReminderIntervalMinutes,
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

  it("uses the lead-time interval for contract reminders", () => {
    expect(taskReminderIntervalMinutes(2)).toBe(120);
    expect(taskReminderIntervalMinutes(1)).toBe(60);
    expect(taskReminderIntervalMinutes(0)).toBe(30);
    expect(taskReminderIntervalMinutes(3)).toBeNull();
    expect(taskReminderDaysUntil("2026-11-11", "2026-11-13")).toBe(2);
    const range = taskReminderDateRangeForDays("2026-11-11T08:00", 3);
    expect(range.end.toISOString()).toBe("2026-11-14T05:00:00.000Z");
  });

  it("matches the reminder interval after the first half-hour slot at or after scheduled time", () => {
    expect(taskReminderMatchesTime("11:30", "09:30", 30)).toBe(true);
    expect(taskReminderMatchesTime("11:00", "09:30", 30)).toBe(true);
    expect(taskReminderMatchesTime("09:00", "09:30", 30)).toBe(false);
    expect(taskReminderMatchesTime("10:30", "09:30", 60)).toBe(true);
    expect(taskReminderMatchesTime("11:00", "09:30", 60)).toBe(false);
    expect(taskReminderMatchesTime("11:00", "09:00", 120)).toBe(true);
    expect(taskReminderMatchesTime("10:00", "09:00", 120)).toBe(false);
    expect(taskReminderMatchesTime("10:00", "09:45", 30)).toBe(true);
    expect(taskReminderMatchesTime("10:30", "09:45", 30)).toBe(true);
    expect(taskReminderMatchesTime("10:15", "09:00", 30)).toBe(false);
    expect(taskReminderMatchesTime("11:30", "11:30", null)).toBe(true);
    expect(taskReminderMatchesTime("11:00", "11:30", null)).toBe(false);
  });
});
