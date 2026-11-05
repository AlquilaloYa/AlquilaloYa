import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { completeTotp, listVerifiedTotp } from "@/lib/mfa";
import { readSessionTokens } from "@/lib/supabase-auth";
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
    if (denied) return denied;

    const body = (await req.json().catch(() => ({}))) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Ingresa el código de 6 dígitos" }, { status: 400 });
    }

    const { accessToken } = readSessionTokens(req);
    if (!accessToken) {
      return NextResponse.json({ error: "No hay una sesión activa" }, { status: 401 });
    }
    const [factor] = await listVerifiedTotp(accessToken);
    if (!factor) {
      return NextResponse.json(
        { error: "Configura tu app autenticadora para continuar." },
        { status: 403 }
      );
    }

    try {
      await completeTotp(accessToken, factor.id, code);
    } catch {
      return NextResponse.json(
        { error: "El código no es válido o ya venció." },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "no-store");
    return grantPaymentVerification(response, auth.user.id);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Cache-Control", "no-store");
  return clearPaymentVerification(response);
}
