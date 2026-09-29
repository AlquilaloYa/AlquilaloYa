import { env } from "@contract/config/env";

/**
 * Proxy server-to-server hacia la API administrativa de AlquilaYa
 * (/api/admin/v1). El ERP nunca expone las credenciales al navegador:
 * se autentica aquí, en el servidor, y cachea el token de Supabase Auth
 * del sitio con margen de seguridad antes de que expire.
 */

const TOKEN_REFRESH_BUFFER_SECONDS = 300;

interface TokenState {
  token: string;
  expiresAt: number;
}

let tokenState: TokenState | null = null;

export interface AlquilayaConfig {
  apiUrl: string;
  email: string;
  password: string;
}

export function alquilayaConfig(): AlquilayaConfig | null {
  const apiUrl = env.ALQUILAYA_API_URL?.trim();
  const email = env.ALQUILAYA_ADMIN_EMAIL?.trim();
  const password = env.ALQUILAYA_ADMIN_PASSWORD;
  if (!apiUrl || !email || !password) return null;
  return { apiUrl: apiUrl.replace(/\/+$/, ""), email, password };
}

function isUsable(state: TokenState): boolean {
  return state.expiresAt > Date.now();
}

async function fetchAlquilayaToken(config: AlquilayaConfig): Promise<string> {
  const response = await fetch(`${config.apiUrl}/api/admin/v1/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: config.email, password: config.password }),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as {
    data?: { token?: string; expires_in?: number };
  };

  if (!response.ok || !body.data?.token) {
    throw new Error("No se pudo autenticar contra la API de AlquilaYa");
  }

  const expiresIn = body.data.expires_in ?? 3600;
  const ttlMs = Math.max(60, expiresIn - TOKEN_REFRESH_BUFFER_SECONDS) * 1000;
  tokenState = { token: body.data.token, expiresAt: Date.now() + ttlMs };
  return tokenState.token;
}

export async function getAlquilayaToken(): Promise<string> {
  const config = alquilayaConfig();
  if (!config) {
    throw new Error("ALQUILAYA_API_URL, ALQUILAYA_ADMIN_EMAIL y ALQUILAYA_ADMIN_PASSWORD no están configurados");
  }
  if (tokenState && isUsable(tokenState)) return tokenState.token;
  return fetchAlquilayaToken(config);
}

export function clearAlquilayaTokenCache(): void {
  tokenState = null;
}

function upstreamRequest(
  config: AlquilayaConfig,
  token: string,
  req: Request,
  target: URL
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  const contentType = req.headers.get("content-type") ?? "";
  const isJson = /application\/json/i.test(contentType);
  const isFormData = contentType.includes("multipart/form-data");

  const init: RequestInit = { method: req.method, headers };

  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "DELETE") {
    if (isFormData) {
      return req.formData().then((form) => {
        const out = new FormData();
        for (const [key, value] of form.entries()) {
          out.append(key, value instanceof File ? new Blob([value], { type: value.type }) : value);
        }
        return fetch(target, { ...init, body: out });
      });
    }
    if (isJson) {
      return req.json().then((body) =>
        fetch(target, {
          ...init,
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      );
    }
  }

  return fetch(target, init);
}

async function rawForward(req: Request, target: URL): Promise<Response> {
  const config = alquilayaConfig();
  if (!config) {
    return Response.json(
      { error: "El panel de contenido web no está configurado en el ERP (env ALQUILAYA_*)" },
      { status: 503 }
    );
  }

  const token = await getAlquilayaToken();
  let upstream = await upstreamRequest(config, token, req, target);

  if (upstream.status === 401) {
    clearAlquilayaTokenCache();
    const freshToken = await fetchAlquilayaToken(config);
    upstream = await upstreamRequest(config, freshToken, req, target);
  }

  const body = upstream.status === 204 ? null : await upstream.arrayBuffer();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
      "x-contenido-web": "ok",
    },
  });
}

/** Reenvía la petición del ERP a la API admin del sitio con auth interna. */
export async function proxyAlquilaya(req: Request, pathSegments: string[]): Promise<Response> {
  const config = alquilayaConfig();
  if (!config) {
    return Response.json(
      { error: "El panel de contenido web no está configurado en el ERP (env ALQUILAYA_*)" },
      { status: 503 }
    );
  }

  const rest = pathSegments.filter(Boolean).join("/");
  const target = new URL(`${config.apiUrl}/api/admin/v1/${rest}`);
  target.search = new URL(req.url).search;

  try {
    return await rawForward(req, target);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error conectando con AlquilaYa";
    clearAlquilayaTokenCache();
    return Response.json({ error: message }, { status: 502 });
  }
}