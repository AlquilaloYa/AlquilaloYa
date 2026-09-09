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

/** Inventario (bienes propios) de un departamento, filtrando el catálogo. */
export function inventarioDepartamento(departamentoId: string | null | undefined): GrupoChecklist[] {
  const seleccionados = departamentoId ? (cache ?? {})[departamentoId] : undefined;
  const permitidos = new Set(seleccionados ?? []);
  return INVENTARIO_MUEBLERIA.map((grupo) => ({
    ...grupo,
    items: grupo.items.filter(([id]) => permitidos.has(id)),
  })).filter((grupo) => grupo.items.length > 0);
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
