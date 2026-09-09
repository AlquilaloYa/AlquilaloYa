import type {
  ConnectorRepository,
  CredentialRepository,
  ConnectorLogRepository,
} from "./core/connector";
import { ConnectorRegistry } from "./core/registry";
import { ConnectorService } from "./core/connector-service";
import type { DeduplicationStore } from "./core/connector";
import type { ConnectorCredentialsInput, ConnectorInstance } from "./core/types";
import { MemoryDeduplicationStore } from "./rest/dedup";
import { RestAdapter, type ResolvedCredentials } from "./rest/adapter";
import { instanceToRestConfig } from "./rest/outbox";
import { GoogleFormsAdapter } from "./rest/google-forms-adapter";
import { GmailAdapter } from "./rest/gmail-adapter";
import { WhatsAppAdapter } from "./rest/whatsapp-adapter";

/**
 * Construye el ConnectorService de producción.
 *
 * - Usa los repositorios Drizzle de @contract/db.
 * - Resuelve credenciales reales (cifradas) desde la DB por instancia al
 *   despachar, vía `restTransportForInstance`.
 * - Registra todos los adapters: REST, Google Forms, Gmail, WhatsApp.
 * - La deduplicación se respalda en memoria por defecto (ver notas).
 */
export function buildConnectorServices(repos: {
  connectors: ConnectorRepository;
  credentials: CredentialRepository;
  logs: ConnectorLogRepository;
  dedupe?: DeduplicationStore;
}): ConnectorService {
  const registry = new ConnectorRegistry();

  registry.register({
    type: "REST",
    provider: "*",
    build: () => new RestAdapter({ baseUrl: "" }),
  });

  registry.register({
    type: "GOOGLE_FORMS",
    provider: "*",
    build: () => new GoogleFormsAdapter(),
  });

  registry.register({
    type: "GMAIL",
    provider: "*",
    build: () => new GmailAdapter(),
  });

  registry.register({
    type: "WHATSAPP",
    provider: "*",
    build: () => new WhatsAppAdapter(),
  });

  const service = new ConnectorService(
    repos.connectors,
    repos.credentials,
    repos.logs,
    registry,
    repos.dedupe ?? new MemoryDeduplicationStore(),
    (instance) => buildTransportForInstance(repos.credentials, instance)
  );

  return service;
}

/**
 * Crea un transport concreto para una instancia, resolviendo sus credenciales
 * cifradas según el tipo de conector.
 */
async function buildTransportForInstance(
  credentials: CredentialRepository,
  instance: ConnectorInstance
): Promise<RestAdapter | GoogleFormsAdapter | GmailAdapter | WhatsAppAdapter | null> {
  const creds = await credentials.getDecrypted(instance.id);

  switch (instance.type) {
    case "REST": {
      const config = instanceToRestConfig(instance);
      const resolved: ResolvedCredentials = {
        authType: config.authType,
        ...(creds?.accessToken ?? creds?.token ? { token: creds.accessToken ?? creds.token } : {}),
        ...(creds?.token ? { apiKey: creds.token } : {}),
        ...(creds?.username ? { username: creds.username } : {}),
        ...(creds?.password ? { password: creds.password } : {}),
        ...(creds?.clientId ? { clientId: creds.clientId } : {}),
        ...(creds?.clientSecret ? { clientSecret: creds.clientSecret } : {}),
      };
      return new RestAdapter({
        baseUrl: config.baseUrl,
        method: config.method,
        path: config.path,
        ...(config.headers ? { headers: config.headers } : {}),
        authType: config.authType,
        ...(config.apiKeyHeader ? { apiKeyHeader: config.apiKeyHeader } : {}),
        ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
        credentials: resolved,
      });
    }

    case "GOOGLE_FORMS":
      return new GoogleFormsAdapter();

    case "GMAIL": {
      const accessToken = creds?.accessToken ?? creds?.token;
      const from = instance.config?.from as string | undefined;
      return new GmailAdapter({
        ...(accessToken ? { accessToken } : {}),
        ...(from ? { from } : {}),
      });
    }

    case "WHATSAPP": {
      const phoneNumberId = instance.config?.phoneNumberId as string | undefined;
      const apiVersion = instance.config?.apiVersion as string | undefined;
      return new WhatsAppAdapter({
        ...(phoneNumberId ? { phoneNumberId } : {}),
        ...(apiVersion ? { apiVersion } : {}),
      });
    }

    default:
      return null;
  }
}

export type { ConnectorCredentialsInput as IConnectorCreds };