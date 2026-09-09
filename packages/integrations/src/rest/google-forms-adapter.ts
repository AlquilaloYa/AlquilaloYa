import type { ConnectorTransport, DispatchResult } from "../core/connector";

/**
 * Adaptador para Google Forms.
 * Envía datos de formularios Google Forms vía webhook o Google Forms API.
 * Config de la instancia: { spreadsheetId?, formId?, webhookUrl? }
 */
export class GoogleFormsAdapter implements ConnectorTransport {
  async dispatch(input: Record<string, unknown>): Promise<DispatchResult> {
    const kind = input.kind as string;
    const provider = input.provider as string;
    const payload = (input.payload ?? input) as Record<string, unknown>;

    if (kind === "TEST_CONNECTION") {
      return {
        ok: true,
        statusCode: 200,
        providerMessage: "Google Forms adapter listo",
      };
    }

    // Webhook URL se obtiene de config del conector (inyectada vía registry)
    const webhookUrl = input.webhookUrl as string | undefined;
    if (!webhookUrl) {
      return {
        ok: false,
        statusCode: null,
        providerMessage: null,
        error: "Google Forms: falta webhookUrl en la configuración del conector",
      };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorId: input.connectorId,
          provider,
          kind,
          payload,
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(15000),
      });

      const ok = response.ok;
      const text = await response.text().catch(() => null);
      return {
        ok,
        statusCode: response.status,
        providerMessage: text,
        error: ok ? null : `Google Forms: HTTP ${response.status}`,
      };
    } catch (e) {
      return {
        ok: false,
        statusCode: null,
        providerMessage: null,
        error: `Google Forms: ${(e as Error).message}`,
      };
    }
  }
}
