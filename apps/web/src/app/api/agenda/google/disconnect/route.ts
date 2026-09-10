import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { deleteToken } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

/** POST /api/agenda/google/disconnect — desvincula la cuenta de Google del usuario. */
export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_UPDATE);
    if (denied) return denied;

    await deleteToken(auth.user.email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}