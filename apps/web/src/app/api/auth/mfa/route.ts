import { NextResponse } from "next/server";
import {
  readSessionTokens,
  verifyAccessToken,
} from "@/lib/supabase-auth";
import { listVerifiedTotp, unenrollFactor } from "@/lib/mfa";

export const dynamic = "force-dynamic";

/** GET /api/auth/mfa — factores TOTP verificados del usuario autenticado. */
export async function GET(req: Request) {
  const { accessToken } = readSessionTokens(req);
  const identity = await verifyAccessToken(accessToken);
  if (!identity || !accessToken) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  try {
    const factors = await listVerifiedTotp(accessToken);
    return NextResponse.json({
      factors: factors.map((f) => ({ id: f.id, ...(f.friendlyName ? { name: f.friendlyName } : {}) })),
      enabled: factors.length > 0,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** DELETE /api/auth/mfa { factorId } — retira un factor TOTP. */
export async function DELETE(req: Request) {
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
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
