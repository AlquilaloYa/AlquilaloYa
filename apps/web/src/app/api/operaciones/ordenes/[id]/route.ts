import { NextResponse } from "next/server";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { createSignedObjectUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

const NEXT_STATES: Record<string, string[]> = {
  CREATED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["ACCEPTED", "REASSIGNED", "REJECTED", "BLOCKED", "CANCELLED"],
  REASSIGNED: ["ACCEPTED", "REASSIGNED", "REJECTED", "BLOCKED", "CANCELLED"],
  ACCEPTED: ["VISIT_SCHEDULED", "REASSIGNED", "BLOCKED", "CANCELLED"],
  VISIT_SCHEDULED: [
    "ON_SITE",
    "RESCHEDULED",
    "REASSIGNED",
    "BLOCKED",
    "CANCELLED",
  ],
  RESCHEDULED: [
    "VISIT_SCHEDULED",
    "ON_SITE",
    "REASSIGNED",
    "BLOCKED",
    "CANCELLED",
  ],
  ON_SITE: ["DIAGNOSIS", "REASSIGNED", "BLOCKED"],
  DIAGNOSIS: [
    "VISIT_SCHEDULED",
    "ESTIMATED",
    "IN_PROGRESS",
    "REASSIGNED",
    "BLOCKED",
  ],
  ESTIMATED: [
    "VISIT_SCHEDULED",
    "IN_PROGRESS",
    "REASSIGNED",
    "BLOCKED",
    "CANCELLED",
  ],
  IN_PROGRESS: ["VISIT_SCHEDULED", "RESOLVED", "REASSIGNED", "BLOCKED"],
  RESOLVED: ["PENDING_CLOSURE", "IN_PROGRESS", "REASSIGNED"],
  PENDING_CLOSURE: ["COMPLETED", "IN_PROGRESS", "REASSIGNED"],
  BLOCKED: ["ASSIGNED", "REASSIGNED", "CANCELLED"],
  REJECTED: ["ASSIGNED", "REASSIGNED", "CANCELLED"],
  CANCELLED: [],
  COMPLETED: [],
};
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UpdateBody = {
  status?: unknown;
  assignedEmployeeId?: unknown;
  scheduledAt?: unknown;
  diagnosis?: unknown;
  resolution?: unknown;
  estimatedCost?: unknown;
  estimatedMinutes?: unknown;
  actualCost?: unknown;
  actualMinutes?: unknown;
  note?: unknown;
};

function parseMetric(
  value: unknown,
  wholeNumber = false,
): string | null | false {
  if (value === undefined) return null;
  if (value === null || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return false;
  const parsed = typeof value === "number" ? value : Number(value);
  const max = wholeNumber ? 99_999_999 : 9_999_999_999.99;
  return Number.isFinite(parsed) &&
    parsed >= 0 &&
    parsed <= max &&
    (!wholeNumber || Number.isInteger(parsed))
    ? String(parsed)
    : false;
}

function parseDate(value: unknown): Date | null | false {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? false : parsed;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(
      auth.user.role,
      Permission.WORK_ORDER_READ,
    );
    if (denied) return denied;

    const { db, schema } = dbModule;
    if (!UUID_PATTERN.test(params.id)) {
      return NextResponse.json(
        { error: "Identificador de orden no válido" },
        { status: 400 },
      );
    }
    const [order] = await db
      .select()
      .from(schema.workOrders)
      .where(eq(schema.workOrders.id, params.id))
      .limit(1);
    if (!order)
      return NextResponse.json(
        { error: "Orden de trabajo no encontrada" },
        { status: 404 },
      );
    if (auth.user.role === "ASISTENTE_ADMINISTRATIVO") {
      const [employee] = await db
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
        return NextResponse.json(
          { error: "Orden de trabajo no encontrada" },
          { status: 404 },
        );
      }
    }

    const [events, visits, assignments, attachments] = await Promise.all([
      db
        .select()
        .from(schema.workOrderEvents)
        .where(eq(schema.workOrderEvents.workOrderId, params.id))
        .orderBy(desc(schema.workOrderEvents.createdAt)),
      db
        .select()
        .from(schema.workOrderVisits)
        .where(eq(schema.workOrderVisits.workOrderId, params.id))
        .orderBy(desc(schema.workOrderVisits.visitNumber)),
      db
        .select({
          id: schema.workOrderAssignments.id,
          employeeId: schema.workOrderAssignments.employeeId,
          assignedAt: schema.workOrderAssignments.assignedAt,
          endedAt: schema.workOrderAssignments.endedAt,
          note: schema.workOrderAssignments.note,
          name: schema.hrEmployees.nombres,
          surname: schema.hrEmployees.apellidos,
        })
        .from(schema.workOrderAssignments)
        .leftJoin(
          schema.hrEmployees,
          eq(schema.workOrderAssignments.employeeId, schema.hrEmployees.id),
        )
        .where(eq(schema.workOrderAssignments.workOrderId, params.id))
        .orderBy(desc(schema.workOrderAssignments.assignedAt)),
      db
        .select()
        .from(schema.workOrderAttachments)
        .where(eq(schema.workOrderAttachments.workOrderId, params.id))
        .orderBy(desc(schema.workOrderAttachments.createdAt)),
    ]);
    const evidence = await Promise.all(
      attachments.map(async (attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: Number(attachment.sizeBytes),
        createdAt: attachment.createdAt,
        url: await createSignedObjectUrl(
          attachment.storageKey,
          "work-order-evidence",
        ),
      })),
    );

    return NextResponse.json({
      ...order,
      events,
      visits,
      assignments: assignments.map((assignment) => ({
        ...assignment,
        name: [assignment.name, assignment.surname].filter(Boolean).join(" "),
      })),
      attachments: evidence,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No se pudo cargar la orden",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(
      auth.user.role,
      Permission.WORK_ORDER_UPDATE,
    );
    if (denied) return denied;

    let body: UpdateBody;
    try {
      body = (await req.json()) as UpdateBody;
    } catch {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es JSON válido" },
        { status: 400 },
      );
    }

    const { db, schema } = dbModule;
    if (!UUID_PATTERN.test(params.id)) {
      return NextResponse.json(
        { error: "Identificador de orden no válido" },
        { status: 400 },
      );
    }
    const [current] = await db
      .select()
      .from(schema.workOrders)
      .where(eq(schema.workOrders.id, params.id))
      .limit(1);
    if (!current)
      return NextResponse.json(
        { error: "Orden de trabajo no encontrada" },
        { status: 404 },
      );
    if (auth.user.role === "ASISTENTE_ADMINISTRATIVO") {
      const [employee] = await db
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
      if (!employee || current.assignedEmployeeId !== employee.id) {
        return NextResponse.json(
          { error: "Orden de trabajo no encontrada" },
          { status: 404 },
        );
      }
    }

    const scheduledAt = parseDate(body.scheduledAt);
    const estimatedCost = parseMetric(body.estimatedCost);
    const estimatedMinutes = parseMetric(body.estimatedMinutes, true);
    const actualCost = parseMetric(body.actualCost);
    const actualMinutes = parseMetric(body.actualMinutes, true);
    if (scheduledAt === false)
      return NextResponse.json(
        { error: "La fecha de visita no es válida" },
        { status: 400 },
      );
    if (
      estimatedCost === false ||
      estimatedMinutes === false ||
      actualCost === false ||
      actualMinutes === false
    ) {
      return NextResponse.json(
        {
          error:
            "El costo y el tiempo deben ser números iguales o mayores a cero",
        },
        { status: 400 },
      );
    }

    const diagnosis =
      typeof body.diagnosis === "string" ? body.diagnosis.trim() : undefined;
    const resolution =
      typeof body.resolution === "string" ? body.resolution.trim() : undefined;
    const note =
      typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
    if (
      (body.diagnosis !== undefined && typeof body.diagnosis !== "string") ||
      (body.resolution !== undefined && typeof body.resolution !== "string") ||
      (body.note !== undefined && typeof body.note !== "string")
    ) {
      return NextResponse.json(
        { error: "El diagnóstico, la resolución y la nota deben ser texto" },
        { status: 400 },
      );
    }
    if ((diagnosis?.length ?? 0) > 10000 || (resolution?.length ?? 0) > 10000) {
      return NextResponse.json(
        { error: "El diagnóstico o la resolución supera el límite permitido" },
        { status: 400 },
      );
    }

    let assignedEmployeeId = current.assignedEmployeeId;
    let assignee: { id: string; name: string } | null = null;
    const hasAssigneeChange =
      body.assignedEmployeeId !== undefined &&
      body.assignedEmployeeId !== current.assignedEmployeeId;
    if (
      hasAssigneeChange &&
      ["COMPLETED", "CANCELLED"].includes(current.status)
    ) {
      return NextResponse.json(
        { error: "No se puede cambiar la asignación de una orden cerrada" },
        { status: 409 },
      );
    }
    if (
      hasAssigneeChange &&
      current.assignedEmployeeId &&
      (body.assignedEmployeeId === null || body.assignedEmployeeId === "")
    ) {
      return NextResponse.json(
        {
          error:
            "Reasigna la orden a otro trabajador en lugar de dejarla sin responsable",
        },
        { status: 400 },
      );
    }
    if (
      hasAssigneeChange &&
      body.assignedEmployeeId !== null &&
      body.assignedEmployeeId !== ""
    ) {
      if (
        typeof body.assignedEmployeeId !== "string" ||
        !UUID_PATTERN.test(body.assignedEmployeeId)
      ) {
        return NextResponse.json(
          { error: "El trabajador asignado no es válido" },
          { status: 400 },
        );
      }
      const [employee] = await db
        .select({
          id: schema.hrEmployees.id,
          nombres: schema.hrEmployees.nombres,
          apellidos: schema.hrEmployees.apellidos,
        })
        .from(schema.hrEmployees)
        .where(
          and(
            eq(schema.hrEmployees.id, body.assignedEmployeeId),
            eq(schema.hrEmployees.estado, "ACTIVO"),
            isNull(schema.hrEmployees.deletedAt),
            or(
              ilike(schema.hrEmployees.area, "%manten%"),
              ilike(schema.hrEmployees.cargo, "%manten%"),
              ilike(schema.hrEmployees.equipo, "%manten%"),
            ),
          ),
        )
        .limit(1);
      if (!employee)
        return NextResponse.json(
          {
            error:
              "Solo se puede asignar personal activo del área de mantenimiento",
          },
          { status: 400 },
        );
      assignee = {
        id: employee.id,
        name: `${employee.nombres} ${employee.apellidos}`.trim(),
      };
      assignedEmployeeId = employee.id;
    } else if (hasAssigneeChange) {
      assignedEmployeeId = null;
    }

    let nextStatus =
      typeof body.status === "string" ? body.status : current.status;
    if (hasAssigneeChange && body.status === undefined) {
      nextStatus = assignedEmployeeId
        ? current.assignedEmployeeId
          ? "REASSIGNED"
          : "ASSIGNED"
        : current.status;
    }
    if (scheduledAt && body.status === undefined)
      nextStatus = "VISIT_SCHEDULED";
    if (
      body.status !== undefined &&
      (typeof body.status !== "string" ||
        !Object.prototype.hasOwnProperty.call(NEXT_STATES, body.status))
    ) {
      return NextResponse.json(
        { error: "El estado indicado no es válido" },
        { status: 400 },
      );
    }
    if (
      nextStatus !== current.status &&
      !NEXT_STATES[current.status]?.includes(nextStatus)
    ) {
      return NextResponse.json(
        { error: `No se permite cambiar de ${current.status} a ${nextStatus}` },
        { status: 409 },
      );
    }
    if (nextStatus === "ASSIGNED" && !assignedEmployeeId) {
      return NextResponse.json(
        { error: "Asigna un trabajador antes de asignar la orden" },
        { status: 400 },
      );
    }
    if (
      nextStatus === "VISIT_SCHEDULED" &&
      !scheduledAt &&
      current.status !== "VISIT_SCHEDULED"
    ) {
      return NextResponse.json(
        { error: "Indica la fecha y hora de la visita" },
        { status: 400 },
      );
    }
    if (nextStatus === "DIAGNOSIS" && !diagnosis && !current.diagnosis) {
      return NextResponse.json(
        { error: "Registra el diagnóstico antes de continuar" },
        { status: 400 },
      );
    }
    if (nextStatus === "RESOLVED" && !resolution && !current.resolution) {
      return NextResponse.json(
        { error: "Registra la resolución antes de marcarla resuelta" },
        { status: 400 },
      );
    }
    if (nextStatus === "COMPLETED" && !resolution && !current.resolution) {
      return NextResponse.json(
        { error: "Una orden debe tener resolución antes de cerrarse" },
        { status: 400 },
      );
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      if (hasAssigneeChange) {
        await tx
          .update(schema.workOrderAssignments)
          .set({ endedAt: now })
          .where(
            and(
              eq(schema.workOrderAssignments.workOrderId, params.id),
              isNull(schema.workOrderAssignments.endedAt),
            ),
          );
        if (assignedEmployeeId) {
          await tx.insert(schema.workOrderAssignments).values({
            workOrderId: params.id,
            employeeId: assignedEmployeeId,
            assignedBy: auth.user.id,
            note,
            assignedAt: now,
          });
        }
        await tx.insert(schema.workOrderEvents).values({
          workOrderId: params.id,
          actorId: auth.user.id,
          actorName: auth.user.name,
          eventType: "ASSIGNMENT_CHANGED",
          fromStatus: current.status,
          toStatus: nextStatus,
          details: {
            employeeId: assignedEmployeeId,
            employeeName: assignee?.name ?? null,
            note,
          },
          createdAt: now,
        });
      }

      if (scheduledAt) {
        const [lastVisit] = await tx
          .select({ visitNumber: schema.workOrderVisits.visitNumber })
          .from(schema.workOrderVisits)
          .where(eq(schema.workOrderVisits.workOrderId, params.id))
          .orderBy(desc(schema.workOrderVisits.visitNumber))
          .limit(1);
        const visitNumber = lastVisit ? Number(lastVisit.visitNumber) + 1 : 1;
        await tx.insert(schema.workOrderVisits).values({
          workOrderId: params.id,
          visitNumber: String(visitNumber),
          scheduledAt,
          createdBy: auth.user.id,
        });
      }

      if (nextStatus === "ON_SITE") {
        const [visit] = await tx
          .select({ id: schema.workOrderVisits.id })
          .from(schema.workOrderVisits)
          .where(
            and(
              eq(schema.workOrderVisits.workOrderId, params.id),
              isNull(schema.workOrderVisits.arrivedAt),
              isNull(schema.workOrderVisits.completedAt),
            ),
          )
          .orderBy(desc(schema.workOrderVisits.visitNumber))
          .limit(1);
        if (!visit)
          throw new Error("Programa una visita antes de confirmar la llegada");
        await tx
          .update(schema.workOrderVisits)
          .set({ arrivedAt: now })
          .where(eq(schema.workOrderVisits.id, visit.id));
      }

      const update: Partial<typeof schema.workOrders.$inferInsert> = {
        status: nextStatus,
        assignedEmployeeId,
        updatedAt: now,
      };
      if (diagnosis !== undefined) update.diagnosis = diagnosis;
      if (resolution !== undefined) update.resolution = resolution;
      if (estimatedCost !== null) update.estimatedCost = estimatedCost;
      if (estimatedMinutes !== null) update.estimatedMinutes = estimatedMinutes;
      if (actualCost !== null) update.actualCost = actualCost;
      if (actualMinutes !== null) update.actualMinutes = actualMinutes;
      if (nextStatus === "COMPLETED") update.completedAt = now;
      const [saved] = await tx
        .update(schema.workOrders)
        .set(update)
        .where(
          and(
            eq(schema.workOrders.id, params.id),
            eq(schema.workOrders.updatedAt, current.updatedAt),
          ),
        )
        .returning({ id: schema.workOrders.id });
      if (!saved) {
        throw new Error(
          "La orden cambió mientras la actualizabas. Recarga e inténtalo de nuevo.",
        );
      }

      if (
        diagnosis !== undefined ||
        resolution !== undefined ||
        nextStatus === "COMPLETED"
      ) {
        const [visit] = await tx
          .select({ id: schema.workOrderVisits.id })
          .from(schema.workOrderVisits)
          .where(
            and(
              eq(schema.workOrderVisits.workOrderId, params.id),
              isNull(schema.workOrderVisits.completedAt),
            ),
          )
          .orderBy(desc(schema.workOrderVisits.visitNumber))
          .limit(1);
        if (visit) {
          await tx
            .update(schema.workOrderVisits)
            .set({
              ...(diagnosis !== undefined ? { diagnosis } : {}),
              ...(resolution !== undefined ? { resolution } : {}),
              ...(nextStatus === "COMPLETED" ? { completedAt: now } : {}),
            })
            .where(eq(schema.workOrderVisits.id, visit.id));
        }
      }

      if (nextStatus !== current.status) {
        await tx.insert(schema.workOrderEvents).values({
          workOrderId: params.id,
          actorId: auth.user.id,
          actorName: auth.user.name,
          eventType: "STATUS_CHANGED",
          fromStatus: current.status,
          toStatus: nextStatus,
          details: {
            note,
            scheduledAt: scheduledAt?.toISOString() ?? null,
          },
          createdAt: now,
        });
      }
    });

    const [updated] = await db
      .select()
      .from(schema.workOrders)
      .where(eq(schema.workOrders.id, params.id))
      .limit(1);
    return NextResponse.json(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo actualizar la orden";
    return NextResponse.json(
      { error: message },
      {
        status:
          message === "Programa una visita antes de confirmar la llegada" ||
          message ===
            "La orden cambió mientras la actualizabas. Recarga e inténtalo de nuevo."
            ? 409
            : 500,
      },
    );
  }
}