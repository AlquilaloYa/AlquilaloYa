import { env } from "@contract/config/env";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";

export type GCalConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
};

/** Scopes Google combinados (calendario + gmail + drive + los que se quiera añadir). */
export function gcalScopes(): string[] {
  const scopes = [env.GOOGLE_CALENDAR_SCOPE];
  if (env.GOOGLE_GMAIL_SCOPE) scopes.push(env.GOOGLE_GMAIL_SCOPE);
  if (env.GOOGLE_DRIVE_SCOPE) scopes.push(env.GOOGLE_DRIVE_SCOPE);
  return [...new Set(scopes.filter(Boolean))];
}

/** Devuelve la config de Google o null si aun no se configuraron las env vars. */
export function gcalConfig(): GCalConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: env.GOOGLE_REDIRECT_URI ?? "",
    scope: gcalScopes().join(" "),
  };
}

export function isGcalEnabled(): boolean {
  return gcalConfig() !== null;
}

/** URL de consentimiento de Google con access_type=offline (para refresh token). */
export function buildAuthUrl(cfg: GCalConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: cfg.scope,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

/** Canjea el code de OAuth por tokens. */
export async function exchangeCode(cfg: GCalConfig, code: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`No se pudo canjear el codigo de Google (${res.status}): ${detail}`);
  }
  return (await res.json()) as GoogleTokens;
}

/** Renueva un access token usando el refresh token. */
export async function refreshAccessToken(
  cfg: GCalConfig,
  refreshToken: string
): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`No se pudo renovar el token de Google (${res.status}): ${detail}`);
  }
  return (await res.json()) as GoogleTokens;
}

export type StoredToken = {
  email: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string;
  calendarId: string;
};

/** Guarda (upsert) los tokens cifrados vinculados al email del usuario. */
export async function saveToken(
  email: string,
  tokens: GoogleTokens,
  calendarId = "primary"
): Promise<void> {
  const { db, schema, encryptJson } = await import("@contract/db");
  const eq = (await import("drizzle-orm")).eq;
  const now = new Date();
  const expiresAt = tokens.expires_in ? new Date(now.getTime() + tokens.expires_in * 1000) : null;
  const encryptedAccess = encryptJson({ v: tokens.access_token });
  const encryptedRefresh = tokens.refresh_token ? encryptJson({ v: tokens.refresh_token }) : null;

  const [existing] = await db
    .select({ id: schema.userGoogleTokens.id, refreshToken: schema.userGoogleTokens.refreshToken })
    .from(schema.userGoogleTokens)
    .where(eq(schema.userGoogleTokens.email, email))
    .limit(1);

  if (existing) {
    await db
      .update(schema.userGoogleTokens)
      .set({
        accessToken: encryptedAccess,
        // Google solo devuelve refresh_token la primera vez; si no viene, conservamos el previo.
        refreshToken: encryptedRefresh ?? existing.refreshToken,
        expiresAt,
        scopes: tokens.scope ?? "",
        calendarId,
        updatedAt: now,
      })
      .where(eq(schema.userGoogleTokens.id, existing.id));
    return;
  }
  await db.insert(schema.userGoogleTokens).values({
    email,
    accessToken: encryptedAccess,
    refreshToken: encryptedRefresh,
    expiresAt,
    scopes: tokens.scope ?? "",
    calendarId,
  });
}

/** Obtiene el token descifrado del usuario, o null si no conecto Google. */
export async function getToken(email: string): Promise<StoredToken | null> {
  const { db, schema, decryptJson } = await import("@contract/db");
  const eq = (await import("drizzle-orm")).eq;
  const [row] = await db
    .select()
    .from(schema.userGoogleTokens)
    .where(eq(schema.userGoogleTokens.email, email))
    .limit(1);
  if (!row) return null;
  try {
    const access = decryptJson<{ v: string }>(row.accessToken).v;
    const refresh = row.refreshToken ? decryptJson<{ v: string }>(row.refreshToken).v : null;
    return {
      email: row.email,
      accessToken: access,
      refreshToken: refresh,
      expiresAt: row.expiresAt,
      scopes: row.scopes,
      calendarId: row.calendarId,
    };
  } catch {
    return null;
  }
}

export async function deleteToken(email: string): Promise<void> {
  const { db, schema } = await import("@contract/db");
  const eq = (await import("drizzle-orm")).eq;
  await db.delete(schema.userGoogleTokens).where(eq(schema.userGoogleTokens.email, email));
}

export class GcalNotConnected extends Error {}

/**
 * Access token valido para el usuario, renovandolo si esta cerca de expirar.
 * Lanza GcalNotConnected si el usuario no vinculo su cuenta.
 */
export async function getValidAccessToken(email: string): Promise<{ token: string; calendarId: string }> {
  const cfg = gcalConfig();
  if (!cfg) throw new Error("Google Calendar no esta configurado (faltan GOOGLE_CLIENT_ID/SECRET).");
  const stored = await getToken(email);
  if (!stored) throw new GcalNotConnected("Sin cuenta de Google vinculada.");

  const nearExpiry = !stored.expiresAt || stored.expiresAt.getTime() - Date.now() < 60_000;
  if (nearExpiry && stored.refreshToken) {
    const fresh = await refreshAccessToken(cfg, stored.refreshToken);
    await saveToken(email, fresh, stored.calendarId);
    return { token: fresh.access_token, calendarId: stored.calendarId };
  }
  return { token: stored.accessToken, calendarId: stored.calendarId };
}

export type GEvent = {
  id: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink?: string | undefined;
};

function mapEvent(item: {
  id?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
}): GEvent | null {
  const start = item.start?.dateTime ?? item.start?.date;
  const end = item.end?.dateTime ?? item.end?.date;
  if (!item.id || !start) return null;
  return {
    id: item.id,
    summary: item.summary ?? "(sin titulo)",
    description: item.description ?? "",
    start,
    end: end ?? start,
    allDay: Boolean(item.start?.date && !item.start?.dateTime),
    htmlLink: item.htmlLink,
  };
}

/** Lista eventos de un rango (single events ordenados por inicio). */
export async function listEvents(
  token: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date
): Promise<GEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google rechazo la consulta de eventos (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as { items?: unknown[] };
  return (data.items ?? [])
    .map((i) => mapEvent(i as never))
    .filter((e): e is GEvent => e !== null);
}

/** Crea un evento en el calendario del usuario. */
export async function createEvent(
  token: string,
  calendarId: string,
  ev: { summary: string; description?: string | undefined; start: string; end?: string | undefined; allDay?: boolean | undefined }
): Promise<GEvent | null> {
  const body = ev.allDay
    ? {
        summary: ev.summary,
        description: ev.description ?? "",
        start: { date: ev.start.slice(0, 10) },
        end: { date: (ev.end ?? ev.start).slice(0, 10) },
      }
    : {
        summary: ev.summary,
        description: ev.description ?? "",
        start: { dateTime: ev.start },
        end: { dateTime: ev.end ?? ev.start },
      };
  const res = await fetch(`${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`No se pudo crear el evento en Google (${res.status}): ${detail}`);
  }
  return mapEvent((await res.json()) as never);
}

/** Elimina un evento del calendario del usuario. */
export async function deleteEvent(token: string, calendarId: string, eventId: string): Promise<void> {
  const res = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok && res.status !== 204) {
    const detail = await res.text().catch(() => "");
    throw new Error(`No se pudo eliminar el evento (${res.status}): ${detail}`);
  }
}