import { NextResponse } from "next/server";
import {
  readSessionTokens,
  verifyAccessToken,
} from "@/lib/supabase-auth";
import { listVerifiedTotp, unenrollFactor } from "@/lib/mfa";
import { mfaEnforce } from "@contract/config/env";
import { isMfaPrivilegedRole } from "@/lib/mfa-policy";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/auth/mfa — factores TOTP verificados del usuario autenticado. */
export async function GET(req: Request) {
  const dbModule = await import("@contract/db");
  const auth = await requireUser(dbModule, req);
  if ("error" in auth) return auth.error;
  const { accessToken } = readSessionTokens(req);
  const identity = await verifyAccessToken(accessToken);
  if (!identity || !accessToken) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  try {
    const factors = await listVerifiedTotp(accessToken);
    const response = NextResponse.json({
      factors: factors.map((f) => ({ id: f.id, ...(f.friendlyName ? { name: f.friendlyName } : {}) })),
      enabled: factors.length > 0,
      canDisable: !(mfaEnforce() && isMfaPrivilegedRole(auth.user.role)),
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
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
  const { accessToken } = readSessionTokens(req);
  const identity = await verifyAccessToken(accessToken);
  if (!identity || !accessToken) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { factorId?: unknown };
    const factorId = typeof body.factorId === "string" ? body.factorId : "";
    if (!factorId) {
      return NextResponse.json({ error: "Falta factorId" }, { status: 400 });
    }
    // Solo permitir retirar factores propios (verificados).
    const factors = await listVerifiedTotp(accessToken);
    if (!factors.some((f) => f.id === factorId)) {
      return NextResponse.json({ error: "Factor no encontrado" }, { status: 404 });
    }
    await unenrollFactor(accessToken, factorId);
    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
