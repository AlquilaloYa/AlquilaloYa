import { NextResponse } from "next/server";
import {
  applySessionCookies,
  readSessionTokens,
  verifyAccessToken,
  isNativeMobileRequest,
} from "@/lib/supabase-auth";
import { completeTotp } from "@/lib/mfa";
import { buildSessionUser } from "@/lib/app-user";
import { Permission } from "@contract/domain/rbac";
import { requirePermission } from "@/lib/session";
import { grantPaymentVerification } from "@/lib/payment-verification-session";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/mfa/activate { factorId, code } (SEC-015)
 * Confirma el código del factor recién enrolado y lo activa. Devuelve una
 * sesión AAL2 (se refrescan las cookies de sesión).
 */
export async function POST(req: Request) {
  try {
    const native = isNativeMobileRequest(req);
    const { accessToken } = readSessionTokens(req);
    const identity = await verifyAccessToken(accessToken);
    if (!identity || !accessToken) {
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
    if (body.purpose !== undefined && !paymentVerification) {
      return NextResponse.json({ error: "Propósito de activación no válido" }, { status: 400 });
    }
    if (!factorId || !code) {
      return NextResponse.json({ error: "Faltan factorId o código" }, { status: 400 });
    }

    let tokens;
    try {
      tokens = await completeTotp(accessToken, factorId, code);
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message || "Código inválido" },
        { status: 400 }
      );
    }

    const refreshed = await verifyAccessToken(tokens.access_token);
    if (!refreshed) {
      return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
    }

    const dbModule = await import("@contract/db");
    const user = await buildSessionUser(dbModule, refreshed.email);
    if (!user) {
      return NextResponse.json({ error: "Usuario sin acceso al sistema" }, { status: 403 });
    }
    if (paymentVerification) {
      const denied = requirePermission(user, Permission.CONTRACT_UPDATE);
      if (denied) return denied;
    }

    const res = NextResponse.json({ user }, { status: 200 });
    res.headers.set("Cache-Control", "no-store");
    const response = applySessionCookies(res, {
      access_token: tokens.access_token,
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    }, native);
    return paymentVerification ? grantPaymentVerification(response, user.id) : response;
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
