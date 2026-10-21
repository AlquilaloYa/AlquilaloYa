export type ScoreBand = "EXCELENTE" | "BUENO" | "REGULAR" | "RIESGO" | "CRITICO";

export interface ScoreBandInfo {
  band: ScoreBand;
  label: string;
  min: number;
  max: number;
  /** Token de color para UI (no un hex fijo). */
  color: string;
}

/** Bandas de color del scoring. Menor puntaje = mayor riesgo. */
export const SCORE_BANDS: ScoreBandInfo[] = [
  { band: "EXCELENTE", label: "Excelente", min: 85, max: 100, color: "hsl(var(--secondary))" },
  { band: "BUENO", label: "Bueno", min: 70, max: 84, color: "hsl(var(--primary))" },
  { band: "REGULAR", label: "Regular", min: 50, max: 69, color: "hsl(35 100% 45%)" },
  { band: "RIESGO", label: "En riesgo", min: 30, max: 49, color: "hsl(var(--error))" },
  { band: "CRITICO", label: "Crítico", min: 1, max: 29, color: "hsl(0 72% 30%)" },
];

export function bandForScore(score: number): ScoreBandInfo {
  const clamped = Math.max(1, Math.min(100, Math.round(score)));
  const found = SCORE_BANDS.find((b) => clamped >= b.min && clamped <= b.max);
  return found ?? SCORE_BANDS[SCORE_BANDS.length - 1]!;
}

export type IncidentSeveridad = "LEVE" | "MEDIA" | "GRAVE";

/** Penalización base por severidad de una incidencia de convivencia. */
const INCIDENT_PENALTY: Record<IncidentSeveridad, number> = {
  LEVE: 4,
  MEDIA: 10,
  GRAVE: 20,
};

export interface IncidentInput {
  tipo: string;
  severidad: string;
}

export interface PaymentInput {
  /** Días de atraso para cuotas ya pagadas (fechaPago - periodo). 0 si a tiempo. */
  diasAtrasoPagado: number;
  /** Días transcurridos desde el vencimiento de una cuota aún pendiente. 0 si no aplica. */
  diasVencidoPendiente: number;
}

export interface ScoringInput {
  pagos: PaymentInput[];
  incidencias: IncidentInput[];
}

export interface ScoringBreakdown {
  base: number;
  penalizacionTardanza: number;
  penalizacionIncidencias: number;
  detalleIncidencias: { severidad: IncidentSeveridad; cantidad: number; penalizacion: number }[];
  cuotasPagadasConAtraso: number;
  cuotasVencidasPendientes: number;
  diasAtrasoPromedio: number;
  diasVencidoMaximo: number;
}

export interface ScoringResult {
  score: number;
  band: ScoreBandInfo;
  breakdown: ScoringBreakdown;
}

const BASE = 100;

/**
 * Penalización por tardanza. Progresiva: los primeros días pesan poco y
 * crece rápido con atrasos largos o cuotas vencidas sin pagar.
 */
function penaltyForPaidLate(dias: number): number {
  if (dias <= 0) return 0;
  if (dias <= 5) return dias * 0.5;
  if (dias <= 15) return 2.5 + (dias - 5) * 1;
  if (dias <= 30) return 12.5 + (dias - 15) * 1.5;
  return 35 + (dias - 30) * 2;
}

function penaltyForOverduePending(dias: number): number {
  if (dias <= 0) return 0;
  if (dias <= 10) return dias * 1.5;
  if (dias <= 30) return 15 + (dias - 10) * 2;
  return 55 + (dias - 30) * 2.5;
}

/**
 * Calcula el puntaje de un inquilino (1-100).
 * Regla: a mayor tardanza en pagos e incidencias de convivencia, menor puntaje.
 */
export function computeTenantScore(input: ScoringInput): ScoringResult {
  let penalizacionTardanza = 0;
  let cuotasPagadasConAtraso = 0;
  let cuotasVencidasPendientes = 0;
  let sumaDiasAtraso = 0;
  let diasVencidoMaximo = 0;

  for (const pago of input.pagos) {
    if (pago.diasAtrasoPagado > 0) {
      penalizacionTardanza += penaltyForPaidLate(pago.diasAtrasoPagado);
      cuotasPagadasConAtraso++;
      sumaDiasAtraso += pago.diasAtrasoPagado;
    }
    if (pago.diasVencidoPendiente > 0) {
      penalizacionTardanza += penaltyForOverduePending(pago.diasVencidoPendiente);
      cuotasVencidasPendientes++;
      diasVencidoMaximo = Math.max(diasVencidoMaximo, pago.diasVencidoPendiente);
    }
  }

  const conteoIncidencias = new Map<IncidentSeveridad, number>();
  for (const inc of input.incidencias) {
    const sev = (inc.severidad as IncidentSeveridad) ?? "MEDIA";
    const key: IncidentSeveridad = INCIDENT_PENALTY[sev] ? sev : "MEDIA";
    conteoIncidencias.set(key, (conteoIncidencias.get(key) ?? 0) + 1);
  }

  const detalleIncidencias: ScoringBreakdown["detalleIncidencias"] = [];
  let penalizacionIncidencias = 0;
  for (const severidad of ["LEVE", "MEDIA", "GRAVE"] as IncidentSeveridad[]) {
    const cantidad = conteoIncidencias.get(severidad) ?? 0;
    if (cantidad === 0) continue;
    const penalizacion = cantidad * INCIDENT_PENALTY[severidad];
    penalizacionIncidencias += penalizacion;
    detalleIncidencias.push({ severidad, cantidad, penalizacion });
  }

  const penalizacionTardanzaRedondeada = Math.round(penalizacionTardanza * 100) / 100;
  const totalPenalizacion = penalizacionTardanzaRedondeada + penalizacionIncidencias;
  const score = Math.max(1, Math.min(100, Math.round(BASE - totalPenalizacion)));

  return {
    score,
    band: bandForScore(score),
    breakdown: {
      base: BASE,
      penalizacionTardanza: penalizacionTardanzaRedondeada,
      penalizacionIncidencias,
      detalleIncidencias,
      cuotasPagadasConAtraso,
      cuotasVencidasPendientes,
      diasAtrasoPromedio: cuotasPagadasConAtraso
        ? Math.round(sumaDiasAtraso / cuotasPagadasConAtraso)
        : 0,
      diasVencidoMaximo,
    },
  };
}
