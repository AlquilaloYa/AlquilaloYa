import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    if (!UUID_PATTERN.test(params.id)) {
      return NextResponse.json(
        { error: "La notificación indicada no es válida" },
        { status: 400 },
      );
    }

    const [notification] = await dbModule.db
      .update(dbModule.schema.notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(dbModule.schema.notifications.id, params.id),
          eq(dbModule.schema.notifications.userId, auth.user.id),
          eq(dbModule.schema.notifications.isActive, true),
        ),
      )
      .returning({ id: dbModule.schema.notifications.id });
    if (!notification) {
      return NextResponse.json(
        { error: "La notificación no existe" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo marcar la notificación como leída",
      },
      { status: 500 },
    );
  }
}
