import { NextResponse } from "next/server";

/**
 * Cookies de sesión de Supabase Auth — módulo LIVIANO y edge-safe (sin config/
 * dotenv) para poder importarse desde el middleware. Solo gestiona cookies.
 */
export const ACCESS_COOKIE = "sb_at";
export const REFRESH_COOKIE = "sb_rt";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 días

const isProd = () => process.env.NODE_ENV === "production";

function cookie(name: string, value: string, maxAge = MAX_AGE): string {
  const secure = isProd() ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
function expired(name: string): string {
  const secure = isProd() ? "; Secure" : "";
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function applySessionCookies(
  res: NextResponse,
  tokens: { access_token: string; refresh_token?: string }
): NextResponse {
  res.headers.append("Set-Cookie", cookie(ACCESS_COOKIE, tokens.access_token));
  if (tokens.refresh_token) {
    res.headers.append("Set-Cookie", cookie(REFRESH_COOKIE, tokens.refresh_token));
  }
  return res;
}

export function clearSessionCookies(res: NextResponse): NextResponse {
  res.headers.append("Set-Cookie", expired(ACCESS_COOKIE));
  res.headers.append("Set-Cookie", expired(REFRESH_COOKIE));
  return res;
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (k) out[k] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function readSessionTokens(req: Request): {
  accessToken?: string;
  refreshToken?: string;
} {
  const c = parseCookies(req.headers.get("cookie"));
  const out: { accessToken?: string; refreshToken?: string } = {};
  const at = c[ACCESS_COOKIE];
  const rt = c[REFRESH_COOKIE];
  if (at) out.accessToken = at;
  if (rt) out.refreshToken = rt;
  return out;
}
