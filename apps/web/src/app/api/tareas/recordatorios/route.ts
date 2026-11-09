import { and, eq, gte, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { calcularFechaCheckOut } from "@/lib/tareas-contrato";
import { MAX_DIAS_EXTRAS } from "@/lib/dias-extras-policy";

export const dynamic = "force-dynamic";

function limaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule;
    const today = limaToday();
    const tomorrowDate = new Date(`${today}T12:00:00Z`);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const tomorrow = tomorrowDate.toISOString().slice(0, 10);
    const earliestCheckOutDate = new Date(`${today}T12:00:00Z`);
    earliestCheckOutDate.setUTCDate(earliestCheckOutDate.getUTCDate() - MAX_DIAS_EXTRAS);
    const earliestCheckOut = earliestCheckOutDate.toISOString().slice(0, 10);
    const contracts = await db
      .select({
        id: schema.contracts.id,
        codigo: schema.contracts.codigoContrato,
        fechaInicio: schema.contracts.fechaInicio,
        fechaFin: schema.contracts.fechaFin,
        contractId: schema.contracts.id,
        cliente: schema.clients.nombres,
        apellidos: schema.clients.apellidos,
        departamento: schema.departments.codigo,
        numero: schema.departments.numero,
      })
      .from(schema.contracts)
      .leftJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
      .leftJoin(schema.departments, eq(schema.departments.id, schema.contracts.departamentoId))
      .where(and(
        inArray(schema.contracts.estado, ["FIRMADO", "NOTARIADO", "ACTIVO", "VIGENTE"]),
        isNull(schema.contracts.eliminadoEn),
        or(
          eq(schema.contracts.fechaInicio, today),
          and(
            gte(schema.contracts.fechaFin, earliestCheckOut),
            lte(schema.contracts.fechaFin, today),
          ),
        ),
      ));

    const extras = contracts.length
      ? await db
          .select({
            contractId: schema.diasExtras.contractId,
            fechaFinPeriodo: schema.diasExtras.fechaFinPeriodo,
            dias: schema.diasExtras.dias,
          })
          .from(schema.diasExtras)
          .where(and(
            inArray(schema.diasExtras.contractId, contracts.map((contract) => contract.contractId)),
            gte(schema.diasExtras.fechaFinPeriodo, earliestCheckOut),
            lte(schema.diasExtras.fechaFinPeriodo, today),
          ))
      : [];

    const extrasPorContrato = new Map<string, typeof extras>();
    for (const extra of extras) {
      const contractExtras = extrasPorContrato.get(extra.contractId) ?? [];
      contractExtras.push(extra);
      extrasPorContrato.set(extra.contractId, contractExtras);
    }

    const tareasNuevas: Array<typeof schema.tasks.$inferInsert> = [];
    for (const contract of contracts) {
      const fechaInicio = String(contract.fechaInicio).slice(0, 10);
      const fechaFinPeriodo = String(contract.fechaFin).slice(0, 10);
      const checkout = calcularFechaCheckOut(
        fechaFinPeriodo,
        (extrasPorContrato.get(contract.contractId) ?? [])
          .map((extra) => ({
            fechaFinPeriodo: extra.fechaFinPeriodo,
            dias: extra.dias,
          })),
      );
      const contractEvents = [
        ...(fechaInicio === today ? [{
          kind: "CHECKIN",
          label: "Check-in",
          date: fechaInicio,
        }] : []),
        ...(checkout.fecha === today ? [{
          kind: "CHECKOFF",
          label: "Check-out",
          date: checkout.fecha,
        }] : []),
      ];
      for (const event of contractEvents) {
        tareasNuevas.push({
          titulo: `${event.label} ${contract.departamento || contract.numero || "departamento"} · ${contract.codigo}`,
          descripcion: `${event.label} de ${[contract.cliente, contract.apellidos].filter(Boolean).join(" ")}. Confirmar que se realizó hoy.`,
          asignadoA: "",
          fechaLimite: new Date(`${event.date}T12:00:00-05:00`),
          estado: "PENDIENTE",
          creadoPor: "Sistema (contrato)",
          origenTipo: "CONTRATO",
          origenContratoId: contract.id,
          origenEvento: event.kind,
        });
      }
    }
    for (let offset = 0; offset < tareasNuevas.length; offset += 500) {
      await db
        .insert(schema.tasks)
        .values(tareasNuevas.slice(offset, offset + 500))
        .onConflictDoNothing();
    }

    const reminders = await db
      .select({
        id: schema.tasks.id,
        titulo: schema.tasks.titulo,
        descripcion: schema.tasks.descripcion,
      })
      .from(schema.tasks)
      .where(and(
        inArray(schema.tasks.origenEvento, ["CHECKIN", "CHECKOFF"]),
        ne(schema.tasks.estado, "RESUELTA"),
        gte(schema.tasks.fechaLimite, new Date(`${today}T00:00:00-05:00`)),
        lt(schema.tasks.fechaLimite, new Date(`${tomorrow}T00:00:00-05:00`)),
      ));
    return NextResponse.json({ items: reminders });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar los recordatorios de Work 123" },
      { status: 500 },
    );
  }
}
