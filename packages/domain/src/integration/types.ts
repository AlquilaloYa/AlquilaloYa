import type { UUID } from "../common/types";

/** Tipos de conector soportados. */
export const ConnectorType = {
  REST: "REST",
  GOOGLE_FORMS: "GOOGLE_FORMS",
  GMAIL: "GMAIL",
  WHATSAPP: "WHATSAPP",
  STORAGE: "STORAGE",
} as const;

export type ConnectorType = (typeof ConnectorType)[keyof typeof ConnectorType];

export const ConnectorAuthType = {
  NONE: "NONE",
  API_KEY: "API_KEY",
  BASIC: "BASIC",
  BEARER: "BEARER",
  OAUTH2: "OAUTH2",
} as const;

export type ConnectorAuthType =
  (typeof ConnectorAuthType)[keyof typeof ConnectorAuthType];

export const ConnectorStatus = {
  ENABLED: "ENABLED",
  DISABLED: "DISABLED",
} as const;

export type ConnectorStatus =
  (typeof ConnectorStatus)[keyof typeof ConnectorStatus];

/** Instancia de conector tal como la ve el dominio (sin credenciales). */
export interface ConnectorInstance {
  id: UUID;
  type: ConnectorType;
  provider: string;
  name: string;
  description?: string | null;
  status: ConnectorStatus;
  enabled: boolean;
  config: Record<string, unknown>;
  credentialId: UUID | null;
  createdBy: UUID | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewConnectorInstanceInput {
  type: ConnectorType;
  provider: string;
  name: string;
  description?: string | null;
  config: Record<string, unknown>;
  credentials?: ConnectorCredentialsInput | null;
}

export interface UpdateConnectorInstanceInput {
  provider?: string;
  name?: string;
  description?: string | null;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

/** Credenciales al momento del alta/reemplazo (nunca al leer). */
export interface ConnectorCredentialsInput {
  authType: ConnectorAuthType;
  token?: string;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenEndpoint?: string;
  scopes?: string[];
}

/** Metadatos seguros de credenciales (para listar sin exponer secretos). */
export interface ConnectorCredentialSummary {
  id: UUID;
  authType: ConnectorAuthType;
  createdAt: string;
  expiresAt?: string | null;
}

/** Resultado de un despacho saliente a un proveedor externo. */
export interface DispatchResult {
  ok: boolean;
  statusCode: number | null;
  providerMessage: string | null;
  error?: string | null;
}

/** Filtro para listar instancias. */
export interface ConnectorFilter {
  type?: ConnectorType;
  provider?: string;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}