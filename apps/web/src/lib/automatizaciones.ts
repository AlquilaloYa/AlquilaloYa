import { and, eq, inArray, like, lt, sql } from "drizzle-orm";
import { EVENTOS, type EventoRegla } from "./automatizaciones-shared";

export { EVENTOS, type EventoRegla } from "./automatizaciones-shared";

export interface ResultadoRegla {
  ruleId: string;
  nombre: string;
  evaluados: number;
  creadas: number;
}

function yMD(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtCorto(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Evalúa todas las reglas activas. Idempotente: no duplica tareas abiertas. */
export async function evaluarReglas(
  fuente: "MANUAL" | "CRON"
): Promise<ResultadoRegla[]> {
  const dbModule = await import("@contract/db");
  const { db, schema } = dbModule as {
    db: typeof import("@contract/db").db;
    schema: typeof import("@contract/db").schema;
  };

  const rules = await db
    .select()
    .from(schema.automationRules)
    .where(eq(schema.automationRules.activa, true));

  const now = new Date();
  const resultados: ResultadoRegla[] = [];

  for (const rule of rules) {
    const params = (rule.params ?? {}) as Record<string, number>;
    const acciones = Array.isArray(rule.acciones) ? (rule.acciones as Array<{ tipo?: string; asignadoA?: string }>) : [];
    let creadas = 0;
    let evaluados = 0;

    type Candidato = { id: string; titulo: string; descripcion: string; fechaLimite: Date; asignado: string };
    let candidatos: Candidato[] = [];

    if (rule.evento === "LEAD_VENCE") {
      const dias = Math.max(0, params.dias ?? 2);
      const hasta = new Date(now.getTime() + dias * 86_400_000);
      const desde = new Date(now.getTime() - 30 * 86_400_000);
      const rows = await db
        .select()
        .from(schema.leads)
        .where(
          and(
            sql`${schema.leads.venceEl} is not null`,
            sql`${schema.leads.venceEl} <= ${yMD(hasta)}`,
            sql`${schema.leads.venceEl} >= ${yMD(desde)}`,
            sql`${schema.leads.etapa} not in ('GANADO','PERDIDO')`
          )
        );
      evaluados = rows.length;
      candidatos = rows.map((l) => ({
        id: l.id,
        titulo: `Vence en ${dias}d: ${l.nombre} ${l.apellido} (${l.servicio || "seguimiento"})`,
        descripcion: `Automatización «${rule.nombre}»: el lead ${l.nombre} ${l.apellido} tiene seguimiento/vencimiento el ${fmtCorto(String(l.venceEl))}. Canal: ${l.canal}.`,
        fechaLimite: new Date(`${String(l.venceEl).slice(0, 10)}T12:00:00`),
        asignado: l.asignadoA,
      }));
    } else if (rule.evento === "LEAD_INACTIVO") {
      const dias = Math.max(1, params.dias ?? 5);
      const corte = new Date(now.getTime() - dias * 86_400_000);
      const rows = await db
        .select()
        .from(schema.leads)
        .where(
          and(
            inArray(schema.leads.etapa, ["ENTRANTE", "DECISION"]),
            lt(schema.leads.updatedAt, corte)
          )
        );
      evaluados = rows.length;
      candidatos = rows.map((l) => ({
        id: l.id,
        titulo: `Lead inactivo ${dias}d+: ${l.nombre} ${l.apellido}`,
        descripcion: `Automatización «${rule.nombre}»: sin actividad hace más de ${dias} días en etapa ${l.etapa}. Contactar por ${l.canal}.`,
        fechaLimite: new Date(now.getTime() + 86_400_000),
        asignado: l.asignadoA,
      }));
    } else if (rule.evento === "CONV_SIN_RESPUESTA") {
      const horas = Math.max(1, params.horas ?? 8);
      const corte = new Date(now.getTime() - horas * 3_600_000);
      const rows = await db
        .select()
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.estado, "ABIERTA"),
            sql`${schema.conversations.noLeidos} > 0`,
            sql`${schema.conversations.ultimoMensajeEn} < ${corte.toISOString()}`
          )
        );
      evaluados = rows.length;
      candidatos = rows.map((c) => ({
        id: c.id,
        titulo: `Responder a ${c.contactoNombre || "contacto"} (${c.canal})`,
        descripcion: `Automatización «${rule.nombre}»: ${c.noLeidos} mensaje(s) sin responder hace más de ${horas} h.`,
        fechaLimite: new Date(now.getTime() + 4 * 3_600_000),
        asignado: c.asignadoA,
      }));
    } else {
      continue;
    }

    for (const cand of candidatos) {
      const marker = `#auto-${rule.id.slice(0, 8)}-${cand.id.slice(0, 8)}`;
      const abiertas = await db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(and(like(schema.tasks.titulo, `%${marker}%`), sql`${schema.tasks.estado} <> 'RESUELTA'`))
        .limit(1);
      if (abiertas.length > 0) continue;
      await db.insert(schema.tasks).values({
        titulo: `${cand.titulo} ${marker}`,
        descripcion: cand.descripcion,
        asignadoA: acciones.find((a) => a.tipo === "CREATE_TASK")?.asignadoA || cand.asignado,
        fechaLimite: cand.fechaLimite,
        estado: "PENDIENTE",
        creadoPor: `Automatización (${rule.nombre})`,
        origenTipo: "MANUAL",
      });
      creadas += 1;
    }

    await db.insert(schema.automationRuns).values({
      ruleId: rule.id,
      fuente,
      detalle: { evaluados, creadas, en: now.toISOString() },
    });
    resultados.push({ ruleId: rule.id, nombre: rule.nombre, evaluados, creadas });
  }

  return resultados;
}
