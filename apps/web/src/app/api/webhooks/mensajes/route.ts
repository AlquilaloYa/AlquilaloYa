import { NextResponse } from "next/server";
import { ingresarMensaje, type MensajeCanonico } from "@/lib/messaging-gateway";

export const dynamic = "force-dynamic";

const CANALES = ["MANUAL", "WHATSAPP", "MESSENGER", "TIKTOK", "WEB", "LLAMADA", "EMAIL"] as const;

/**
 * POST /api/webhooks/mensajes — gateway canónico e idempotente.
 * Los adaptadores de canal transforman su payload a este formato y llaman aquí
 * (o reutilizan ingresarMensaje). Header: x-webhook-token = MESSAGING_WEBHOOK_TOKEN.
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

    const body = (await req.json()) as MensajeCanonico;
    const canal = (body.canal ?? "").toUpperCase();
    if (!CANALES.includes(canal as (typeof CANALES)[number])) {
      return NextResponse.json({ error: "canal inválido" }, { status: 400 });
    }

    const dbModule = await import("@contract/db");
    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const r = await ingresarMensaje(db, schema, { ...body, canal });
    return NextResponse.json({ ok: true, ...r });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
