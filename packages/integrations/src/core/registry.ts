import type { ConnectorTransport } from "@contract/domain/integration";
import type { ConnectorType } from "@contract/domain/integration";

export interface RegisteredConnector {
  type: ConnectorType;
  provider: string;
  build(): ConnectorTransport;
}

/**
 * Registro de conectores (Fase 6). Permite añadir proveedores o adaptadores
 * sin modificar el dominio de contratos: basta registrar un transport nuevo.
 */
export class ConnectorRegistry {
  private readonly connectors = new Map<string, RegisteredConnector>();

  register(connector: RegisteredConnector): void {
    const key = registryKey(connector.type, connector.provider);
    this.connectors.set(key, connector);
  }

  get(type: ConnectorType, provider: string): ConnectorTransport | null {
    // Intento exacto primero, luego wildcard "*"
    const c =
      this.connectors.get(registryKey(type, provider)) ??
      this.connectors.get(registryKey(type, "*"));
    return c ? c.build() : null;
  }

  has(type: ConnectorType, provider: string): boolean {
    return this.connectors.has(registryKey(type, provider));
  }

  list(): RegisteredConnector[] {
    return Array.from(this.connectors.values());
  }
}

export function registryKey(type: ConnectorType, provider: string): string {
  return `${type}:${provider.toLowerCase()}`;
}