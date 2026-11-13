export type PaymentReminderKind = "TWO_DAYS_BEFORE" | "DUE_DATE";

export type PaymentAmountError =
  "invalid_amount" | "amount_exceeds_balance" | "full_payment_required";

export function moneyToCents(value: string | number): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export function monthlyPaymentCents(
  rent: string | number,
  maintenance: string | number,
): number | null {
  const rentCents = moneyToCents(rent);
  const maintenanceCents = moneyToCents(maintenance);
  if (rentCents === null || maintenanceCents === null) return null;
  return rentCents + maintenanceCents;
}

export function servicePaymentCents(service: {
  montoTotal: string | null;
  incluyeInternet: boolean;
  incluyeCargaElectrica: boolean;
  montoInternet: string;
  montoCargaElectrica: string;
}): number | null {
  if (service.montoTotal !== null) return moneyToCents(service.montoTotal);
  const internet = service.incluyeInternet
    ? moneyToCents(service.montoInternet)
    : 0;
  const electric = service.incluyeCargaElectrica
    ? moneyToCents(service.montoCargaElectrica)
    : 0;
  if (internet === null || electric === null) return null;
  return internet + electric;
}

export function centsToMoney(value: number): string {
  return (value / 100).toFixed(2);
}

function parseIsoDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

export function currentMonthlyPaymentPeriod(
  startsAt: string,
  endsAt: string,
  today: string,
): string | null {
  const start = parseIsoDate(startsAt);
  const end = parseIsoDate(endsAt);
  const current = parseIsoDate(today);
  if (start === null || end === null || current === null) return null;

  const startDate = new Date(start);
  const currentDate = new Date(current);
  const months =
    (currentDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
    currentDate.getUTCMonth() -
    startDate.getUTCMonth();
  if (months < 0) return null;

  const dueMonth = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(dueMonth.getUTCFullYear(), dueMonth.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const due = Date.UTC(
    dueMonth.getUTCFullYear(),
    dueMonth.getUTCMonth(),
    Math.min(startDate.getUTCDate(), lastDay),
  );
  if (due >= end) return null;
  return new Date(due).toISOString().slice(0, 10);
}

export function shiftIsoDate(value: string, days: number): string | null {
  const timestamp = parseIsoDate(value);
  if (timestamp === null || !Number.isInteger(days)) return null;
  return new Date(timestamp + days * 86_400_000).toISOString().slice(0, 10);
}

export function paymentReminderKind(
  dueDate: string,
  today: string,
): PaymentReminderKind | null {
  const due = parseIsoDate(dueDate);
  const current = parseIsoDate(today);
  if (due === null || current === null) return null;
  const daysUntilDue = Math.round((due - current) / 86_400_000);
  if (daysUntilDue === 2) return "TWO_DAYS_BEFORE";
  if (daysUntilDue === 0) return "DUE_DATE";
  return null;
}

export function validatePaymentAmount(input: {
  amountCents: number;
  remainingCents: number;
  dueDate: string;
  today: string;
  allowPartialWhenOverdue?: boolean;
}): PaymentAmountError | null {
  const due = parseIsoDate(input.dueDate);
  const current = parseIsoDate(input.today);
  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    input.remainingCents <= 0 ||
    due === null ||
    current === null
  ) {
    return "invalid_amount";
  }
  if (input.amountCents > input.remainingCents) {
    return "amount_exceeds_balance";
  }
  if (
    current >= due &&
    input.amountCents !== input.remainingCents &&
    !(input.allowPartialWhenOverdue && current > due)
  ) {
    return "full_payment_required";
  }
  return null;
}
