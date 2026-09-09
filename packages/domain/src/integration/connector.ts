import type { UUID } from "../common/types";
import type {
  ConnectorCredentialsInput,
  ConnectorCredentialSummary,
  ConnectorFilter,
  ConnectorInstance,
  DispatchResult,
  NewConnectorInstanceInput,
  UpdateConnectorInstanceInput,
} from "./types";

/**
 * Puertos (interfaces) de la capa de integraciones en el dominio.
 * La infraestructura (@contract/db) los implementa; los adaptadores de
 * transporte viven en @contract/integrations.
 */

/** Almacenamiento de instancias de conector. */
export interface ConnectorRepository {
  findById(id: UUID): Promise<ConnectorInstance | null>;
  findByType(type: string): Promise<ConnectorInstance[]>;
  list(filter: ConnectorFilter): Promise<ConnectorInstance[]>;
  count(filter: ConnectorFilter): Promise<number>;
  create(input: NewConnectorInstanceInput): Promise<ConnectorInstance>;
  update(id: UUID, changes: UpdateConnectorInstanceInput): Promise<ConnectorInstance>;
  setEnabled(id: UUID, enabled: boolean): Promise<ConnectorInstance>;
  delete(id: UUID): Promise<void>;
}

/** Custodia de credenciales (cifrado en reposo). */
export interface CredentialRepository {
  create(connectorId: UUID, creds: ConnectorCredentialsInput): Promise<ConnectorCredentialSummary>;
  replace(connectorId: UUID, creds: ConnectorCredentialsInput): Promise<ConnectorCredentialSummary>;
  getDecrypted(connectorId: UUID): Promise<ConnectorCredentialsInput | null>;
  findByConnector(connectorId: UUID): Promise<ConnectorCredentialSummary | null>;
  delete(connectorId: UUID): Promise<void>;
}

/** Log de despachos (actividad/reintentos/DLQ). */
export interface ConnectorLogRepository {
  record(input: {
    connectorId: UUID;
    action: string;
    ok: boolean;
    statusCode?: number | null;
    payload?: Record<string, unknown> | null;
    error?: string | null;
  }): Promise<void>;
}

/** Puerta de salida abstracta. El dominio depende de esto, nunca de un SDK. */
export interface ConnectorTransport {
  dispatch(input: Record<string, unknown>): Promise<DispatchResult>;
}

/** Idempotencia de despachos externos. */
export interface DeduplicationStore {
  exists(key: string): Promise<boolean>;
  mark(key: string): Promise<void>;
}