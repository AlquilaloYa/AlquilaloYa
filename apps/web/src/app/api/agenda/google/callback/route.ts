import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { exchangeCode, gcalConfig, saveToken } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

/** GET /api/agenda/google/callback — canjea el code y guarda los tokens cifrados. */
export async function GET(req: Request) {
  const back = (q: string) => NextResponse.redirect(new URL(`/agenda?${q}`, req.url));
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_READ);
    if (denied) return denied;

    const cfg = gcalConfig();
    if (!cfg) return back("error=google-no-configurado");

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    if (error) return back(`error=${encodeURIComponent(error)}`);
    if (!code) return back("error=code-ausente");

    const savedState = cookies().get("gcal_oauth_state")?.value;
    cookies().set("gcal_oauth_state", "", { httpOnly: true, path: "/", maxAge: 0 });
    if (!savedState || savedState !== state) return back("error=estado-invalido");

    const tokens = await exchangeCode(cfg, code);
    await saveToken(auth.user.email, tokens);
    return back("connected=1");
  } catch (error) {
    return back(`error=${encodeURIComponent((error as Error).message)}`);
  }
}