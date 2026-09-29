"use client";

/**
 * Cliente del panel "Contenido Web" del ERP. Todas las peticiones van al
 * proxy server-side /api/contenido-web, que valida la sesión del ERP y el
 * permiso web_content.* antes de reenviar a la API admin de AlquilaYa.
 */

const BASE = "/api/contenido-web";

export type Zone = "Angamos" | "Benavides";

export interface AdminImage {
  id: number;
  url: string;
  order: number;
  alt: string;
}

export interface AdminAmenities {
  is_furnished: boolean;
  pets_allowed: boolean;
  ventana_externa: boolean;
  ventanas_altas: boolean;
  monoambiente: boolean;
  mini_departamento: boolean;
  mini_con_tendal: boolean;
}

export interface AdminProperty {
  id: number;
  property_code: string;
  title: string;
  address: string;
  zone: Zone;
  price: number;
  expenses: number;
  surface_m2: number;
  coordinates: { lat: number; lng: number };
  amenities: AdminAmenities;
  description: string;
  is_featured: boolean;
  is_active: boolean;
  images: AdminImage[];
  created_at: string;
  updated_at: string;
}

export type PropertyDraft = Omit<AdminProperty, "id" | "images" | "created_at" | "updated_at">;

export class ContenidoWebError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ContenidoWebError";
    this.statusCode = statusCode;
  }
}

interface SiteSettingsSection {
  [key: string]: unknown;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    status?: string;
  } | null;

  if (!response.ok) {
    throw new ContenidoWebError(body?.error ?? `Error ${response.status}`, response.status);
  }
  if (response.status === 204) return undefined as T;

  return body as T;
}

function toQuery(filters: { zone?: string; status?: string; search?: string }): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function data<T>(response: { status: string; data: T }): T {
  return response.data;
}

export const contenidoWebApi = {
  properties: {
    list: (filters: { zone?: string; status?: string; search?: string } = {}) =>
      request<{ status: string; count: number; data: AdminProperty[] }>(
        `/properties${toQuery(filters)}`
      ).then(data),

    create: (draft: PropertyDraft) =>
      request<{ status: string; data: AdminProperty }>("/properties", {
        method: "POST",
        body: JSON.stringify(draft),
      }).then(data),

    update: (id: number, patch: Partial<PropertyDraft>) =>
      request<{ status: string; data: AdminProperty }>(`/properties/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }).then(data),

    remove: (id: number) => request<void>(`/properties/${id}`, { method: "DELETE" }),
  },

  images: {
    addUrl: (propertyId: number, url: string, altText: string) =>
      request<{ status: string; data: AdminProperty }>(`/properties/${propertyId}/images/url`, {
        method: "POST",
        body: JSON.stringify({ url, alt_text: altText }),
      }).then(data),

    upload: (propertyId: number, file: File | Blob, altText: string) => {
      const form = new FormData();
      form.append("file", file);
      form.append("alt_text", altText);
      return request<{ status: string; data: AdminProperty }>(`/properties/${propertyId}/images`, {
        method: "POST",
        body: form,
      }).then(data);
    },

    remove: (propertyId: number, imageId: number) =>
      request<{ status: string; data: AdminProperty }>(
        `/properties/${propertyId}/images/${imageId}`,
        { method: "DELETE" }
      ).then(data),

    reorder: (propertyId: number, images: AdminImage[]) =>
      request<{ status: string; data: AdminProperty }>(`/properties/${propertyId}/images/reorder`, {
        method: "POST",
        body: JSON.stringify({
          images: images.map((image) => ({ url: image.url, alt_text: image.alt })),
        }),
      }).then(data),
  },

  settings: {
    get: () =>
      request<{ status: string; data: Record<string, SiteSettingsSection> }>("/settings").then(
        (response) => response.data
      ),

    update: (sections: Record<string, SiteSettingsSection>) =>
      request<{ status: string; data: Record<string, SiteSettingsSection> }>("/settings", {
        method: "PUT",
        body: JSON.stringify(sections),
      }).then((response) => response.data),
  },
};

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return list;
  next.splice(to, 0, item);
  return next;
}

export function formatPrice(value: number): string {
  return `S/ ${value.toLocaleString("es-PE")}`;
}