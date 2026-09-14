import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { evaluarReglas } from "@/lib/automatizaciones";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/automatizaciones/evaluar — ejecución manual del motor. */
export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_UPDATE);
    if (denied) return denied;
    const resultados = await evaluarReglas("MANUAL");
    return NextResponse.json({ ok: true, resultados });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
