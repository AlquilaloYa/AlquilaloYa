import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

const CANALES = ["MANUAL", "WHATSAPP", "MESSENGER", "TIKTOK", "WEB", "LLAMADA", "EMAIL"] as const;
const ESTADOS = ["ABIERTA", "EN_ESPERA", "CERRADA"] as const;

type Body = {
  id?: string;
  canal?: string;
  contactoNombre?: string;
  contactoTelefono?: string;
  leadId?: string | null;
  estado?: string;
  asignadoA?: string;
};

function toView(r: {
  id: string;
  canal: string;
  externoId: string | null;
  contactoNombre: string;
  contactoTelefono: string;
  leadId: string | null;
  estado: string;
  asignadoA: string;
  ultimoMensaje: string;
  ultimoMensajeEn: Date | null;
  noLeidos: number;
  createdAt: Date;
}) {
  return {
    id: r.id,
    canal: r.canal,
    externoId: r.externoId,
    contactoNombre: r.contactoNombre,
    contactoTelefono: r.contactoTelefono,
    leadId: r.leadId,
    estado: r.estado,
    asignadoA: r.asignadoA,
    ultimoMensaje: r.ultimoMensaje,
    ultimoMensajeEn: r.ultimoMensajeEn?.toISOString?.() ?? null,
    noLeidos: r.noLeidos,
    createdAt: r.createdAt?.toISOString?.() ?? null,
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
  return { db, schema };
}

/** GET /api/conversaciones */
export async function GET(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_READ, req);
    if ("error" in c) return c.error;
    const rows = await c.db
      .select()
      .from(c.schema.conversations)
      .orderBy(desc(c.schema.conversations.ultimoMensajeEn), desc(c.schema.conversations.createdAt));
    return NextResponse.json(rows.map(toView));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/conversaciones — crear conversación manual. */
export async function POST(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_CREATE, req);
    if ("error" in c) return c.error;
    const body = (await req.json()) as Body;
    if (!body.contactoNombre?.trim()) {
      return NextResponse.json({ error: "Indica el nombre del contacto" }, { status: 400 });
    }
    if (body.canal !== undefined && !CANALES.includes(body.canal as (typeof CANALES)[number])) {
      return NextResponse.json({ error: "Canal inválido" }, { status: 400 });
    }
    const [row] = await c.db
      .insert(c.schema.conversations)
      .values({
        canal: body.canal ?? "MANUAL",
        contactoNombre: body.contactoNombre.trim(),
        contactoTelefono: (body.contactoTelefono ?? "").trim(),
        leadId: body.leadId || null,
        asignadoA: (body.asignadoA ?? "").trim(),
      })
      .returning();
    if (!row) return NextResponse.json({ error: "No se pudo crear la conversación" }, { status: 500 });
    return NextResponse.json(toView(row), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

/** PUT /api/conversaciones — actualizar estado/asignación/lead. */
export async function PUT(req: Request) {
  try {
    const c = await ctx(Permission.CLIENT_UPDATE, req);
    if ("error" in c) return c.error;
    const body = (await req.json()) as Body;
    if (!body.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    if (body.estado !== undefined && !ESTADOS.includes(body.estado as (typeof ESTADOS)[number])) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (body.estado !== undefined) set.estado = body.estado;
    if (body.asignadoA !== undefined) set.asignadoA = (body.asignadoA ?? "").trim();
    if (body.leadId !== undefined) set.leadId = body.leadId || null;
    if (body.contactoNombre !== undefined) set.contactoNombre = body.contactoNombre.trim();
    if (body.contactoTelefono !== undefined) set.contactoTelefono = body.contactoTelefono.trim();
    const [row] = await c.db
      .update(c.schema.conversations)
      .set(set as never)
      .where(eq(c.schema.conversations.id, body.id))
      .returning();
    if (!row) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    return NextResponse.json(toView(row));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
