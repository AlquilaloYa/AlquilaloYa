import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/auth/me — usuario de la sesión de Supabase + rol, o 401/403. */
export async function GET(req: Request) {
  const dbModule = await import("@contract/db");
  const auth = await requireUser(dbModule, req);
  if ("error" in auth) return auth.error;
  const { id, email, name, role } = auth.user;
  return NextResponse.json({ user: { id, email, name, role } });
}
