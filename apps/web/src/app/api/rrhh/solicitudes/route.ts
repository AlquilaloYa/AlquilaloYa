import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";
const TIPOS = ["VACACIONES", "PERMISO"] as const;

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const hr = requirePermission(auth.user.role, Permission.HR_READ);
    const self = requirePermission(auth.user.role, Permission.HR_REQUEST_CREATE);
    if (hr && self) return hr;
    const { db, schema } = dbModule as { db: typeof import("@contract/db").db; schema: typeof import("@contract/db").schema };
    let employeeId: string | null = null;
    if (hr) {
      const [employee] = await db.select({ id: schema.hrEmployees.id }).from(schema.hrEmployees)
        .where(and(eq(schema.hrEmployees.userId, auth.user.id), isNull(schema.hrEmployees.deletedAt))).limit(1);
      if (!employee) return NextResponse.json({ error: "Tu usuario no está vinculado a una ficha de empleado" }, { status: 403 });
      employeeId = employee.id;
    }
    const rows = await db.select({
      id: schema.hrRequests.id,
      employeeId: schema.hrRequests.employeeId,
      employeeName: schema.hrEmployees.nombres,
      employeeLastName: schema.hrEmployees.apellidos,
      tipo: schema.hrRequests.tipo,
      fechaInicio: schema.hrRequests.fechaInicio,
      fechaFin: schema.hrRequests.fechaFin,
      motivo: schema.hrRequests.motivo,
      estado: schema.hrRequests.estado,
      aprobadoPor: schema.hrRequests.aprobadoPor,
      respondidoEn: schema.hrRequests.respondidoEn,
      respuesta: schema.hrRequests.respuesta,
      createdAt: schema.hrRequests.createdAt,
    }).from(schema.hrRequests).innerJoin(schema.hrEmployees, eq(schema.hrEmployees.id, schema.hrRequests.employeeId))
      .where(employeeId ? eq(schema.hrRequests.employeeId, employeeId) : undefined)
      .orderBy(desc(schema.hrRequests.createdAt));
    return NextResponse.json(rows.map((row) => ({ ...row, fechaInicio: row.fechaInicio.toISOString(), fechaFin: row.fechaFin.toISOString(), respondidoEn: row.respondidoEn?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.HR_REQUEST_CREATE);
    if (denied) return denied;
    const { db, schema } = dbModule as { db: typeof import("@contract/db").db; schema: typeof import("@contract/db").schema };
    const [employee] = await db.select({ id: schema.hrEmployees.id, estado: schema.hrEmployees.estado })
      .from(schema.hrEmployees).where(and(eq(schema.hrEmployees.userId, auth.user.id), isNull(schema.hrEmployees.deletedAt))).limit(1);
    if (!employee) return NextResponse.json({ error: "Tu usuario no está vinculado a una ficha de empleado" }, { status: 403 });
    if (employee.estado !== "ACTIVO") return NextResponse.json({ error: "Solo el personal activo puede crear solicitudes" }, { status: 403 });
    const body = await req.json() as { tipo?: string; fechaInicio?: string; fechaFin?: string; motivo?: string };
    if (!TIPOS.includes(body.tipo as (typeof TIPOS)[number])) return NextResponse.json({ error: "Tipo de solicitud inválido" }, { status: 400 });
    if (!body.fechaInicio || !body.fechaFin || body.fechaFin < body.fechaInicio) return NextResponse.json({ error: "Indica un rango de fechas válido" }, { status: 400 });
    if (!body.motivo?.trim()) return NextResponse.json({ error: "Indica el motivo de la solicitud" }, { status: 400 });
    const [row] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.hrRequests).values({ employeeId: employee.id, tipo: body.tipo!, fechaInicio: new Date(body.fechaInicio!), fechaFin: new Date(body.fechaFin!), motivo: body.motivo!.trim() }).returning();
      await tx.insert(schema.hrEmployeeHistory).values({ employeeId: employee.id, actor: auth.user.name || auth.user.email, action: "REQUESTED", after: { requestId: created?.id, tipo: body.tipo, fechaInicio: body.fechaInicio, fechaFin: body.fechaFin } });
      return [created];
    });
    return NextResponse.json({ ...row, fechaInicio: row?.fechaInicio.toISOString(), fechaFin: row?.fechaFin.toISOString() }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
