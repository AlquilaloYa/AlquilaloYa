import { INVENTARIO_MUEBLERIA, type GrupoChecklist } from "./catalogos";
import { apiFetch } from "./api";

/** Clave LEGACY (localStorage) usada solo por la migración de una sola vez. */
export const INVENTARIOS_DEPARTAMENTO_STORAGE_KEY = "sc_inventarios_departamento_v1";

type InventarioMap = Record<string, string[]>;

let cache: InventarioMap | null = null;

async function pedir(): Promise<InventarioMap> {
  try {
    const res = await apiFetch("/api/inventarios");
    if (!res.ok) return {};
    return (await res.json()) as InventarioMap;
  } catch {
    return {};
  }
}

/** Carga (y cachea) los inventarios. Forzar = recargar desde el servidor. */
export async function cargarInventarios(forzar = false): Promise<InventarioMap> {
  if (cache && !forzar) return cache;
  cache = await pedir();
  return cache;
}

export function inventariosCache(): InventarioMap {
  return cache ?? {};
}

/**
 * Migración de una sola vez: inventarios de este navegador → BD.
 * Solo si el servidor está vacío y hay datos locales.
 */
export async function migrarInventariosLocales(): Promise<void> {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(INVENTARIOS_DEPARTAMENTO_STORAGE_KEY);
  if (!raw) return;
  window.localStorage.removeItem(INVENTARIOS_DEPARTAMENTO_STORAGE_KEY);
  try {
    const locales = JSON.parse(raw) as InventarioMap;
    if (!locales || typeof locales !== "object") return;
    const server = await pedir();
    if (Object.keys(server).length > 0) return;
    for (const [departamentoId, items] of Object.entries(locales)) {
      if (!Array.isArray(items) || items.length === 0) continue;
      try {
        await apiFetch("/api/inventarios", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ departamentoId, items }),
        });
      } catch {
        /* siguiente */
      }
    }
    cache = null;
  } catch {
    /* ilegible */
  }
}

export function resolverDepartamentoInventarioId(
  departamentoActivo: string | null | undefined,
  departamentoVista: string | null | undefined
): string | null {
  if (departamentoActivo && departamentoActivo.trim() !== "") return departamentoActivo;
  if (departamentoVista && departamentoVista.trim() !== "") return departamentoVista;
  return null;
}

/** Prefijo de los bienes agregados manualmente (fuera del catálogo). */
export const CUSTOM_ITEM_PREFIX = "CUSTOM:";

/** Categorías disponibles para bienes manuales. */
export const CUSTOM_ITEM_CATEGORIAS = ["Cocina", "Dormitorio", "Baño"] as const;

/**
 * Descompone un bien manual. Formato: "CUSTOM:Categoría:etiqueta".
 * El formato legacy "CUSTOM:etiqueta" cae en "Adicionales".
 */
export function parseCustomItem(id: string): { categoria: string; etiqueta: string } {
  const resto = id.startsWith(CUSTOM_ITEM_PREFIX) ? id.slice(CUSTOM_ITEM_PREFIX.length).trim() : id;
  const sep = resto.indexOf(":");
  if (sep > 0) {
    return { categoria: resto.slice(0, sep).trim(), etiqueta: resto.slice(sep + 1).trim() };
  }
  return { categoria: "Adicionales", etiqueta: resto };
}

export function customItemLabel(id: string): string {
  return parseCustomItem(id).etiqueta;
}

/** Convierte una lista de ids (catálogo + CUSTOM:categoría:etiqueta) en grupos por sección. */
export function gruposDesdeItems(ids: readonly string[]): GrupoChecklist[] {
  const permitidos = new Set(ids);
  const custom = [...new Set(ids.filter((id) => id.startsWith(CUSTOM_ITEM_PREFIX)).map((id) => id.trim()))].map(
    (id) => ({ id, ...parseCustomItem(id) })
  );
  const customEn = (categoria: string) =>
    custom
      .filter((c) => c.categoria.toLowerCase() === categoria.toLowerCase())
      .map((c) => [c.id, c.etiqueta] as [string, string]);
  const grupos = INVENTARIO_MUEBLERIA.map((grupo) => ({
    ...grupo,
    items: [...grupo.items.filter(([id]) => permitidos.has(id)), ...customEn(grupo.categoria)],
  })).filter((grupo) => grupo.items.length > 0);
  const restantes = custom
    .filter((c) => !INVENTARIO_MUEBLERIA.some((grupo) => grupo.categoria.toLowerCase() === c.categoria.toLowerCase()))
    .map((c) => [c.id, c.etiqueta] as [string, string]);
  if (restantes.length > 0) {
    grupos.push({ categoria: "Adicionales", items: restantes });
  }
  return grupos;
}

/** Inventario (bienes propios) de un departamento: catálogo filtrado + manuales por sección. */
export function inventarioDepartamento(departamentoId: string | null | undefined): GrupoChecklist[] {
  const seleccionados = departamentoId ? (cache ?? {})[departamentoId] : undefined;
  return gruposDesdeItems(seleccionados ?? []);
}

export function inventarioDepartamentoIds(departamentoId: string | null | undefined): string[] {
  return inventarioDepartamento(departamentoId).flatMap((grupo) => grupo.items.map(([id]) => id));
}

/** Guarda (upsert) el inventario de un departamento y refresca la memoria. */
export async function guardarInventarioDepartamento(
  departamentoId: string,
  items: string[]
): Promise<void> {
  const res = await apiFetch("/api/inventarios", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ departamentoId, items }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "No se pudo guardar el inventario");
  }
  cache = { ...(cache ?? {}), [departamentoId]: items };
}
