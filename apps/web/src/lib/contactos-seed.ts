import { PersonType } from "@contract/domain/client";
import { apiFetch } from "./api";

export interface ArchivoAdjunto {
  id: string;
  nombre: string;
  tipo: string;
  dataUrl: string;
}

export interface ContactSeed {
  id: string;
  nombre: string;
  apellido: string;
  tipoPersona: PersonType;
  dni: string;
  ruc?: string | null;
  domicilio?: string;
  nacionalidad?: string;
  email: string;
  telefono: string;
  codigoPais?: string;
  copiaDni?: ArchivoAdjunto[];
  copiaBoletas?: ArchivoAdjunto[];
  copiaAntecedentes?: ArchivoAdjunto[];
contactoEmergencia?: {
    nombre: string;
    parentesco: string;
    telefono: string;
  } | null;
  mascotas?: boolean;
  mascotasItems?: string[];
}

/** Clave LEGACY (localStorage) usada solo por la migración de una sola vez. */
export const CONTACTOS_STORAGE_KEY = "sc_contactos_v7";

export async function obtenerContactos(): Promise<ContactSeed[]> {
  try {
    const res = await apiFetch("/api/contactos");
    if (!res.ok) return [];
    return (await res.json()) as ContactSeed[];
  } catch {
    return [];
  }
}

export async function crearContacto(data: ContactSeed): Promise<ContactSeed> {
  const res = await apiFetch("/api/contactos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "No se pudo crear el contacto");
  }
  return (await res.json()) as ContactSeed;
}

export async function actualizarContacto(data: ContactSeed): Promise<ContactSeed> {
  const res = await apiFetch("/api/contactos", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "No se pudo actualizar el contacto");
  }
  return (await res.json()) as ContactSeed;
}

export async function eliminarContacto(id: string): Promise<void> {
  const res = await apiFetch(`/api/contactos?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "No se pudo eliminar el contacto");
  }
}

/**
 * Migración de una sola vez: contactos de este navegador (localStorage) → BD.
 * Solo si la BD está vacía y hay datos locales. Devuelve el mapa viejoId→nuevoId.
 */
export async function migrarContactosLocales(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (typeof window === "undefined") return mapa;
  const raw = window.localStorage.getItem(CONTACTOS_STORAGE_KEY);
  if (!raw) return mapa;
  window.localStorage.removeItem(CONTACTOS_STORAGE_KEY);
  try {
    const locales = JSON.parse(raw) as ContactSeed[];
    if (!Array.isArray(locales) || locales.length === 0) return mapa;
    const server = await obtenerContactos();
    if (server.length > 0) return mapa;
    for (const c of locales) {
      try {
        const creado = await crearContacto(c);
        mapa.set(c.id, creado.id);
      } catch {
        /* siguiente */
      }
    }
  } catch {
    /* datos corruptos: ya se descartó la clave */
  }
  return mapa;
}
