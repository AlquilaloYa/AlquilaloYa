import { randomUUID } from "node:crypto";
import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { logger } from "@/lib/logger";
import { sendUrgentWorkOrderPush } from "@/lib/fieldops-push";
import { notificationRows } from "@/lib/notifications";

export const dynamic = "force-dynamic";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIORITIES = ["BAJA", "MEDIA", "ALTA", "URGENTE"] as const;

type AvailabilityOption = { startsAt: Date; endsAt: Date };

function parseAvailability(value: unknown): AvailabilityOption[] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const options: AvailabilityOption[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (typeof row.startsAt !== "string" || typeof row.endsAt !== "string") return null;
    const startsAt = new Date(row.startsAt);
    const endsAt = new Date(row.endsAt);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt.getTime() <= startsAt.getTime()
    ) {
      return null;
    }
    options.push({ startsAt, endsAt });
  }
  return options;
}

function siteFromDepartmentCode(code: string): "Angamos" | "Benavides" | null {
  const normalized = code.trim().toUpperCase();
  if (normalized.startsWith("ANG170")) return "Angamos";
  if (normalized.startsWith("BEN2195")) return "Benavides";
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.WORK_ORDER_CREATE);
    if (denied) return denied;
    if (!UUID_PATTERN.test(params.id)) {
      return NextResponse.json({ error: "Identificador de solicitud no válido." }, { status: 400 });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
    }
    const bodyRecord =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const priorityValue = bodyRecord.priority ?? "MEDIA";
    const priority =
      typeof priorityValue === "string"
        ? PRIORITIES.find((candidate) => candidate === priorityValue)
        : undefined;
    if (!priority) {
      return NextResponse.json({ error: "La prioridad seleccionada no es válida." }, { status: 400 });
    }
    const assignedEmployeeIdValue = bodyRecord.assignedEmployeeId;
    if (
      assignedEmployeeIdValue !== undefined &&
      assignedEmployeeIdValue !== null &&
      assignedEmployeeIdValue !== "" &&
      (typeof assignedEmployeeIdValue !== "string" ||
        !UUID_PATTERN.test(assignedEmployeeIdValue))
    ) {
      return NextResponse.json({ error: "El trabajador asignado no es válido." }, { status: 400 });
    }
    const requestedEmployeeId =
      typeof assignedEmployeeIdValue === "string" && assignedEmployeeIdValue
        ? assignedEmployeeIdValue
        : null;

    const workOrderId = randomUUID();
    const now = new Date();
    const result = await dbModule.db.transaction(async (tx) => {
      const [requestRow] = await tx
        .select({
          id: dbModule.schema.clientWorkOrderRequests.id,
          clientId: dbModule.schema.clientWorkOrderRequests.clientId,
          departmentId: dbModule.schema.clientWorkOrderRequests.departmentId,
          issueType: dbModule.schema.issueTypes.name,
          description: dbModule.schema.clientWorkOrderRequests.description,
          customerPresentAtVisit:
            dbModule.schema.clientWorkOrderRequests.customerPresentAtVisit,
          availabilityOptions:
            dbModule.schema.clientWorkOrderRequests.availabilityOptions,
          status: dbModule.schema.clientWorkOrderRequests.status,
          clientName: sql<string>`trim(coalesce(${dbModule.schema.clients.nombres}, '') || ' ' || coalesce(${dbModule.schema.clients.apellidos}, ''))`,
          departmentCode: dbModule.schema.departments.codigo,
          departmentActive: dbModule.schema.departments.activo,
        })
        .from(dbModule.schema.clientWorkOrderRequests)
        .innerJoin(
          dbModule.schema.clients,
          eq(dbModule.schema.clients.id, dbModule.schema.clientWorkOrderRequests.clientId),
        )
        .innerJoin(
          dbModule.schema.issueTypes,
          eq(
            dbModule.schema.issueTypes.id,
            dbModule.schema.clientWorkOrderRequests.issueTypeId,
          ),
        )
        .leftJoin(
          dbModule.schema.departments,
          eq(dbModule.schema.departments.id, dbModule.schema.clientWorkOrderRequests.departmentId),
        )
        .where(eq(dbModule.schema.clientWorkOrderRequests.id, params.id))
        .for("update", { of: dbModule.schema.clientWorkOrderRequests });
      if (!requestRow) throw new Error("No se encontró la solicitud.");
      if (requestRow.status !== "PENDING") {
        throw new Error("Esta solicitud ya fue procesada.");
      }
      if (!requestRow.departmentId || !requestRow.departmentCode || !requestRow.departmentActive) {
        throw new Error("El departamento de la solicitud no está activo.");
      }
      const site = siteFromDepartmentCode(requestRow.departmentCode);
      if (!site) throw new Error("El departamento no está habilitado para órdenes de trabajo.");
      const availability = parseAvailability(requestRow.availabilityOptions);
      if (!availability) throw new Error("La solicitud no tiene opciones de disponibilidad válidas.");

      let assignee: {
        id: string;
        nombre: string;
        apellido: string;
        userId: string | null;
      } | null = null;
      if (requestedEmployeeId) {
        const [employee] = await tx
          .select({
            id: dbModule.schema.hrEmployees.id,
            nombre: dbModule.schema.hrEmployees.nombres,
            apellido: dbModule.schema.hrEmployees.apellidos,
            userId: dbModule.schema.hrEmployees.userId,
          })
          .from(dbModule.schema.hrEmployees)
          .where(
            and(
              eq(dbModule.schema.hrEmployees.id, requestedEmployeeId),
              eq(dbModule.schema.hrEmployees.estado, "ACTIVO"),
              isNull(dbModule.schema.hrEmployees.deletedAt),
              or(
                ilike(dbModule.schema.hrEmployees.area, "%manten%"),
                ilike(dbModule.schema.hrEmployees.cargo, "%manten%"),
                ilike(dbModule.schema.hrEmployees.equipo, "%manten%"),
              ),
            ),
          )
          .limit(1);
        if (!employee) {
          throw new Error("Solo se puede asignar personal activo del área de mantenimiento.");
        }
        assignee = employee;
      }

      const uploads = await tx
        .select({
          id: dbModule.schema.clientPortalUploads.id,
          storageKey: dbModule.schema.clientPortalUploads.storageKey,
          fileName: dbModule.schema.clientPortalUploads.fileName,
          mimeType: dbModule.schema.clientPortalUploads.mimeType,
          sizeBytes: dbModule.schema.clientPortalUploads.sizeBytes,
        })
        .from(dbModule.schema.clientPortalUploads)
        .where(
          and(
            eq(dbModule.schema.clientPortalUploads.requestId, requestRow.id),
            isNull(dbModule.schema.clientPortalUploads.workOrderId),
          ),
        );

      const [workOrder] = await tx
        .insert(dbModule.schema.workOrders)
        .values({
          id: workOrderId,
          code: `OT-${workOrderId.replace(/-/g, "").slice(0, 16).toUpperCase()}`,
          title: `Reporte: ${requestRow.issueType}`,
          description: requestRow.description,
          issueType: requestRow.issueType,
          priority,
          status: assignee ? "ASSIGNED" : "CREATED",
          location: site,
          contactName: requestRow.clientName,
          customerPresentAtVisit: requestRow.customerPresentAtVisit,
          site,
          departmentId: requestRow.departmentId,
          departmentCode: requestRow.departmentCode,
          clientId: requestRow.clientId,
          assignedEmployeeId: assignee?.id ?? null,
          createdBy: auth.user.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: dbModule.schema.workOrders.id,
          code: dbModule.schema.workOrders.code,
          title: dbModule.schema.workOrders.title,
          status: dbModule.schema.workOrders.status,
          createdAt: dbModule.schema.workOrders.createdAt,
        });
      if (!workOrder) throw new Error("No se pudo crear la orden de trabajo.");

        const assignmentEventId = randomUUID();
        if (assignee) {
          await tx.insert(dbModule.schema.workOrderAssignments).values({
            workOrderId,
            employeeId: assignee.id,
            assignedBy: auth.user.id,
          });
        }

        await tx.insert(dbModule.schema.workOrderAvailabilityOptions).values(
        availability.map((option, index) => ({
          workOrderId,
          optionNumber: index + 1,
          startsAt: option.startsAt,
          endsAt: option.endsAt,
        })),
      );
      if (uploads.length) {
        const claimed = await tx
          .update(dbModule.schema.clientPortalUploads)
          .set({ workOrderId })
          .where(
            and(
              eq(dbModule.schema.clientPortalUploads.requestId, requestRow.id),
              isNull(dbModule.schema.clientPortalUploads.workOrderId),
            ),
          )
          .returning({ id: dbModule.schema.clientPortalUploads.id });
        if (claimed.length !== uploads.length) {
          throw new Error("No se pudieron asociar todos los archivos de la solicitud.");
        }
        await tx.insert(dbModule.schema.workOrderAttachments).values(
          uploads.map((upload) => ({
            workOrderId,
            storageKey: upload.storageKey,
            fileName: upload.fileName,
            mimeType: upload.mimeType,
            kind: "CLIENT_REPORT",
            description: "Adjunto enviado por el cliente",
            sizeBytes: String(upload.sizeBytes),
            uploadedBy: null,
          })),
        );
      }
      await tx.insert(dbModule.schema.workOrderEvents).values({
        workOrderId,
        actorId: auth.user.id,
        actorName: auth.user.name,
        eventType: "CLIENT_REQUEST_CONVERTED",
        toStatus: assignee ? "ASSIGNED" : "CREATED",
        details: {
          clientRequestId: requestRow.id,
          priority,
          assignedTo: assignee
            ? `${assignee.nombre} ${assignee.apellido}`.trim()
            : null,
        },
        createdAt: now,
      });
      if (assignee?.userId) {
        await tx.insert(dbModule.schema.notifications).values(
          notificationRows([assignee.userId], {
            type: priority === "URGENTE" ? "WORK_ORDER_URGENT" : "WORK_ORDER_ASSIGNED",
            title:
              priority === "URGENTE"
                ? "Orden urgente asignada"
                : "Nueva orden de trabajo asignada",
            body: `${workOrder.code}: ${workOrder.title}`,
            href: "/operaciones",
            entityType: "WORK_ORDER",
            entityId: workOrder.id,
            dedupeKey: `work-order-assignment:${assignmentEventId}`,
          }),
        );
      }
      const [updatedRequest] = await tx
        .update(dbModule.schema.clientWorkOrderRequests)
        .set({
          status: "CONVERTED",
          workOrderId,
          reviewedBy: auth.user.id,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(dbModule.schema.clientWorkOrderRequests.id, requestRow.id),
            eq(dbModule.schema.clientWorkOrderRequests.status, "PENDING"),
          ),
        )
        .returning({ id: dbModule.schema.clientWorkOrderRequests.id });
      if (!updatedRequest) throw new Error("La solicitud dejó de estar pendiente.");
      return { workOrder, assignee };
    });

    if (priority === "URGENTE" && result.assignee) {
      try {
        await sendUrgentWorkOrderPush(dbModule, {
          employeeId: result.assignee.id,
          workOrderId: result.workOrder.id,
          code: result.workOrder.code,
          title: result.workOrder.title,
        });
      } catch (error) {
        logger.error("Falló el envío push de una orden urgente", {
          workOrderId: result.workOrder.id,
          error: error instanceof Error ? error.message : "Error desconocido",
        });
      }
    }

    return NextResponse.json({ workOrder: result.workOrder });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo convertir la solicitud.";
    const status = message.includes("no se encontró") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
