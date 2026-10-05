/**
 * Clasificacion de un departamento en los paneles de /disponibilidad.
 *
 * Se extrae a un modulo puro para poder testearla sin tocar la base de datos:
 * la parte delicada es que un estado manual explicito gana al mantenimiento
 * automatico por contrato vencido.
 */

export type EstadoManual = "MANTENIMIENTO" | "BLOQUEADO" | "DISPONIBLE" | null;

const ESTADOS_MANUALES: readonly EstadoManual[] = ["MANTENIMIENTO", "BLOQUEADO", "DISPONIBLE"];

/**
 * Normaliza el valor guardado en `estado_manual`. Cualquier valor desconocido
 * (por ejemplo un `LIBRE` heredado de una version anterior) se degrada a null,
 * que equivale al modo automatico.
 */
export function normalizarEstadoManual(valor: string | null | undefined): EstadoManual {
  return ESTADOS_MANUALES.includes(valor as EstadoManual) ? (valor as EstadoManual) : null;
}

export interface ClasificacionSinOcupante {
  enMantenimiento: boolean;
  bloqueado: boolean;
}

/**
 * Clasifica un departamento que no tiene contrato vigente hoy.
 *
 * - `MANTENIMIENTO` y `BLOQUEADO` mandan sobre cualquier inferencia.
 * - `DISPONIBLE` es una excepcion explicita: la unidad queda disponible aunque
 *   su ultimo contrato haya vencido sin renovar. Por eso no basta con limpiar
 *   `estado_manual` a null, porque null vuelve a activar el modo automatico.
 * - Con `null` se mantiene el modo automatico: si el ultimo contrato ya termino
 *   la unidad pasa a mantenimiento.
 *
 * @param estadoManual Estado forzado desde el ERP, o null para modo automatico.
 * @param ultimoFin Fecha `YYYY-MM-DD` de fin del ultimo contrato, o null si nunca contrato.
 * @param hoy Fecha `YYYY-MM-DD` de referencia.
 */
export function clasificarSinOcupante(args: {
  estadoManual: EstadoManual;
  ultimoFin: string | null;
  hoy: string;
}): ClasificacionSinOcupante {
  const { estadoManual, ultimoFin, hoy } = args;

  if (estadoManual === "BLOQUEADO") return { enMantenimiento: false, bloqueado: true };
  if (estadoManual === "MANTENIMIENTO") return { enMantenimiento: true, bloqueado: false };
  if (estadoManual === "DISPONIBLE") return { enMantenimiento: false, bloqueado: false };

  return { enMantenimiento: Boolean(ultimoFin && ultimoFin < hoy), bloqueado: false };
}

/** Etiquetas legibles para mostrar el estado manual en las fichas. */
export const ETIQUETA_ESTADO_MANUAL: Record<string, string> = {
  MANTENIMIENTO: "Mantenimiento",
  BLOQUEADO: "Bloqueado",
  DISPONIBLE: "Disponible (a mano)",
};
