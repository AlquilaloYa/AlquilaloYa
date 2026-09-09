import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

function parseFilters(searchParams: URLSearchParams) {
  const take = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 200);
  const offset = Number(searchParams.get("offset") ?? 0) || 0;
  const filter: Record<string, string | number> = { limit: take, offset };
  const optional: Record<string, string> = {
    userId: "userId",
    action: "action",
    module: "module",
    entityType: "entityType",
    entityId: "entityId",
    result: "result",
    from: "from",
    to: "to",
  };
  for (const [param, key] of Object.entries(optional)) {
    const v = searchParams.get(param);
    if (v) filter[key] = v;
  }
  return filter;
}

/** GET /api/activity — actividad global según permisos (activity.read). */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;

    const denied = requirePermission(auth.user.role, Permission.ACTIVITY_READ);
    if (denied) return denied;

    const repo = new dbModule.DrizzleActivityRepository();
    const filter = parseFilters(new URL(req.url).searchParams) as import("@contract/domain").ActivityFilter;
    const [items, total] = await Promise.all([
      repo.find(filter),
      repo.count(filter),
    ]);

    return NextResponse.json({
      items: items.map((r) => ({
        id: r.id,
        timestamp: r.timestamp.toISOString(),
        userId: r.userId,
        actorType: r.actorType,
        user: r.userName ?? null,
        action: r.action,
        module: r.module,
        entityType: r.entityType,
        entityId: r.entityId,
        result: r.result,
        metadata: r.metadata,
      })),
      total,
      limit: filter.limit,
      offset: filter.offset,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}