import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  addSessionCookiesIfRefreshed,
  resolveClientPortalIdentity,
  sameOriginRequest,
} from "@/lib/client-portal-auth";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const session = await resolveClientPortalIdentity(request, dbModule);
    if (!session) {
      return NextResponse.json({ error: "Sesión no válida" }, { status: 401 });
    }
    const notifications = await dbModule.db
      .select({
        id: dbModule.schema.clientPortalNotifications.id,
        type: dbModule.schema.clientPortalNotifications.type,
        title: dbModule.schema.clientPortalNotifications.title,
        body: dbModule.schema.clientPortalNotifications.body,
        isRead: dbModule.schema.clientPortalNotifications.isRead,
        createdAt: dbModule.schema.clientPortalNotifications.createdAt,
      })
      .from(dbModule.schema.clientPortalNotifications)
      .where(
        eq(
          dbModule.schema.clientPortalNotifications.clientId,
          session.identity.client.id,
        ),
      )
      .orderBy(desc(dbModule.schema.clientPortalNotifications.createdAt))
      .limit(50);
    const response = NextResponse.json({ notifications });
    response.headers.set("Cache-Control", "no-store");
    return addSessionCookiesIfRefreshed(response, session);
  } catch (error) {
    console.error("No se pudieron consultar las notificaciones del portal", error);
    return NextResponse.json(
      { error: "No se pudieron consultar las notificaciones" },
      { status: 503 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!sameOriginRequest(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });
  }
  const id =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).id
      : undefined;
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Notificación no válida" }, { status: 400 });
  }

  try {
    const dbModule = await import("@contract/db");
    const session = await resolveClientPortalIdentity(request, dbModule);
    if (!session) {
      return NextResponse.json({ error: "Sesión no válida" }, { status: 401 });
    }
    const [notification] = await dbModule.db
      .update(dbModule.schema.clientPortalNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(dbModule.schema.clientPortalNotifications.id, id),
          eq(
            dbModule.schema.clientPortalNotifications.clientId,
            session.identity.client.id,
          ),
        ),
      )
      .returning({ id: dbModule.schema.clientPortalNotifications.id });
    if (!notification) {
      return NextResponse.json({ error: "Notificación no encontrada" }, { status: 404 });
    }
    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "no-store");
    return addSessionCookiesIfRefreshed(response, session);
  } catch (error) {
    console.error("No se pudo marcar como leída la notificación del portal", error);
    return NextResponse.json(
      { error: "No se pudo actualizar la notificación" },
      { status: 503 },
    );
  }
}
