import type { ConnectorTransport, DispatchResult } from "../core/connector";

/**
 * Adaptador para WhatsApp Business API.
 * Envía mensajes de texto o plantillas vía la API de Meta/WhatsApp.
 * Config de la instancia: { phoneNumberId?, apiVersion?: "v18.0" }
 * Payload esperado: { to (número E.164), template?, text?, type? }
 */
export class WhatsAppAdapter implements ConnectorTransport {
  constructor(
    private readonly config: {
      phoneNumberId?: string;
      apiVersion?: string;
      timeoutMs?: number;
    } = {}
  ) {}

  async dispatch(input: Record<string, unknown>): Promise<DispatchResult> {
    const kind = input.kind as string;
    const payload = (input.payload ?? input) as Record<string, unknown>;

    if (kind === "TEST_CONNECTION") {
      return {
        ok: true,
        statusCode: 200,
        providerMessage: "WhatsApp Business adapter listo",
      };
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

    const accessToken = payload.accessToken as string;
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
