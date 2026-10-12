import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { metrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/**
 * GET /api/metrics (Fase 7) — métricas de operación.
 * Protegido (SEC-075): requiere sesión válida y el permiso `audit.read`
 * (solo Developer/Administrador), para no exponer contadores a cualquier
 * usuario autenticado.
 */
export async function GET(req: Request) {
  const dbModule = await import("@contract/db");
  const auth = await requireUser(dbModule, req);
  if ("error" in auth) return auth.error;
  const denied = requirePermission(auth.user, Permission.AUDIT_READ);
  if (denied) return denied;

  return NextResponse.json({
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
    env: process.env.NODE_ENV ?? "development",
    ...metrics.snapshot(),
  });
}
