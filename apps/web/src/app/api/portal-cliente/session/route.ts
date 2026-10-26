import { NextResponse } from "next/server";
import { addSessionCookiesIfRefreshed, resolveClientPortalIdentity } from "@/lib/client-portal-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const session = await resolveClientPortalIdentity(request, dbModule);
    if (!session) {
      return NextResponse.json({ error: "Sesión no válida" }, { status: 401 });
    }
    const response = NextResponse.json({ client: session.identity.client });
    response.headers.set("Cache-Control", "no-store");
    return addSessionCookiesIfRefreshed(response, session);
  } catch {
    return NextResponse.json(
      { error: "No fue posible validar la sesión" },
      { status: 503 },
    );
  }
}
