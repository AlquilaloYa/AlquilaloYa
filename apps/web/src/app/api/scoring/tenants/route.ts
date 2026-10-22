import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/scoring/tenants — scoring 1-100 de cada inquilino con contrato activo. */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.SCORING_READ);
    if (denied) return denied;

    const repo = new dbModule.DrizzleScoringRepository();
    const rows = await repo.listTenantScores();

    return NextResponse.json({
      items: rows.map((row) => ({
        clienteId: row.clienteId,
        nombre: [row.nombres, row.apellidos].filter(Boolean).join(" "),
        documentoIdentidad: row.documentoIdentidad,
        telefono: row.telefono,
        contratosActivos: row.contratosActivos,
        departamentos: row.departamentos,
        score: row.score,
        band: row.band,
        breakdown: row.breakdown,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
