import { INVENTARIO_MUEBLERIA, type GrupoChecklist } from "./catalogos";
import { apiFetch } from "./api";

/** Clave LEGACY (localStorage) usada solo por la migración de una sola vez. */
export const INVENTARIOS_DEPARTAMENTO_STORAGE_KEY = "sc_inventarios_departamento_v1";

type InventarioMap = Record<string, string[]>;

let cache: InventarioMap | null = null;
let catalogoCache: GrupoChecklist[] | null = null;

interface InventariosResponse {
  porDepartamento: InventarioMap;
  catalogo: GrupoChecklist[];
}

async function pedir(): Promise<InventariosResponse> {
  try {
    const res = await apiFetch("/api/inventarios");
    if (!res.ok) return { porDepartamento: {}, catalogo: INVENTARIO_MUEBLERIA as GrupoChecklist[] };
    return (await res.json()) as InventariosResponse;
  } catch {
    return { porDepartamento: {}, catalogo: INVENTARIO_MUEBLERIA as GrupoChecklist[] };
  }
}

/** Catálogo completo (estándar + elementos añadidos por el usuario). */
export function catalogoCompleto(): GrupoChecklist[] {
  return catalogoCache ?? (INVENTARIO_MUEBLERIA as GrupoChecklist[]);
}

/** Carga (y cachea) los inventarios. Forzar = recargar desde el servidor. */
export async function cargarInventarios(forzar = false): Promise<InventarioMap> {
  if (cache && !forzar) return cache;
  const data = await pedir();
  cache = data.porDepartamento;
  catalogoCache = data.catalogo;
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
    if (Object.keys(server.porDepartamento).length > 0) return;
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

/** Categorías disponibles para bienes manuales (todas las del catálogo). */
export const CUSTOM_ITEM_CATEGORIAS = ["Living", "Cocina", "Dormitorio", "Baño"] as const;

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
  const base = catalogoCompleto();
  const grupos = base.map((grupo) => ({
    ...grupo,
    items: [...grupo.items.filter(([id]) => permitidos.has(id)), ...customEn(grupo.categoria)],
  })).filter((grupo) => grupo.items.length > 0);
  const categorias = new Set(base.map((g) => g.categoria.toLowerCase()));
  const idsConocidos = new Set<string>();
  for (const grupo of base) {
    for (const [id] of grupo.items) idsConocidos.add(id);
  }
  const restantes = [
    ...custom
      .filter((c) => !categorias.has(c.categoria.toLowerCase()))
      .map((c) => [c.id, c.etiqueta] as [string, string]),
    ...ids
      .map((id) => id.trim())
      .filter((id) => id && !id.startsWith(CUSTOM_ITEM_PREFIX) && !idsConocidos.has(id))
      .map((id) => [id, id] as [string, string]),
  ];
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

/**
 * Catálogo completo (todas las secciones con todos sus elementos) más los
 * manuales (CUSTOM) y los ids desconocidos/legacy como "Adicionales".
 * Usado por el modal para poder marcar/desmarcar cualquier elemento.
 */
export function gruposModal(ids: readonly string[]): GrupoChecklist[] {
  const seleccion = new Set(ids.map((id) => id.trim()).filter(Boolean));
  const custom = [...new Set(ids.filter((id) => id.startsWith(CUSTOM_ITEM_PREFIX)).map((id) => id.trim()))].map(
    (id) => ({ id, ...parseCustomItem(id) })
  );
  const customEn = (categoria: string) =>
    custom
      .filter((c) => c.categoria.toLowerCase() === categoria.toLowerCase())
      .map((c) => [c.id, c.etiqueta] as [string, string]);
  const base = catalogoCompleto();
  const grupos = base.map((grupo) => ({
    ...grupo,
    items: [...grupo.items, ...customEn(grupo.categoria)],
  }));
  const categorias = new Set(base.map((g) => g.categoria.toLowerCase()));
  const idsConocidos = new Set<string>();
  for (const grupo of base) {
    for (const [id] of grupo.items) idsConocidos.add(id);
  }
  const desconocidos = [...seleccion]
    .filter((id) => !id.startsWith(CUSTOM_ITEM_PREFIX) && !idsConocidos.has(id))
    .map((id) => [id, id] as [string, string]);
  const restantesCustom = custom
    .filter((c) => !categorias.has(c.categoria.toLowerCase()))
    .map((c) => [c.id, c.etiqueta] as [string, string]);
  const adicionales = [...desconocidos, ...restantesCustom];
  if (adicionales.length > 0) {
    grupos.push({ categoria: "Adicionales", items: adicionales });
  }
  return grupos;
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

/**
 * Añade un elemento al catálogo (persistente). Devuelve { id, etiqueta }.
 * Refresca el catálogo en memoria para que aparezca en todos los departamentos.
 */
export async function agregarElementoCatalogo(
  categoria: string,
  etiqueta: string
): Promise<{ id: string; etiqueta: string }> {
  const res = await apiFetch("/api/inventarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoria, etiqueta }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    id?: string;
    etiqueta?: string;
    error?: string;
  };
  if (!res.ok || !body.id) {
    throw new Error(body.error ?? "No se pudo añadir el elemento al catálogo");
  }
  const id = body.id;
  if (catalogoCache) {
    const grupo = catalogoCache.find((g) => g.categoria.toLowerCase() === categoria.toLowerCase());
    const existe = grupo?.items.some(([itemId]) => itemId === id);
    if (grupo && !existe) {
      catalogoCache = catalogoCache.map((g) =>
        g === grupo ? { ...g, items: [...g.items, [id, body.etiqueta ?? etiqueta] as [string, string]] } : g
      );
    }
  }
  return { id, etiqueta: body.etiqueta ?? etiqueta };
}
