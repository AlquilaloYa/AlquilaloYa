import { getIntegrationService } from "@/lib/integration-service";

type Db = typeof import("@contract/db").db;

/** Proveedor y tipo de conector por canal de la bandeja. */
const PROVEEDOR_POR_CANAL: Record<string, { provider: string; type: string }> = {
  WHATSAPP: { provider: "whatsapp-cloud", type: "WHATSAPP" },
};

export type EstadoMensaje = "PENDIENTE" | "ENVIADO" | "FALLO";

export interface DispatchOutboundResult {
  delivered: boolean;
  provider: string | null;
  error: string | null;
  estado: EstadoMensaje;
}

/**
 * Envía un correo real con la cuenta de Google del usuario (conectada en /agenda).
 * Usa el mismo token OAuth2 que la agenda (con refresh automático) para no
 * depender de conexiones manuales de credenciales con expiración.
 */
async function enviarCorreoGmail(input: {
  messageId: string;
  to: string;
  text: string;
  userEmail: string;
}): Promise<DispatchOutboundResult> {
  try {
    const { getValidAccessToken } = await import("@/lib/google-calendar");
    const { GmailAdapter } = await import("@contract/integrations");
    const { token } = await getValidAccessToken(input.userEmail);
    const adapter = new GmailAdapter({
      accessToken: token,
      from: input.userEmail,
    });
    const result = await adapter.dispatch({
      kind: "SEND",
      payload: {
        to: input.to,
        subject: `Mensaje de Contactos e Inmobiliarias`,
        body: input.text,
      },
      idempotencyKey: `msg:${input.messageId}`,
    });
    return {
      delivered: result.ok,
      provider: "gmail",
      error: result.error ?? null,
      estado: result.ok ? "ENVIADO" : "FALLO",
    };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Error desconocido enviando correo";
    const userEmail = input.userEmail;
    return {
      delivered: false,
      provider: "gmail",
      error: /Sin cuenta de Google|GcalNotConnected/.test(msg)
        ? `No hay cuenta de Google conectada para ${userEmail}. Conéctala en /agenda.`
        : `Gmail: ${msg}`,
      estado: "FALLO",
    };
  }
}

/**
 * Despacha un mensaje saliente.
 *
 * - EMAIL: envía con la cuenta OAuth2 del usuario (requiere userEmail).
 * - WHATSAPP: usa el conector activo whatsapp-cloud.
 * - Sin conector configurado para el canal => no envía (delivered:false con
 *   error descriptivo). MANUAL es un registro local intencional y cuenta como
 *   ENVIADO; el resto de canales sin transmisor real quedan como FALLO para no
 *   fingir un envío que no ocurrió.
 * - Usa idempotencia por id del mensaje para evitar envíos duplicados.
 */
export async function despacharMensajeSaliente(input: {
  db: Db;
  messageId: string;
  canal: string;
  to: string;
  text: string;
  userEmail?: string;
}): Promise<DispatchOutboundResult> {
  const proveedor = PROVEEDOR_POR_CANAL[input.canal];

  if (input.canal === "EMAIL") {
    if (!input.userEmail?.trim()) {
      return {
        delivered: false,
        provider: "gmail",
        error: "No se puede enviar correo sin la cuenta de Google del usuario",
        estado: "FALLO",
      };
    }
    return enviarCorreoGmail({
      messageId: input.messageId,
      to: input.to,
      text: input.text,
      userEmail: input.userEmail.trim(),
    });
  }

  if (!proveedor) {
    const estado: EstadoMensaje = input.canal === "MANUAL" ? "ENVIADO" : "FALLO";
    return {
      delivered: false,
      provider: null,
      error: input.canal === "MANUAL" ? null : `El canal ${input.canal} aún no tiene conector de envío real`,
      estado,
    };
  }

  const service = await getIntegrationService();
  const connectors = await service.list({
    provider: proveedor.provider,
    type: proveedor.type as "WHATSAPP" | "GMAIL",
    enabled: true,
    limit: 10,
  });
  const connector = connectors[0];
  if (!connector) {
    return {
      delivered: false,
      provider: proveedor.provider,
      error: `No hay conector activo para el canal ${input.canal}`,
      estado: "FALLO",
    };
  }
  if (!input.to.trim()) {
    return {
      delivered: false,
      provider: proveedor.provider,
      error: "El contacto no tiene teléfono/email configurado",
      estado: "FALLO",
    };
  }

  const result = await service.dispatch(
    connector.id,
    "SEND",
    { to: input.to, text: input.text },
    `msg:${input.messageId}`
  );

  return { delivered: result.ok, provider: proveedor.provider, error: result.error ?? null, estado: result.ok ? "ENVIADO" : "FALLO" };
}