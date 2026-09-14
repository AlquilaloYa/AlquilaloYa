import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

const ETAPAS = ["ENTRANTE", "DECISION", "NEGOCIACION", "FINAL", "GANADO", "PERDIDO"] as const;
const CANALES = ["MANUAL", "WHATSAPP", "MESSENGER", "TIKTOK", "WEB", "LLAMADA", "EMAIL"] as const;

type Etapa = (typeof ETAPAS)[number];

type LeadBody = {
  id?: string;
  nombre?: string;
  apellido?: string;
  contactoId?: string | null;
  canal?: string;
  etapa?: string;
  servicio?: string;
  monto?: number | string;
  tags?: string[];
  asignadoA?: string;
  venceEl?: string | null;
  notas?: string;
  origenExternoId?: string | null;
};

function toView(r: {
  id: string;
  nombre: string;
  apellido: string;
  contactoId: string | null;
  canal: string;
  etapa: string;
  servicio: string;
  monto: string | number;
  tags: unknown;
  asignadoA: string;
  venceEl: string | Date | null;
  notas: string;
  origenExternoId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    nombre: r.nombre,
    apellido: r.apellido,
    contactoId: r.contactoId,
    canal: r.canal,
    etapa: r.etapa,
    servicio: r.servicio,
    monto: Number(r.monto),
    tags: Array.isArray(r.tags) ? (r.tags as unknown[]).map(String) : [],
    asignadoA: r.asignadoA,
    venceEl:
      r.venceEl instanceof Date
        ? r.venceEl.toISOString().slice(0, 10)
        : (r.venceEl ?? null),
    notas: r.notas,
    origenExternoId: r.origenExternoId,
    createdAt: r.createdAt?.toISOString?.() ?? null,
    updatedAt: r.updatedAt?.toISOString?.() ?? null,
  };
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
  return { db, schema, user: auth.user };
}

function validate(body: LeadBody, partial: boolean): string | null {
  if (!partial && !body?.nombre?.trim()) return "El nombre es obligatorio";
  if (body.etapa !== undefined && !ETAPAS.includes(body.etapa as Etapa)) {
    return `Etapa inválida. Valores: ${ETAPAS.join(", ")}`;
  }
  if (body.canal !== undefined && !CANALES.includes(body.canal as (typeof CANALES)[number])) {
    return `Canal inválido. Valores: ${CANALES.join(", ")}`;
  }
  if (body.monto !== undefined && Number.isNaN(Number(body.monto))) return "Monto inválido";
  return null;
}

/** GET /api/leads — listado del pipeline. */
export async function GET(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_READ, req);
    if ("error" in c) return c.error;
    const rows = await c.db.select().from(c.schema.leads).orderBy(desc(c.schema.leads.createdAt));
    return NextResponse.json(rows.map(toView));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/leads — crear lead. Idempotente por (canal, origenExternoId). */
export async function POST(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_CREATE, req);
    if ("error" in c) return c.error;
    const body = (await req.json()) as LeadBody;
    const err = validate(body, false);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const values = {
      nombre: body.nombre!.trim(),
      apellido: (body.apellido ?? "").trim(),
      contactoId: body.contactoId || null,
      canal: body.canal ?? "MANUAL",
      etapa: body.etapa ?? "ENTRANTE",
      servicio: (body.servicio ?? "").trim(),
      monto: String(body.monto ?? 0),
      tags: body.tags ?? [],
      asignadoA: (body.asignadoA ?? "").trim(),
      venceEl: body.venceEl || null,
      notas: body.notas ?? "",
      origenExternoId: body.origenExternoId || null,
    };
    const [row] = await c.db
      .insert(c.schema.leads)
      .values(values)
      .onConflictDoNothing()
      .returning();
    if (!row) {
      const [existing] = await c.db
        .select()
        .from(c.schema.leads)
        .where(eq(c.schema.leads.origenExternoId, values.origenExternoId!))
        .limit(1);
      if (existing && values.origenExternoId) return NextResponse.json(toView(existing));
      return NextResponse.json({ error: "No se pudo crear el lead" }, { status: 500 });
    }
    return NextResponse.json(toView(row), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

/** PUT /api/leads — actualizar lead o mover de etapa (drag & drop). */
export async function PUT(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_UPDATE, req);
    if ("error" in c) return c.error;
    const body = (await req.json()) as LeadBody;
    if (!body.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    const err = validate(body, true);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (body.nombre !== undefined) set.nombre = body.nombre.trim();
    if (body.apellido !== undefined) set.apellido = (body.apellido ?? "").trim();
    if (body.contactoId !== undefined) set.contactoId = body.contactoId || null;
    if (body.canal !== undefined) set.canal = body.canal;
    if (body.etapa !== undefined) set.etapa = body.etapa;
    if (body.servicio !== undefined) set.servicio = (body.servicio ?? "").trim();
    if (body.monto !== undefined) set.monto = String(body.monto);
    if (body.tags !== undefined) set.tags = body.tags;
    if (body.asignadoA !== undefined) set.asignadoA = (body.asignadoA ?? "").trim();
    if (body.venceEl !== undefined) set.venceEl = body.venceEl || null;
    if (body.notas !== undefined) set.notas = body.notas;

    const [row] = await c.db
      .update(c.schema.leads)
      .set(set as never)
      .where(eq(c.schema.leads.id, body.id))
      .returning();
    if (!row) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
    return NextResponse.json(toView(row));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

/** DELETE /api/leads?id= */
export async function DELETE(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_UPDATE, req);
    if ("error" in c) return c.error;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    const [row] = await c.db
      .delete(c.schema.leads)
      .where(eq(c.schema.leads.id, id))
      .returning({ id: c.schema.leads.id });
    if (!row) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
