import { NextResponse } from "next/server";

/**
 * Cookies de sesión de Supabase Auth — módulo LIVIANO y edge-safe (sin config/
 * dotenv) para poder importarse desde el middleware. Solo gestiona cookies.
 */
export const ACCESS_COOKIE = "sb_at";
export const REFRESH_COOKIE = "sb_rt";
export const MOBILE_ACCESS_COOKIE = "sb_mobile_at";
export const MOBILE_REFRESH_COOKIE = "sb_mobile_rt";
// Cookies temporales durante el reto MFA (SEC-015): contienen una sesión AAL1
// que AÚN no da acceso; solo sirven para completar el segundo factor.
export const MFA_ACCESS_COOKIE = "sb_mfa_at";
export const MFA_REFRESH_COOKIE = "sb_mfa_rt";
export const MOBILE_MFA_ACCESS_COOKIE = "sb_mobile_mfa_at";
export const MOBILE_MFA_REFRESH_COOKIE = "sb_mobile_mfa_rt";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 días
const MFA_MAX_AGE = 10 * 60; // 10 minutos

const isProd = () => process.env.NODE_ENV === "production";
const NATIVE_CLIENT_HEADER = "x-fieldops-client";

export function isNativeMobileRequest(req: Request): boolean {
  return req.headers.get(NATIVE_CLIENT_HEADER) === "android-native";
}

function cookie(
  name: string,
  value: string,
  maxAge = MAX_AGE,
  native = false,
): string {
  const secure = isProd() || native ? "; Secure" : "";
  const sameSite = native ? "None" : "Lax";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${secure}`;
}
function expired(name: string, native = false): string {
  const secure = isProd() || native ? "; Secure" : "";
  const sameSite = native ? "None" : "Lax";
  return `${name}=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secure}`;
}

export function applySessionCookies(
  res: NextResponse,
  tokens: { access_token: string; refresh_token?: string },
  native = false,
): NextResponse {
  const accessCookie = native ? MOBILE_ACCESS_COOKIE : ACCESS_COOKIE;
  const refreshCookie = native ? MOBILE_REFRESH_COOKIE : REFRESH_COOKIE;
  res.headers.append(
    "Set-Cookie",
    cookie(accessCookie, tokens.access_token, MAX_AGE, native),
  );
  if (tokens.refresh_token) {
    res.headers.append(
      "Set-Cookie",
      cookie(refreshCookie, tokens.refresh_token, MAX_AGE, native),
    );
  }
  return res;
}

export function clearSessionCookies(
  res: NextResponse,
  native = false,
): NextResponse {
  const accessCookie = native ? MOBILE_ACCESS_COOKIE : ACCESS_COOKIE;
  const refreshCookie = native ? MOBILE_REFRESH_COOKIE : REFRESH_COOKIE;
  res.headers.append("Set-Cookie", expired(accessCookie, native));
  res.headers.append("Set-Cookie", expired(refreshCookie, native));
  return res;
}

/** Guarda los tokens AAL1 en cookies temporales mientras se completa el MFA. */
export function applyMfaCookies(
  res: NextResponse,
  tokens: { access_token: string; refresh_token?: string },
  native = false,
): NextResponse {
  const accessCookie = native ? MOBILE_MFA_ACCESS_COOKIE : MFA_ACCESS_COOKIE;
  const refreshCookie = native ? MOBILE_MFA_REFRESH_COOKIE : MFA_REFRESH_COOKIE;
  res.headers.append(
    "Set-Cookie",
    cookie(accessCookie, tokens.access_token, MFA_MAX_AGE, native),
  );
  if (tokens.refresh_token) {
    res.headers.append(
      "Set-Cookie",
      cookie(refreshCookie, tokens.refresh_token, MFA_MAX_AGE, native),
    );
  }
  return res;
}

export function clearMfaCookies(
  res: NextResponse,
  native = false,
): NextResponse {
  const accessCookie = native ? MOBILE_MFA_ACCESS_COOKIE : MFA_ACCESS_COOKIE;
  const refreshCookie = native ? MOBILE_MFA_REFRESH_COOKIE : MFA_REFRESH_COOKIE;
  res.headers.append("Set-Cookie", expired(accessCookie, native));
  res.headers.append("Set-Cookie", expired(refreshCookie, native));
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
  const native = isNativeMobileRequest(req);
  const out: { accessToken?: string; refreshToken?: string } = {};
  const at = c[native ? MOBILE_ACCESS_COOKIE : ACCESS_COOKIE];
  const rt = c[native ? MOBILE_REFRESH_COOKIE : REFRESH_COOKIE];
  if (at) out.accessToken = at;
  if (rt) out.refreshToken = rt;
  return out;
}

/** Lee los tokens temporales del reto MFA (SEC-015). */
export function readMfaTokens(req: Request): {
  accessToken?: string;
  refreshToken?: string;
} {
  const c = parseCookies(req.headers.get("cookie"));
  const native = isNativeMobileRequest(req);
  const out: { accessToken?: string; refreshToken?: string } = {};
  const at = c[native ? MOBILE_MFA_ACCESS_COOKIE : MFA_ACCESS_COOKIE];
  const rt = c[native ? MOBILE_MFA_REFRESH_COOKIE : MFA_REFRESH_COOKIE];
  if (at) out.accessToken = at;
  if (rt) out.refreshToken = rt;
  return out;
}
