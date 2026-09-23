import { getIntegrationService } from "@/lib/integration-service";

type Db = typeof import("@contract/db").db;

/** Proveedor y tipo de conector por canal de la bandeja. */
const PROVEEDOR_POR_CANAL: Record<string, { provider: string; type: string }> = {
  WHATSAPP: { provider: "whatsapp-cloud", type: "WHATSAPP" },
  EMAIL: { provider: "gmail", type: "GMAIL" },
};

export type EstadoMensaje = "PENDIENTE" | "ENVIADO" | "FALLO";

export interface DispatchOutboundResult {
  delivered: boolean;
  provider: string | null;
  error: string | null;
  estado: EstadoMensaje;
}

/**
 * Despacha un mensaje saliente por el conector activo del canal.
 *
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
}): Promise<DispatchOutboundResult> {
  const proveedor = PROVEEDOR_POR_CANAL[input.canal];
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
    input.canal === "EMAIL"
      ? { to: input.to, subject: `Mensaje de Contactos e Inmobiliarias`, body: input.text }
      : { to: input.to, text: input.text },
    `msg:${input.messageId}`
  );

  return { delivered: result.ok, provider: proveedor.provider, error: result.error ?? null, estado: result.ok ? "ENVIADO" : "FALLO" };
}