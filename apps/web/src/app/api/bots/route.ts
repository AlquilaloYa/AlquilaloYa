import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

const CANALES = ["TODOS", "WHATSAPP", "MESSENGER", "TIKTOK", "WEB", "EMAIL"] as const;

type Body = {
  id?: string;
  nombre?: string;
  canal?: string;
  keywords?: string[];
  plantillaId?: string | null;
  cuerpo?: string;
  unaPorConversacion?: boolean;
  activa?: boolean;
};

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

/** GET /api/bots */
export async function GET(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_READ, req);
    if ("error" in c) return c.error;
    const rows = await c.db
      .select()
      .from(c.schema.botRules)
      .orderBy(desc(c.schema.botRules.createdAt));
    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        canal: r.canal,
        keywords: Array.isArray(r.keywords) ? (r.keywords as unknown[]).map(String) : [],
        plantillaId: r.plantillaId,
        cuerpo: r.cuerpo,
        unaPorConversacion: r.unaPorConversacion,
        activa: r.activa,
      }))
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/bots */
export async function POST(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_CREATE, req);
    if ("error" in c) return c.error;
    const body = (await req.json()) as Body;
    if (!body.nombre?.trim()) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
    if (!body.canal || !CANALES.includes(body.canal as (typeof CANALES)[number])) {
      return NextResponse.json({ error: "Canal inválido" }, { status: 400 });
    }
    if (!body.cuerpo?.trim() && !body.plantillaId) {
      return NextResponse.json({ error: "Elige una plantilla o escribe el cuerpo" }, { status: 400 });
    }
    const [row] = await c.db
      .insert(c.schema.botRules)
      .values({
        nombre: body.nombre.trim(),
        canal: body.canal,
        keywords: body.keywords ?? [],
        plantillaId: body.plantillaId || null,
        cuerpo: body.cuerpo ?? "",
        unaPorConversacion: body.unaPorConversacion ?? true,
        activa: body.activa ?? true,
      })
      .returning();
    if (!row) return NextResponse.json({ error: "No se pudo crear" }, { status: 500 });
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes("unique") || msg.toLowerCase().includes("duplicate")) {
      return NextResponse.json({ error: "Ya existe un bot con ese nombre" }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/** PUT /api/bots */
export async function PUT(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_UPDATE, req);
    if ("error" in c) return c.error;
    const body = (await req.json()) as Body;
    if (!body.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (body.nombre !== undefined) set.nombre = body.nombre.trim();
    if (body.canal !== undefined) {
      if (!CANALES.includes(body.canal as (typeof CANALES)[number])) return NextResponse.json({ error: "Canal inválido" }, { status: 400 });
      set.canal = body.canal;
    }
    if (body.keywords !== undefined) set.keywords = body.keywords;
    if (body.plantillaId !== undefined) set.plantillaId = body.plantillaId || null;
    if (body.cuerpo !== undefined) set.cuerpo = body.cuerpo;
    if (body.unaPorConversacion !== undefined) set.unaPorConversacion = body.unaPorConversacion;
    if (body.activa !== undefined) set.activa = body.activa;
    const [row] = await c.db
      .update(c.schema.botRules)
      .set(set as never)
      .where(eq(c.schema.botRules.id, body.id))
      .returning();
    if (!row) return NextResponse.json({ error: "Bot no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

/** DELETE /api/bots?id= */
export async function DELETE(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_UPDATE, req);
    if ("error" in c) return c.error;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    const [row] = await c.db
      .delete(c.schema.botRules)
      .where(eq(c.schema.botRules.id, id))
      .returning({ id: c.schema.botRules.id });
    if (!row) return NextResponse.json({ error: "Bot no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
