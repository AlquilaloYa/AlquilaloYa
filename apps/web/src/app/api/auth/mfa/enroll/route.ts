import { NextResponse } from "next/server";
import {
  applySessionCookies,
  isNativeMobileRequest,
  readSessionTokens,
  resolveSession,
} from "@/lib/supabase-auth";
import { enrollTotp } from "@/lib/mfa";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/mfa/enroll (SEC-015)
 * Inicia el enrolamiento de un factor TOTP. Devuelve el QR (SVG data URL) y el
 * secreto para configurar el autenticador. Requiere sesión (AAL1 basta).
 */
export async function POST(req: Request) {
  const identity = await resolveSession(req);
  if (!identity) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const currentAccessToken =
    identity.refreshed?.access_token ?? readSessionTokens(req).accessToken;
  if (!currentAccessToken) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  try {
    const enrolled = await enrollTotp(currentAccessToken, identity.email);
    const response = NextResponse.json(enrolled);
    response.headers.set("Cache-Control", "no-store");
    return identity.refreshed
      ? applySessionCookies(response, identity.refreshed, isNativeMobileRequest(req))
      : response;
  } catch (error) {
    const response = NextResponse.json({ error: (error as Error).message }, { status: 500 });
    return identity.refreshed
      ? applySessionCookies(response, identity.refreshed, isNativeMobileRequest(req))
      : response;
  }
}
