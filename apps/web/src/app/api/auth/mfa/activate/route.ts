import { NextResponse } from "next/server";
import {
  applySessionCookies,
  isNativeMobileRequest,
  readSessionTokens,
  resolveSession,
  verifyAccessToken,
} from "@/lib/supabase-auth";
import { completeTotp } from "@/lib/mfa";
import { buildSessionUser } from "@/lib/app-user";
import { Permission } from "@contract/domain/rbac";
import { requirePermission } from "@/lib/session";
import { grantPaymentVerification } from "@/lib/payment-verification-session";
import { replaceAuthUserTotpFactor } from "@/lib/users-admin";
import { recordAdminAction } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/mfa/activate { factorId, code } (SEC-015)
 * Confirma el código del factor recién enrolado y lo activa. Devuelve una
 * sesión AAL2 (se refrescan las cookies de sesión).
 */
export async function POST(req: Request) {
  try {
    const native = isNativeMobileRequest(req);
    const identity = await resolveSession(req);
    if (!identity) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const accessToken =
      identity.refreshed?.access_token ?? readSessionTokens(req).accessToken;
    if (!accessToken) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      factorId?: unknown;
      code?: unknown;
      purpose?: unknown;
    };
    const factorId = typeof body.factorId === "string" ? body.factorId : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const paymentVerification = body.purpose === "payment-verification";
    const replaceLostFactor = body.purpose === "replace-lost-factor";
    if (body.purpose !== undefined && !paymentVerification && !replaceLostFactor) {
      return NextResponse.json({ error: "Propósito de activación no válido" }, { status: 400 });
    }
    if (!factorId || !code) {
      return NextResponse.json({ error: "Faltan factorId o código" }, { status: 400 });
    }

    let tokens;
    try {
      tokens = await completeTotp(accessToken, factorId, code);
    } catch (e) {
      const response = NextResponse.json(
        { error: (e as Error).message || "Código inválido" },
        { status: 400 }
      );
      return identity.refreshed
        ? applySessionCookies(response, identity.refreshed, native)
        : response;
    }

    const refreshed = await verifyAccessToken(tokens.access_token);
    if (!refreshed) {
      const response = NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
      return identity.refreshed
        ? applySessionCookies(response, identity.refreshed, native)
        : response;
    }

    const dbModule = await import("@contract/db");
    const user = await buildSessionUser(dbModule, refreshed.email);
    if (!user) {
      return NextResponse.json({ error: "Usuario sin acceso al sistema" }, { status: 403 });
    }
    if (paymentVerification || replaceLostFactor) {
      const denied = requirePermission(user, Permission.CONTRACT_UPDATE);
      if (denied) return denied;
    }

    let replacedFactors = 0;
    if (replaceLostFactor) {
      replacedFactors = await replaceAuthUserTotpFactor(refreshed.id, factorId);
      await recordAdminAction(dbModule, user, {
        action: "MFA_TOTP_FACTOR_RECOVERED",
        module: "SECURITY",
        entityType: "USER",
        entityId: user.id,
        current: { replacedFactors },
      });
    }

    const res = NextResponse.json({ user }, { status: 200 });
    res.headers.set("Cache-Control", "no-store");
    const response = applySessionCookies(res, {
      access_token: tokens.access_token,
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    }, native);
    return paymentVerification || replaceLostFactor
      ? grantPaymentVerification(response, user.id)
      : response;
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
