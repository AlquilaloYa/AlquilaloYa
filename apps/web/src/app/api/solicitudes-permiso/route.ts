import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

function requestJson(row: {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  modulo: string;
  detalle: string;
  estado: string;
  comentario: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const canReadAll = !requirePermission(auth.user, Permission.PERMISSION_REQUEST_READ);
    const canReadOwn = !requirePermission(auth.user, Permission.PERMISSION_REQUEST_CREATE);
    if (!canReadAll && !canReadOwn) {
      return requirePermission(auth.user, Permission.PERMISSION_REQUEST_READ) ?? NextResponse.json(
        { error: "Acceso denegado" },
        { status: 403 }
      );
    }

    const rows = await dbModule.db
      .select()
      .from(dbModule.schema.permissionRequests)
      .where(canReadAll ? undefined : eq(dbModule.schema.permissionRequests.userId, auth.user.id))
      .orderBy(desc(dbModule.schema.permissionRequests.createdAt));
    return NextResponse.json({ items: rows.map(requestJson) });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.PERMISSION_REQUEST_CREATE);
    if (denied) return denied;

    const body = (await req.json().catch(() => ({}))) as { modulo?: unknown; detalle?: unknown };
    const modulo = typeof body.modulo === "string" ? body.modulo.trim() : "";
    const detalle = typeof body.detalle === "string" ? body.detalle.trim() : "";
    if (!modulo || modulo.length > 120) {
      return NextResponse.json({ error: "Indica un módulo válido" }, { status: 400 });
    }
    if (!detalle || detalle.length > 2000) {
      return NextResponse.json({ error: "Describe el cambio (máximo 2000 caracteres)" }, { status: 400 });
    }

    const [row] = await dbModule.db
      .insert(dbModule.schema.permissionRequests)
      .values({
        userId: auth.user.id,
        userName: auth.user.name,
        userRole: auth.user.role,
        modulo,
        detalle,
      })
      .returning();
    if (!row) return NextResponse.json({ error: "No se pudo crear la solicitud" }, { status: 500 });
    return NextResponse.json(requestJson(row), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.PERMISSION_REQUEST_APPROVE);
    if (denied) return denied;

    const body = (await req.json().catch(() => ({}))) as {
      id?: unknown;
      estado?: unknown;
      comentario?: unknown;
    };
    const id = typeof body.id === "string" ? body.id : "";
    const estado = body.estado;
    const comentario = typeof body.comentario === "string" ? body.comentario.trim() : "";
    if (!id || (estado !== "APROBADA" && estado !== "RECHAZADA")) {
      return NextResponse.json({ error: "Solicitud o decisión inválida" }, { status: 400 });
    }
    if (!comentario || comentario.length > 2000) {
      return NextResponse.json({ error: "Indica un mensaje para el solicitante" }, { status: 400 });
    }

    const [row] = await dbModule.db
      .update(dbModule.schema.permissionRequests)
      .set({
        estado,
        comentario,
        resolvedBy: auth.user.id,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(dbModule.schema.permissionRequests.id, id),
        eq(dbModule.schema.permissionRequests.estado, "PENDIENTE"),
      ))
      .returning();
    if (!row) {
      return NextResponse.json({ error: "La solicitud no existe o ya fue resuelta" }, { status: 409 });
    }
    return NextResponse.json(requestJson(row));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
