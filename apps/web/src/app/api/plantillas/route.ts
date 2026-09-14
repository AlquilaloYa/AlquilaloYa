import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

type Body = {
  id?: string;
  nombre?: string;
  canal?: string;
  cuerpo?: string;
  activa?: boolean;
};

function toView(r: { id: string; nombre: string; canal: string; cuerpo: string; activa: boolean }) {
  return { id: r.id, nombre: r.nombre, canal: r.canal, cuerpo: r.cuerpo, activa: r.activa };
}

async function ctx(permission: Permission, req: Request) {
  const dbModule = await import("@contract/db");
  const auth = await requireUser(dbModule, req);
  if ("error" in auth) return { error: auth.error };
  const denied = requirePermission(auth.user.role, permission);
  if (denied) return { error: denied };
  const { db, schema } = dbModule as {
    db: typeof import("@contract/db").db;
    schema: typeof import("@contract/db").schema;
  };
  return { db, schema };
}

/** GET /api/plantillas */
export async function GET(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_READ, req);
    if ("error" in c) return c.error;
    const rows = await c.db.select().from(c.schema.messageTemplates);
    return NextResponse.json(rows.map(toView));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/plantillas */
export async function POST(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_CREATE, req);
    if ("error" in c) return c.error;
    const body = (await req.json()) as Body;
    if (!body.nombre?.trim() || !body.cuerpo?.trim()) {
      return NextResponse.json({ error: "Nombre y cuerpo son obligatorios" }, { status: 400 });
    }
    const [row] = await c.db
      .insert(c.schema.messageTemplates)
      .values({
        nombre: body.nombre.trim(),
        canal: (body.canal ?? "TODOS").trim(),
        cuerpo: body.cuerpo,
        activa: body.activa ?? true,
      })
      .returning();
    if (!row) return NextResponse.json({ error: "No se pudo crear la plantilla" }, { status: 500 });
    return NextResponse.json(toView(row), { status: 201 });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.toLowerCase().includes("duplicate") || msg.includes("unique")) {
      return NextResponse.json({ error: "Ya existe una plantilla con ese nombre" }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/** PUT /api/plantillas */
export async function PUT(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_UPDATE, req);
    if ("error" in c) return c.error;
    const body = (await req.json()) as Body;
    if (!body.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (body.nombre !== undefined) set.nombre = body.nombre.trim();
    if (body.canal !== undefined) set.canal = body.canal.trim();
    if (body.cuerpo !== undefined) set.cuerpo = body.cuerpo;
    if (body.activa !== undefined) set.activa = Boolean(body.activa);
    const [row] = await c.db
      .update(c.schema.messageTemplates)
      .set(set as never)
      .where(eq(c.schema.messageTemplates.id, body.id))
      .returning();
    if (!row) return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
    return NextResponse.json(toView(row));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

/** DELETE /api/plantillas?id= */
export async function DELETE(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_UPDATE, req);
    if ("error" in c) return c.error;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    const [row] = await c.db
      .delete(c.schema.messageTemplates)
      .where(eq(c.schema.messageTemplates.id, id))
      .returning({ id: c.schema.messageTemplates.id });
    if (!row) return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
