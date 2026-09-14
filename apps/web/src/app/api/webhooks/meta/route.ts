import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ingresarMensaje } from "@/lib/messaging-gateway";

export const dynamic = "force-dynamic";

type MetaChange = {
  field?: string;
  value?: {
    messaging_product?: string;
    contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
    messages?: Array<{
      id?: string;
      from?: string;
      to?: string;
      type?: string;
      text?: { body?: string };
      button?: { text?: string };
      interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string }; nft_reply?: { title?: string } };
    }>;
    statuses?: unknown[];
  };
};

type MetaEntry = {
  id?: string;
  changes?: MetaChange[];
  messaging?: Array<{
    message?: { id?: string; text?: { text?: string }; is_echo?: boolean };
    sender?: { id?: string };
    recipient?: { id?: string };
  }>;
};

function firmaValida(raw: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * GET /api/webhooks/meta — verificación de suscripción (Meta llama aquí).
 * Requiere META_VERIFY_TOKEN.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const esperado = process.env.META_VERIFY_TOKEN;
  if (mode === "subscribe" && esperado && token === esperado && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new NextResponse("forbidden", { status: 403 });
}

/**
 * POST /api/webhooks/meta — recibe mensajes de WhatsApp Business Cloud y
 * Messenger (misma URL; Meta envía X-Hub-Signature-256 con META_APP_SECRET).
 */
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      return NextResponse.json({ error: "META_APP_SECRET no configurado" }, { status: 503 });
    }
    if (!firmaValida(raw, req.headers.get("x-hub-signature-256"), appSecret)) {
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }

    const payload = JSON.parse(raw) as { object?: string; entry?: MetaEntry[] };
    const dbModule = await import("@contract/db");
    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    let procesados = 0;
    let ignorados = 0;
    const nombrePorWaId = new Map<string, string>();

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value;
        if (!v) continue;
        for (const c of v.contacts ?? []) {
          if (c.wa_id && c.profile?.name) nombrePorWaId.set(c.wa_id, c.profile.name);
        }
        for (const m of v.messages ?? []) {
          const texto =
            m.text?.body ??
            m.button?.text ??
            m.interactive?.button_reply?.title ??
            m.interactive?.list_reply?.title ??
            m.interactive?.nft_reply?.title ??
            "";
          if (!m.from || !texto) {
            ignorados += 1;
            continue;
          }
          const res = await ingresarMensaje(db, schema, {
            canal: "WHATSAPP",
            conversacionExternaId: m.from,
            contactoNombre: nombrePorWaId.get(m.from) ?? "",
            contactoTelefono: m.from,
            contenido: texto,
            msgExternoId: m.id ?? null,
          });
          if (!res.duplicado) procesados += 1;
        }
      }
      // Messenger: entradas de página con array messaging
      for (const msg of entry.messaging ?? []) {
        const texto = msg.message?.text?.text;
        const senderId = msg.sender?.id;
        if (!senderId || !texto || msg.message?.is_echo) {
          ignorados += 1;
          continue;
        }
        const res = await ingresarMensaje(db, schema, {
          canal: "MESSENGER",
          conversacionExternaId: senderId,
          contenido: texto,
          msgExternoId: msg.message?.id ?? null,
        });
        if (!res.duplicado) procesados += 1;
      }
    }

    return NextResponse.json({ ok: true, procesados, ignorados });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
