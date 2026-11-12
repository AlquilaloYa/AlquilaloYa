import { and, eq, inArray } from "drizzle-orm";

export type EventoContrato = "REVISION" | "LIMPIEZA" | "CHECKIN" | "CHECKOFF";

type CargoDiasExtras = {
  fechaFinPeriodo: string | Date;
  dias: number;
};

function fechaIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

export function calcularFechaCheckOut(
  fechaFinPeriodo: string,
  cargos: CargoDiasExtras[],
): { fecha: string; diasExtras: number } {
  const diasExtras = cargos
    .filter((cargo) => fechaIso(cargo.fechaFinPeriodo) === fechaFinPeriodo)
    .reduce((total, cargo) => total + cargo.dias, 0);
  const fecha = new Date(`${fechaFinPeriodo}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + diasExtras);
  return { fecha: fecha.toISOString().slice(0, 10), diasExtras };
}

function fechaMediodia(iso: string): Date | null {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00-05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fechaEnLima(value: Date | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function shiftDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Crea/actualiza en Work 123 las tareas automaticas derivadas de un contrato:
 * - Revisión previa: 2 dias antes del inicio
 * - Limpieza: 1 dia antes del inicio
 * - Revisión (check out): el dia del fin de contrato
 * Idempotente: si las fechas del contrato cambian, las tareas se mueven; si el
 * usuario ya las resolvio, no se tocan su estado ni su asignado.
 */
export async function sincronizarTareasContrato(
  contractId: string,
  createdByUserId?: string,
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
  const finPeriodo = String(c.fechaFin).slice(0, 10);
  const cargosDiasExtras = await db
    .select({
      fechaFinPeriodo: schema.diasExtras.fechaFinPeriodo,
      dias: schema.diasExtras.dias,
    })
    .from(schema.diasExtras)
    .where(eq(schema.diasExtras.contractId, contractId));
  const checkout = calcularFechaCheckOut(finPeriodo, cargosDiasExtras);
  const fin = checkout.fecha;
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
      kind: "CHECKIN",
      fecha: inicio,
      titulo: `Check-in ${depto} · ${c.codigoContrato}`,
      detalle: `Check-in del departamento el día de inicio del contrato (${inicio})`,
    },
    {
      kind: "CHECKOFF",
      fecha: fin,
      titulo: `Check out ${depto} · ${c.codigoContrato}`,
      detalle: checkout.diasExtras
        ? `Check out del departamento al terminar ${checkout.diasExtras} día(s) extra, el ${fin}`
        : `Check out del departamento el día del fin de contrato (${fin})`,
    },
  ];

  const existentes = await db
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.origenContratoId, contractId),
        inArray(schema.tasks.origenEvento, ["REVISION", "LIMPIEZA", "CHECKIN", "CHECKOFF"])
      )
    );

  let creadas = 0;
  let actualizadas = 0;
  const nuevas: Array<typeof schema.tasks.$inferInsert> = [];
  const actualizaciones: Array<{
    id: string;
    patch: {
      fechaLimite?: Date;
      titulo?: string;
      descripcion?: string;
      estado?: string;
      completedAt?: Date | null;
      updatedAt: Date;
    };
  }> = [];
  for (const ev of eventos) {
    const limite = fechaMediodia(ev.fecha);
    if (!limite) continue;
    const descripcion = `Contrato ${c.codigoContrato} · Cliente: ${cliente} · ${depto} · ${ev.detalle}. Generada automáticamente por AlquilaYa ERP.`;
    const prev = existentes.find((t) => t.origenEvento === ev.kind);
    if (!prev) {
      nuevas.push({
        titulo: ev.titulo,
        descripcion,
        asignadoA: "",
        createdByUserId: createdByUserId ?? null,
        horaEjecucion: "09:00",
        repetirCadaHora: ev.kind === "CHECKOFF",
        fechaLimite: limite,
        estado: "PENDIENTE",
        creadoPor: "Sistema (contrato)",
        origenTipo: "CONTRATO",
        origenContratoId: contractId,
        origenEvento: ev.kind,
      });
      continue;
    }
    const patch: {
      fechaLimite?: Date;
      titulo?: string;
      descripcion?: string;
      estado?: string;
      completedAt?: Date | null;
      createdByUserId?: string;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    let toco = false;
    if (!prev.createdByUserId && createdByUserId) {
      patch.createdByUserId = createdByUserId;
      toco = true;
    }
    if (fechaEnLima(prev.fechaLimite) !== ev.fecha) {
      patch.fechaLimite = limite;
      toco = true;
      if (ev.kind === "CHECKOFF" && prev.estado === "RESUELTA") {
        patch.estado = "PENDIENTE";
        patch.completedAt = null;
      }
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
      actualizaciones.push({ id: prev.id, patch });
    }
  }
  if (nuevas.length > 0) {
    await db.insert(schema.tasks).values(nuevas).onConflictDoNothing();
    creadas = nuevas.length;
  }
  await Promise.all(
    actualizaciones.map(({ id, patch }) =>
      db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, id))
    )
  );
  actualizadas = actualizaciones.length;
  return { creadas, actualizadas };
}
