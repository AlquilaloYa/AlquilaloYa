import type { ConnectorTransport, DispatchResult } from "../core/connector";
import type { ConnectorAuthType } from "../core/types";

export const RestMethod = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
} as const;
export type RestMethod = (typeof RestMethod)[keyof typeof RestMethod];

/**
 * Configuración de un adaptador REST genérico.
 * El `baseUrl` y las opciones de auth se resuelven a partir de la configuración
 * de la instancia de conector + sus credenciales.
 */
export interface RestAdapterConfig {
  baseUrl: string;
  method?: RestMethod;
  path?: string;
  headers?: Record<string, string>;
  authType?: ConnectorAuthType;
  /** Plantilla de header para API_KEY, p.ej. "X-API-Key" o "token". */
  apiKeyHeader?: string;
  /** Doble opcional: añadir credenciales BASIC/BEARER/OAUTH2 automáticamente. */
  timeoutMs?: number;
  /** Credenciales resueltas inyectadas al construir el adaptador. */
  credentials?: ResolvedCredentials;
  /** Función opcional para inyectar autenticación OAUTH2 (token exchange). */
  oauthTokenProvider?: () => Promise<string>;
}

/** Credenciales resueltas que el adaptador usa para firmar la petición. */
export interface ResolvedCredentials {
  authType: ConnectorAuthType;
  token?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
}

function resolveCredentials(
  cfg?: ResolvedCredentials,
  input?: ResolvedCredentials
): ResolvedCredentials {
  const base: ResolvedCredentials = { authType: cfg?.authType ?? input?.authType ?? "NONE" };
  const pick = (src?: ResolvedCredentials) =>
    src
      ? {
          ...(src.token ? { token: src.token } : {}),
          ...(src.apiKey ? { apiKey: src.apiKey } : {}),
          ...(src.username ? { username: src.username } : {}),
          ...(src.password ? { password: src.password } : {}),
          ...(src.clientId ? { clientId: src.clientId } : {}),
          ...(src.clientSecret ? { clientSecret: src.clientSecret } : {}),
        }
      : {};
  return { ...base, ...pick(cfg), ...pick(input) };
}

function buildAuthHeaders(
  authType: ConnectorAuthType,
  creds: ResolvedCredentials,
  apiKeyHeader: string
): Record<string, string> {
  switch (authType) {
    case "API_KEY":
      return { [apiKeyHeader || "X-API-Key"]: creds.apiKey ?? creds.token ?? "" };
    case "BASIC": {
      const raw = `${creds.username ?? ""}:${creds.password ?? ""}`;
      return { Authorization: `Basic ${Buffer.from(raw).toString("base64")}` };
    }
    case "BEARER":
      return { Authorization: `Bearer ${creds.token ?? ""}` };
    case "OAUTH2":
      return { Authorization: `Bearer ${creds.token ?? ""}` };
    default:
      return {};
  }
}

/**
 * Adaptador REST genérico (Fase 6).
 *
 * Envía una petición HTTP a un proveedor externo usando la configuración y las
 * credenciales resueltas. Sirve de base para conectar cualquier sistema externo
 * por API REST (p. ej. un ERP de asistencia RRHH), sin acoplarlo a un SDK.
 */
export class RestAdapter implements ConnectorTransport {
  constructor(
    private readonly config: RestAdapterConfig
  ) {}

  async dispatch(input: Record<string, unknown>): Promise<DispatchResult> {
    const method = this.config.method ?? "POST";
    const path = this.config.path ?? "";
    const baseUrl = this.config.baseUrl.replace(/\/+$/, "");
    const url = input.path ? `${baseUrl}/${String(input.path).replace(/^\/+/, "")}` : `${baseUrl}${path}`;

    const authHeaders = buildAuthHeaders(
      this.config.authType ?? "NONE",
      resolveCredentials(this.config.credentials, input.credentials as ResolvedCredentials | undefined),
      this.config.apiKeyHeader ?? "X-API-Key"
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.config.headers ?? {}),
      ...authHeaders,
    };

    // Si hay OAuth2 y se provee un token provider, refrescarlo.
    if (this.config.authType === "OAUTH2" && this.config.oauthTokenProvider) {
      const token = await this.config.oauthTokenProvider();
      headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 15000);

    try {
      const response = await fetch(url, {
        method,
        headers,
        ...(method === "GET"
          ? {}
          : {
              body: JSON.stringify({
                connectorId: input.connectorId,
                provider: input.provider,
                kind: input.kind,
                payload: input.payload ?? input,
              }),
            }),
        signal: controller.signal,
      });

      const ok = response.ok;
      const text = await response.text().catch(() => null);
      return {
        ok,
        statusCode: response.status,
        providerMessage: text,
        error: ok ? null : `HTTP ${response.status}: ${text?.slice(0, 500) ?? ""}`,
      };
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      return {
        ok: false,
        statusCode: null,
        providerMessage: null,
        error: aborted
          ? `Timeout tras ${this.config.timeoutMs ?? 15000}ms`
          : (e as Error).message,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}