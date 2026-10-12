/**
 * Estados de contrato que OCUPAN un departamento.
 *
 * Un contrato ocupa la unidad cuando ya inició (`fechaInicio <= hoy`) y su
 * estado representa un compromiso de alquiler. Además de los estados
 * "en curso" (FIRMADO/NOTARIADO y los legados ACTIVO/VIGENTE), se incluyen
 * EMITIDO y PENDIENTE_FIRMA porque en la operación el inquilino ya está en
 * proceso de mudanza; así la disponibilidad es consistente con
 * `lib/matching.ts`, que ya los trata como ocupantes.
 *
 * El filtro de fechas sigue siendo necesario: un contrato emitido/pendiente
 * cuya `fechaInicio` es futura NO ocupa todavía.
 */
export const ESTADOS_CONTRATO_OCUPANTES: string[] = [
  "EMITIDO",
  "PENDIENTE_FIRMA",
  "FIRMADO",
  "NOTARIADO",
  "ACTIVO",
  "VIGENTE",
];
