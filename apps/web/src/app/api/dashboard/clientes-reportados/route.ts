import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Clientes reportados: clientes con reportes activos (tenant_incidents).
 * No son los morosos; es la lista de reportes de clientes registrados.
 */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.SCORING_READ);
    if (denied) return denied;

    const repo = new dbModule.DrizzleScoringRepository();
    const clientes = await repo.listReportedClients();
    return NextResponse.json({
      total: clientes.length,
      clientes,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
