import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { completeTotp, listVerifiedTotp } from "@/lib/mfa";
import { applySessionCookies, isNativeMobileRequest } from "@/lib/supabase-auth";
import {
  clearPaymentVerification,
  grantPaymentVerification,
} from "@/lib/payment-verification-session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) {
      return auth.sessionTokens.refreshed
        ? applySessionCookies(denied, auth.sessionTokens.refreshed, isNativeMobileRequest(req))
        : denied;
    }

    const body = (await req.json().catch(() => ({}))) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Ingresa el código de 6 dígitos" }, { status: 400 });
    }

    const { accessToken } = auth.sessionTokens;
    const [factor] = await listVerifiedTotp(accessToken);
    if (!factor) {
      return NextResponse.json(
        { error: "Configura tu app autenticadora para continuar." },
        { status: 403 }
      );
    }

    let tokens: Awaited<ReturnType<typeof completeTotp>>;
    try {
      tokens = await completeTotp(accessToken, factor.id, code);
    } catch {
      const response = NextResponse.json(
        { error: "El código no es válido o ya venció." },
        { status: 401 }
      );
      return auth.sessionTokens.refreshed
        ? applySessionCookies(response, auth.sessionTokens.refreshed, isNativeMobileRequest(req))
        : response;
    }

    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "no-store");
    const refreshedToken = tokens.refresh_token ?? auth.sessionTokens.refreshToken;
    return grantPaymentVerification(
      applySessionCookies(
        response,
        {
          access_token: tokens.access_token,
          ...(refreshedToken ? { refresh_token: refreshedToken } : {}),
        },
        isNativeMobileRequest(req)
      ),
      auth.user.id
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Cache-Control", "no-store");
  return clearPaymentVerification(response);
}
