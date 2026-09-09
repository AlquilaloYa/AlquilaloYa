"use client";

import { migrarContactosLocales } from "./contactos-seed";
import { migrarSeparacionesLocales } from "./separaciones";
import { migrarInventariosLocales } from "./inventarios-departamento";

let promesa: Promise<void> | null = null;

/**
 * Migración de una sola vez (por navegador) de localStorage → BD:
 * contactos → separaciones (remepeando contactoId) → inventarios.
 * Idempotente: cada paso solo actúa si hay datos locales y la BD está vacía.
 */
export function migrarDatosLocales(): Promise<void> {
  promesa ??= (async () => {
    const mapaContactos = await migrarContactosLocales();
    await migrarSeparacionesLocales(mapaContactos);
    await migrarInventariosLocales();
  })().catch(() => undefined);
  return promesa;
}
