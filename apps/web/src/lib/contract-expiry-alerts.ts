export const CONTRACT_EXPIRY_MILESTONES = [60, 45, 30] as const;

export type ContractExpiryMilestone =
  (typeof CONTRACT_EXPIRY_MILESTONES)[number];

export function limaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) {
    throw new Error("No se pudo calcular la fecha actual de Lima");
  }
  return `${year}-${month}-${day}`;
}

export function daysUntilDate(today: string, endDate: string): number {
  const todayTime = parseDateOnly(today);
  const endTime = parseDateOnly(endDate);
  return Math.round((endTime - todayTime) / 86_400_000);
}

export function expiryMilestonesForDays(
  daysRemaining: number,
): ContractExpiryMilestone[] {
  return CONTRACT_EXPIRY_MILESTONES.filter(
    (milestone) => daysRemaining >= 0 && daysRemaining <= milestone,
  );
}

function parseDateOnly(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Fecha contractual inválida: ${value}`);
  }
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(time) ||
    new Date(time).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Fecha contractual inválida: ${value}`);
  }
  return time;
}
