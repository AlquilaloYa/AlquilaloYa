import { NextResponse } from "next/server";
import {
  clearClientPortalCookies,
  resolveClientPortalSession,
  revokeClientPortalSession,
  sameOriginRequest,
} from "@/lib/client-portal-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  try {
    const session = await resolveClientPortalSession(request);
    if (session) await revokeClientPortalSession(session.tokens.access_token);
    return clearClientPortalCookies(NextResponse.json({ ok: true }));
  } catch {
    return NextResponse.json(
      { error: "No fue posible cerrar la sesión. Inténtalo de nuevo." },
      { status: 503 },
    );
  }
}
