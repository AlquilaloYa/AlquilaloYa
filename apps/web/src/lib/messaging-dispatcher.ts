import { getIntegrationService } from "@/lib/integration-service";

type Db = typeof import("@contract/db").db;

/** Proveedor de conector por canal de la bandeja. */
const PROVIDER_BY_CANAL: Record<string, string> = {
  WHATSAPP: "whatsapp-cloud",
};

export interface DispatchOutboundResult {
  delivered: boolean;
  provider: string | null;
  error: string | null;
}

/**
 * Despacha un mensaje saliente por el conector activo del canal.
 *
 * - Sin conector configurado para el canal => no envía (delivered:false sin error
 *   fatal; el mensaje queda guardado en la bandeja igualmente).
 * - Usa idempotencia por id del mensaje para evitar envíos duplicados.
 */
export async function despacharMensajeSaliente(input: {
  db: Db;
  messageId: string;
  canal: string;
  to: string;
  text: string;
}): Promise<DispatchOutboundResult> {
  const provider = PROVIDER_BY_CANAL[input.canal];
  if (!provider) return { delivered: false, provider: null, error: null };

  const service = await getIntegrationService();
  const connectors = await service.list({ provider, enabled: true, limit: 10 });
  const connector = connectors[0];
  if (!connector) {
    return { delivered: false, provider, error: `No hay conector activo para el canal ${input.canal}` };
  }
  if (!input.to.trim()) {
    return { delivered: false, provider, error: "El contacto no tiene teléfono configurado" };
  }

  const result = await service.dispatch(
    connector.id,
    "SEND",
    { to: input.to, text: input.text },
    `msg:${input.messageId}`
  );

  return { delivered: result.ok, provider, error: result.error ?? null };
}