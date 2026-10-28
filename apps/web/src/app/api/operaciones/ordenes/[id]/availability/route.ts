import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { notificationRows } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const dbModule = await import("@contract/db");
  const auth = await requireUser(dbModule, request);
  if ("error" in auth) return auth.error;
  const denied = requirePermission(auth.user, Permission.WORK_ORDER_UPDATE);
  if (denied) return denied;
  if (!UUID_PATTERN.test(params.id)) {
    return NextResponse.json({ error: "Identificador no válido" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });
  }
  const optionIdValue =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).optionId
      : undefined;
  if (typeof optionIdValue !== "string" || !UUID_PATTERN.test(optionIdValue)) {
    return NextResponse.json({ error: "Selecciona una opción válida" }, { status: 400 });
  }
  const optionId = optionIdValue;
  const { db, schema } = dbModule;

  try {
    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .select({
          id: schema.workOrders.id,
          code: schema.workOrders.code,
          title: schema.workOrders.title,
          status: schema.workOrders.status,
          clientId: schema.workOrders.clientId,
          assignedEmployeeId: schema.workOrders.assignedEmployeeId,
          createdBy: schema.workOrders.createdBy,
        })
        .from(schema.workOrders)
        .where(eq(schema.workOrders.id, params.id))
        .limit(1);
      if (!order) return { error: "Orden no encontrada", status: 404 as const };
      if (
        auth.user.role === "ASISTENTE_ADMINISTRATIVO" ||
        auth.user.role === "MANTENIMIENTO"
      ) {
        const [employee] = await tx
          .select({ id: schema.hrEmployees.id })
          .from(schema.hrEmployees)
          .where(
            and(
              eq(schema.hrEmployees.userId, auth.user.id),
              eq(schema.hrEmployees.estado, "ACTIVO"),
              isNull(schema.hrEmployees.deletedAt),
            ),
          )
          .limit(1);
        if (!employee || order.assignedEmployeeId !== employee.id) {
          return { error: "Orden no encontrada", status: 404 as const };
        }
      }
      if (order.status !== "ACCEPTED") {
        return {
          error: "La orden debe estar aceptada antes de confirmar el horario",
          status: 409 as const,
        };
      }

      const [option] = await tx
        .select()
        .from(schema.workOrderAvailabilityOptions)
        .where(
          and(
            eq(schema.workOrderAvailabilityOptions.id, optionId),
            eq(schema.workOrderAvailabilityOptions.workOrderId, order.id),
            isNull(schema.workOrderAvailabilityOptions.selectedAt),
          ),
        )
        .limit(1);
      if (!option) {
        return {
          error: "La opción ya fue confirmada o no pertenece a esta orden",
          status: 409 as const,
        };
      }

      const now = new Date();
      const [selected] = await tx
        .update(schema.workOrderAvailabilityOptions)
        .set({ selectedAt: now, selectedBy: auth.user.id })
        .where(
          and(
            eq(schema.workOrderAvailabilityOptions.id, option.id),
            isNull(schema.workOrderAvailabilityOptions.selectedAt),
          ),
        )
        .returning({ id: schema.workOrderAvailabilityOptions.id });
      if (!selected) {
        return { error: "La opción ya fue confirmada", status: 409 as const };
      }

      const [updated] = await tx
        .update(schema.workOrders)
        .set({
          status: "VISIT_SCHEDULED",
          targetAt: option.startsAt,
          arrivalWindowEnd: option.endsAt,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.workOrders.id, order.id),
            eq(schema.workOrders.status, "ACCEPTED"),
          ),
        )
        .returning({ id: schema.workOrders.id });
      if (!updated) {
        throw new Error("La orden cambió mientras se confirmaba el horario");
      }

      await tx.insert(schema.workOrderVisits).values({
        workOrderId: order.id,
        visitNumber: "1",
        scheduledAt: option.startsAt,
        arrivalWindowEnd: option.endsAt,
        isCustomerAppointment: false,
        customerName: "",
        createdBy: auth.user.id,
      });
      await tx.insert(schema.workOrderEvents).values({
        workOrderId: order.id,
        actorId: auth.user.id,
        actorName: auth.user.name,
        eventType: "CLIENT_AVAILABILITY_SELECTED",
        fromStatus: "ACCEPTED",
        toStatus: "VISIT_SCHEDULED",
        details: {
          optionNumber: option.optionNumber,
          scheduledAt: option.startsAt.toISOString(),
          arrivalWindowEnd: option.endsAt.toISOString(),
        },
        createdAt: now,
      });
      if (order.clientId) {
        const date = new Intl.DateTimeFormat("es-PE", {
          dateStyle: "long",
          timeZone: "America/Lima",
        }).format(option.startsAt);
        const time = new Intl.DateTimeFormat("es-PE", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/Lima",
        });
        await tx.insert(schema.clientPortalNotifications).values({
          clientId: order.clientId,
          workOrderId: order.id,
          type: "VISIT_CONFIRMED",
          title: "Confirmamos la fecha de tu visita",
          body: `La opción ${option.optionNumber} quedó confirmada para el ${date}, entre las ${time.format(option.startsAt)} y las ${time.format(option.endsAt)}.`,
          dedupeKey: `visit-confirmed:${option.id}`,
        });
      }
      if (order.createdBy) {
        await tx.insert(schema.notifications).values(
          notificationRows([order.createdBy], {
            type: "WORK_ORDER_UPDATE",
            title: "Visita de mantenimiento programada",
            body: `${order.code}: ${order.title}`,
            href: "/pedidos-clientes",
            entityType: "WORK_ORDER",
            entityId: order.id,
            dedupeKey: `work-order-availability-selected:${option.id}`,
          }),
        );
      }
      return { ok: true, status: 200 as const };
    });

    return "error" in result
      ? NextResponse.json({ error: result.error }, { status: result.status })
      : NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { error: "Ya se confirmó otra opción para esta orden" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo confirmar el horario" },
      { status: 500 },
    );
  }
}
