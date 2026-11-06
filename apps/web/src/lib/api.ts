"use client";

import { SESSION_HEADER } from "./session";
import { forzarCierreSesion } from "./sesion-segura";

/**
 * parsea la sesión demo guardada en localStorage y devuelve el email del
 * usuario autenticado (o null).
 */
export function currentUserEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("sc_session");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.email === "string" ? parsed.email : null;
  } catch {
    return null;
  }
}

export interface OpcionesApi extends RequestInit {
  /**
   * Cuando es true (por defecto), una respuesta 401 indica que la sesión ya
   * no es válida y se redirige al login. Un timeout nunca cierra la sesión.
   * Los pollers de segundo plano pueden desactivar esta gestión de 401.
   */
  sesionCritica?: boolean;
}

/** Límite para evitar que una petición pendiente deje indefinidamente la UI cargando. */
export const TIEMPO_LIMITE_PETICION_MS = 30_000;

/** fetch de la aplicación que inyecta la identidad de la sesión. */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: OpcionesApi
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const email = currentUserEmail();
  if (email) headers.set(SESSION_HEADER, email);

  const { sesionCritica: sesionCriticaConfig, ...restoInit } = init ?? {};
  const sesionCritica = sesionCriticaConfig ?? true;

  // Si el llamador trae su propio signal (p.ej. abort manual), lo respetamos:
  // no le añadimos nuestro timeout ni cerramos sesión por su cuenta.
  if (restoInit.signal) {
    return fetch(input, { ...restoInit, headers });
  }

  const ctrl = new AbortController();
  const temporizador = setTimeout(() => ctrl.abort(), TIEMPO_LIMITE_PETICION_MS);
  try {
    const res = await fetch(input, { ...restoInit, headers, signal: ctrl.signal });
    if (sesionCritica && res.status === 401) {
      // La sesión dejó de ser válida: cerrar y volver al login.
      forzarCierreSesion();
    }
    return res;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (sesionCritica) {
        throw new Error(
          `La carga superó ${TIEMPO_LIMITE_PETICION_MS / 1000} s de espera.`
        );
      }
      throw new Error(`La carga superó ${TIEMPO_LIMITE_PETICION_MS / 1000} s de espera.`);
    }
    throw err;
  } finally {
    clearTimeout(temporizador);
  }
}