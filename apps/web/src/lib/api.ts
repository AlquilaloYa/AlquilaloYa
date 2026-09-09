"use client";

import { SESSION_HEADER } from "./session";

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

/** fetch de la aplicación que inyecta la identidad de la sesión. */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const email = currentUserEmail();
  if (email) headers.set(SESSION_HEADER, email);
  return fetch(input, { ...init, headers });
}