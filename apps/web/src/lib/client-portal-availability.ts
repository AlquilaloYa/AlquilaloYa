export type ClientAvailabilityInput = { date: string; time: string };
export type ClientAvailabilityOption = { startsAt: string; endsAt: string };

export const VISIT_WINDOW_MS = 2 * 60 * 60 * 1000;

export function localDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function emptyAvailabilityOptions(date = ""): ClientAvailabilityInput[] {
  return Array.from({ length: 3 }, () => ({ date, time: "" }));
}

export function buildClientPortalAvailabilityOptions(
  options: ClientAvailabilityInput[],
  now = new Date(),
): ClientAvailabilityOption[] {
  if (options.length !== 3) {
    throw new Error("Selecciona una fecha y una hora para cada una de las tres opciones.");
  }

  const startsAtDates = options.map((option) => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(option.date) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(option.time)
    ) {
      throw new Error("Selecciona una fecha y una hora futura para cada opción.");
    }
    const startsAt = new Date(`${option.date}T${option.time}`);
    if (
      !option.date ||
      !option.time ||
      Number.isNaN(startsAt.getTime()) ||
      localDateInputValue(startsAt) !== option.date ||
      `${String(startsAt.getHours()).padStart(2, "0")}:${String(startsAt.getMinutes()).padStart(2, "0")}` !== option.time ||
      startsAt.getTime() <= now.getTime()
    ) {
      throw new Error("Selecciona una fecha y una hora futura para cada opción.");
    }
    return startsAt;
  });
  if (new Set(startsAtDates.map((date) => date.getTime())).size !== 3) {
    throw new Error("Elige tres fechas y horas distintas para tu visita.");
  }

  return startsAtDates.map((startsAt) => ({
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + VISIT_WINDOW_MS).toISOString(),
  }));
}
