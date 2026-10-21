import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

/** DELETE /api/scoring/incidents/:id — baja lógica de una incidencia. */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.SCORING_MANAGE);
    if (denied) return denied;

    const repo = new dbModule.DrizzleScoringRepository();
    const ok = await repo.softDeleteIncident(params.id);
    if (!ok) {
      return NextResponse.json({ error: "Incidencia no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
