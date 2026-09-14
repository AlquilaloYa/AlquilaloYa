import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { EVENTOS, type EventoRegla } from "@/lib/automatizaciones";

export const dynamic = "force-dynamic";

type Body = {
  id?: string;
  nombre?: string;
  evento?: string;
  params?: Record<string, number>;
  asignadoA?: string;
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

/** GET /api/automatizaciones — reglas + últimos runs. */
export async function GET(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_READ, req);
    if ("error" in c) return c.error;
    const [rules, runs] = await Promise.all([
      c.db.select().from(c.schema.automationRules).orderBy(desc(c.schema.automationRules.createdAt)),
      c.db.select().from(c.schema.automationRuns).orderBy(desc(c.schema.automationRuns.ejecutadoEn)).limit(15),
    ]);
    return NextResponse.json({
      reglas: rules.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        evento: r.evento,
        params: r.params ?? {},
        asignadoA: Array.isArray(r.acciones)
          ? ((r.acciones as Array<{ asignadoA?: string }>)[0]?.asignadoA ?? "")
          : "",
        activa: r.activa,
      })),
      runs: runs.map((x) => ({
        id: x.id,
        ruleId: x.ruleId,
        fuente: x.fuente,
        detalle: x.detalle ?? {},
        ejecutadoEn: x.ejecutadoEn?.toISOString?.() ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/automatizaciones — crear regla. */
export async function POST(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_CREATE, req);
    if ("error" in c) return c.error;
    const body = (await req.json()) as Body;
    if (!body.nombre?.trim()) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
    if (!body.evento || !EVENTOS[body.evento as EventoRegla]) {
      return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
    }
    const [row] = await c.db
      .insert(c.schema.automationRules)
      .values({
        nombre: body.nombre.trim(),
        evento: body.evento,
        params: body.params ?? {},
        acciones: [{ tipo: "CREATE_TASK", asignadoA: (body.asignadoA ?? "").trim() }],
      })
      .returning();
    if (!row) return NextResponse.json({ error: "No se pudo crear" }, { status: 500 });
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes("unique") || msg.toLowerCase().includes("duplicate")) {
      return NextResponse.json({ error: "Ya existe una regla con ese nombre" }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/** PUT /api/automatizaciones — editar/activar regla. */
export async function PUT(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_UPDATE, req);
    if ("error" in c) return c.error;
    const body = (await req.json()) as Body;
    if (!body.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (body.nombre !== undefined) set.nombre = body.nombre.trim();
    if (body.evento !== undefined) {
      if (!EVENTOS[body.evento as EventoRegla]) return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
      set.evento = body.evento;
    }
    if (body.params !== undefined) set.params = body.params;
    if (body.asignadoA !== undefined) set.acciones = [{ tipo: "CREATE_TASK", asignadoA: body.asignadoA.trim() }];
    if (body.activa !== undefined) set.activa = Boolean(body.activa);
    const [row] = await c.db
      .update(c.schema.automationRules)
      .set(set as never)
      .where(eq(c.schema.automationRules.id, body.id))
      .returning();
    if (!row) return NextResponse.json({ error: "Regla no encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

/** DELETE /api/automatizaciones?id= */
export async function DELETE(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_UPDATE, req);
    if ("error" in c) return c.error;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    const [row] = await c.db
      .delete(c.schema.automationRules)
      .where(eq(c.schema.automationRules.id, id))
      .returning({ id: c.schema.automationRules.id });
    if (!row) return NextResponse.json({ error: "Regla no encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
