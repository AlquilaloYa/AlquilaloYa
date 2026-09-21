import type { ConnectorService } from "@contract/integrations";
import type { NewConnectorInstanceInput } from "@contract/domain/integration";

const DEFAULT_CONNECTORS: NewConnectorInstanceInput[] = [
  {
    type: "REST",
    provider: "gmail",
    name: "Gmail",
    description: "Envío de correo mediante Gmail API",
    config: {
      baseUrl: "https://gmail.googleapis.com",
      method: "POST",
      path: "/gmail/v1/users/me/messages/send",
      authType: "BEARER",
    },
  },
  {
    type: "WHATSAPP",
    provider: "whatsapp-cloud",
    name: "WhatsApp Business",
    description: "Mensajería mediante WhatsApp Cloud API",
    config: {
      phoneNumberId: "",
      apiVersion: "v20.0",
    },
  },
  {
    type: "REST",
    provider: "bcp",
    name: "BCP",
    description: "Conector API del Banco de Crédito del Perú",
    config: { baseUrl: "", method: "POST", path: "/", authType: "API_KEY" },
  },
  {
    type: "REST",
    provider: "bbva",
    name: "BBVA",
    description: "Conector API de BBVA",
    config: { baseUrl: "", method: "POST", path: "/", authType: "API_KEY" },
  },
  {
    type: "REST",
    provider: "interbank",
    name: "Interbank",
    description: "Conector API de Interbank",
    config: { baseUrl: "", method: "POST", path: "/", authType: "API_KEY" },
  },
  {
    type: "REST",
    provider: "telegram",
    name: "Telegram",
    description: "Mensajería mediante Telegram Bot API",
    config: {
      baseUrl: "https://api.telegram.org",
      method: "POST",
      path: "/bot{token}/sendMessage",
      authType: "NONE",
    },
  },
  {
    type: "REST",
    provider: "google-calendar",
    name: "Google Calendar",
    description: "Calendarios mediante Google Calendar API",
    config: {
      baseUrl: "https://www.googleapis.com",
      method: "POST",
      path: "/calendar/v3/calendars/primary/events",
      authType: "BEARER",
    },
  },
  {
    type: "REST",
    provider: "google-cloud",
    name: "Google Cloud",
    description: "Servicios API de Google Cloud",
    config: { baseUrl: "", method: "POST", path: "/", authType: "BEARER" },
  },
  {
    type: "REST",
    provider: "google-drive",
    name: "Google Drive",
    description: "Archivos mediante Google Drive API",
    config: {
      baseUrl: "https://www.googleapis.com",
      method: "GET",
      path: "/drive/v3/files",
      authType: "BEARER",
    },
  },
  {
    type: "REST",
    provider: "microsoft-drive",
    name: "Microsoft Drive",
    description: "Archivos mediante Microsoft Graph / OneDrive",
    config: {
      baseUrl: "https://graph.microsoft.com",
      method: "GET",
      path: "/v1.0/me/drive/root/children",
      authType: "BEARER",
    },
  },
];

/**
 * Instancia única del ConnectorService por proceso.
 *
 * La deduplicación de despachos usa una tienda en memoria (DeduplicationStore);
 * por eso el servicio debe ser un singleton: si cada request construyera uno
 * nuevo, la idempotencia nunca se cumpliría entre peticiones. Guardamos la
 * referencia en globalThis (mismo enfoque que el pool de DB) para que todas las
 * rutas e importaciones compartan la misma instancia dentro del proceso.
 */
interface GlobalIntegration {
  __contract_integration_service__?: ConnectorService;
  __contract_integration_defaults_ready__?: Promise<void>;
}

function getGlobal(): GlobalIntegration {
  return globalThis as unknown as GlobalIntegration;
}

export async function getIntegrationService(): Promise<ConnectorService> {
  const cachedService = getGlobal().__contract_integration_service__;
  if (cachedService) return cachedService;

  const dbModule = await import("@contract/db");
  const { buildConnectorServices } = await import("@contract/integrations");
  const service = buildConnectorServices({
    connectors: new dbModule.DrizzleConnectorRepository(),
    credentials: new dbModule.DrizzleCredentialRepository(),
    logs: new dbModule.DrizzleConnectorLogRepository(),
  });

  const global = getGlobal();
  global.__contract_integration_defaults_ready__ ??= (async () => {
    const existingConnectors = await service.list({ limit: 1000 });
    const existingProviders = new Set(existingConnectors.map((connector) => connector.provider));
    for (const connector of DEFAULT_CONNECTORS) {
      if (!existingProviders.has(connector.provider)) await service.create(connector);
    }
  })();
  await global.__contract_integration_defaults_ready__;

  getGlobal().__contract_integration_service__ = service;
  return service;
}