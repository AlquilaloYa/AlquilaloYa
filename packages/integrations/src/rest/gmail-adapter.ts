import type { ConnectorTransport, DispatchResult } from "../core/connector";

/**
 * Adaptador para Gmail API.
 * Envía correos electrónicos vía la API de Gmail (requiere OAuth2 o Service Account).
 * Config de la instancia: { from?: string, defaultTo?: string }
 * Payload esperado: { to, subject, body, html? }
 */
export class GmailAdapter implements ConnectorTransport {
  constructor(
    private readonly config: {
      accessToken?: string;
      from?: string;
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
        providerMessage: "Gmail adapter listo",
      };
    }

    const to = payload.to as string;
    const subject = payload.subject as string;
    const body = payload.body as string;
    const html = payload.html as string | undefined;

    if (!to || !subject || !body) {
      return {
        ok: false,
        statusCode: null,
        providerMessage: null,
        error: "Gmail: faltan campos requeridos (to, subject, body)",
      };
    }

    const from = (payload.from as string) ?? this.config.from ?? "sistema@contratos.com";
    const accessToken = this.config.accessToken ?? (payload.accessToken as string);

    if (!accessToken) {
      return {
        ok: false,
        statusCode: null,
        providerMessage: null,
        error: "Gmail: falta accessToken (OAuth2 o Service Account)",
      };
    }

    // Construir RFC 2822 message para Gmail API
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const lines = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      body,
    ];

    if (html) {
      lines.push(
        "",
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "",
        html
      );
    }

    lines.push("", `--${boundary}--`);
    const rawMessage = Buffer.from(lines.join("\r\n")).toString("base64url");

    try {
      const response = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: rawMessage }),
          signal: AbortSignal.timeout(this.config.timeoutMs ?? 30000),
        }
      );

      const ok = response.ok;
      const text = await response.text().catch(() => null);
      const data = ok ? JSON.parse(text ?? "{}") : null;

      return {
        ok,
        statusCode: response.status,
        providerMessage: data?.id ? `Mensaje enviado (id: ${data.id})` : text,
        error: ok ? null : `Gmail: HTTP ${response.status} - ${text?.slice(0, 300)}`,
      };
    } catch (e) {
      return {
        ok: false,
        statusCode: null,
        providerMessage: null,
        error: `Gmail: ${(e as Error).message}`,
      };
    }
  }
}
