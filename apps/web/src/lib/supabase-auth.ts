import { supabaseAnonKey, supabaseUrl } from "@contract/config/env";
import { decodeJwtPayload } from "@/lib/jwt";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  MFA_ACCESS_COOKIE,
  MFA_REFRESH_COOKIE,
  applySessionCookies,
  clearSessionCookies,
  applyMfaCookies,
  clearMfaCookies,
  readSessionTokens,
  readMfaTokens,
  isNativeMobileRequest,
} from "@/lib/session-cookies";

/**
 * Autenticación contra Supabase Auth vía REST (sin SDK), en la línea de
 * lib/storage.ts. La sesión vive en cookies httpOnly (ver session-cookies.ts) y
 * se VALIDA EN EL SERVIDOR contra /auth/v1/user: el cliente no puede forjarla.
 */
export {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  MFA_ACCESS_COOKIE,
  MFA_REFRESH_COOKIE,
  applySessionCookies,
  clearSessionCookies,
  applyMfaCookies,
  clearMfaCookies,
  readSessionTokens,
  readMfaTokens,
  isNativeMobileRequest,
};

export class SupabaseAuthUnavailableError extends Error {
  constructor() {
    super("Supabase Auth no está disponible temporalmente");
    this.name = "SupabaseAuthUnavailableError";
  }
}

const VERIFIED_SESSION_TTL_MS = 15_000;
const MAX_VERIFIED_SESSIONS = 500;
const verifiedSessionCache = new Map<
  string,
  { expiresAt: number; identity: { email: string; id: string; aal?: string } }
>();

async function hashAccessToken(accessToken: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(accessToken)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function cachedSession(key: string) {
  const cached = verifiedSessionCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    verifiedSessionCache.delete(key);
    return null;
  }
  return { key, identity: cached.identity };
}

function cacheSession(
  key: string,
  identity: { email: string; id: string; aal?: string }
): void {
  const now = Date.now();
  for (const [cacheKey, entry] of verifiedSessionCache) {
    if (entry.expiresAt <= now) verifiedSessionCache.delete(cacheKey);
  }
  while (verifiedSessionCache.size >= MAX_VERIFIED_SESSIONS) {
    const oldestKey = verifiedSessionCache.keys().next().value;
    if (oldestKey === undefined) break;
    verifiedSessionCache.delete(oldestKey);
  }
  verifiedSessionCache.set(key, {
    expiresAt: now + VERIFIED_SESSION_TTL_MS,
    identity,
  });
}

/** Cambia email+password por tokens (flujo de contraseña de Supabase). */
export async function loginWithPassword(
  email: string,
  password: string
): Promise<{ access_token: string; refresh_token?: string; email: string } | null> {
  const url = supabaseUrl();
  const anon = supabaseAnonKey();
  if (!url || !anon) return null;

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    user?: { email?: string };
  };
  if (!data.access_token) return null;
  return {
    access_token: data.access_token,
    ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
    email: data.user?.email ?? email,
  };
}

/** Valida un access token contra Supabase. Devuelve email/id verificados o null. */
export async function verifyAccessToken(
  accessToken: string | undefined
): Promise<{ email: string; id: string; aal?: string } | null> {
  if (!accessToken) return null;
  let cacheKey: string;
  try {
    cacheKey = await hashAccessToken(accessToken);
  } catch {
    throw new SupabaseAuthUnavailableError();
  }
  const cached = cachedSession(cacheKey);
  if (cached) return cached.identity;
  const url = supabaseUrl();
  const anon = supabaseAnonKey();
  if (!url || !anon) throw new SupabaseAuthUnavailableError();
  let res: Response;
  try {
    res = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: anon },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new SupabaseAuthUnavailableError();
  }
  if (res.status === 429 || res.status >= 500) {
    throw new SupabaseAuthUnavailableError();
  }
  if (!res.ok) return null;
  try {
    const data = (await res.json()) as { email?: string; id?: string };
    if (!data.email || !data.id) return null;
    // SEC-015: el claim `aal` del access token indica si la sesión ya pasó MFA.
    const aal = decodeJwtPayload(accessToken)?.aal;
    const identity = { email: data.email, id: data.id, ...(aal ? { aal } : {}) };
    cacheSession(cacheKey, identity);
    return identity;
  } catch {
    throw new SupabaseAuthUnavailableError();
  }
}

/** Reemplaza un access token caducado usando el refresh token (mejor esfuerzo). */
export async function refreshSession(
  refreshToken: string
): Promise<{ access_token: string; refresh_token?: string } | null> {
  const url = supabaseUrl();
  const anon = supabaseAnonKey();
  if (!url || !anon) throw new SupabaseAuthUnavailableError();
  let res: Response;
  try {
    res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anon },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new SupabaseAuthUnavailableError();
  }
  if (res.status === 429 || res.status >= 500) {
    throw new SupabaseAuthUnavailableError();
  }
  if (!res.ok) return null;
  try {
    const d = (await res.json()) as { access_token?: string; refresh_token?: string };
    if (!d.access_token) return null;
    return {
      access_token: d.access_token,
      ...(d.refresh_token ? { refresh_token: d.refresh_token } : {}),
    };
  } catch {
    throw new SupabaseAuthUnavailableError();
  }
}

/**
 * Resuelve la identidad desde la request: valida el access token; si caducó,
 * refresca con el refresh token y (si se pasa `res`) adjunta cookies nuevas.
 */
export async function resolveSession(req: Request): Promise<{
  email: string;
  id: string;
  aal?: string;
  refreshed?: { access_token: string; refresh_token?: string };
} | null> {
  const { accessToken, refreshToken } = readSessionTokens(req);
  const direct = await verifyAccessToken(accessToken);
  if (direct) return direct;
  if (refreshToken) {
    const fresh = await refreshSession(refreshToken);
    if (fresh) {
      const verified = await verifyAccessToken(fresh.access_token);
      if (verified) return { ...verified, refreshed: fresh };
    }
  }
  return null;
}
