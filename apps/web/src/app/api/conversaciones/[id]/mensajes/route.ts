import { NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

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

/** GET /api/conversaciones/[id]/mensajes?read=1 — histórico (y marcar leídos). */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const c = await ctx(Permission.CLIENT_READ, req);
    if ("error" in c) return c.error;
    const url = new URL(req.url);
    if (url.searchParams.get("read") === "1") {
      await c.db
        .update(c.schema.conversations)
        .set({ noLeidos: 0, updatedAt: new Date() })
        .where(eq(c.schema.conversations.id, params.id));
    }
    const rows = await c.db
      .select()
      .from(c.schema.messages)
      .where(eq(c.schema.messages.conversationId, params.id))
      .orderBy(asc(c.schema.messages.createdAt));
    return NextResponse.json(
      rows.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        direccion: m.direccion,
        autor: m.autor,
        contenido: m.contenido,
        estado: m.estado,
        createdAt: m.createdAt?.toISOString?.() ?? null,
      }))
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/conversaciones/[id]/mensajes — enviar/agregar mensaje. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const c = await ctx(Permission.CLIENT_CREATE, req);
    if ("error" in c) return c.error;
    const body = (await req.json()) as { contenido?: string; direccion?: string; autor?: string };
    const contenido = (body.contenido ?? "").trim();
    if (!contenido) return NextResponse.json({ error: "El mensaje está vacío" }, { status: 400 });
    const direccion = body.direccion === "INBOUND" ? "INBOUND" : "OUTBOUND";
    const [conv] = await c.db
      .select({
        id: c.schema.conversations.id,
        canal: c.schema.conversations.canal,
        contactoTelefono: c.schema.conversations.contactoTelefono,
      })
      .from(c.schema.conversations)
      .where(eq(c.schema.conversations.id, params.id))
      .limit(1);
    if (!conv) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });

    const now = new Date();
    const [msg] = await c.db
      .insert(c.schema.messages)
      .values({
        conversationId: params.id,
        direccion,
        autor: (body.autor ?? "").trim() || (direccion === "OUTBOUND" ? c.user.name || c.user.email : ""),
        contenido,
        estado: direccion === "INBOUND" ? "ENVIADO" : "PENDIENTE",
      })
      .returning();
    if (!msg) return NextResponse.json({ error: "No se pudo enviar el mensaje" }, { status: 500 });
    await c.db
      .update(c.schema.conversations)
      .set({
        ultimoMensaje: contenido.slice(0, 300),
        ultimoMensajeEn: now,
        updatedAt: now,
        noLeidos: sql`${c.schema.conversations.noLeidos} + ${direccion === "INBOUND" ? 1 : 0}`,
      })
      .where(eq(c.schema.conversations.id, params.id));

    const messageView = {
      id: msg.id,
      conversationId: msg.conversationId,
      direccion: msg.direccion,
      autor: msg.autor,
      contenido: msg.contenido,
      estado: msg.estado,
      createdAt: msg.createdAt?.toISOString?.() ?? null,
    };

// Despacho saliente real (WhatsApp/Gmail) fuera de la transacción.
      if (direccion === "OUTBOUND") {
        const { despacharMensajeSaliente } = await import("@/lib/messaging-dispatcher");
        const r = await despacharMensajeSaliente({
          db: c.db,
          messageId: msg.id,
          canal: conv.canal,
          to: conv.contactoTelefono,
          text: contenido,
          userEmail: c.user.email,
        });
        // El estado lo decide el dispatcher: ENVIADO solo cuando hubo entrega
        // real o registro local (MANUAL). Sin conector => FALLO, no se finge.
        const estadoFinal = r.estado;
        if (estadoFinal !== msg.estado) {
        await c.db
          .update(c.schema.messages)
          .set({ estado: estadoFinal })
          .where(eq(c.schema.messages.id, msg.id));
        messageView.estado = estadoFinal;
      }
      return NextResponse.json({ ...messageView, despacho: r }, { status: 201 });
    }

    return NextResponse.json(messageView, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
