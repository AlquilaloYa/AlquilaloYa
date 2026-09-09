import type { ConnectorAuthType } from "../core/types";

// Re-export MemoryDeduplicationStore desde dedup.ts
export { MemoryDeduplicationStore } from "./dedup";

/** Construye la configuración de REST a partir de una instancia de conector. */
export function instanceToRestConfig(
  instance: {
    type: string;
    config: Record<string, unknown>;
  }
): {
  baseUrl: string;
  method: "GET" | "POST" | "PUT" | "PATCH";
  path: string;
  headers?: Record<string, string>;
  authType: ConnectorAuthType;
  apiKeyHeader?: string;
  timeoutMs?: number;
} {
  const config = instance.config ?? {};
  const rawMethod = String(config.method ?? "POST").toUpperCase() as "GET" | "POST" | "PUT" | "PATCH";
  return {
    baseUrl: String(config.baseUrl ?? config.url ?? ""),
    method: rawMethod,
    path: String(config.path ?? ""),
    headers: (config.headers as Record<string, string>) ?? undefined,
    authType: (config.authType ?? "NONE") as ConnectorAuthType,
    apiKeyHeader: config.apiKeyHeader ? String(config.apiKeyHeader) : "X-API-Key",
    timeoutMs: typeof config.timeoutMs === "number" ? config.timeoutMs : 15000,
  };
}