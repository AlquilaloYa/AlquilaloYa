import type {
  ConnectorCredentialsInput,
  ConnectorCredentialSummary,
  ConnectorFilter,
  ConnectorInstance,
  DispatchResult,
  NewConnectorInstanceInput,
  UpdateConnectorInstanceInput,
} from "./types";
import type {
  ConnectorLogRepository,
  ConnectorRepository,
  ConnectorTransport,
  CredentialRepository,
  DeduplicationStore,
} from "./connector";
import type { ConnectorRegistry } from "./registry";
import type { UUID } from "@contract/domain";

/**
 * Servicio de conectores: orquesta instancias, credenciales y despacho de
 * mensajes hacia proveedores externos mediante el transport registrado.
 *
 * Principios (Fase 6):
 * - El dominio NUNCA conoce al proveedor; depende de ConnectorTransport.
 * - Las credenciales se cifran en reposo (via CredentialRepository) y nunca
 *   se devuelven al leer una instancia.
 * - El envío usa una clave de idempotencia (DeduplicationStore) para que
 *   repeticiones no produzcan efectos duplicados.
 * - Toda operación de despacho se registra en logs (ConnectorLogRepository),
 *   que alimenta actividad/auditoría y permite reintentos/DLQ.
 */
export class ConnectorService {
  constructor(
    private readonly connectors: ConnectorRepository,
    private readonly credentials: CredentialRepository,
    private readonly logs: ConnectorLogRepository,
    private readonly registry: ConnectorRegistry,
    private readonly dedupe: DeduplicationStore,
    private readonly transportFactory?: (
      instance: ConnectorInstance
    ) => Promise<ConnectorTransport | null>
  ) {}

  async list(filter: ConnectorFilter): Promise<ConnectorInstance[]> {
    return this.connectors.list(filter);
  }

  async findById(id: UUID): Promise<ConnectorInstance | null> {
    return this.connectors.findById(id);
  }

  async create(input: NewConnectorInstanceInput): Promise<ConnectorInstance> {
    const instance = await this.connectors.create(input);
    if (input.credentials) {
      await this.credentials.create(instance.id, input.credentials);
    }
    return (await this.connectors.findById(instance.id)) ?? instance;
  }

  async update(id: UUID, changes: UpdateConnectorInstanceInput): Promise<ConnectorInstance> {
    return this.connectors.update(id, changes);
  }

  async setCredentials(
    id: UUID,
    creds: ConnectorCredentialsInput
  ): Promise<ConnectorCredentialSummary> {
    const existing = await this.credentials.findByConnector(id);
    return existing
      ? this.credentials.replace(id, creds)
      : this.credentials.create(id, creds);
  }

  async getCredentialSummary(id: UUID): Promise<ConnectorCredentialSummary | null> {
    return this.credentials.findByConnector(id);
  }

  async setEnabled(id: UUID, enabled: boolean): Promise<ConnectorInstance> {
    return this.connectors.setEnabled(id, enabled);
  }

  async delete(id: UUID): Promise<void> {
    await this.credentials.delete(id);
    await this.connectors.delete(id);
  }

  /**
   * Prueba la conexión con el proveedor de la instancia. Devuelve el resultado
   * sin persistir logs (no es un envío de negocio).
   */
  async testConnection(id: UUID): Promise<DispatchResult> {
    const instance = await this.connectors.findById(id);
    if (!instance) {
      return { ok: false, statusCode: null, providerMessage: null, error: "Conector no encontrado" };
    }
    const transport = await this.buildTransport(instance);
    if (!transport) {
      return { ok: false, statusCode: null, providerMessage: null, error: "No hay transport para este conector" };
    }
    try {
      return await transport.dispatch({
        kind: "TEST_CONNECTION",
        connectorId: instance.id,
        provider: instance.provider,
      });
    } catch (e) {
      return { ok: false, statusCode: null, providerMessage: null, error: (e as Error).message };
    }
  }

  /**
   * Envía un mensaje al proveedor de forma idempotente y registra el log.
   * - Devuelve el resultado del despacho.
   * - Si ya se procesó la clave, devuelve un resultado "ok" sin volver a enviar.
   */
  async dispatch(
    id: UUID,
    action: string,
    payload: Record<string, unknown>,
    idempotencyKey: string
  ): Promise<DispatchResult> {
    if (await this.dedupe.exists(idempotencyKey)) {
      return { ok: true, statusCode: null, providerMessage: "idempotente: ya procesado" };
    }

    const instance = await this.connectors.findById(id);
    if (!instance || !instance.enabled) {
      await this.logs.record({ connectorId: id, action, ok: false, payload, error: "Conector no disponible" });
      return { ok: false, statusCode: null, providerMessage: null, error: "Conector no disponible" };
    }

    const transport = await this.buildTransport(instance);
    if (!transport) {
      await this.logs.record({ connectorId: id, action, ok: false, payload, error: "No hay transport registrado" });
      return { ok: false, statusCode: null, providerMessage: null, error: "No hay transport registrado" };
    }

    let result: DispatchResult;
    try {
      result = await transport.dispatch({ kind: action, connectorId: instance.id, provider: instance.provider, ...payload });
    } catch (e) {
      result = { ok: false, statusCode: null, providerMessage: null, error: (e as Error).message };
    }

    await this.logs.record({
      connectorId: id,
      action,
      ok: result.ok,
      ...(result.statusCode !== null && result.statusCode !== undefined && { statusCode: result.statusCode }),
      payload,
      ...(result.error !== undefined && result.error !== null && { error: result.error }),
    });

    if (result.ok) {
      await this.dedupe.mark(idempotencyKey);
    }
    return result;
  }

  /** Construye el transport registrado/facturado para la instancia. */
  private async buildTransport(instance: ConnectorInstance): Promise<ConnectorTransport | null> {
    if (this.transportFactory) {
      return this.transportFactory(instance).catch(() => null);
    }
    return this.registry.get(instance.type, instance.provider);
  }
}