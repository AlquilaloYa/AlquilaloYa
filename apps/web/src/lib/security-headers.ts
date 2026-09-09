/**
 * Cabeceras de seguridad compartidas (Fase 7).
 * Se aplican en el middleware (edge) como fuente principal y se duplican en
 * next.config como defensa en profundidad.
 */

/** Cabeceras de seguridad no negociables para todas las respuestas. */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-DNS-Prefetch-Control": "off",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

/**
 * CSP pragmática: permite inline (necesario por el script de tema y Next dev),
 * data:/blob: para imágenes de adjuntos (fichas con dataUrl) y el bucket de
 * Supabase en storage. Aun así bloquea framing, object y base externa.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** Solo debe enviarse CSP estricta en producción; en dev rompe el HMR/React Refresh. */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Construye las cabeceras de seguridad para una respuesta.
 * - `csp` por defecto: solo en producción. En desarrollo se omite la CSP para no
 *   bloquear el script de React Refresh (que requiere 'unsafe-eval'), lo que de
 *   otro modo impediría hidratar la app (p. ej. el login haría GET nativo a /login).
 */
export function securityHeaders(csp = isProduction()): Record<string, string> {
  return csp
    ? { ...SECURITY_HEADERS, "Content-Security-Policy": CONTENT_SECURITY_POLICY }
    : { ...SECURITY_HEADERS };
}
