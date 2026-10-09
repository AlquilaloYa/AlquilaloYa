import { NextResponse } from "next/server";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type CreateBody = {
  title?: unknown;
  description?: unknown;
  issueType?: unknown;
  priority?: unknown;
  site?: unknown;
  departmentId?: unknown;
  clientId?: unknown;
  assignedEmployeeId?: unknown;
  targetAt?: unknown;
};

const PRIORITIES = ["BAJA", "MEDIA", "ALTA", "URGENTE"] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SITES = ["Angamos", "Benavides"] as const;

function siteFromDepartment(code: string): (typeof SITES)[number] | null {
  const normalizedCode = code.trim().toUpperCase();
  if (normalizedCode.startsWith("ANG170")) return "Angamos";
  if (normalizedCode.startsWith("BEN2195")) return "Benavides";
  return null;
}

function normalizeDepartmentCode(code: string | null | undefined): string {
  return code?.trim().toUpperCase() ?? "";
}

function asText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function parseDate(value: unknown): Date | null | false {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? false : date;
}

export async function GET(req: Request) {
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
    let employeeScope: string | null = null;
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
      if (!employee) {
        return NextResponse.json(
          {
            error:
              "Vincula tu usuario con tu expediente de RR. HH. para consultar órdenes",
          },
          { status: 403 },
        );
      }
      employeeScope = employee.id;
    }
    const rows = await db
      .select({
        id: schema.workOrders.id,
        code: schema.workOrders.code,
        title: schema.workOrders.title,
        description: schema.workOrders.description,
        issueType: schema.workOrders.issueType,
        priority: schema.workOrders.priority,
        status: schema.workOrders.status,
        location: schema.workOrders.location,
        site: schema.workOrders.site,
        departmentId: schema.workOrders.departmentId,
        departmentCode: schema.workOrders.departmentCode,
        clientId: schema.workOrders.clientId,
        contactName: schema.workOrders.contactName,
        assignedEmployeeId: schema.workOrders.assignedEmployeeId,
        targetAt: schema.workOrders.targetAt,
        diagnosis: schema.workOrders.diagnosis,
        resolution: schema.workOrders.resolution,
        estimatedCost: schema.workOrders.estimatedCost,
        actualCost: schema.workOrders.actualCost,
        estimatedMinutes: schema.workOrders.estimatedMinutes,
        actualMinutes: schema.workOrders.actualMinutes,
        completedAt: schema.workOrders.completedAt,
        createdAt: schema.workOrders.createdAt,
        updatedAt: schema.workOrders.updatedAt,
        assigneeName: schema.hrEmployees.nombres,
        assigneeSurname: schema.hrEmployees.apellidos,
        assigneeRole: schema.hrEmployees.cargo,
        departmentName: schema.departments.nombre,
        departmentNumber: schema.departments.numero,
      })
      .from(schema.workOrders)
      .leftJoin(
        schema.hrEmployees,
        eq(schema.workOrders.assignedEmployeeId, schema.hrEmployees.id),
      )
      .leftJoin(
        schema.departments,
        eq(schema.workOrders.departmentId, schema.departments.id),
      )
      .where(
        employeeScope
          ? eq(schema.workOrders.assignedEmployeeId, employeeScope)
          : undefined,
      )
      .orderBy(desc(schema.workOrders.createdAt));

    return NextResponse.json(
      rows.map((row) => ({
        ...row,
        assigneeName:
          [row.assigneeName, row.assigneeSurname].filter(Boolean).join(" ") ||
          null,
      })),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las órdenes",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(
      auth.user.role,
      Permission.WORK_ORDER_CREATE,
    );
    if (denied) return denied;

    let body: CreateBody;
    try {
      body = (await req.json()) as CreateBody;
    } catch {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es JSON válido" },
        { status: 400 },
      );
    }

    const title = asText(body.title, 255);
    const issueType = asText(body.issueType, 80);
    const site = body.site;
    if (
      body.description !== undefined &&
      typeof body.description !== "string"
    ) {
      return NextResponse.json(
        { error: "La descripción debe ser texto" },
        { status: 400 },
      );
    }
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const priority = body.priority ?? "MEDIA";
    const targetAt = parseDate(body.targetAt);
    if (!title || !issueType) {
      return NextResponse.json(
        { error: "Título y tipo de incidencia son obligatorios" },
        { status: 400 },
      );
    }
    if (description.length > 10000) {
      return NextResponse.json(
        { error: "La descripción supera el límite permitido" },
        { status: 400 },
      );
    }
    if (
      body.clientId !== undefined &&
      body.clientId !== null &&
      body.clientId !== "" &&
      (typeof body.clientId !== "string" || !UUID_PATTERN.test(body.clientId))
    ) {
      return NextResponse.json(
        { error: "El residente seleccionado no es válido" },
        { status: 400 },
      );
    }
    if (
      typeof priority !== "string" ||
      !PRIORITIES.includes(priority as (typeof PRIORITIES)[number])
    ) {
      return NextResponse.json(
        { error: "La prioridad indicada no es válida" },
        { status: 400 },
      );
    }
    if (targetAt === false) {
      return NextResponse.json(
        { error: "La fecha objetivo no es válida" },
        { status: 400 },
      );
    }

    const { db, schema } = dbModule;
    let client: { id: string; name: string } | null = null;
    let clientDepartmentCode: string | null = null;
    if (typeof body.clientId === "string" && body.clientId) {
      const [row] = await db
        .select({
          id: schema.clients.id,
          nombres: schema.clients.nombres,
          apellidos: schema.clients.apellidos,
          codigoDepartamento: schema.clients.codigoDepartamento,
        })
        .from(schema.clients)
        .where(
          and(
            eq(schema.clients.id, body.clientId),
            eq(schema.clients.activo, true),
          ),
        )
        .limit(1);
      if (!row)
        return NextResponse.json(
          { error: "El residente ya no está activo en Clientes" },
          { status: 400 },
        );
      client = {
        id: row.id,
        name: [row.nombres, row.apellidos].filter(Boolean).join(" "),
      };
      clientDepartmentCode = normalizeDepartmentCode(
        row.codigoDepartamento,
      );
      if (!clientDepartmentCode) {
        return NextResponse.json(
          { error: "El residente no tiene un código UNI/DEP asociado" },
          { status: 400 },
        );
      }
    }

    if (!client) {
      if (
        typeof site !== "string" ||
        !SITES.includes(site as (typeof SITES)[number])
      ) {
        return NextResponse.json(
          { error: "Selecciona Angamos o Benavides" },
          { status: 400 },
        );
      }
      if (
        typeof body.departmentId !== "string" ||
        !UUID_PATTERN.test(body.departmentId)
      ) {
        return NextResponse.json(
          { error: "Selecciona un departamento válido de UNI/DEP" },
          { status: 400 },
        );
      }
    }

    const departmentQuery = db
      .select({
        id: schema.departments.id,
        code: schema.departments.codigo,
        name: schema.departments.nombre,
        number: schema.departments.numero,
        active: schema.departments.activo,
      })
      .from(schema.departments)
      .limit(1);
    const [department] = clientDepartmentCode
      ? await departmentQuery.where(
          sql`upper(trim(${schema.departments.codigo})) = ${clientDepartmentCode}`,
        )
      : await departmentQuery.where(
          eq(schema.departments.id, body.departmentId as string),
        );
    const departmentSite = department && siteFromDepartment(department.code);
    if (
      !department ||
      !department.active ||
      !departmentSite ||
      (!client && departmentSite !== site)
    ) {
      return NextResponse.json(
        {
          error: client
            ? "No se encontró un departamento UNI/DEP activo para el código del residente"
            : "El departamento no corresponde a la sede seleccionada",
        },
        { status: 400 },
      );
    }

    let assignee: { id: string; nombre: string; apellido: string } | null =
      null;
    if (
      body.assignedEmployeeId !== undefined &&
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
          nombre: schema.hrEmployees.nombres,
          apellido: schema.hrEmployees.apellidos,
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
      if (!employee) {
        return NextResponse.json(
          {
            error:
              "Solo se puede asignar personal activo del área de mantenimiento",
          },
          { status: 400 },
        );
      }
      assignee = employee;
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const status = assignee ? "ASSIGNED" : "CREATED";
    const [order] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.workOrders)
        .values({
          id,
          code: `OT-${id.replace(/-/g, "").slice(0, 16).toUpperCase()}`,
          title,
          description,
          issueType,
          priority,
          status,
          location: departmentSite,
          site: departmentSite,
          departmentId: department.id,
          departmentCode: department.code,
          clientId: client?.id ?? null,
          contactName: client?.name ?? "",
          assignedEmployeeId: assignee?.id ?? null,
          targetAt,
          createdBy: auth.user.id,
        })
        .returning();
      if (!created) throw new Error("No se pudo crear la orden de trabajo");

      if (assignee) {
        await tx.insert(schema.workOrderAssignments).values({
          workOrderId: id,
          employeeId: assignee.id,
          assignedBy: auth.user.id,
        });
      }
      await tx.insert(schema.workOrderEvents).values({
        workOrderId: id,
        actorId: auth.user.id,
        actorName: auth.user.name,
        eventType: "ORDER_CREATED",
        toStatus: status,
        details: {
          assignedTo: assignee
            ? `${assignee.nombre} ${assignee.apellido}`.trim()
            : null,
        },
        createdAt: now,
      });
      return [created];
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No se pudo crear la orden",
      },
      { status: 500 },
    );
  }
}
