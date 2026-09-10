import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import {
  GcalNotConnected,
  createEvent,
  deleteEvent,
  getValidAccessToken,
  isGcalEnabled,
  listEvents,
  getToken,
} from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

function monthRange(): { min: Date; max: Date } {
  const now = new Date();
  return { min: new Date(now.getFullYear(), now.getMonth(), 1), max: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
}

/** GET /api/agenda — estado de conexion + eventos de Google del rango indicado. */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_READ);
    if (denied) return denied;

    if (!isGcalEnabled()) {
      return NextResponse.json({ configured: false, connected: false, events: [] });
    }
    const stored = await getToken(auth.user.email);
    if (!stored) {
      return NextResponse.json({ configured: true, connected: false, events: [] });
    }

    const url = new URL(req.url);
    const def = monthRange();
    const timeMin = url.searchParams.get("timeMin") ? new Date(url.searchParams.get("timeMin") as string) : def.min;
    const timeMax = url.searchParams.get("timeMax") ? new Date(url.searchParams.get("timeMax") as string) : def.max;

    const { token, calendarId } = await getValidAccessToken(auth.user.email);
    const events = await listEvents(token, calendarId, timeMin, timeMax);
    return NextResponse.json({ configured: true, connected: true, events });
  } catch (error) {
    if (error instanceof GcalNotConnected) {
      return NextResponse.json({ configured: true, connected: false, events: [] });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/agenda — crea un evento en Google Calendar. */
export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_CREATE);
    if (denied) return denied;

    const body = (await req.json()) as {
      summary?: string;
      description?: string;
      start?: string;
      end?: string;
      allDay?: boolean;
    };
    if (!body.summary?.trim()) {
      return NextResponse.json({ error: "Indica el titulo del evento" }, { status: 400 });
    }
    if (!body.start) {
      return NextResponse.json({ error: "Indica la fecha/hora de inicio" }, { status: 400 });
    }
    const { token, calendarId } = await getValidAccessToken(auth.user.email);
    const ev = await createEvent(token, calendarId, {
      summary: body.summary.trim(),
      description: body.description,
      start: body.start,
      end: body.end,
      allDay: body.allDay,
    });
    return NextResponse.json(ev, { status: 201 });
  } catch (error) {
    if (error instanceof GcalNotConnected) {
      return NextResponse.json({ error: "Primero conecta tu cuenta de Google." }, { status: 409 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** DELETE /api/agenda?id= — elimina un evento de Google Calendar. */
export async function DELETE(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_UPDATE);
    if (denied) return denied;

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    const { token, calendarId } = await getValidAccessToken(auth.user.email);
    await deleteEvent(token, calendarId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof GcalNotConnected) {
      return NextResponse.json({ error: "Primero conecta tu cuenta de Google." }, { status: 409 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}