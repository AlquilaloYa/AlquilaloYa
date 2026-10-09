import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type Body = {
  modulo?: unknown;
  detalle?: unknown;
};

function json(r: {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  modulo: string;
  detalle: string;
  estado: string;
  comentario: string | null;
  resolvedBy: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}) {
  return {
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    userRole: r.userRole,
    modulo: r.modulo,
    detalle: r.detalle,
    estado: r.estado,
    comentario: r.comentario,
    resolvedBy: r.resolvedBy,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
  };
}

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const role = auth.user.role;
    const isDev = role === "DEVELOPER";
    const isAdmin = role === "ADMIN";
    const denied = requirePermission(auth.user.role, isDev || isAdmin ? Permission.PERMISSION_REQUEST_READ : Permission.PERMISSION_REQUEST_CREATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    if (isDev || isAdmin) {
      const rows = await db
        .select()
        .from(schema.permissionRequests)
        .orderBy(desc(schema.permissionRequests.createdAt))
        .limit(500);
      return NextResponse.json({ items: rows.map(json) });
    }
    const rows = await db
      .select()
      .from(schema.permissionRequests)
      .where(eq(schema.permissionRequests.userId, auth.user.id))
      .orderBy(desc(schema.permissionRequests.createdAt))
      .limit(100);
    return NextResponse.json({ items: rows.map(json) });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.PERMISSION_REQUEST_CREATE);
    if (denied) return denied;

    const body = (await req.json().catch(() => ({}))) as Body;
    const modulo = typeof body.modulo === "string" ? body.modulo.trim() : "";
    const detalle = typeof body.detalle === "string" ? body.detalle.trim() : "";
    if (!modulo || !detalle) {
      return NextResponse.json({ error: "Faltan módulo y detalle" }, { status: 400 });
    }
    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const [row] = await db
      .insert(schema.permissionRequests)
      .values({
        userId: auth.user.id,
        userName: auth.user.name,
        userRole: auth.user.role,
        modulo,
        detalle,
      })
      .returning();
    return NextResponse.json({ item: row ? json(row) : null }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}