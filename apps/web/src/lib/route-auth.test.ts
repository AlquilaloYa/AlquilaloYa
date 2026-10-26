import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

/**
 * SEC-010: la autorización está centralizada en `requireUser`/`requirePermission`.
 * Este test evita regresiones: toda ruta `/api/**` debe exigir sesión
 * (`requireUser(`) salvo una allowlist justificada (endpoints públicos,
 * máquinas o de autenticación).
 *
 * Es una salvaguarda estructural (grep), no una prueba de comportamiento.
 */

const API_DIR = resolve(process.cwd(), "src", "app", "api");

/**
 * Rutas que NO deben llamar a `requireUser`, con el motivo por el que son
 * públicas o se autentican por otra vía.
 */
const PUBLIC_ROUTES = new Set<string>([
  // Autenticación: entran ANTES de que exista una sesión.
  "auth/login/route.ts",
  "auth/logout/route.ts",
  "auth/mfa/route.ts",
  "auth/mfa/activate/route.ts",
  "auth/mfa/enroll/route.ts",
  "auth/mfa/verify/route.ts",
  // Portal de clientes: autenticación propia y sesión validada por contrato.
  "portal-cliente/auth/login/route.ts",
  "portal-cliente/auth/logout/route.ts",
  "portal-cliente/ordenes/[id]/chat/route.ts",
  "portal-cliente/ordenes/route.ts",
  "portal-cliente/session/route.ts",
  "portal-cliente/uploads/route.ts",
  // Endpoints máquina-a-máquina (token/HMAC propio).
  "cron/automatizaciones/route.ts",
  "webhooks/mensajes/route.ts",
  "webhooks/meta/route.ts",
  // Observabilidad y lectura pública del sitio.
  "health/route.ts",
  "publico/disponibilidad/route.ts",
  "publico/estado-departamentos/route.ts",
]);

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listRouteFiles(full));
    } else if (entry.name === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

function toKey(absPath: string): string {
  return relative(API_DIR, absPath).split(sep).join("/");
}

describe("SEC-010 autorización de rutas /api", () => {
  const routes = listRouteFiles(API_DIR);

  it("encuentra rutas de API", () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it("toda ruta exige requireUser salvo la allowlist", () => {
    const offenders = routes
      .filter((file) => !PUBLIC_ROUTES.has(toKey(file)))
      .filter((file) => !readFileSync(file, "utf8").includes("requireUser("))
      .map(toKey);

    expect(
      offenders,
      `Rutas sin requireUser( fuera de la allowlist: ${offenders.join(", ")}`
    ).toEqual([]);
  });

  it("la allowlist no contiene entradas obsoletas", () => {
    const stale = [...PUBLIC_ROUTES].filter(
      (rel) => !existsSync(resolve(API_DIR, rel))
    );
    expect(stale, `Entradas obsoletas en PUBLIC_ROUTES: ${stale.join(", ")}`).toEqual([]);
  });
});
