const LIMA_TIME_ZONE = "America/Lima";

export function taskReminderSlot(now: Date): string | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  if (
    !values.year ||
    !values.month ||
    !values.day ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 8 ||
    hour > 18 ||
    (hour === 18 && minute >= 30)
  ) {
    return null;
  }
  const slotMinute = minute < 30 ? "00" : "30";
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${slotMinute}`;
}

export function taskReminderDateRange(slot: string): { start: Date; end: Date } {
  const date = slot.slice(0, 10);
  const start = new Date(`${date}T00:00:00.000-05:00`);
  const nextDate = new Date(`${date}T12:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const end = new Date(`${nextDate.toISOString().slice(0, 10)}T00:00:00.000-05:00`);
  return { start, end };
}

export function taskReminderMatchesTime(
  slotTime: string,
  horaEjecucion: string,
  repetirCadaTreintaMinutos: boolean,
): boolean {
  const toMinutes = (value: string): number | null => {
    const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
    if (!match) return null;
    const [hour, minute] = value.split(":").map(Number);
    return hour! * 60 + minute!;
  };
  const slot = toMinutes(slotTime);
  const scheduled = toMinutes(horaEjecucion);
  if (slot === null || scheduled === null) return false;
  if (!repetirCadaTreintaMinutos) return slot === scheduled;
  return slot >= scheduled && slot % 30 === 0;
}
