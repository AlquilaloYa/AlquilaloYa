import { NextResponse } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@contract/config/env";
import { readSessionTokens, clearSessionCookies } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — cierra la sesión en Supabase (mejor esfuerzo) y limpia cookies. */
export async function POST(req: Request) {
  try {
    const { accessToken } = readSessionTokens(req);
    const url = supabaseUrl();
    const anon = supabaseAnonKey();
    if (url && anon && accessToken) {
      await fetch(`${url}/auth/v1/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: anon,
        },
        cache: "no-store",
      }).catch(() => undefined);
    }
  } catch {
    /* best-effort */
  }
  return clearSessionCookies(NextResponse.json({ ok: true }, { status: 200 }));
}
