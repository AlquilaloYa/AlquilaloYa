import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { ActivityAction } from "@contract/domain/activity";
import { requireUser, requirePermission } from "@/lib/session";
import { registrarActividadHR } from "@/lib/rrhh-actividad";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.HR_UPDATE);
    if (denied) return denied;
    const body = await req.json() as { estado?: string; respuesta?: string };
    if (body.estado !== "APROBADA" && body.estado !== "RECHAZADA") return NextResponse.json({ error: "La respuesta debe ser aprobar o rechazar" }, { status: 400 });
    const { db, schema } = dbModule as { db: typeof import("@contract/db").db; schema: typeof import("@contract/db").schema };
    const result = await db.transaction(async (tx) => {
      const [request] = await tx.select().from(schema.hrRequests).where(eq(schema.hrRequests.id, params.id)).limit(1);
      if (!request) return { error: "Solicitud no encontrada" } as const;
      if (request.estado !== "PENDIENTE") return { error: "La solicitud ya fue respondida" } as const;
      const [employee] = await tx.select().from(schema.hrEmployees).where(eq(schema.hrEmployees.id, request.employeeId)).limit(1);
      if (!employee || employee.deletedAt) return { error: "Empleado no encontrado" } as const;
      const [updated] = await tx.update(schema.hrRequests).set({ estado: body.estado!, aprobadoPor: auth.user.name || auth.user.email, respondidoEn: new Date(), respuesta: body.respuesta?.trim() ?? "" }).where(eq(schema.hrRequests.id, params.id)).returning();
      if (body.estado === "APROBADA") {
        await tx.update(schema.hrEmployees).set({ estado: request.tipo, updatedAt: new Date() }).where(eq(schema.hrEmployees.id, request.employeeId));
      }
      await tx.insert(schema.hrEmployeeHistory).values({ employeeId: request.employeeId, actor: auth.user.name || auth.user.email, action: body.estado === "APROBADA" ? "REQUEST_APPROVED" : "REQUEST_REJECTED", motivo: (body.respuesta?.trim() ?? "") || `${request.tipo} ${body.estado!.toLowerCase()}`, before: { requestId: request.id, estado: request.estado, employeeState: employee.estado }, after: { requestId: updated?.id, estado: body.estado, employeeState: body.estado === "APROBADA" ? request.tipo : employee.estado } });
      return { row: updated, employeeId: request.employeeId, tipo: request.tipo } as const;
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
    await registrarActividadHR(db, schema, {
      actorId: auth.user.id,
      actorName: auth.user.name || auth.user.email,
      action: body.estado === "APROBADA" ? ActivityAction.HR_REQUEST_APPROVED : ActivityAction.HR_REQUEST_REJECTED,
      entityId: result.employeeId,
      metadata: { solicitud: params.id, tipo: result.tipo, estado: body.estado },
    });
    return NextResponse.json(result.row);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
