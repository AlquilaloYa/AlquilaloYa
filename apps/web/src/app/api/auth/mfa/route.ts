import { NextResponse } from "next/server";
import {
  applySessionCookies,
  isNativeMobileRequest,
  readSessionTokens,
  resolveSession,
} from "@/lib/supabase-auth";
import { listVerifiedTotp, unenrollFactor } from "@/lib/mfa";
import { mfaEnforce } from "@contract/config/env";
import { isMfaPrivilegedRole } from "@/lib/mfa-policy";
import { requireUser } from "@/lib/session";
import { buildSessionUser } from "@/lib/app-user";

export const dynamic = "force-dynamic";

/** GET /api/auth/mfa — factores TOTP verificados del usuario autenticado. */
export async function GET(req: Request) {
  const dbModule = await import("@contract/db");
  const identity = await resolveSession(req);
  if (!identity) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const accessToken = identity.refreshed?.access_token ?? readSessionTokens(req).accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const user = await buildSessionUser(dbModule, identity.email);
  if (!user) {
    return NextResponse.json({ error: "Usuario sin acceso al sistema" }, { status: 403 });
  }
  try {
    const factors = await listVerifiedTotp(accessToken);
    const response = NextResponse.json({
      factors: factors.map((f) => ({ id: f.id, ...(f.friendlyName ? { name: f.friendlyName } : {}) })),
      enabled: factors.length > 0,
      canDisable: !(mfaEnforce() && isMfaPrivilegedRole(user.role)),
    });
    response.headers.set("Cache-Control", "no-store");
    return identity.refreshed
      ? applySessionCookies(response, identity.refreshed, isNativeMobileRequest(req))
      : response;
  } catch (error) {
    const response = NextResponse.json({ error: (error as Error).message }, { status: 500 });
    return identity.refreshed
      ? applySessionCookies(response, identity.refreshed, isNativeMobileRequest(req))
      : response;
  }
}

/** DELETE /api/auth/mfa { factorId } — retira un factor TOTP. */
export async function DELETE(req: Request) {
  const dbModule = await import("@contract/db");
  const auth = await requireUser(dbModule, req);
  if ("error" in auth) return auth.error;
  if (mfaEnforce() && isMfaPrivilegedRole(auth.user.role)) {
    return NextResponse.json(
      { error: "MFA es obligatorio para este rol y no se puede desactivar." },
      { status: 403 },
    );
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { factorId?: unknown };
    const factorId = typeof body.factorId === "string" ? body.factorId : "";
    if (!factorId) {
      return NextResponse.json({ error: "Falta factorId" }, { status: 400 });
    }
    // Solo permitir retirar factores propios (verificados).
    const factors = await listVerifiedTotp(auth.sessionTokens.accessToken);
    if (!factors.some((f) => f.id === factorId)) {
      return NextResponse.json({ error: "Factor no encontrado" }, { status: 404 });
    }
    await unenrollFactor(auth.sessionTokens.accessToken, factorId);
    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "no-store");
    return auth.sessionTokens.refreshed
      ? applySessionCookies(response, auth.sessionTokens.refreshed, isNativeMobileRequest(req))
      : response;
  } catch (error) {
    const response = NextResponse.json({ error: (error as Error).message }, { status: 500 });
    return auth.sessionTokens.refreshed
      ? applySessionCookies(response, auth.sessionTokens.refreshed, isNativeMobileRequest(req))
      : response;
  }
}
