import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Requiere contract.read + activity.read. Devuelve métricas + actividad reciente. */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;

    const denied = requirePermission(auth.user.role, Permission.CONTRACT_READ);
    if (denied) return denied;
    const deniedAct = requirePermission(auth.user.role, Permission.ACTIVITY_READ);
    if (deniedAct) return deniedAct;

    const dashboard = new dbModule.DrizzleDashboardRepository();
    const activity = new dbModule.DrizzleActivityRepository();

    const [metrics, resumen, recent] = await Promise.all([
      dashboard.getContractMetrics(),
      dashboard.getResumenPortafolio(),
      activity.findRecent(12),
    ]);

    return NextResponse.json({
      ...metrics,
      resumen,
      actividadReciente: recent.map((r) => ({
        id: r.id,
        timestamp: r.timestamp.toISOString(),
        actor: r.userName ?? r.actorType,
        action: r.action,
        module: r.module,
        entityId: r.entityId,
        result: r.result,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}