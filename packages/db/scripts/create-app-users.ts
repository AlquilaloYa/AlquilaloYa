import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../src/worker.js";
import { users } from "../src/schema/users.js";
import { APP_USERS } from "../src/users-directory.js";
import { env } from "@contract/config/env";

/**
 * Crea/actualiza los usuarios de la app en DOS capas, de forma idempotente:
 *  1) tabla `users` (Postgres): email, nombre, rol, activo.
 *  2) Supabase Auth (Admin API): credencial email+contraseña.
 *
 * Contraseñas: por defecto se generan (una por usuario) y se escriben en
 * `scripts/app-users.local.json` (NO versionado). Para una contraseña fija común:
 *   SUPABASE_USERS_PASSWORD="..." pnpm users
 *
 * Requiere DATABASE_URL + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (vía .env).
 */

const url = env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (define en .env o exporta).");
  process.exit(1);
}

const fixedPassword = process.env.SUPABASE_USERS_PASSWORD;
if (fixedPassword && fixedPassword.length < 6) {
  console.error("SUPABASE_USERS_PASSWORD debe tener >= 6 caracteres.");
  process.exit(1);
}

function genPassword(): string {
  return "Ss!" + randomBytes(9).toString("base64url"); // ~15 chars, legible y fuerte
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function findAuthUser(email: string): Promise<{ id: string } | null> {
  const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`list ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const arr = Array.isArray(data) ? data : (data.users ?? []);
  const found = arr.find((u: { email?: string }) =>
    (u.email ?? "").toLowerCase() === email.toLowerCase()
  );
  return found ? { id: found.id } : null;
}

async function upsertAuthUser(email: string, password: string): Promise<string> {
  const existing = await findAuthUser(email);
  if (existing) {
    const r = await fetch(`${url}/auth/v1/admin/users/${existing.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ password }),
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`update ${r.status}: ${await r.text()}`);
    return "contraseña actualizada";
  }
  const r = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`create ${r.status}: ${await r.text()}`);
  return "creado";
}

async function main() {
  const rows: { email: string; name: string; role: string; password: string }[] = [];

  for (const u of APP_USERS) {
    const password = fixedPassword ?? genPassword();

    // 1) tabla users (upsert por email)
    await db
      .insert(users)
      .values({ email: u.email, name: u.name, role: u.role, active: true })
      .onConflictDoUpdate({
        target: users.email,
        set: { name: u.name, role: u.role, active: true, updatedAt: new Date() },
      });

    // 2) Supabase Auth
    let status: string;
    try {
      status = await upsertAuthUser(u.email, password);
    } catch (e) {
      status = `ERROR ${String((e as Error).message).slice(0, 80)}`;
    }

    rows.push({ email: u.email, name: u.name, role: u.role, password });
    console.log(`• ${u.email.padEnd(30)} ${u.role.padEnd(10)} ${status}`);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const out = join(here, "app-users.local.json");
  writeFileSync(out, JSON.stringify(rows, null, 2), "utf-8");

  const total = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users);
  console.log(`\nTabla 'users' ahora tiene ${total[0]?.n ?? "?"} filas.`);
  console.log(`Contraseñas guardadas en: ${out}`);
  console.log(`(email + contraseña; NO versionar — ya está en .gitignore)`);
}

main()
  .then(async () => {
    // El pool de postgres mantiene el loop vivo; cerramos/salimos explícitamente.
    process.exit(0);
  })
  .catch((e) => {
    console.error("Fallo:", (e as Error).message);
    process.exit(1);
  });
