import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/canales/estado — diagnóstico de conectores de mensajería:
 * qué variables están definidas y qué URL de webhook configurar en Meta.
 */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_READ);
    if (denied) return denied;

    const base = (process.env.NEXT_PUBLIC_URL ?? req.headers.get("origin") ?? "").replace(/\/$/, "");
    return NextResponse.json({
      variables: {
        META_APP_SECRET: Boolean(process.env.META_APP_SECRET),
        META_VERIFY_TOKEN: Boolean(process.env.META_VERIFY_TOKEN),
        MESSAGING_WEBHOOK_TOKEN: Boolean(process.env.MESSAGING_WEBHOOK_TOKEN),
        CRON_SECRET: Boolean(process.env.CRON_SECRET),
        WHATSAPP_TOKEN: Boolean(process.env.WHATSAPP_TOKEN),
        WHATSAPP_PHONE_NUMBER_ID: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
      },
      webhooks: {
        meta: base ? `${base}/api/webhooks/meta` : "/api/webhooks/meta",
        canonico: base ? `${base}/api/webhooks/mensajes` : "/api/webhooks/mensajes",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
