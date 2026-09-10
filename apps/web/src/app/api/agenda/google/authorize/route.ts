import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { buildAuthUrl, gcalConfig } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

/** GET /api/agenda/google/authorize — redirige al consentimiento de Google. */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_READ);
    if (denied) return denied;

    const cfg = gcalConfig();
    if (!cfg) {
      return NextResponse.redirect(new URL("/agenda?error=google-no-configurado", req.url));
    }
    const state = randomBytes(16).toString("hex");
    cookies().set("gcal_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return NextResponse.redirect(buildAuthUrl(cfg, state));
  } catch (error) {
    return NextResponse.redirect(new URL(`/agenda?error=${encodeURIComponent((error as Error).message)}`, req.url));
  }
}