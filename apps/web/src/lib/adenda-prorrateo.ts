export interface ProrrateoCuota {
  dias: number;
  desde: string;
  hasta: string;
  monto: number;
  mantenimiento: number;
}

export function addMonthsIso(base: string, months: number): string {
  const [y, m, d] = base.split("-").map(Number);
  const date = new Date(Date.UTC(y as number, (m as number) - 1 + months, 1));
  const ultimoDia = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
  ).getUTCDate();
  date.setUTCDate(Math.min(d as number, ultimoDia));
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${mm}-${dd}`;
}

function montoPorDias(montoMensual: number, desde: string, hasta: string): number {
  const fin = Date.parse(`${hasta}T12:00:00Z`);
  let cursor = Date.parse(`${desde}T12:00:00Z`);
  let monto = 0;

  while (cursor < fin) {
    const fecha = new Date(cursor);
    const diasDelMes = new Date(
      Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0)
    ).getUTCDate();
    monto += montoMensual / diasDelMes;
    cursor += 86400000;
  }

  return Math.round(monto * 100) / 100;
}

export function calcularProrrateoUltimaCuota(
  fechaInicioPeriodo: string,
  fechaFinPeriodo: string,
  montoCanonMensual: number,
  mantenimientoMensual: number
): ProrrateoCuota | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fechaInicioPeriodo) ||
    !(fechaFinPeriodo > fechaInicioPeriodo)
  ) {
    return null;
  }

  let cursor = fechaInicioPeriodo;
  let guard = 0;
  while (cursor < fechaFinPeriodo && guard < 240) {
    const siguientePeriodo = addMonthsIso(cursor, 1);
    if (siguientePeriodo > fechaFinPeriodo) {
      const dias = Math.round(
        (Date.parse(`${fechaFinPeriodo}T12:00:00Z`) -
          Date.parse(`${cursor}T12:00:00Z`)) /
          86400000
      );
      return {
        dias,
        desde: cursor,
        hasta: fechaFinPeriodo,
        monto: montoPorDias(montoCanonMensual, cursor, fechaFinPeriodo),
        mantenimiento: montoPorDias(mantenimientoMensual, cursor, fechaFinPeriodo),
      };
    }
    cursor = siguientePeriodo;
    guard += 1;
  }

  return null;
}
