import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Comparación de cadenas en tiempo constante (SEC-042/SEC-078).
 *
 * Compara los SHA-256 de ambos valores con `timingSafeEqual`, de modo que ni el
 * valor ni la longitud filtran información por el tiempo de respuesta. Usar
 * para tokens, firmas y cabeceras de autenticación de webhooks/cron.
 */
export function safeEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}
