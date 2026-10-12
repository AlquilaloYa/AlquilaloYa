/**
 * Helpers de "jornada de asistencia" (SEC/UX). Lima no aplica horario de
 * verano: siempre UTC-5. El servidor estampa y compara el inicio del día en
 * hora de Lima; el cliente debe usar la misma regla para no desincronizarse
 * (p. ej. cuando la fecha/reloj del navegador no coincide con Lima y, tras
 * marcar la entrada, el refrigerio y la salida quedaban deshabilitados).
 */

/** Inicio del día actual en hora de Lima (UTC-5) expresado como instante UTC. */
export function inicioDiaLima(nowMs: number = Date.now()): Date {
  const lima = new Date(nowMs - 5 * 3600 * 1000);
  const dia = Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate());
  return new Date(dia + 5 * 3600 * 1000);
}

/** ¿El registro pertenece a la jornada de hoy (día Lima)? */
export function esJornadaDeHoy(
  createdAt: Date | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!createdAt) return false;
  return createdAt.getTime() >= inicioDiaLima(nowMs).getTime();
}
