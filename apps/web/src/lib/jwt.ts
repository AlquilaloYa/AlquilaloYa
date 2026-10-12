/**
 * Decodificación del payload de un JWT (SIN verificar la firma).
 *
 * Uso: leer claims informativos de un token que YA validamos contra Supabase
 * Auth (p. ej. `aal` para saber si la sesión alcanzó nivel AAL2 con MFA). No
 * debe usarse para autorizar por sí solo.
 */

export interface JwtPayload {
  /** Nivel de garantía de autenticación: "aal1" (solo un factor) o "aal2" (con MFA). */
  aal?: string;
  /** Métodos de autenticación usados, del más reciente al más antiguo. */
  amr?: Array<{ method?: string; timestamp?: number }>;
  [key: string]: unknown;
}

export function decodeJwtPayload(token: string | undefined): JwtPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    // atob está disponible tanto en Node 18+ como en runtime edge.
    const binary = atob(padded);
    const json = decodeURIComponent(
      Array.prototype.map
        .call(binary, (c: string) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as JwtPayload) : null;
  } catch {
    return null;
  }
}
