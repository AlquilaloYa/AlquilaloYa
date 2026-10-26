import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { supabaseAnonKey, supabaseUrl } from "@contract/config/env";

const SECURE_COOKIE_PREFIX = process.env.NODE_ENV === "production" ? "__Host-" : "";
export const CLIENT_PORTAL_ACCESS_COOKIE = `${SECURE_COOKIE_PREFIX}client_portal_at`;
export const CLIENT_PORTAL_REFRESH_COOKIE = `${SECURE_COOKIE_PREFIX}client_portal_rt`;
const LEGACY_ACCESS_COOKIE = "client_portal_at";
const LEGACY_REFRESH_COOKIE = "client_portal_rt";

const COOKIE_MAX_AGE = 15 * 60;
const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const AUTH_TIMEOUT_MS = 8_000;

export interface ClientPortalTokens {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user: { id: string; email?: string };
}

export interface ClientPortalIdentity {
  client: {
    id: string;
    names: string;
    departmentCode: string;
    email: string;
  };
  accountId: string;
}

export interface PortalLoginTarget {
  clientId: string;
  authUserId: string;
  email: string;
  contractId: string;
}

export const ACTIVE_CLIENT_CONTRACT_STATUSES = [
  "FIRMADO",
  "NOTARIADO",
  "ACTIVO",
  "VIGENTE",
  "RENOVADO",
];

export function clientPortalAuthEmail(departmentCode: string): string {
  const normalized = departmentCode.trim().toUpperCase();
  const codeHash = createHash("sha256").update(normalized).digest("hex").slice(0, 32);
  return `client-${codeHash}@portal.invalid`;
}

export function peruDateString(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function findCurrentClientContract(
  dbModule: typeof import("@contract/db"),
  clientId: string,
  departmentCode: string,
): Promise<{
  id: string;
  periodKey: string;
  startsAt: string;
  endsAt: string;
} | null> {
  const contracts = await findCurrentClientContracts(dbModule, [
    { clientId, departmentCode },
  ]);
  return contracts.get(clientId) ?? null;
}

export async function findCurrentClientContracts(
  dbModule: typeof import("@contract/db"),
  clients: Array<{ clientId: string; departmentCode: string }>,
): Promise<
  Map<
    string,
    { id: string; periodKey: string; startsAt: string; endsAt: string }
  >
> {
  const codeByClient = new Map(
    clients.map(({ clientId, departmentCode }) => [
      clientId,
      departmentCode.trim().toUpperCase(),
    ]),
  );
  const clientIds = [...codeByClient.keys()];
  if (!clientIds.length) return new Map();
  const today = peruDateString();
  const candidates = await dbModule.db
    .select({
      id: dbModule.schema.contracts.id,
      clientId: dbModule.schema.contracts.clienteId,
      departmentCode: dbModule.schema.departments.codigo,
      startsAt: dbModule.schema.contracts.fechaInicio,
      endsAt: dbModule.schema.contracts.fechaFin,
    })
    .from(dbModule.schema.contracts)
    .innerJoin(
      dbModule.schema.departments,
      eq(dbModule.schema.departments.id, dbModule.schema.contracts.departamentoId),
    )
    .where(
      and(
        inArray(dbModule.schema.contracts.clienteId, clientIds),
        inArray(dbModule.schema.contracts.estado, ACTIVE_CLIENT_CONTRACT_STATUSES),
        lte(dbModule.schema.contracts.fechaInicio, today),
        isNull(dbModule.schema.contracts.eliminadoEn),
      ),
    )
    .orderBy(desc(dbModule.schema.contracts.fechaInicio))
    .limit(Math.min(clientIds.length * 20, 10_000));

  const contractIds = candidates.map(({ id }) => id);
  const addendaRows = contractIds.length
    ? await dbModule.db
        .select({
          id: dbModule.schema.documents.id,
          contractId: dbModule.schema.documents.contractId,
          data: dbModule.schema.contractSnapshots.datosContrato,
        })
        .from(dbModule.schema.documents)
        .innerJoin(
          dbModule.schema.contractSnapshots,
          eq(dbModule.schema.contractSnapshots.id, dbModule.schema.documents.snapshotId),
        )
        .where(
          and(
            inArray(dbModule.schema.documents.contractId, contractIds),
            inArray(dbModule.schema.documents.tipo, ["ADENDA", "ADENDA_EXTENSION"]),
            eq(dbModule.schema.documents.estadoGeneracion, "GENERADO"),
            isNull(dbModule.schema.documents.eliminadoEn),
            isNull(dbModule.schema.contractSnapshots.eliminadoEn),
          ),
        )
        .orderBy(desc(dbModule.schema.documents.createdAt))
    : [];
  const addendaByContract = new Map<string, typeof addendaRows>();
  for (const document of addendaRows) {
    const records = addendaByContract.get(document.contractId) ?? [];
    records.push(document);
    addendaByContract.set(document.contractId, records);
  }

  const current = new Map<
    string,
    { id: string; periodKey: string; startsAt: string; endsAt: string }
  >();
  for (const contract of candidates) {
    const normalizedCode = codeByClient.get(contract.clientId);
    if (
      current.has(contract.clientId) ||
      !normalizedCode ||
      contract.departmentCode.trim().toUpperCase() !== normalizedCode
    ) continue;
    const addenda = addendaByContract.get(contract.id) ?? [];

    for (const document of addenda) {
      const data = document.data as Record<string, unknown>;
      const addendumStartsAt =
        typeof data.fechaInicioAdenda === "string"
          ? data.fechaInicioAdenda.slice(0, 10)
          : contract.endsAt;
      const addendumEndsAt =
        typeof data.fechaFinAdenda === "string"
          ? data.fechaFinAdenda.slice(0, 10)
          : typeof data.fechaFin === "string"
            ? data.fechaFin.slice(0, 10)
            : "";
      if (
        addendumEndsAt > String(contract.endsAt) &&
        addendumStartsAt <= today &&
        addendumEndsAt >= today
      ) {
        current.set(contract.clientId, {
          id: contract.id,
          periodKey: `${contract.id}:${document.id}`,
          startsAt: addendumStartsAt,
          endsAt: addendumEndsAt,
        });
        break;
      }
    }

    if (!current.has(contract.clientId) && String(contract.endsAt) >= today) {
      current.set(contract.clientId, {
        id: contract.id,
        periodKey: `${contract.id}:${contract.startsAt}:${contract.endsAt}`,
        startsAt: contract.startsAt,
        endsAt: contract.endsAt,
      });
    }
  }
  return current;
}

export async function findPortalLoginTarget(
  dbModule: typeof import("@contract/db"),
  departmentCode: string,
): Promise<PortalLoginTarget | null> {
  const normalizedCode = departmentCode.trim().toUpperCase();
  if (!normalizedCode) return null;
  const candidates = await dbModule.db
    .select({
      clientId: dbModule.schema.clients.id,
      departmentCode: dbModule.schema.clients.codigoDepartamento,
      email: dbModule.schema.clientPortalAccounts.email,
      authUserId: dbModule.schema.clientPortalAccounts.authUserId,
      contractId: dbModule.schema.clientPortalAccounts.contractId,
      credentialPeriodKey: dbModule.schema.clientPortalAccounts.credentialPeriodKey,
    })
    .from(dbModule.schema.clientPortalAccounts)
    .innerJoin(
      dbModule.schema.clients,
      eq(dbModule.schema.clients.id, dbModule.schema.clientPortalAccounts.clientId),
    )
    .where(
      and(
        eq(dbModule.schema.clientPortalAccounts.active, true),
        eq(dbModule.schema.clients.activo, true),
        isNull(dbModule.schema.clients.eliminadoEn),
        sql`upper(trim(${dbModule.schema.clients.codigoDepartamento})) = ${normalizedCode}`,
      ),
    )
    .limit(2);
  if (candidates.length !== 1) return null;
  const match = candidates[0];
  if (!match?.contractId || !match.departmentCode) return null;
  const currentContract = await findCurrentClientContract(
    dbModule,
    match.clientId,
    match.departmentCode,
  );
  if (
    currentContract?.id !== match.contractId ||
    currentContract.periodKey !== match.credentialPeriodKey
  ) return null;
  return {
    clientId: match.clientId,
    authUserId: match.authUserId,
    email: match.email,
    contractId: match.contractId,
  };
}

function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const segment of (header ?? "").split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0) continue;
    const name = segment.slice(0, separator).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(segment.slice(separator + 1).trim());
    } catch {
      continue;
    }
  }
  return cookies;
}

function authConfig(): { url: string; anonKey: string } {
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();
  if (!url || !anonKey) {
    throw new Error("Autenticación del portal no está configurada");
  }
  return { url, anonKey };
}

async function authRequest(path: string, init: RequestInit): Promise<Response> {
  const { url, anonKey } = authConfig();
  return fetch(`${url}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
  });
}

function readAuthError(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const field of ["msg", "message", "error_description", "error"]) {
      const value = record[field];
      if (typeof value === "string" && value) return value;
    }
  }
  return `Error de autenticación (${status})`;
}

export async function requestClientPortalOtp(email: string): Promise<void> {
  const response = await authRequest("/otp", {
    method: "POST",
    body: JSON.stringify({ email, create_user: false }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(readAuthError(detail, response.status));
  }
}

export async function verifyClientPortalOtp(
  email: string,
  token: string,
): Promise<ClientPortalTokens | null> {
  const response = await authRequest("/verify", {
    method: "POST",
    body: JSON.stringify({ email, token, type: "email" }),
  });
  if (response.status === 400 || response.status === 422) return null;
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(readAuthError(detail, response.status));
  }
  const tokens = (await response.json()) as Partial<ClientPortalTokens>;
  if (
    typeof tokens.access_token !== "string" ||
    typeof tokens.refresh_token !== "string" ||
    typeof tokens.user?.id !== "string" ||
    typeof tokens.user.email !== "string"
  ) {
    throw new Error("Supabase Auth devolvió una sesión incompleta");
  }
  return tokens as ClientPortalTokens;
}

export async function loginClientPortalPassword(
  email: string,
  password: string,
): Promise<ClientPortalTokens | null> {
  const response = await authRequest("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (response.status === 400 || response.status === 401 || response.status === 422) {
    return null;
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(readAuthError(detail, response.status));
  }
  const tokens = (await response.json()) as Partial<ClientPortalTokens>;
  if (
    typeof tokens.access_token !== "string" ||
    typeof tokens.refresh_token !== "string" ||
    typeof tokens.user?.id !== "string" ||
    typeof tokens.user.email !== "string"
  ) {
    throw new Error("Supabase Auth devolvió una sesión incompleta");
  }
  return tokens as ClientPortalTokens;
}

export async function revokeClientPortalSession(
  accessToken: string,
): Promise<void> {
  const response = await authRequest("/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok && response.status !== 401) {
    const detail = await response.json().catch(() => null);
    throw new Error(readAuthError(detail, response.status));
  }
}

function cookieHeader(
  name: string,
  value: string,
  maxAge: number,
): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function expiredCookie(name: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function applyClientPortalCookies(
  response: NextResponse,
  tokens: ClientPortalTokens,
): NextResponse {
  const maxAge = Math.max(
    60,
    Math.min(tokens.expires_in ?? COOKIE_MAX_AGE, COOKIE_MAX_AGE),
  );
  response.headers.append(
    "Set-Cookie",
    cookieHeader(CLIENT_PORTAL_ACCESS_COOKIE, tokens.access_token, maxAge),
  );
  response.headers.append(
    "Set-Cookie",
    cookieHeader(
      CLIENT_PORTAL_REFRESH_COOKIE,
      tokens.refresh_token,
      REFRESH_COOKIE_MAX_AGE,
    ),
  );
  if (SECURE_COOKIE_PREFIX) {
    response.headers.append("Set-Cookie", expiredCookie(LEGACY_ACCESS_COOKIE));
    response.headers.append("Set-Cookie", expiredCookie(LEGACY_REFRESH_COOKIE));
  }
  return response;
}

export function clearClientPortalCookies(response: NextResponse): NextResponse {
  response.headers.append("Set-Cookie", expiredCookie(CLIENT_PORTAL_ACCESS_COOKIE));
  response.headers.append("Set-Cookie", expiredCookie(CLIENT_PORTAL_REFRESH_COOKIE));
  if (SECURE_COOKIE_PREFIX) {
    response.headers.append("Set-Cookie", expiredCookie(LEGACY_ACCESS_COOKIE));
    response.headers.append("Set-Cookie", expiredCookie(LEGACY_REFRESH_COOKIE));
  }
  return response;
}

export async function resolveClientPortalSession(
  request: Request,
): Promise<{ tokens: ClientPortalTokens; refreshed: boolean } | null> {
  const cookies = parseCookies(request.headers.get("cookie"));
  let accessToken = cookies[CLIENT_PORTAL_ACCESS_COOKIE];
  const refreshToken = cookies[CLIENT_PORTAL_REFRESH_COOKIE];
  if (!accessToken && !refreshToken) return null;

  if (accessToken) {
    const response = await authRequest("/user", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      const user = (await response.json()) as { id?: unknown; email?: unknown };
      if (typeof user.id === "string" && typeof user.email === "string") {
        return {
          tokens: {
            access_token: accessToken,
            refresh_token: refreshToken ?? "",
            user: { id: user.id, email: user.email },
          },
          refreshed: false,
        };
      }
    }
  }

  if (!refreshToken) return null;
  const refreshed = await authRequest("/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!refreshed.ok) return null;
  const tokens = (await refreshed.json()) as Partial<ClientPortalTokens>;
  if (
    typeof tokens.access_token !== "string" ||
    typeof tokens.refresh_token !== "string" ||
    typeof tokens.user?.id !== "string" ||
    typeof tokens.user.email !== "string"
  ) {
    throw new Error("Supabase Auth devolvió una sesión renovada incompleta");
  }
  accessToken = tokens.access_token;
  return { tokens: tokens as ClientPortalTokens, refreshed: true };
}

export async function resolveClientPortalIdentity(
  request: Request,
  dbModule: typeof import("@contract/db"),
): Promise<{
  identity: ClientPortalIdentity;
  tokens: ClientPortalTokens;
  refreshed: boolean;
} | null> {
  const session = await resolveClientPortalSession(request);
  if (!session) return null;
  const [row] = await dbModule.db
    .select({
      accountId: dbModule.schema.clientPortalAccounts.id,
      authUserId: dbModule.schema.clientPortalAccounts.authUserId,
      accountEmail: dbModule.schema.clientPortalAccounts.email,
      contractId: dbModule.schema.clientPortalAccounts.contractId,
      credentialPeriodKey: dbModule.schema.clientPortalAccounts.credentialPeriodKey,
      clientId: dbModule.schema.clients.id,
      names: dbModule.schema.clients.nombres,
      surnames: dbModule.schema.clients.apellidos,
      departmentCode: dbModule.schema.clients.codigoDepartamento,
    })
    .from(dbModule.schema.clientPortalAccounts)
    .innerJoin(
      dbModule.schema.clients,
      eq(dbModule.schema.clients.id, dbModule.schema.clientPortalAccounts.clientId),
    )
    .where(
      and(
        eq(dbModule.schema.clientPortalAccounts.authUserId, session.tokens.user.id),
        eq(dbModule.schema.clientPortalAccounts.active, true),
        eq(dbModule.schema.clients.activo, true),
        isNull(dbModule.schema.clients.eliminadoEn),
      ),
    )
    .limit(1);
  if (!row || !row.departmentCode || !row.contractId) {
    return null;
  }
  const currentContract = await findCurrentClientContract(
    dbModule,
    row.clientId,
    row.departmentCode,
  );
  if (
    currentContract?.id !== row.contractId ||
    currentContract.periodKey !== row.credentialPeriodKey ||
    session.tokens.user.email?.toLowerCase() !== row.accountEmail.toLowerCase()
  ) return null;
  return {
    identity: {
      accountId: row.accountId,
      client: {
        id: row.clientId,
        names: [row.names, row.surnames].filter(Boolean).join(" "),
        departmentCode: row.departmentCode ?? "",
        email: row.accountEmail,
      },
    },
    tokens: session.tokens,
    refreshed: session.refreshed,
  };
}

export function sameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function addSessionCookiesIfRefreshed(
  response: NextResponse,
  session: { tokens: ClientPortalTokens; refreshed: boolean },
): NextResponse {
  return session.refreshed
    ? applyClientPortalCookies(response, session.tokens)
    : response;
}
