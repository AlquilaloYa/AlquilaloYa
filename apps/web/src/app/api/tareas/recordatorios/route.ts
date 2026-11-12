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

function fechaEnLima(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

type TareaContratoNueva = {
  titulo: string;
  descripcion: string;
  asignadoA: string;
  fechaLimite: Date;
  horaEjecucion: string;
  repetirCadaHora: boolean;
  createdByUserId: string;
  estado: string;
  creadoPor: string;
  origenTipo: string;
  origenContratoId: string;
  origenEvento: "CHECKIN" | "CHECKOFF";
};

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
    const dayAfterTomorrowDate = new Date(`${tomorrow}T12:00:00Z`);
    dayAfterTomorrowDate.setUTCDate(dayAfterTomorrowDate.getUTCDate() + 1);
    const dayAfterTomorrow = dayAfterTomorrowDate.toISOString().slice(0, 10);
    const dayThreeAfterDate = new Date(`${dayAfterTomorrow}T12:00:00Z`);
    dayThreeAfterDate.setUTCDate(dayThreeAfterDate.getUTCDate() + 1);
    const dayThreeAfter = dayThreeAfterDate.toISOString().slice(0, 10);
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
          and(
            gte(schema.contracts.fechaInicio, today),
            lte(schema.contracts.fechaInicio, dayAfterTomorrow),
          ),
          and(
            gte(schema.contracts.fechaFin, earliestCheckOut),
            lte(schema.contracts.fechaFin, dayAfterTomorrow),
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
            lte(schema.diasExtras.fechaFinPeriodo, dayAfterTomorrow),
          ))
      : [];

    const extrasPorContrato = new Map<string, typeof extras>();
    for (const extra of extras) {
      const contractExtras = extrasPorContrato.get(extra.contractId) ?? [];
      contractExtras.push(extra);
      extrasPorContrato.set(extra.contractId, contractExtras);
    }

    const tareasNuevas: TareaContratoNueva[] = [];
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
      const contractEvents: Array<{ kind: "CHECKIN" | "CHECKOFF"; label: string; date: string }> = [
        ...(fechaInicio >= today && fechaInicio <= dayAfterTomorrow ? [{
          kind: "CHECKIN" as const,
          label: "Check-in",
          date: fechaInicio,
        }] : []),
        ...(checkout.fecha >= today && checkout.fecha <= dayAfterTomorrow ? [{
          kind: "CHECKOFF" as const,
          label: "Check out",
          date: checkout.fecha,
        }] : []),
      ];
      for (const event of contractEvents) {
        tareasNuevas.push({
          titulo: `${event.label} ${contract.departamento || contract.numero || "departamento"} · ${contract.codigo}`,
          descripcion: `${event.label} de ${[contract.cliente, contract.apellidos].filter(Boolean).join(" ")}. Programado para el ${event.date}. Confirmar que se realizó.`,
          asignadoA: "",
          createdByUserId: auth.user.id,
          fechaLimite: new Date(`${event.date}T12:00:00-05:00`),
          horaEjecucion: "09:00",
          repetirCadaHora: true,
          estado: "PENDIENTE",
          creadoPor: "Sistema (contrato)",
          origenTipo: "CONTRATO",
          origenContratoId: contract.id,
          origenEvento: event.kind,
        });
      }
    }
    // El índice único (origen_contrato_id, origen_evento) permite una sola fila
    // por contrato y evento: si la fecha del check in/out cambió (p. ej. días
    // extras registrados después), se mueve la tarea en lugar de chocar con el
    // conflicto y dejar una fecha vencida.
    const contractIdsConEvento = [
      ...new Set(
        tareasNuevas
          .map((tarea) => tarea.origenContratoId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const existentes = contractIdsConEvento.length
      ? await db
          .select({
            id: schema.tasks.id,
            origenContratoId: schema.tasks.origenContratoId,
            origenEvento: schema.tasks.origenEvento,
            fechaLimite: schema.tasks.fechaLimite,
            estado: schema.tasks.estado,
            createdByUserId: schema.tasks.createdByUserId,
            repetirCadaHora: schema.tasks.repetirCadaHora,
          })
          .from(schema.tasks)
          .where(and(
            inArray(schema.tasks.origenContratoId, contractIdsConEvento),
            inArray(schema.tasks.origenEvento, ["CHECKIN", "CHECKOFF"]),
          ))
      : [];

    const tareasAInsertar: typeof tareasNuevas = [];
    for (const nueva of tareasNuevas) {
      const previa = existentes.find(
        (t) => t.origenContratoId === nueva.origenContratoId && t.origenEvento === nueva.origenEvento,
      );
      if (!previa) {
        tareasAInsertar.push(nueva);
        continue;
      }
      if (fechaEnLima(previa.fechaLimite) === fechaEnLima(nueva.fechaLimite)) continue;
      const patch: {
        fechaLimite?: Date;
        titulo?: string;
        descripcion?: string;
        estado?: string;
        completedAt?: null;
        createdByUserId?: string;
        repetirCadaHora?: boolean;
        updatedAt: Date;
      } = {
        fechaLimite: nueva.fechaLimite,
        titulo: nueva.titulo,
        descripcion: nueva.descripcion,
        updatedAt: new Date(),
      };
      if (nueva.origenEvento === "CHECKOFF" && previa.estado === "RESUELTA") {
        patch.estado = "PENDIENTE";
        patch.completedAt = null;
      }
      await db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, previa.id));
    }
    for (const task of existentes) {
      if (task.createdByUserId && task.repetirCadaHora) continue;
      await db
        .update(schema.tasks)
        .set({
          ...(!task.createdByUserId ? { createdByUserId: auth.user.id } : {}),
          repetirCadaHora: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.tasks.id, task.id));
    }
    for (let offset = 0; offset < tareasAInsertar.length; offset += 500) {
      await db
        .insert(schema.tasks)
        .values(tareasAInsertar.slice(offset, offset + 500))
        .onConflictDoNothing();
    }

    const reminders = await db
      .select({
        id: schema.tasks.id,
        titulo: schema.tasks.titulo,
        descripcion: schema.tasks.descripcion,
        fechaLimite: schema.tasks.fechaLimite,
        horaEjecucion: schema.tasks.horaEjecucion,
        origenEvento: schema.tasks.origenEvento,
      })
      .from(schema.tasks)
      .where(and(
        inArray(schema.tasks.origenEvento, ["CHECKIN", "CHECKOFF"]),
        ne(schema.tasks.estado, "RESUELTA"),
        or(
          and(
            eq(schema.tasks.origenEvento, "CHECKIN"),
            gte(schema.tasks.fechaLimite, new Date(`${today}T00:00:00-05:00`)),
            lt(schema.tasks.fechaLimite, new Date(`${dayThreeAfter}T00:00:00-05:00`)),
          ),
          and(
            eq(schema.tasks.origenEvento, "CHECKOFF"),
            gte(schema.tasks.fechaLimite, new Date(`${today}T00:00:00-05:00`)),
            lt(schema.tasks.fechaLimite, new Date(`${dayThreeAfter}T00:00:00-05:00`)),
          ),
        ),
      ));
    return NextResponse.json({ items: reminders });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar los recordatorios de Work 123" },
      { status: 500 },
    );
  }
}
