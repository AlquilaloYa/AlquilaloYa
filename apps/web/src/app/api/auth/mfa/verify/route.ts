import { NextResponse } from "next/server";
import {
  applySessionCookies,
  clearMfaCookies,
  readMfaTokens,
  verifyAccessToken,
  isNativeMobileRequest,
} from "@/lib/supabase-auth";
import { listVerifiedTotp, completeTotp } from "@/lib/mfa";
import { buildSessionUser } from "@/lib/app-user";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/mfa/verify { code } (SEC-015)
 * Segundo paso del login: valida el código TOTP contra la sesión AAL1 guardada
 * en cookies temporales y, si es correcto, emite la sesión completa (AAL2).
 */
export async function POST(req: Request) {
  try {
    const native = isNativeMobileRequest(req);
    const body = (await req.json().catch(() => ({}))) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code) {
      return NextResponse.json({ error: "Falta el código de verificación" }, { status: 400 });
    }

    const { accessToken } = readMfaTokens(req);
    if (!accessToken) {
      return NextResponse.json(
        { error: "No hay un inicio de sesión pendiente de MFA" },
        { status: 400 }
      );
    }

    const [factor] = await listVerifiedTotp(accessToken);
    if (!factor) {
      const res = NextResponse.json(
        { error: "No hay un factor MFA verificado para este usuario" },
        { status: 400 }
      );
      res.headers.set("Cache-Control", "no-store");
      return clearMfaCookies(res, native);
    }

    let tokens;
    try {
      tokens = await completeTotp(accessToken, factor.id, code);
    } catch (e) {
      const response = NextResponse.json(
        { error: (e as Error).message || "Código inválido" },
        { status: 401 }
      );
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    const identity = await verifyAccessToken(tokens.access_token);
    if (!identity) {
      const response = NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    const dbModule = await import("@contract/db");
    const user = await buildSessionUser(dbModule, identity.email);
    if (!user) {
      const res = NextResponse.json(
        { error: "Usuario sin acceso al sistema" },
        { status: 403 }
      );
      res.headers.set("Cache-Control", "no-store");
      return clearMfaCookies(res, native);
    }

    const res = NextResponse.json({ user }, { status: 200 });
    res.headers.set("Cache-Control", "no-store");
    return applySessionCookies(
      clearMfaCookies(res, native),
      {
        access_token: tokens.access_token,
        ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
      },
      native,
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
