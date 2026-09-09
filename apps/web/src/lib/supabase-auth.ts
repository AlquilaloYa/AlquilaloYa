import { supabaseAnonKey, supabaseUrl } from "@contract/config/env";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  applySessionCookies,
  clearSessionCookies,
  readSessionTokens,
} from "@/lib/session-cookies";

/**
 * Autenticación contra Supabase Auth vía REST (sin SDK), en la línea de
 * lib/storage.ts. La sesión vive en cookies httpOnly (ver session-cookies.ts) y
 * se VALIDA EN EL SERVIDOR contra /auth/v1/user: el cliente no puede forjarla.
 */
export {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  applySessionCookies,
  clearSessionCookies,
  readSessionTokens,
};

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
): Promise<{ email: string; id: string } | null> {
  if (!accessToken) return null;
  const url = supabaseUrl();
  const anon = supabaseAnonKey();
  if (!url || !anon) return null;
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: anon },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string; id?: string };
    if (!data.email || !data.id) return null;
    return { email: data.email, id: data.id };
  } catch {
    return null;
  }
}

/** Reemplaza un access token caducado usando el refresh token (mejor esfuerzo). */
export async function refreshSession(
  refreshToken: string
): Promise<{ access_token: string; refresh_token?: string } | null> {
  const url = supabaseUrl();
  const anon = supabaseAnonKey();
  if (!url || !anon) return null;
  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anon },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { access_token?: string; refresh_token?: string };
    if (!d.access_token) return null;
    return {
      access_token: d.access_token,
      ...(d.refresh_token ? { refresh_token: d.refresh_token } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Resuelve la identidad desde la request: valida el access token; si caducó,
 * refresca con el refresh token y (si se pasa `res`) adjunta cookies nuevas.
 */
export async function resolveSession(req: Request): Promise<{
  email: string;
  id: string;
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
