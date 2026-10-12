import { NextResponse } from "next/server";
import {
  readSessionTokens,
  verifyAccessToken,
} from "@/lib/supabase-auth";
import { enrollTotp } from "@/lib/mfa";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/mfa/enroll (SEC-015)
 * Inicia el enrolamiento de un factor TOTP. Devuelve el QR (SVG data URL) y el
 * secreto para configurar el autenticador. Requiere sesión (AAL1 basta).
 */
export async function POST(req: Request) {
  const { accessToken } = readSessionTokens(req);
  const identity = await verifyAccessToken(accessToken);
  if (!identity || !accessToken) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  try {
    const enrolled = await enrollTotp(accessToken);
    return NextResponse.json(enrolled);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
