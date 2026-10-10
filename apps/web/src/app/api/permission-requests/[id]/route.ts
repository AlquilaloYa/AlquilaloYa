import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type Body = {
  action?: unknown;
  comentario?: unknown;
};

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.PERMISSION_REQUEST_APPROVE);
    if (denied) return denied;

    const body = (await req.json().catch(() => ({}))) as Body;
    const action = String(body.action ?? "").toUpperCase();
    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
    }
    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const [exist] = await db
      .select()
      .from(schema.permissionRequests)
      .where(eq(schema.permissionRequests.id, params.id))
      .limit(1);
    if (!exist) {
      return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }
    if (exist.estado !== "PENDIENTE") {
      return NextResponse.json({ error: "La solicitud ya fue resuelta" }, { status: 400 });
    }
    const estado = action === "APPROVE" ? "APROBADA" : "RECHAZADA";
    const [row] = await db
      .update(schema.permissionRequests)
      .set({
        estado,
        comentario: typeof body.comentario === "string" ? body.comentario.trim() || null : null,
        resolvedBy: auth.user.id,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.permissionRequests.id, params.id))
      .returning();
    return NextResponse.json({ item: row });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}