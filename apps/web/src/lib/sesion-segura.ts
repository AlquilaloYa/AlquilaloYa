"use client";

/**
 * Cierre forzado de sesión cuando la sesión dejó de ser válida (401).
 * Idempotente: aunque varias pantallas lo invoquen a la vez, solo la primera
 * redirige.
 */
let redirigiendo = false;

export function forzarCierreSesion(): void {
  if (typeof window === "undefined") return;
  if (redirigiendo) return;
  redirigiendo = true;

  try {
    localStorage.removeItem("sc_session");
  } catch {
    /* storage no disponible */
  }

  // Registrar el logout en el servidor (best-effort, con su propio límite).
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 3_000);
    void fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      signal: ctrl.signal,
      keepalive: true,
    }).catch(() => undefined).finally(() => clearTimeout(timeout));
  } catch {
    /* best-effort */
  }

  const url = new URL("/login", window.location.origin);
  url.searchParams.set("sesion", "expirada");
  window.location.assign(url.toString());
}
