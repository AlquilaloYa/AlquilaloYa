import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/inventarios — mapa { departamentoId: items[] }. */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.DEPARTMENT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const rows = await db.select().from(schema.departmentInventories);
    const map: Record<string, string[]> = {};
    for (const r of rows) {
      map[r.departamentoId] = Array.isArray(r.items) ? (r.items as string[]) : [];
    }
    return NextResponse.json(map);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** PUT /api/inventarios — { departamentoId, items } (upsert). */
export async function PUT(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.DEPARTMENT_UPDATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const body = (await req.json()) as { departamentoId?: string; items?: string[] };
    if (!body.departamentoId) {
      return NextResponse.json({ error: "Falta departamentoId" }, { status: 400 });
    }
    const items = Array.isArray(body.items)
      ? body.items.filter((i) => typeof i === "string")
      : [];
    await db
      .insert(schema.departmentInventories)
      .values({ departamentoId: body.departamentoId, items })
      .onConflictDoUpdate({
        target: schema.departmentInventories.departamentoId,
        set: { items, updatedAt: new Date() },
      });
    return NextResponse.json({ ok: true, departamentoId: body.departamentoId, items });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
