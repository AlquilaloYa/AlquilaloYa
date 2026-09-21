import type { ConnectorTransport, DispatchResult } from "../core/connector";

/**
 * Adaptador para WhatsApp Business API.
 * Envía mensajes de texto o plantillas vía la API de Meta/WhatsApp.
 * Config de la instancia: { phoneNumberId?, apiVersion?, accessToken? }
 * El token debe venir resuelto desde las credenciales descifradas (config.accessToken),
 * con fallback a payload.accessToken para compatibilidad con despachos manuales.
 * Payload esperado: { to (número E.164), template?, text?, type? }
 */
export class WhatsAppAdapter implements ConnectorTransport {
  constructor(
    private readonly config: {
      phoneNumberId?: string;
      apiVersion?: string;
      accessToken?: string;
      timeoutMs?: number;
    } = {}
  ) {}

  async dispatch(input: Record<string, unknown>): Promise<DispatchResult> {
    const kind = input.kind as string;
    const payload = (input.payload ?? input) as Record<string, unknown>;

    if (kind === "TEST_CONNECTION") {
      const accessToken = this.config.accessToken ?? (payload.accessToken as string);
      const phoneNumberId = this.config.phoneNumberId ?? (payload.phoneNumberId as string);
      const apiVersion = this.config.apiVersion ?? "v20.0";

      if (!accessToken) {
        return {
          ok: false,
          statusCode: null,
          providerMessage: null,
          error: "WhatsApp: falta accessToken (token de WhatsApp Business)",
        };
      }
      if (!phoneNumberId) {
        return {
          ok: false,
          statusCode: null,
          providerMessage: null,
          error: "WhatsApp: falta phoneNumberId en la configuración del conector",
        };
      }

      const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=display_phone_number,verified_name`;
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(this.config.timeoutMs ?? 15000),
        });
        if (response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { display_phone_number?: string; verified_name?: string }
            | null;
          return {
            ok: true,
            statusCode: response.status,
            providerMessage: data
              ? `Conectado: ${data.display_phone_number ?? "número"} (${data.verified_name ?? "empresa"})`
              : "Conexión exitosa con WhatsApp Business",
          };
        }
        const text = await response.text().catch(() => null);
        return {
          ok: false,
          statusCode: response.status,
          providerMessage: null,
          error: `WhatsApp: HTTP ${response.status} - ${text?.slice(0, 300)}`,
        };
      } catch (e) {
        return {
          ok: false,
          statusCode: null,
          providerMessage: null,
          error: `WhatsApp: ${(e as Error).message}`,
        };
      }
    }

    const to = payload.to as string;
    const text = payload.text as string | undefined;
    const template = payload.template as
      | { name: string; language?: string; parameters?: string[] }
      | undefined;

    if (!to) {
      return {
        ok: false,
        statusCode: null,
        providerMessage: null,
        error: "WhatsApp: falta campo requerido (to)",
      };
    }

    if (!text && !template) {
      return {
        ok: false,
        statusCode: null,
        providerMessage: null,
        error: "WhatsApp: se requiere text o template",
      };
    }

    const phoneNumberId = this.config.phoneNumberId ?? (payload.phoneNumberId as string);
    const apiVersion = this.config.apiVersion ?? "v18.0";

    if (!phoneNumberId) {
      return {
        ok: false,
        statusCode: null,
        providerMessage: null,
        error: "WhatsApp: falta phoneNumberId en la configuración del conector",
      };
    }

    const accessToken = this.config.accessToken ?? (payload.accessToken as string);
    if (!accessToken) {
      return {
        ok: false,
        statusCode: null,
        providerMessage: null,
        error: "WhatsApp: falta accessToken (token de WhatsApp Business)",
      };
    }

    // Construir body según tipo de mensaje
    let body: Record<string, unknown>;
    if (template) {
      body = {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template.name,
          language: { code: template.language ?? "es" },
          ...(template.parameters?.length
            ? { components: [{ type: "body", parameters: template.parameters.map((p) => ({ type: "text", text: p })) }] }
            : {}),
        },
      };
    } else {
      body = {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      };
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 30000),
      });

      const ok = response.ok;
      const text = await response.text().catch(() => null);
      const data = ok ? JSON.parse(text ?? "{}") : null;

      return {
        ok,
        statusCode: response.status,
        providerMessage: data?.messages?.[0]?.id
          ? `Mensaje enviado (id: ${data.messages[0].id})`
          : text,
        error: ok ? null : `WhatsApp: HTTP ${response.status} - ${text?.slice(0, 300)}`,
      };
    } catch (e) {
      return {
        ok: false,
        statusCode: null,
        providerMessage: null,
        error: `WhatsApp: ${(e as Error).message}`,
      };
    }
  }
}
