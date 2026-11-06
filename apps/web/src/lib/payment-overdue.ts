function datePartsInLima(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

export function todayInLima(now = new Date()): string {
  const { year, month, day } = datePartsInLima(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function monthlyDueDate(startDate: string, month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const [, , startDay] = startDate.slice(0, 10).split("-").map(Number);
  if (!year || !monthNumber || !startDay) {
    throw new Error("Fecha de inicio o mes no válido");
  }
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const dueDay = Math.min(startDay, lastDay);
  return `${year}-${String(monthNumber).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
}

export function addDaysToDate(date: string, days: number): string {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  const result = new Date(Date.UTC(year!, month! - 1, day! + Math.max(0, Math.floor(days))));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}`;
}

export function daysBetweenDates(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate.slice(0, 10)}T00:00:00.000Z`);
  const end = Date.parse(`${endDate.slice(0, 10)}T00:00:00.000Z`);
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}
