import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { enrollTotp } from "@/lib/mfa";
import { buildSessionUser } from "@/lib/app-user";
import { recordAdminAction } from "@/lib/audit-log";
import { readSessionTokens, resolveSession } from "@/lib/supabase-auth";
import { applySessionCookies, isNativeMobileRequest } from "@/lib/session-cookies";
import { requirePermission } from "@/lib/session";
import { removeAllAuthUserTotpFactors, isUsersAdminConfigured } from "@/lib/users-admin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const identity = await resolveSession(req);
  if (!identity) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const accessToken = identity.refreshed?.access_token ?? readSessionTokens(req).accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!isUsersAdminConfigured()) {
    return NextResponse.json({ error: "La recuperación MFA no está configurada." }, { status: 503 });
  }

  try {
    const dbModule = await import("@contract/db");
    const user = await buildSessionUser(dbModule, identity.email);
    if (!user) {
      return NextResponse.json({ error: "Usuario sin acceso al sistema" }, { status: 403 });
    }
    const denied = requirePermission(user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const removedFactors = await removeAllAuthUserTotpFactors(identity.id);
    await recordAdminAction(dbModule, user, {
      action: "MFA_TOTP_RECOVERY_STARTED",
      module: "SECURITY",
      entityType: "USER",
      entityId: user.id,
      current: { removedFactors },
    });

    const enrolled = await enrollTotp(accessToken, identity.email);
    const response = NextResponse.json(enrolled);
    response.headers.set("Cache-Control", "no-store");
    return identity.refreshed
      ? applySessionCookies(response, identity.refreshed, isNativeMobileRequest(req))
      : response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo recuperar el autenticador." },
      { status: 500 }
    );
  }
}
