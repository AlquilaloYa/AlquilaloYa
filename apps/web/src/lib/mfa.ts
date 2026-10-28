import { supabaseAnonKey, supabaseUrl } from "@contract/config/env";
import { normalizeTotpQrCode } from "./mfa-qr";

/**
 * Multi-Factor Authentication (TOTP) contra Supabase Auth por REST — sin SDK,
 * en la línea de lib/supabase-auth.ts y lib/storage.ts (SEC-015).
 *
 * Todas las funciones requieren un access token de una sesión AAL1 (el que se
 * obtiene tras email+contraseña) para enrolar, retar y verificar factores.
 */

export interface TotpFactor {
  id: string;
  status: string;
  friendlyName?: string;
}

export interface EnrolledTotp {
  factorId: string;
  qrCode: string;
  secret: string;
}

export interface SessionTokens {
  access_token: string;
  refresh_token?: string;
}

function authHeaders(accessToken: string): Record<string, string> {
  const anon = supabaseAnonKey();
  if (!anon) throw new Error("SUPABASE_ANON_KEY no configurado");
  return {
    apikey: anon,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function call(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = supabaseUrl();
  if (!url) throw new Error("SUPABASE_URL no configurado");
  return fetch(`${url}/auth/v1${path}`, {
    ...init,
    headers: { ...authHeaders(accessToken), ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { msg?: string; error_description?: string; error?: string };
    return body.msg ?? body.error_description ?? body.error ?? `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}

/** Factores TOTP verificados del usuario (los que fuerzan AAL2). */
export async function listVerifiedTotp(accessToken: string): Promise<TotpFactor[]> {
  const res = await call(accessToken, "/user");
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    factors?: Array<{ id?: string; factor_type?: string; status?: string; friendly_name?: string }>;
  };
  return (data.factors ?? [])
    .filter((f) => f.factor_type === "totp" && f.status === "verified" && f.id)
    .map((f) => ({ id: f.id!, status: f.status!, ...(f.friendly_name ? { friendlyName: f.friendly_name } : {}) }));
}

/** Inicia el enrolamiento de un factor TOTP (devuelve QR y secreto). */
export async function enrollTotp(accessToken: string): Promise<EnrolledTotp> {
  const factorsResponse = await call(accessToken, "/user");
  if (!factorsResponse.ok) throw new Error(await readError(factorsResponse));
  const factorsData = (await factorsResponse.json()) as {
    factors?: Array<{
      id?: string;
      factor_type?: string;
      status?: string;
    }>;
  };
  if (!Array.isArray(factorsData.factors)) {
    throw new Error("Respuesta de factores MFA inválida");
  }
  const pendingFactors = factorsData.factors.filter(
    (
      factor,
    ): factor is { id: string; factor_type?: string; status?: string } =>
      factor.factor_type === "totp" &&
      factor.status === "unverified" &&
      typeof factor.id === "string",
  );
  for (const factor of pendingFactors) {
    await unenrollFactor(accessToken, factor.id);
  }

  const res = await call(accessToken, "/factors", {
    method: "POST",
    body: JSON.stringify({ factor_type: "totp", friendly_name: "AlquilaYa ERP" }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    id?: string;
    totp?: { qr_code?: string; secret?: string };
  };
  if (!data.id || !data.totp?.qr_code || !data.totp.secret) {
    throw new Error("Respuesta de enrolamiento inválida");
  }
  return {
    factorId: data.id,
    qrCode: normalizeTotpQrCode(data.totp.qr_code),
    secret: data.totp.secret,
  };
}

/** Crea un challenge para un factor y devuelve su id. */
export async function challengeFactor(accessToken: string, factorId: string): Promise<string> {
  const res = await call(accessToken, `/factors/${encodeURIComponent(factorId)}/challenge`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("Challenge sin id");
  return data.id;
}

/**
 * Verifica un código TOTP contra un challenge. Devuelve los tokens de una
 * sesión AAL2 (o los mismos si el factor es de enrole). Lanza si el código es
 * inválido.
 */
export async function verifyFactor(
  accessToken: string,
  factorId: string,
  challengeId: string,
  code: string
): Promise<SessionTokens> {
  const res = await call(accessToken, `/factors/${encodeURIComponent(factorId)}/verify`, {
    method: "POST",
    body: JSON.stringify({ challenge_id: challengeId, code }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (!data.access_token) throw new Error("Verificación sin sesión");
  return {
    access_token: data.access_token,
    ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
  };
}

/** Retira un factor TOTP. */
export async function unenrollFactor(accessToken: string, factorId: string): Promise<void> {
  const res = await call(accessToken, `/factors/${encodeURIComponent(factorId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readError(res));
}

/** Reta y verifica en un solo paso (util para el login y la activación). */
export async function completeTotp(
  accessToken: string,
  factorId: string,
  code: string
): Promise<SessionTokens> {
  const challengeId = await challengeFactor(accessToken, factorId);
  return verifyFactor(accessToken, factorId, challengeId, code);
}
