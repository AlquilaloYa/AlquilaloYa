import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

const CANALES = ["MANUAL", "WHATSAPP", "MESSENGER", "TIKTOK", "WEB", "LLAMADA", "EMAIL"] as const;

type WebhookBody = {
  canal?: string;
  conversacionExternaId?: string;
  contactoNombre?: string;
  contactoTelefono?: string;
  contenido?: string;
  msgExternoId?: string | null;
  direccion?: string;
};

/**
 * POST /api/webhooks/mensajes — gateway normalizado e idempotente.
 * Los adaptadores de canal (Meta WhatsApp/Messenger, TikTok) deben transformar
 * su payload a este formato canónico y llamar aquí con el header
 * `x-webhook-token` igual a MESSAGING_WEBHOOK_TOKEN.
 */
export async function POST(req: Request) {
  try {
    const secret = process.env.MESSAGING_WEBHOOK_TOKEN;
    if (!secret) {
      return NextResponse.json(
        { error: "Webhook no configurado: define MESSAGING_WEBHOOK_TOKEN" },
        { status: 503 }
      );
    }
    if (req.headers.get("x-webhook-token") !== secret) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }

    const body = (await req.json()) as WebhookBody;
    const canal = (body.canal ?? "").toUpperCase();
    const externoId = (body.conversacionExternaId ?? "").trim();
    const contenido = (body.contenido ?? "").trim();
    if (!CANALES.includes(canal as (typeof CANALES)[number])) {
      return NextResponse.json({ error: "canal inválido" }, { status: 400 });
    }
    if (!externoId || !contenido) {
      return NextResponse.json({ error: "conversacionExternaId y contenido son requeridos" }, { status: 400 });
    }
    const direccion = body.direccion === "OUTBOUND" ? "OUTBOUND" : "INBOUND";

    const dbModule = await import("@contract/db");
    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    let [conv] = await db
      .select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.canal, canal), eq(schema.conversations.externoId, externoId)))
      .limit(1);
    if (!conv) {
      const [created] = await db
        .insert(schema.conversations)
        .values({
          canal,
          externoId,
          contactoNombre: (body.contactoNombre ?? "").trim(),
          contactoTelefono: (body.contactoTelefono ?? "").trim(),
        })
        .returning();
      conv = created ?? undefined;
    }
    if (!conv) {
      return NextResponse.json({ error: "No se pudo crear la conversación" }, { status: 500 });
    }

    const extMsg = (body.msgExternoId ?? "").trim() || null;
    if (extMsg) {
      const dup = await db
        .select({ id: schema.messages.id })
        .from(schema.messages)
        .where(and(eq(schema.messages.conversationId, conv.id), eq(schema.messages.externoMsgId, extMsg)))
        .limit(1);
      if (dup.length > 0) {
        return NextResponse.json({ ok: true, duplicado: true, conversationId: conv.id });
      }
    }

    const now = new Date();
    await db.insert(schema.messages).values({
      conversationId: conv.id,
      direccion,
      contenido,
      externoMsgId: extMsg,
    });
    await db
      .update(schema.conversations)
      .set({
        ultimoMensaje: contenido.slice(0, 300),
        ultimoMensajeEn: now,
        updatedAt: now,
        noLeidos: direccion === "INBOUND" ? conv.noLeidos + 1 : conv.noLeidos,
      })
      .where(eq(schema.conversations.id, conv.id));

    return NextResponse.json({ ok: true, conversationId: conv.id });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
