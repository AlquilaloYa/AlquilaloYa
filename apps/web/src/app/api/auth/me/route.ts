import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { applySessionCookies, isNativeMobileRequest } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

/** GET /api/auth/me — usuario de la sesión de Supabase + rol, o 401/403. */
export async function GET(req: Request) {
  const dbModule = await import("@contract/db");
  const auth = await requireUser(dbModule, req);
  if ("error" in auth) return auth.error;
  const { db, schema } = dbModule;
  const [employee] = await db
    .select({ id: schema.hrEmployees.id })
    .from(schema.hrEmployees)
    .where(
      and(
        eq(schema.hrEmployees.userId, auth.user.id),
        eq(schema.hrEmployees.estado, "ACTIVO"),
        isNull(schema.hrEmployees.deletedAt),
      ),
    )
    .limit(1);
  const { id, email, name, role, additionalPermissions } = auth.user;
  const response = NextResponse.json({
    user: {
      id,
      email,
      name,
      role,
      employeeId: employee?.id ?? null,
      additionalPermissions,
    },
  });
  response.headers.set("Cache-Control", "no-store");
  return auth.sessionTokens.refreshed
    ? applySessionCookies(
        response,
        auth.sessionTokens.refreshed,
        isNativeMobileRequest(req),
      )
    : response;
}
