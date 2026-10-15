import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

const RESUELTOS = new Set(["RESOLVED", "COMPLETED"]);
const CERRADOS = new Set(["CANCELLED", "REJECTED"]);

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

    const [ordenes, empleados] = await Promise.all([
      db
        .select({
          id: schema.workOrders.id,
          code: schema.workOrders.code,
          title: schema.workOrders.title,
          issueType: schema.workOrders.issueType,
          priority: schema.workOrders.priority,
          status: schema.workOrders.status,
          departmentCode: schema.workOrders.departmentCode,
          assignedEmployeeId: schema.workOrders.assignedEmployeeId,
          createdAt: schema.workOrders.createdAt,
          completedAt: schema.workOrders.completedAt,
        })
        .from(schema.workOrders),
      db
        .select({
          id: schema.hrEmployees.id,
          nombres: schema.hrEmployees.nombres,
          apellidos: schema.hrEmployees.apellidos,
        })
        .from(schema.hrEmployees),
    ]);

    const encargados = new Map<string, string>(
      empleados.map((empleado) => [
        empleado.id,
        `${empleado.nombres ?? ""} ${empleado.apellidos ?? ""}`.trim(),
      ])
    );

    const incidencias = ordenes
      .map((orden) => {
        const estado = etiquetaEstado(String(orden.status));
        const abierta =
          !RESUELTOS.has(String(orden.status)) &&
          !CERRADOS.has(String(orden.status));
        return {
          id: String(orden.id),
          codigo: String(orden.code ?? ""),
          incidencia: String(orden.title ?? ""),
          tipo: String(orden.issueType ?? ""),
          encargado:
            (orden.assignedEmployeeId
              ? encargados.get(String(orden.assignedEmployeeId))
              : undefined) || null,
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
      })
      .sort((a, b) =>
        a.abierta === b.abierta
          ? b.creadaEn.localeCompare(a.creadaEn)
          : a.abierta
            ? -1
            : 1
      );

    return NextResponse.json({
      total: incidencias.length,
      pendientes: incidencias.filter((incidencia) => incidencia.abierta).length,
      incidencias,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
