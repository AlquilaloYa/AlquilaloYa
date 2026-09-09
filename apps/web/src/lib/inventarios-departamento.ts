import { INVENTARIO_MUEBLERIA, type GrupoChecklist } from "./catalogos";

export const INVENTARIOS_DEPARTAMENTO_STORAGE_KEY = "sc_inventarios_departamento_v1";

type InventarioMap = Record<string, string[]>;

export function leerInventariosDepartamento(): InventarioMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(INVENTARIOS_DEPARTAMENTO_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as InventarioMap) : {};
  } catch {
    return {};
  }
}

export function guardarInventarioDepartamento(departamentoId: string, items: string[]) {
  const inventarios = leerInventariosDepartamento();
  inventarios[departamentoId] = items;
  localStorage.setItem(INVENTARIOS_DEPARTAMENTO_STORAGE_KEY, JSON.stringify(inventarios));
}

export function resolverDepartamentoInventarioId(
  departamentoActivo: string | null | undefined,
  departamentoVista: string | null | undefined
): string | null {
  if (departamentoActivo && departamentoActivo.trim() !== "") return departamentoActivo;
  if (departamentoVista && departamentoVista.trim() !== "") return departamentoVista;
  return null;
}

export function inventarioDepartamento(departamentoId: string | null | undefined): GrupoChecklist[] {
  if (!departamentoId) return [];
  const seleccionados = leerInventariosDepartamento()[departamentoId];
  if (!seleccionados) return [];
  const permitidos = new Set(seleccionados);
  return INVENTARIO_MUEBLERIA
    .map((grupo) => ({
      ...grupo,
      items: grupo.items.filter(([id]) => permitidos.has(id)),
    }))
    .filter((grupo) => grupo.items.length > 0);
}

export function inventarioDepartamentoIds(departamentoId: string | null | undefined): string[] {
  return inventarioDepartamento(departamentoId).flatMap((grupo) => grupo.items.map(([id]) => id));
}
