import { NextResponse } from "next/server";
import { count, desc, eq, sql } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

const RESUELTOS = new Set(["RESOLVED", "COMPLETED"]);
const CERRADOS = new Set(["CANCELLED", "REJECTED"]);
const PAGE_SIZE = 50;

type Etiqueta = "Resuelta" | "Pendiente" | "Cancelada" | "Rechazada";

function etiquetaEstado(status: string): Etiqueta {
  if (RESUELTOS.has(status)) return "Resuelta";
  if (status === "CANCELLED") return "Cancelada";
  if (status === "REJECTED") return "Rechazada";
  return "Pendiente";
}

/**
 * Incidencias reales registradas en órdenes de trabajo:
 * la incidencia, el encargado, el nivel de urgencia y si está resuelta.
 * Va primero lo abierto (pendiente de resolver).
 */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.WORK_ORDER_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const url = new URL(req.url);
    const pagina = Number(url.searchParams.get("page") ?? "1");
    if (!Number.isSafeInteger(pagina) || pagina < 1) {
      return NextResponse.json(
        { error: "El número de página no es válido" },
        { status: 400 },
      );
    }

    const offset = (pagina - 1) * PAGE_SIZE;
    if (!Number.isSafeInteger(offset)) {
      return NextResponse.json(
        { error: "El número de página excede el límite" },
        { status: 400 },
      );
    }

    const [resumenRows, ordenes] = await Promise.all([
      db
        .select({
          total: count(),
          pendientes: sql<number>`count(*) filter (where ${schema.workOrders.status} not in ('RESOLVED', 'COMPLETED', 'CANCELLED', 'REJECTED'))`.mapWith(Number),
        })
        .from(schema.workOrders),
      db
        .select({
          id: schema.workOrders.id,
          code: schema.workOrders.code,
          title: schema.workOrders.title,
          issueType: schema.workOrders.issueType,
          priority: schema.workOrders.priority,
          status: schema.workOrders.status,
          departmentCode: schema.workOrders.departmentCode,
          createdAt: schema.workOrders.createdAt,
          completedAt: schema.workOrders.completedAt,
          encargado: sql<string | null>`nullif(trim(coalesce(${schema.hrEmployees.nombres}, '') || ' ' || coalesce(${schema.hrEmployees.apellidos}, '')), '')`,
        })
        .from(schema.workOrders)
        .leftJoin(
          schema.hrEmployees,
          eq(schema.workOrders.assignedEmployeeId, schema.hrEmployees.id),
        )
        .orderBy(
          sql`case when ${schema.workOrders.status} in ('RESOLVED', 'COMPLETED', 'CANCELLED', 'REJECTED') then 1 else 0 end`,
          desc(schema.workOrders.createdAt),
          desc(schema.workOrders.id),
        )
        .limit(PAGE_SIZE)
        .offset(offset),
    ]);

    const resumen = resumenRows[0] ?? { total: 0, pendientes: 0 };
    const incidencias = ordenes.map((orden) => {
      const estado = etiquetaEstado(String(orden.status));
      const abierta =
        !RESUELTOS.has(String(orden.status)) &&
        !CERRADOS.has(String(orden.status));
      return {
        id: String(orden.id),
        codigo: String(orden.code ?? ""),
        incidencia: String(orden.title ?? ""),
        tipo: String(orden.issueType ?? ""),
        encargado: orden.encargado || null,
        prioridad: String(orden.priority ?? "MEDIA"),
        departamento: String(orden.departmentCode ?? ""),
        estado,
        resuelta: estado === "Resuelta",
        abierta,
        creadaEn: orden.createdAt
          ? new Date(orden.createdAt).toISOString()
          : "",
        resueltaEn: orden.completedAt
          ? new Date(orden.completedAt).toISOString()
          : null,
      };
    });

    return NextResponse.json({
      total: resumen.total,
      pendientes: resumen.pendientes,
      pagina,
      porPagina: PAGE_SIZE,
      incidencias,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
