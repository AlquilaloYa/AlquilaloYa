import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { metrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/**
 * GET /api/metrics (Fase 7) — métricas de operación.
 * Protegido: requiere sesión válida (no expone contadores a anónimos).
 */
export async function GET(req: Request) {
  const dbModule = await import("@contract/db");
  const auth = await requireUser(dbModule, req);
  if ("error" in auth) return auth.error;

  return NextResponse.json({
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
    env: process.env.NODE_ENV ?? "development",
    ...metrics.snapshot(),
  });
}
