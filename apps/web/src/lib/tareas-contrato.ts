import { and, eq, inArray } from "drizzle-orm";

export type EventoContrato = "REVISION" | "LIMPIEZA" | "CHECKOFF";

function fechaMediodia(iso: string): Date | null {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function shiftDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + dias);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Crea/actualiza en Work 123 las tareas automaticas derivadas de un contrato:
 * - Revisión previa: 2 dias antes del inicio
 * - Limpieza: 1 dia antes del inicio
 * - Check off: el dia del fin de contrato
 * Idempotente: si las fechas del contrato cambian, las tareas se mueven; si el
 * usuario ya las resolvio, no se tocan su estado ni su asignado.
 */
export async function sincronizarTareasContrato(
  contractId: string
): Promise<{ creadas: number; actualizadas: number }> {
  const dbModule = await import("@contract/db");
  const { db, schema } = dbModule as {
    db: typeof import("@contract/db").db;
    schema: typeof import("@contract/db").schema;
  };

  const [c] = await db
    .select({
      codigoContrato: schema.contracts.codigoContrato,
      fechaInicio: schema.contracts.fechaInicio,
      fechaFin: schema.contracts.fechaFin,
      clienteNombre: schema.clients.nombres,
      clienteApellido: schema.clients.apellidos,
      deptCodigo: schema.departments.codigo,
      deptNumero: schema.departments.numero,
    })
    .from(schema.contracts)
    .leftJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
    .leftJoin(
      schema.departments,
      eq(schema.departments.id, schema.contracts.departamentoId)
    )
    .where(eq(schema.contracts.id, contractId));

  if (!c?.fechaInicio || !c?.fechaFin) return { creadas: 0, actualizadas: 0 };

  const inicio = String(c.fechaInicio).slice(0, 10);
  const fin = String(c.fechaFin).slice(0, 10);
  const cliente = `${c.clienteNombre ?? ""} ${c.clienteApellido ?? ""}`.trim() || "cliente";
  const depto = `Depto ${c.deptNumero || c.deptCodigo || "—"}`;

  const eventos: Array<{ kind: EventoContrato; fecha: string; titulo: string; detalle: string }> = [
    {
      kind: "REVISION",
      fecha: shiftDias(inicio, -2),
      titulo: `Revisión previa ${depto} · ${c.codigoContrato}`,
      detalle: `Revisión del departamento 2 días antes del inicio (${inicio})`,
    },
    {
      kind: "LIMPIEZA",
      fecha: shiftDias(inicio, -1),
      titulo: `Limpieza ${depto} · ${c.codigoContrato}`,
      detalle: `Limpieza 1 día antes del inicio (${inicio})`,
    },
    {
      kind: "CHECKOFF",
      fecha: fin,
      titulo: `Check off ${depto} · ${c.codigoContrato}`,
      detalle: `Revisión de check off el día del fin de contrato (${fin})`,
    },
  ];

  const existentes = await db
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.origenContratoId, contractId),
        inArray(schema.tasks.origenEvento, ["REVISION", "LIMPIEZA", "CHECKOFF"])
      )
    );

  let creadas = 0;
  let actualizadas = 0;
  for (const ev of eventos) {
    const limite = fechaMediodia(ev.fecha);
    if (!limite) continue;
    const descripcion = `Contrato ${c.codigoContrato} · Cliente: ${cliente} · ${depto} · ${ev.detalle}. Generada automáticamente por CP System ERP.`;
    const prev = existentes.find((t) => t.origenEvento === ev.kind);
    if (!prev) {
      await db.insert(schema.tasks).values({
        titulo: ev.titulo,
        descripcion,
        asignadoA: "",
        fechaLimite: limite,
        estado: "PENDIENTE",
        creadoPor: "Sistema (contrato)",
        origenTipo: "CONTRATO",
        origenContratoId: contractId,
        origenEvento: ev.kind,
      });
      creadas += 1;
      continue;
    }
    const patch: {
      fechaLimite?: Date;
      titulo?: string;
      descripcion?: string;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    let toco = false;
    if (prev.fechaLimite?.getTime() !== limite.getTime()) {
      patch.fechaLimite = limite;
      toco = true;
    }
    if (prev.titulo !== ev.titulo) {
      patch.titulo = ev.titulo;
      toco = true;
    }
    if (prev.descripcion !== descripcion) {
      patch.descripcion = descripcion;
      toco = true;
    }
    if (toco) {
      await db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, prev.id));
      actualizadas += 1;
    }
  }
  return { creadas, actualizadas };
}
