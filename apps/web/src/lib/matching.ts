import { and, eq, inArray, sql } from "drizzle-orm";

type Db = typeof import("@contract/db").db;
type Schema = typeof import("@contract/db").schema;

export interface LeadParaScore {
  id: string;
  etapa: string;
  monto: number;
  asignadoA: string;
  tags: string[];
  venceEl: string | null;
  servicio: string;
  updatedAt: Date | null;
}

export interface DeptoMatch {
  departamentoId: string;
  codigo: string;
  nombre: string;
  numero: string;
  piso: number;
  total: number;
  pct: number;
  motivo: string[];
}

export interface Inteligencia {
  score: number;
  tier: string;
  señales: string[];
  matches: DeptoMatch[];
}

const BASE_ETAPA: Record<string, number> = {
  ENTRANTE: 15,
  DECISION: 40,
  NEGOCIACION: 65,
  FINAL: 85,
  GANADO: 100,
  PERDIDO: 0,
};

export function tierDeScore(score: number): string {
  if (score <= 20) return "FRIO";
  if (score <= 40) return "TIBIO";
  if (score <= 60) return "CALIFICADO";
  if (score <= 80) return "CALIENTE";
  return "MUY CALIENTE";
}

/**
 * Lead score determinístico (0-100): etapa + actividad + urgencia +
 * asignación + monto + engagement de conversaciones.
 */
export function calcularScore(lead: LeadParaScore, hayMensajesEntrantes: boolean): { score: number; señales: string[] } {
  let score = BASE_ETAPA[lead.etapa] ?? 10;
  const señales: string[] = [`Etapa ${lead.etapa.toLowerCase()} (+${BASE_ETAPA[lead.etapa] ?? 10})`];

  if (lead.monto > 0) {
    score += 5;
    señales.push("Presupuesto definido (+5)");
  }
  if (lead.asignadoA.trim()) {
    score += 5;
    señales.push("Asignado a un asesor (+5)");
  }
  if (lead.tags.some((t) => ["urgente", "vip"].includes(t.toLowerCase()))) {
    score += 8;
    señales.push("Etiqueta de prioridad (+8)");
  }
  if (lead.updatedAt) {
    const dias = (Date.now() - lead.updatedAt.getTime()) / 86_400_000;
    if (dias <= 3) {
      score += 10;
      señales.push("Actividad reciente ≤3 días (+10)");
    } else if (dias <= 7) {
      score += 6;
      señales.push("Actividad ≤7 días (+6)");
    } else if (dias <= 30) {
      score += 2;
    }
  }
  if (lead.venceEl) {
    const d = new Date(`${lead.venceEl}T12:00:00`).getTime();
    if (d >= Date.now()) {
      score += 5;
      señales.push("Con seguimiento programado (+5)");
    }
  }
  if (hayMensajesEntrantes) {
    score += 7;
    señales.push("Escribió por un canal (+7)");
  }
  return { score: Math.max(0, Math.min(100, score)), señales };
}

interface DeptoRaw {
  id: string;
  codigo: string;
  nombre: string;
  numero: string;
  piso: number;
  precio: string | number;
  mantenimiento: string | number;
}

/** Rankea departamentos disponibles contra el presupuesto/zona del lead (0-100%). */
export function rankearDepartamentos(lead: LeadParaScore, depts: DeptoRaw[]): DeptoMatch[] {
  const tokensLead = new Set(
    lead.servicio
      .toLowerCase()
      .split(/[^a-záéíóúñ0-9]+/i)
      .filter((t) => t.length >= 4)
  );

  const scored = depts.map((d) => {
    const total = Number(d.precio) + Number(d.mantenimiento || 0);
    const motivo: string[] = [];
    let pct = 0;

    if (lead.monto > 0 && total > 0) {
      const ratio = lead.monto / total;
      if (ratio >= 1) {
        pct += 60;
        motivo.push("dentro de presupuesto");
      } else if (ratio >= 0.9) {
        pct += 45;
        motivo.push("≈ presupuesto (±10%)");
      } else if (ratio >= 0.75) {
        pct += 30;
        motivo.push("algo por encima del presupuesto");
      } else {
        pct += 10;
        motivo.push("fuera de presupuesto");
      }
    } else {
      pct += 30;
      motivo.push("sin presupuesto definido");
    }

    const tokensDepto = new Set(
      `${d.nombre} ${d.codigo}`
        .toLowerCase()
        .split(/[^a-záéíóúñ0-9]+/i)
        .filter((t) => t.length >= 4)
    );
    const matchZona = [...tokensLead].some((t) => tokensDepto.has(t));
    if (matchZona) {
      pct += 30;
      motivo.push("zona/servicio coinciden");
    } else if (tokensLead.size > 0) {
      pct += 8;
    }

    pct += 10;
    return {
      departamentoId: d.id,
      codigo: d.codigo,
      nombre: d.nombre,
      numero: d.numero,
      piso: d.piso,
      total,
      pct: Math.min(100, pct),
      motivo,
    };
  });

  return scored.sort((a, b) => b.pct - a.pct).slice(0, 6);
}

/** Carga datos y produce score + matches para un lead. */
export async function inteligenciaLead(
  db: Db,
  schema: Schema,
  leadId: string
): Promise<Inteligencia | null> {
  const [leadRow] = await db
    .select()
    .from(schema.leads)
    .where(eq(schema.leads.id, leadId))
    .limit(1);
  if (!leadRow) return null;

  const lead: LeadParaScore = {
    id: leadRow.id,
    etapa: leadRow.etapa,
    monto: Number(leadRow.monto),
    asignadoA: leadRow.asignadoA,
    tags: Array.isArray(leadRow.tags) ? (leadRow.tags as unknown[]).map(String) : [],
    venceEl: leadRow.venceEl ?? null,
    servicio: leadRow.servicio,
    updatedAt: leadRow.updatedAt ?? null,
  };

  const [msgs, dptos, ocupantes, separados, contratosVig] = await Promise.all([
    db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .innerJoin(schema.conversations, eq(schema.messages.conversationId, schema.conversations.id))
      .where(and(eq(schema.conversations.leadId, lead.id), eq(schema.messages.direccion, "INBOUND")))
      .limit(1),
    db
      .select()
      .from(schema.departments)
      .where(eq(schema.departments.activo, true)),
    db
      .select({ departamentoId: schema.contracts.departamentoId })
      .from(schema.contracts)
      .where(inArray(schema.contracts.estado, ["EMITIDO", "PENDIENTE_FIRMA", "FIRMADO", "NOTARIADO"])),
    db.select({ departamentoId: schema.separations.departamentoId }).from(schema.separations),
    db
      .select({
        departamentoId: schema.contracts.departamentoId,
        fechaInicio: schema.contracts.fechaInicio,
        fechaFin: schema.contracts.fechaFin,
      })
      .from(schema.contracts)
      .where(inArray(schema.contracts.estado, ["FIRMADO", "NOTARIADO"])),
  ]);

  const hoy = new Date().toISOString().slice(0, 10);
  const ocupadoHoy = (deptoId: string) =>
    // contrato en curso hoy (FIRMADO/NOTARIADO) o pipeline (EMITIDO/PEND_FIRMA)
    contratosVig.some(
      (c) =>
        c.departamentoId === deptoId &&
        String(c.fechaInicio).slice(0, 10) <= hoy &&
        String(c.fechaFin).slice(0, 10) >= hoy
    ) ||
    ocupantes.some((o) => o.departamentoId === deptoId) ||
    separados.some((s) => s.departamentoId === deptoId);

  const libres = dptos.filter((d) => !ocupadoHoy(d.id));

  const { score, señales } = calcularScore(lead, msgs.length > 0);
  return {
    score,
    tier: tierDeScore(score),
    señales,
    matches: rankearDepartamentos(lead, libres.map((d) => ({
      id: d.id,
      codigo: d.codigo,
      nombre: d.nombre,
      numero: d.numero,
      piso: d.piso,
      precio: d.precio,
      mantenimiento: d.mantenimiento,
    }))),
  };
}

export { sql };
