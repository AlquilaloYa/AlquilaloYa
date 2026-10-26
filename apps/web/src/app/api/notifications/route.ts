import { and, count, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;

    const visibleTypes: string[] = [];
    if (requirePermission(auth.user, Permission.CONTRACT_READ) === null) {
      visibleTypes.push("CONTRACT_EXPIRY");
    }
    if (requirePermission(auth.user, Permission.WORK_ORDER_READ) === null) {
      visibleTypes.push(
        "WORK_ORDER_URGENT",
        "WORK_ORDER_ASSIGNED",
        "WORK_ORDER_UPDATE",
        "CLIENT_REQUEST_NEW",
      );
    }
    if (
      requirePermission(auth.user, Permission.PERMISSION_REQUEST_APPROVE) ===
      null
    ) {
      visibleTypes.push("PERMISSION_REQUEST");
    }
    if (!visibleTypes.length) {
      return NextResponse.json({ items: [], unreadCount: 0 });
    }

    const { db, schema } = dbModule;
    const [items, [unread]] = await Promise.all([
      db
        .select({
          id: schema.notifications.id,
          title: schema.notifications.title,
          body: schema.notifications.body,
          href: schema.notifications.href,
          isRead: schema.notifications.isRead,
          createdAt: schema.notifications.createdAt,
        })
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.userId, auth.user.id),
            eq(schema.notifications.isActive, true),
            inArray(schema.notifications.type, visibleTypes),
          ),
        )
        .orderBy(desc(schema.notifications.createdAt))
        .limit(30),
      db
        .select({ value: count() })
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.userId, auth.user.id),
            eq(schema.notifications.isActive, true),
            eq(schema.notifications.isRead, false),
            inArray(schema.notifications.type, visibleTypes),
          ),
        ),
    ]);
    return NextResponse.json({
      items: items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
      unreadCount: unread?.value ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las notificaciones",
      },
      { status: 500 },
    );
  }
}
