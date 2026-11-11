import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { webPushPublicKey } from "@/lib/task-web-push";

export const dynamic = "force-dynamic";

type SubscriptionBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

const ALLOWED_PUSH_HOSTS = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
]);

function isAllowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_PUSH_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

async function getContext(req: Request) {
  const dbModule = await import("@contract/db");
  const auth = await requireUser(dbModule, req);
  if ("error" in auth) return { response: auth.error } as const;
  return { dbModule, user: auth.user } as const;
}

/** GET /api/agenda/push — estado de Web Push para la cuenta y navegador actuales. */
export async function GET(req: Request) {
  try {
    const context = await getContext(req);
    if ("response" in context) return context.response;
    const { db, schema } = context.dbModule;
    const [[calendar], [subscription]] = await Promise.all([
      db
        .select({ email: schema.userGoogleTokens.email })
        .from(schema.userGoogleTokens)
        .where(eq(schema.userGoogleTokens.email, context.user.email))
        .limit(1),
      db
        .select({ id: schema.taskPushSubscriptions.id })
        .from(schema.taskPushSubscriptions)
        .where(eq(schema.taskPushSubscriptions.userId, context.user.id))
        .limit(1),
    ]);
    return NextResponse.json({
      configured: webPushPublicKey() !== null && Boolean(process.env.WEB_PUSH_SUBJECT),
      publicKey: webPushPublicKey(),
      calendarConnected: Boolean(calendar),
      subscribed: Boolean(subscription),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo consultar Web Push" },
      { status: 500 },
    );
  }
}

/** POST /api/agenda/push — registra esta cuenta/navegador para recordatorios de tareas. */
export async function POST(req: Request) {
  try {
    const context = await getContext(req);
    if ("response" in context) return context.response;
    const { db, schema } = context.dbModule;
    if (!webPushPublicKey() || !process.env.WEB_PUSH_SUBJECT) {
      return NextResponse.json({ error: "Los avisos push no están configurados en el servidor." }, { status: 503 });
    }

    const [calendar] = await db
      .select({ email: schema.userGoogleTokens.email })
      .from(schema.userGoogleTokens)
      .where(eq(schema.userGoogleTokens.email, context.user.email))
      .limit(1);
    if (!calendar) {
      return NextResponse.json({ error: "Conecta primero el Google Calendar de esta cuenta." }, { status: 409 });
    }

    let body: SubscriptionBody;
    try {
      body = (await req.json()) as SubscriptionBody;
    } catch {
      return NextResponse.json({ error: "El cuerpo no es JSON válido." }, { status: 400 });
    }
    const p256dh = body.keys?.p256dh;
    const auth = body.keys?.auth;
    if (
      !isAllowedPushEndpoint(body.endpoint) ||
      typeof p256dh !== "string" ||
      p256dh.length < 20 ||
      p256dh.length > 256 ||
      typeof auth !== "string" ||
      auth.length < 10 ||
      auth.length > 256
    ) {
      return NextResponse.json({ error: "La suscripción push no es válida." }, { status: 400 });
    }

    await db
      .insert(schema.taskPushSubscriptions)
      .values({
        userId: context.user.id,
        endpoint: body.endpoint,
        p256dh,
        auth,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.taskPushSubscriptions.endpoint,
        set: {
          userId: context.user.id,
          p256dh,
          auth,
          updatedAt: new Date(),
        },
      });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo activar Web Push" },
      { status: 500 },
    );
  }
}

/** DELETE /api/agenda/push — elimina solo la suscripción del navegador actual. */
export async function DELETE(req: Request) {
  try {
    const context = await getContext(req);
    if ("response" in context) return context.response;
    let body: { endpoint?: unknown };
    try {
      body = (await req.json()) as { endpoint?: unknown };
    } catch {
      return NextResponse.json({ error: "El cuerpo no es JSON válido." }, { status: 400 });
    }
    if (!isAllowedPushEndpoint(body.endpoint)) {
      return NextResponse.json({ error: "La suscripción push no es válida." }, { status: 400 });
    }
    await context.dbModule.db
      .delete(context.dbModule.schema.taskPushSubscriptions)
      .where(
        and(
          eq(context.dbModule.schema.taskPushSubscriptions.userId, context.user.id),
          eq(context.dbModule.schema.taskPushSubscriptions.endpoint, body.endpoint),
        ),
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo desactivar Web Push" },
      { status: 500 },
    );
  }
}
