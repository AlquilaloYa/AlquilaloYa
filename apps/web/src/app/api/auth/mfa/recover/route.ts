import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { enrollTotp } from "@/lib/mfa";
import { buildSessionUser } from "@/lib/app-user";
import { recordAdminAction } from "@/lib/audit-log";
import { loginWithPassword, resolveSession, verifyAccessToken } from "@/lib/supabase-auth";
import { applySessionCookies, isNativeMobileRequest } from "@/lib/session-cookies";
import { requirePermission } from "@/lib/session";
import { removeAllAuthUserTotpFactors, isUsersAdminConfigured } from "@/lib/users-admin";
import { supabaseAnonKey, supabaseUrl } from "@contract/config/env";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const identity = await resolveSession(req);
  if (!identity) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  if (typeof body.password !== "string" || body.password.length === 0) {
    return NextResponse.json({ error: "Ingresa tu contraseña para recuperar el autenticador." }, { status: 400 });
  }
  if (!supabaseUrl() || !supabaseAnonKey() || !isUsersAdminConfigured()) {
    return NextResponse.json({ error: "La recuperación MFA no está configurada." }, { status: 503 });
  }

  try {
    const login = await loginWithPassword(identity.email, body.password);
    if (!login) {
      return NextResponse.json({ error: "La contraseña no es correcta." }, { status: 401 });
    }
    const verified = await verifyAccessToken(login.access_token);
    if (!verified || verified.id !== identity.id) {
      return NextResponse.json({ error: "No se pudo confirmar la cuenta." }, { status: 401 });
    }

    const dbModule = await import("@contract/db");
    const user = await buildSessionUser(dbModule, verified.email);
    if (!user) {
      return NextResponse.json({ error: "Usuario sin acceso al sistema" }, { status: 403 });
    }
    const denied = requirePermission(user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const removedFactors = await removeAllAuthUserTotpFactors(verified.id);
    await recordAdminAction(dbModule, user, {
      action: "MFA_TOTP_RECOVERY_STARTED",
      module: "SECURITY",
      entityType: "USER",
      entityId: user.id,
      current: { removedFactors },
    });

    const enrolled = await enrollTotp(login.access_token, verified.email);
    const response = NextResponse.json(enrolled);
    response.headers.set("Cache-Control", "no-store");
    return applySessionCookies(response, login, isNativeMobileRequest(req));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo recuperar el autenticador." },
      { status: 500 }
    );
  }
}
